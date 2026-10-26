import {
  collection, doc, getDoc, getDocs, query, where, orderBy, limit, startAfter,
  runTransaction, updateDoc, serverTimestamp, onSnapshot
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage } from '../../../../firebaseConfig';
import { suscribirConVisibilidad } from '../../../../hooks/useVisibleSnapshot';
import { COLECCION_TICKETS, DOC_CONTADOR_TICKETS, TAMANO_PAGINA_TICKETS, MAX_CAPTURAS, contextoTecnico, visibilidadTicket } from './ticketsConfig';

// Acceso a Firestore/Storage de los tickets. Lecturas:
//   - Mis tickets: consulta por creadoPor, paginada (TAMANO_PAGINA_TICKETS).
//   - Bandeja: consulta paginada con los filtros en la consulta.
//   - Tickets de mi equipo (administradores): consultas paginadas por los
//     campos de visibilidad guardados en el ticket (administradores /
//     centroAdministradores), nunca todos los tickets.
//   - Abrir un ticket: 1 lectura (la conversación va en el mismo documento).
//   - Indicadores: consultas con limit sobre noLeidoUsuario / pendienteGestor.
//   - Crear: 1 lectura del contador (transacción para el número correlativo).

const coleccion = () => collection(db, COLECCION_TICKETS);
const refContador = () => doc(db, ...DOC_CONTADOR_TICKETS);

// --- Capturas de pantalla --------------------------------------------------
export const TIPOS_CAPTURA = ['image/jpeg', 'image/png', 'image/webp'];
export const TAMANO_MAXIMO_CAPTURA_MB = 15;
const LADO_MAXIMO_CAPTURA = 1600;

export const validarCaptura = (archivo) => {
  if (!TIPOS_CAPTURA.includes(archivo?.type)) return `"${archivo?.name || 'archivo'}": solo imágenes JPG, PNG o WebP.`;
  if (archivo.size > TAMANO_MAXIMO_CAPTURA_MB * 1024 * 1024) return `"${archivo.name}" pesa más de ${TAMANO_MAXIMO_CAPTURA_MB} MB.`;
  return null;
};

// Reduce la captura (lado mayor ≤ 1600 px) y la comprime a WebP/JPEG.
export const comprimirCaptura = async (archivo) => {
  const url = URL.createObjectURL(archivo);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error(`No se pudo leer "${archivo.name}".`));
      i.src = url;
    });
    const escala = Math.min(1, LADO_MAXIMO_CAPTURA / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * escala);
    canvas.height = Math.round(img.naturalHeight * escala);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    const aBlob = (tipo) => new Promise((resolve) => canvas.toBlob(resolve, tipo, 0.8));
    let blob = await aBlob('image/webp');
    if (!blob || blob.type !== 'image/webp') blob = await aBlob('image/jpeg');
    if (!blob) throw new Error(`No se pudo procesar "${archivo.name}".`);
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
};

const subirCapturas = async (uid, ticketId, archivos) => {
  const subidas = [];
  for (let i = 0; i < Math.min(archivos.length, MAX_CAPTURAS); i++) {
    const blob = await comprimirCaptura(archivos[i]);
    const ruta = `tickets_capturas/${uid}/${ticketId}/captura_${i + 1}.${blob.type === 'image/webp' ? 'webp' : 'jpg'}`;
    const r = ref(storage, ruta);
    await uploadBytes(r, blob, { contentType: blob.type });
    subidas.push({ ruta, url: await getDownloadURL(r), nombre: archivos[i].name || `captura ${i + 1}` });
  }
  return subidas;
};

// --- Crear -----------------------------------------------------------------
// form: { tipo, titulo, descripcion, prioridad, modulo }. Devuelve el ticket creado.
export const crearTicket = async ({ form, capturas = [], userData, vista }) => {
  const ticketRef = doc(coleccion());
  const subidas = await subirCapturas(userData.uid, ticketRef.id, capturas);
  try {
    const numero = await runTransaction(db, async (tx) => {
      const contador = await tx.get(refContador());
      const siguiente = (contador.exists() ? Number(contador.data().ultimo) || 0 : 0) + 1;
      tx.set(refContador(), { ultimo: siguiente });
      tx.set(ticketRef, {
        numero: siguiente,
        tipo: form.tipo,
        titulo: form.titulo.trim(),
        descripcion: form.descripcion.trim(),
        prioridad: form.prioridad,
        modulo: form.modulo,
        capturas: subidas,
        contexto: contextoTecnico({ vista }),
        creadoPor: userData.uid,
        creadoPorNombre: userData.nombreCompleto || userData.email || 'Usuario',
        creadoPorEmail: userData.email || '',
        // Quién más lo ve (administradores del autor al crearlo), ver visibilidadTicket.
        ...visibilidadTicket(userData),
        estado: 'NUEVO',
        mensajes: [],
        noLeidoUsuario: false,
        pendienteGestor: true,
        creadoEl: serverTimestamp(),
        actualizadoEl: serverTimestamp(),
      });
      return siguiente;
    });
    return { id: ticketRef.id, numero };
  } catch (error) {
    // Sin ticket, las capturas quedarían huérfanas.
    await Promise.all(subidas.map((s) => deleteObject(ref(storage, s.ruta)).catch(() => {})));
    throw error;
  }
};

