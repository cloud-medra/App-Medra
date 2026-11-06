// Historial de uso de cada referencia en las gestiones de Implantes: qué médicos
// y qué descripciones de CX la han usado (maestros_codigos_uso). Lo usan el
// trigger, el script de carga y la pantalla de Códigos Maestros. Sin dependencias
// de Firebase.
//
// Forma del documento (un documento por referencia normalizada):
//   { referencia, referenciaNormalizada,
//     medicos:       { <clave>: { nombre, gestiones: { <idGestion>: 'AAAA-MM-DD' } } },
//     descripciones: { <clave>: { nombre, gestiones: { <idGestion>: 'AAAA-MM-DD' } } } }
//
// Decisiones:
// - Se guarda QUÉ gestiones aportan cada valor, no un contador: agregar o quitar
//   la misma gestión dos veces da lo mismo, así que un evento repetido no descuadra
//   nada. La cantidad de usos y el último uso se calculan al mostrar.
// - Un uso es una gestión con esa referencia, aunque tenga varias líneas de ella.
// - IDs y claves son hashes: una referencia puede traer "/" o ser "." (inválidos
//   como ID), y un nombre como "DR. PEREZ" rompería una ruta de campo. El texto
//   para mostrar va dentro del valor.
// - La misma referencia en dos empresas comparte historial: los nombres de empresa
//   no siempre coinciden exacto entre gestiones y maestro, y separar por ellos
//   dejaría historiales vacíos.
import { normalizarDescripcion, esDescripcionValida } from '../bodymap/nucleo.mjs';

export const COLECCION_USO_CODIGOS = 'maestros_codigos_uso';

const sha256 = async (texto) => {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(texto)));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
};

// ID del documento: la pantalla lo calcula igual a partir de la referencia.
export const idReferenciaUso = async (referencia) => sha256(normalizarDescripcion(referencia));
// Claves de los mapas. Con prefijo: nunca empiezan con un dígito ni llevan puntos.
export const claveDeTexto = async (normalizado) => `k${(await sha256(normalizarDescripcion(normalizado))).slice(0, 16)}`;
// La ruta completa: el ID de detalles/{id} no es único en todo el árbol.
export const claveDeGestion = async (rutaGestion) => `g${(await sha256(rutaGestion)).slice(0, 24)}`;

const FORMATO_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const FECHA_EN_RUTA = /implantes_gestiones\/(\d{4})\/mes\/(\d{2})\/dia\/(\d{2})\//;

// La fecha de la gestión; si no es válida, la de su ruta. Sin ninguna, vacía
// (cuenta como uso, pero no como último uso).
export const fechaDeGestion = (gestion, ruta) => {
  if (FORMATO_FECHA.test(String(gestion?.fecha ?? ''))) return gestion.fecha;
  const m = FECHA_EN_RUTA.exec(String(ruta ?? ''));
  return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
};

const valorDeTexto = async (texto) => (esDescripcionValida(texto)
  ? { clave: await claveDeTexto(texto), nombre: String(texto).trim() }
  : null);

// Lo que una gestión aporta. Sin médico ni descripción válidos (o sin gestión)
// no aporta nada: la carga se guarda igual y simplemente no genera asociación.
export const aportesDeGestion = async (gestion, ruta) => {
  const vacio = { referencias: [], medico: null, descripcion: null, fecha: '' };
  if (!gestion) return vacio;
  const [medico, descripcion] = await Promise.all([valorDeTexto(gestion.medico), valorDeTexto(gestion.descripcion)]);
  if (!medico && !descripcion) return vacio;
  const porNormalizada = new Map();
  // Solo cotizaciones[0]: es la única "oficial" (ver aplicarNuevoItemABloque).
  (gestion.cotizaciones?.[0]?.items || []).forEach((item) => {
    if (!esDescripcionValida(item?.referencia)) return;
    const normalizada = normalizarDescripcion(item.referencia);
    if (!porNormalizada.has(normalizada)) porNormalizada.set(normalizada, { normalizada, texto: String(item.referencia).trim() });
  });
  return { referencias: [...porNormalizada.values()], medico, descripcion, fecha: fechaDeGestion(gestion, ruta) };
};

