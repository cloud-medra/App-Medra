import { httpsCallable } from 'firebase/functions';
import { collection, doc, endAt, getDoc, getDocs, limit, orderBy, query, startAfter, startAt, where } from 'firebase/firestore';
import { db, functions } from '../../../../firebaseConfig';
import { upsertLocal } from '../../../../stores/catalogosStore';
import { COL_KITS, OPERACION_COMPLETAR, ESTADOS_KIT } from '../../../../../functions/armadoKits/nucleo.mjs';
import { COL_CONFIGURACION_KITS } from '../../../../../functions/armadoKits/receta.mjs';
import { normalizarClave } from '../../../../../functions/bodega/nucleo.mjs';

// Acceso a datos de Armado de Kits: las lecturas van directo a Firestore y las
// escrituras SIEMPRE por las Cloud Functions de functions/armadoKits. Tras
// cada escritura se reflejan los saldos en la copia local del maestro de Bodega.

const TAMANO_PAGINA = 50;

const llamar = (nombre) => {
  const fn = httpsCallable(functions, nombre);
  return async (datos) => {
    const r = (await fn(datos)).data;
    (r.productos || []).forEach(({ id, ...saldo }) => upsertLocal('bodegaProductos', id, saldo));
    return r;
  };
};

// Una página del listado. Con `codigo` busca por el inicio del código y el tipo
// se filtra en memoria (combinar ambos exigiría otro índice).
export const leerKits = async ({ familia, tipo = '', codigo = '', cursor = null }) => {
  const texto = normalizarClave(codigo);
  const restricciones = texto
    ? [where('familia', '==', familia), orderBy('codigoNormalizado'), startAt(texto), endAt(`${texto}`)]
    : [where('familia', '==', familia), ...(tipo ? [where('tipo', '==', tipo)] : []), orderBy('creadoEn', 'desc')];
  const snap = await getDocs(query(collection(db, COL_KITS), ...restricciones, ...(cursor ? [startAfter(cursor)] : []), limit(TAMANO_PAGINA)));
  const kits = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return {
    kits: texto && tipo ? kits.filter((k) => k.tipo === tipo) : kits,
    cursor: snap.docs[snap.docs.length - 1] || null,
    hayMas: snap.size === TAMANO_PAGINA,
  };
};

export const leerKit = async (id) => {
  const snap = await getDoc(doc(db, COL_KITS, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
};

// { familia, kitId? | genero, vaina, referencia?, lineas: [{ productoId, loteId, cantidad, confirmarFueraFEFO?, confirmarSinVencimiento? }] }
export const guardarKit = llamar('kitsGuardar');
export const eliminarKit = llamar('kitsEliminar');
export const completarVencimiento = (datos) => guardarKit({ ...datos, operacion: OPERACION_COMPLETAR });

// Receta y modelos de una familia (null si aún no se configura). 1 lectura.
export const leerConfiguracionKits = async (familia) => {
  const snap = await getDoc(doc(db, COL_CONFIGURACION_KITS, familia));
  return snap.exists() ? snap.data() : null;
};
// { familia, versionEsperada, componentes, modelos } -> { version, cambios, sinCambios? }
export const guardarConfiguracionKits = llamar('kitsConfiguracion');
// Últimos cambios de la configuración (auditoría), solo al pedirlos.
export const leerHistorialConfiguracion = async (familia) => {
  const snap = await getDocs(query(collection(db, COL_CONFIGURACION_KITS, familia, 'logs'), orderBy('fecha', 'desc'), limit(30)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

// { accion: DESPACHAR|RECIBIR|RECHAZAR|ANULAR, kitId, ... } (no mueve stock).
export const gestionarTransitoKit = llamar('kitsTransito');

// Kits despachados y aún no recibidos (Bodega > Tránsito). Igualdad en un
// solo campo: índice automático. Son pocos a la vez; el tope protege.
export const leerKitsEnTransito = async () => {
  const snap = await getDocs(query(collection(db, COL_KITS), where('estado', '==', ESTADOS_KIT.EN_TRANSITO), limit(200)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.despacho?.fecha?.toMillis?.() || 0) - (b.despacho?.fecha?.toMillis?.() || 0));
};
