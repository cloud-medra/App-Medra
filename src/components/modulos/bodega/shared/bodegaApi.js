import { httpsCallable } from 'firebase/functions';
import { collection, doc, getDoc, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { db, functions } from '../../../../firebaseConfig';
import { leerCatalogo, upsertLocal } from '../../../../stores/catalogosStore';
import { COL } from '../../../../../functions/bodega/nucleo.mjs';
import { idVinculo } from '../../../../../functions/bodega/gs1.mjs';

// Acceso a datos de Bodega desde la pantalla.
//   - Lecturas: directo contra Firestore (escaneo y búsqueda instantáneos).
//   - Escrituras: SIEMPRE por las Cloud Functions de functions/bodega (las
//     reglas no dejan escribir desde el navegador). Tras cada una se refleja
//     el resultado en la copia local del catalogosStore.

const llamar = (nombre) => {
  const fn = httpsCallable(functions, nombre);
  return async (datos) => (await fn(datos)).data;
};

// Mensaje legible de un error de Cloud Function o de Firestore.
export const mensajeError = (error, porDefecto = 'No se pudo completar la operación.') => {
  if (error?.code === 'functions/internal' || error?.code === 'internal') return porDefecto;
  if (error?.code === 'functions/unavailable' || error?.code === 'unavailable') return 'Sin conexión con el servidor. Revisa tu conexión e inténtalo de nuevo.';
  return error?.message || porDefecto;
};

// Datos extra de un error (HttpsError details), p. ej. { motivo: 'vinculado-a-otro', ... }.
export const detalleError = (error) => error?.details || null;

// ---------------- Lecturas ----------------

// Vínculo de un código (o null). 1 lectura.
export const leerVinculo = async (clave) => {
  const id = idVinculo(clave);
  if (!id) return null;
  const snap = await getDoc(doc(db, COL.codigosBarra, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
};

// Producto: primero la copia en memoria; si no está (creado por otro
// usuario después de cargar), se lee y se agrega a la copia.
export const obtenerProducto = async (productoId) => {
  const enMemoria = (leerCatalogo('bodegaProductos') || []).find((p) => p.id === productoId);
  if (enMemoria) return enMemoria;
  const snap = await getDoc(doc(db, COL.productos, productoId));
  if (!snap.exists()) return null;
  const producto = { id: snap.id, ...snap.data() };
  upsertLocal('bodegaProductos', producto.id, producto);
  return producto;
};

export const leerCodigosDeProducto = async (productoId) => {
  const snap = await getDocs(query(collection(db, COL.codigosBarra), where('productoId', '==', productoId), limit(50)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

// Lotes del producto (ordenados en memoria por vencimiento: FEFO).
export const leerLotesDeProducto = async (productoId) => {
  const snap = await getDocs(query(collection(db, COL.lotes), where('productoId', '==', productoId), limit(300)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.vencimiento || '9999').localeCompare(b.vencimiento || '9999') || String(a.lote || '').localeCompare(String(b.lote || '')));
};

// Unidades en tránsito en un centro (0 si no tiene). Lo usa Maestros →
// Centros para avisar antes de borrar.
export const unidadesEnTransitoCentro = async (centroId) => {
  const snap = await getDoc(doc(db, COL.transitoCentros, centroId));
  return snap.exists() ? Number(snap.data().unidades) || 0 : 0;
};

// ---------------- Escrituras (Cloud Functions) ----------------

const actualizarCodigosLocal = (productoId, cambiar) => {
  const actual = (leerCatalogo('bodegaProductos') || []).find((p) => p.id === productoId);
  if (actual) upsertLocal('bodegaProductos', productoId, { codigosBarra: cambiar(actual.codigosBarra || []) });
};

export const guardarCatalogo = async (datos) => {
  const r = await llamar('bodegaGuardarCatalogo')(datos);
  upsertLocal('bodegaCatalogos', r.id, r);
  return r;
};

// { id?, producto, codigos?: [codigoLeido], reasignar? } -> { id, producto }
export const guardarProducto = async (datos) => {
  const r = await llamar('bodegaGuardarProducto')(datos);
  upsertLocal('bodegaProductos', r.id, r.producto);
  return r;
};

export const vincularCodigo = async ({ productoId, codigoLeido, reasignar = false }) => {
  const r = await llamar('bodegaVincularCodigo')({ productoId, codigoLeido, reasignar });
  if (r.reasignadoDe) actualizarCodigosLocal(r.reasignadoDe, (c) => c.filter((x) => x !== r.clave));
  actualizarCodigosLocal(productoId, (c) => (c.includes(r.clave) ? c : [...c, r.clave]));
  return r;
};

export const desvincularCodigo = async ({ productoId, clave }) => {
  const r = await llamar('bodegaDesvincularCodigo')({ productoId, clave });
  actualizarCodigosLocal(productoId, (c) => c.filter((x) => x !== clave));
  return r;
};

// ---------------- Documentos (Fase 2) ----------------

// Borradores o confirmados de un tipo, más recientes primero.
export const leerDocumentos = async ({ tipo, estado, max = 30 }) => {
  const campoOrden = estado === 'CONFIRMADO' ? 'confirmadoEn' : 'actualizadoEn';
  const snap = await getDocs(query(collection(db, COL.documentos), where('tipo', '==', tipo), where('estado', '==', estado), orderBy(campoOrden, 'desc'), limit(max)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

export const leerConfigBodega = async () => {
  const snap = await getDoc(doc(db, COL.control, 'config'));
  return snap.exists() ? snap.data() : {};
};

export const guardarBorrador = (datos) => llamar('bodegaGuardarBorrador')(datos);
export const eliminarBorrador = (id) => llamar('bodegaEliminarBorrador')({ id });
export const configurarCargaInicial = (cerrada) => llamar('bodegaConfigurarCargaInicial')({ cerrada });

// Confirma y refleja los nuevos saldos de los productos en la copia local.
export const confirmarDocumento = async (datos) => {
  const r = await llamar('bodegaConfirmarDocumento')(datos);
  (r.productos || []).forEach(({ id, ...saldo }) => upsertLocal('bodegaProductos', id, saldo));
  return r;
};