// Para descartar sin leer nada los guardados que no cambian lo que importa aquí
// (precio, cantidad, lote...).
export const firmaAportes = ({ referencias, medico, descripcion, fecha }) => JSON.stringify([
  referencias.map((r) => r.normalizada).sort(), medico?.clave ?? null, descripcion?.clave ?? null, fecha,
]);

// Deja una sección del documento (medicos o descripciones) con la gestión solo
// en `deseado`. Una entrada sin gestiones deja de existir.
const fijarEnSeccion = (seccion, idGestion, deseado, fecha) => {
  let cambio = false;
  const nueva = {};
  Object.entries(seccion || {}).forEach(([clave, entrada]) => {
    const gestiones = { ...entrada.gestiones };
    if (idGestion in gestiones && clave !== deseado?.clave) {
      delete gestiones[idGestion];
      cambio = true;
    }
    if (Object.keys(gestiones).length) nueva[clave] = { ...entrada, gestiones };
  });
  if (deseado && nueva[deseado.clave]?.gestiones?.[idGestion] !== fecha) {
    const previa = nueva[deseado.clave];
    nueva[deseado.clave] = { nombre: previa?.nombre ?? deseado.nombre, gestiones: { ...previa?.gestiones, [idGestion]: fecha } };
    cambio = true;
  }
  return { seccion: nueva, cambio };
};

// Deja el documento de una referencia como debe quedar según lo que la gestión
// aporta AHORA (`aporte`: { medico, descripcion, fecha }, o null si ya no usa la
// referencia). Es idempotente y no depende de lo que la gestión aportaba antes.
// → { documento, cambio, vacio }; `vacio`: sin asociaciones, se borra.
export const fijarGestion = (documento, referencia, idGestion, aporte) => {
  const medicos = fijarEnSeccion(documento?.medicos, idGestion, aporte?.medico, aporte?.fecha);
  const descripciones = fijarEnSeccion(documento?.descripciones, idGestion, aporte?.descripcion, aporte?.fecha);
  return {
    documento: {
      referencia: documento?.referencia ?? referencia.texto,
      referenciaNormalizada: referencia.normalizada,
      medicos: medicos.seccion,
      descripciones: descripciones.seccion,
    },
    cambio: medicos.cambio || descripciones.cambio,
    vacio: !Object.keys(medicos.seccion).length && !Object.keys(descripciones.seccion).length,
  };
};

const listaDeSeccion = (seccion) => Object.entries(seccion || {})
  .map(([clave, { nombre, gestiones }]) => {
    const fechas = Object.values(gestiones || {});
    return { clave, nombre, usos: fechas.length, ultimoUso: fechas.reduce((max, f) => (f > max ? f : max), '') };
  })
  .sort((a, b) => b.usos - a.usos || String(a.nombre).localeCompare(String(b.nombre), 'es'));

// Médicos de una descripción: los que comparten alguna de sus gestiones. Sale del
// mismo documento, sin guardar nada más.
const medicosDeDescripcion = (entrada, medicos) => Object.values(medicos || {})
  .filter((medico) => Object.keys(entrada?.gestiones || {}).some((id) => id in (medico.gestiones || {})))
  .map((medico) => medico.nombre)
  .sort((a, b) => String(a).localeCompare(String(b), 'es'));

// Para mostrar: listas ordenadas por cantidad de usos.
export const resumenUso = (documento) => ({
  medicos: listaDeSeccion(documento?.medicos),
  descripciones: listaDeSeccion(documento?.descripciones).map((fila) => ({
    ...fila,
    medicos: medicosDeDescripcion(documento.descripciones[fila.clave], documento?.medicos),
  })),
});