// --- Listados paginados ------------------------------------------------------
const pagina = async (restricciones, cursor) => {
  const partes = [...restricciones, limit(TAMANO_PAGINA_TICKETS + 1)];
  if (cursor) partes.push(startAfter(cursor));
  const snap = await getDocs(query(coleccion(), ...partes));
  const docs = snap.docs.slice(0, TAMANO_PAGINA_TICKETS);
  return {
    tickets: docs.map((d) => ({ id: d.id, ...d.data() })),
    cursor: docs[docs.length - 1] || null,
    hayMas: snap.docs.length > TAMANO_PAGINA_TICKETS,
  };
};

export const listarMisTickets = (uid, cursor = null) =>
  pagina([where('creadoPor', '==', uid), orderBy('actualizadoEl', 'desc')], cursor);

// filtros: { estado, tipo, modulo, prioridad, numero, orden: 'desc' | 'asc' }.
export const listarBandeja = (filtros = {}, cursor = null) => {
  if (filtros.numero) return pagina([where('numero', '==', filtros.numero)], null);
  const r = ['estado', 'tipo', 'modulo', 'prioridad']
    .filter((campo) => filtros[campo])
    .map((campo) => where(campo, '==', filtros[campo]));
  r.push(orderBy('creadoEl', filtros.orden === 'asc' ? 'asc' : 'desc'));
  return pagina(r, cursor);
};

// Tickets de mi equipo (Administrador): los de sus usuarios asignados
// (administradores array-contains uid) y los de usuarios que eligieron a
// "todos los administradores" de un centro que administra
// (centroAdministradores in sus centros). Dos consultas paginadas cuyos
// resultados se mezclan por fecha. `cursores`: { asignados, centro } con el
// último documento de cada una, o false si ya no tiene más.
export const listarEquipo = async ({ uid, centros = [] }, filtros = {}, cursores = {}) => {
  const r = ['estado', 'tipo']
    .filter((campo) => filtros[campo])
    .map((campo) => where(campo, '==', filtros[campo]));
  r.push(orderBy('creadoEl', 'desc'));
  const centrosValidos = [...new Set(centros.filter(Boolean))].slice(0, 30);
  const fuentes = [];
  if (cursores.asignados !== false) fuentes.push(['asignados', [where('administradores', 'array-contains', uid), ...r]]);
  if (centrosValidos.length && cursores.centro !== false) fuentes.push(['centro', [where('centroAdministradores', 'in', centrosValidos), ...r]]);
  const paginas = await Promise.all(fuentes.map(([clave, restricciones]) =>
    pagina(restricciones, cursores[clave] || null).then((p) => [clave, p])));
  const siguientes = { asignados: false, centro: false };
  const porId = new Map();
  paginas.forEach(([clave, p]) => {
    siguientes[clave] = p.hayMas ? p.cursor : false;
    p.tickets.forEach((t) => porId.set(t.id, t));
  });
  const fecha = (t) => (t.creadoEl?.toMillis ? t.creadoEl.toMillis() : new Date(t.creadoEl || 0).getTime());
  return {
    tickets: [...porId.values()].sort((a, b) => fecha(b) - fecha(a)),
    cursores: siguientes,
    hayMas: Boolean(siguientes.asignados || siguientes.centro),
  };
};

// --- Un ticket -----------------------------------------------------------------
export const leerTicket = async (id) => {
  const snap = await getDoc(doc(db, COLECCION_TICKETS, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
};

// Guarda solo los campos que cambian (+ fecha de actualización).
export const actualizarTicket = (id, cambios, { tocarFecha = true } = {}) =>
  updateDoc(doc(db, COLECCION_TICKETS, id), tocarFecha ? { ...cambios, actualizadoEl: serverTimestamp() } : cambios);

// --- Indicadores (consultas con limit, en vivo y pausadas con la pestaña oculta) ---
// El usuario tiene alguna novedad sin ver en sus tickets: limit(1).
export const escucharNovedadesUsuario = (uid, cb) => suscribirConVisibilidad(() => onSnapshot(
  query(coleccion(), where('creadoPor', '==', uid), where('noLeidoUsuario', '==', true), limit(1)),
  (snap) => cb(snap.size > 0),
  (error) => { console.error('Error al escuchar novedades de tickets:', error); cb(false); }
));

// Tickets sin revisar por quien gestiona: hasta 10 (se muestra "9+").
export const LIMITE_PENDIENTES_GESTOR = 10;
export const escucharPendientesGestor = (cb) => suscribirConVisibilidad(() => onSnapshot(
  query(coleccion(), where('pendienteGestor', '==', true), limit(LIMITE_PENDIENTES_GESTOR)),
  (snap) => cb(snap.size),
  (error) => { console.error('Error al escuchar tickets pendientes:', error); cb(0); }
));
