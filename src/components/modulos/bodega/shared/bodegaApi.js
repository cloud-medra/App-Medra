import { httpsCallable } from 'firebase/functions';
import { collection, doc, getDoc, getDocs, limit, orderBy, query, startAfter, where } from 'firebase/firestore';
import { db, functions } from '../../../../firebaseConfig';
import { leerCatalogo, upsertLocal, refrescarCatalogo } from '../../../../stores/catalogosStore';
import { COL, TIPOS_ENTREGA } from '../../../../../functions/bodega/nucleo.mjs';
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

// Unidades en tránsito o dejadas en un centro (0 si no tiene). Lo usa
// Maestros → Centros para avisar antes de borrar.
export const unidadesEnTransitoCentro = async (centroId) => {
  const snap = await getDoc(doc(db, COL.transitoCentros, centroId));
  return snap.exists() ? (Number(snap.data().unidades) || 0) + (Number(snap.data().enCentro) || 0) : 0;
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

// Un documento (o null). 1 lectura: tras guardar o confirmar se relee solo
// ese documento en vez de las listas completas.
export const leerDocumento = async (id) => {
  const snap = await getDoc(doc(db, COL.documentos, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
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

// ---------------- Egreso y tránsito (Fase 3) ----------------

const reflejarProductos = (productos = []) => productos.forEach(({ id, ...saldo }) => upsertLocal('bodegaProductos', id, saldo));

export const egresar = async (datos) => {
  const r = await llamar('bodegaEgresar')(datos);
  reflejarProductos(r.productos);
  return r;
};

// origen: 'transito' | 'centros' (vista desde la que se actúa: su permiso).
export const gestionarTransito = async ({ origen, acciones }) => {
  const r = await llamar('bodegaGestionarTransito')({ origen, acciones });
  reflejarProductos(r.productos);
  return r;
};

// Tránsitos abiertos (todos o de un centro), del más antiguo al más nuevo.
export const leerTransitosAbiertos = async ({ centroId = null, max = 500 } = {}) => {
  const filtros = [where('estado', '==', 'ABIERTO'), ...(centroId ? [where('centroId', '==', centroId)] : [])];
  const snap = await getDocs(query(collection(db, COL.transitos), ...filtros, orderBy('fechaSalida', 'asc'), limit(max)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

export const leerHistorialTransito = async (transitoId) => {
  const snap = await getDocs(query(collection(db, COL.transitos, transitoId, 'historial'), orderBy('fecha', 'asc'), limit(200)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

const conStockEnCentro = (c) => (Number(c?.unidades) || 0) > 0 || (Number(c?.enCentro) || 0) > 0;

// Centros con unidades en tránsito o dejadas en el centro (totales
// denormalizados). Dos consultas (una por campo) unidas por id.
export const leerCentrosConTransito = async () => {
  const [enTransito, dejados] = await Promise.all([
    getDocs(query(collection(db, COL.transitoCentros), where('unidades', '>', 0), limit(300))),
    getDocs(query(collection(db, COL.transitoCentros), where('enCentro', '>', 0), limit(300))),
  ]);
  const porId = new Map([...enTransito.docs, ...dejados.docs].map((d) => [d.id, { id: d.id, ...d.data() }]));
  return [...porId.values()];
};

// Totales de tránsito de un centro (o null si ya no tiene). 1 lectura.
export const leerCentroConTransito = async (centroId) => {
  const snap = await getDoc(doc(db, COL.transitoCentros, centroId));
  const centro = snap.exists() ? { id: snap.id, ...snap.data() } : null;
  return conStockEnCentro(centro) ? centro : null;
};

// Tránsito más antiguo y próximo vencimiento de un centro (2 lecturas).
export const leerResumenCentro = async (centroId) => {
  const base = [where('centroId', '==', centroId), where('estado', '==', 'ABIERTO')];
  const [antiguo, vence] = await Promise.all([
    getDocs(query(collection(db, COL.transitos), ...base, orderBy('fechaSalida', 'asc'), limit(1))),
    getDocs(query(collection(db, COL.transitos), ...base, where('vencimiento', '>', ''), orderBy('vencimiento', 'asc'), limit(1))),
  ]);
  return {
    masAntiguo: antiguo.docs[0]?.data().fechaSalida || null,
    proximoVencimiento: vence.docs[0]?.data().vencimiento || '',
  };
};

// ---------------- Kardex y reportes (Fase 4) ----------------

const PAGINA_KARDEX = 200;

// Kardex de un producto, más reciente primero. filtros: { desde, hasta
// ('AAAA-MM-DD', hora local), tipo, centroId }. `despues`: último doc de la
// página anterior (para "Cargar más").
export const leerKardex = async (productoId, { desde, hasta, tipo, centroId } = {}, despues = null) => {
  const restricciones = [where('productoId', '==', productoId)];
  if (tipo) restricciones.push(where('tipo', '==', tipo));
  if (centroId) restricciones.push(where('centroId', '==', centroId));
  if (desde) restricciones.push(where('fecha', '>=', new Date(`${desde}T00:00:00`)));
  if (hasta) restricciones.push(where('fecha', '<=', new Date(`${hasta}T23:59:59.999`)));
  restricciones.push(orderBy('fecha', 'desc'), ...(despues ? [startAfter(despues)] : []), limit(PAGINA_KARDEX));
  const snap = await getDocs(query(collection(db, COL.movimientos), ...restricciones));
  return {
    movimientos: snap.docs.map((d) => ({ id: d.id, ...d.data() })),
    ultimo: snap.docs.length === PAGINA_KARDEX ? snap.docs[snap.docs.length - 1] : null,
  };
};

// Lotes con vencimiento hasta `hasta` ('AAAA-MM-DD'), para los filtros de
// vencidos / próximos a vencer del Maestro (solo los que tienen stock).
// `completo` = false si se llegó al límite (puede faltar el final del rango).
const MAX_LOTES_POR_VENCER = 3000;
export const leerLotesPorVencer = async (hasta) => {
  const snap = await getDocs(query(collection(db, COL.lotes), where('vencimiento', '>', ''), where('vencimiento', '<=', hasta), orderBy('vencimiento', 'asc'), limit(MAX_LOTES_POR_VENCER)));
  return {
    lotes: snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((l) => (l.disponible || 0) + (l.transito || 0) + (l.enCentro || 0) > 0),
    completo: snap.size < MAX_LOTES_POR_VENCER,
  };
};

// Lotes sin vencimiento (guardados con vencimiento null) que tienen stock,
// para el filtro "Con lotes sin vencimiento" del Maestro: completarlos más
// adelante. Igualdad sobre un campo: índice simple automático.
export const leerLotesSinVencimiento = async () => {
  const snap = await getDocs(query(collection(db, COL.lotes), where('vencimiento', '==', null), limit(MAX_LOTES_POR_VENCER)));
  return {
    lotes: snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((l) => (l.disponible || 0) + (l.transito || 0) + (l.enCentro || 0) > 0),
    completo: snap.size < MAX_LOTES_POR_VENCER,
  };
};

// Entregas (consumo) en un rango, opcionalmente de un centro y/o producto.
// Incluye lo entregado desde lo dejado en el centro.
export const leerEntregas = async ({ desde, hasta, centroId, productoId, max = 5000 }) => {
  const restricciones = [where('tipo', 'in', TIPOS_ENTREGA)];
  if (centroId) restricciones.push(where('centroId', '==', centroId));
  if (productoId) restricciones.push(where('productoId', '==', productoId));
  restricciones.push(
    where('fecha', '>=', new Date(`${desde}T00:00:00`)),
    where('fecha', '<=', new Date(`${hasta}T23:59:59.999`)),
    orderBy('fecha', 'desc'),
    limit(max),
  );
  const snap = await getDocs(query(collection(db, COL.movimientos), ...restricciones));
  return { entregas: snap.docs.map((d) => ({ id: d.id, ...d.data() })), truncado: snap.size === max };
};

// ---------------- Inventario físico (Fase 5) ----------------

export const leerEstadoBodega = async () => {
  const snap = await getDoc(doc(db, COL.control, 'estado'));
  return snap.exists() ? snap.data() : {};
};
export const leerInventario = async (id) => {
  const snap = await getDoc(doc(db, COL.inventarios, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
};
export const leerLineasInventario = async (id) => {
  const snap = await getDocs(query(collection(db, COL.inventarios, id, 'lineas'), limit(10000)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};
// Solo las líneas indicadas (1 lectura por línea): tras registrar un conteo
// se releen las líneas tocadas, no el inventario completo.
export const leerLineasInventarioPorId = async (id, lineaIds) => {
  const snaps = await Promise.all(lineaIds.map((l) => getDoc(doc(db, COL.inventarios, id, 'lineas', l))));
  return snaps.filter((s) => s.exists()).map((s) => ({ id: s.id, ...s.data() }));
};
export const leerInventarios = async (max = 20) => {
  const snap = await getDocs(query(collection(db, COL.inventarios), orderBy('fechaInicio', 'desc'), limit(max)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

export const iniciarInventario = (datos) => llamar('bodegaIniciarInventario')(datos);
export const reanudarInventario = (id) => llamar('bodegaReanudarInventario')({ id });
export const registrarConteo = (datos) => llamar('bodegaRegistrarConteo')(datos);
export const anularInventario = (datos) => llamar('bodegaAnularInventario')(datos);
// Al cerrar cambian los saldos: se vuelve a leer el maestro.
export const cerrarInventario = async (datos) => {
  const r = await llamar('bodegaCerrarInventario')(datos);
  refrescarCatalogo('bodegaProductos').catch(() => {});
  return r;
};

// ---------------- Cajas (kits) ----------------

// Listado: solo los documentos de las cajas (1 lectura por caja); el
// historial de inventarios y reposiciones no se lee acá.
export const leerCajas = async () => {
  const snap = await getDocs(query(collection(db, COL.cajas), limit(500)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
};

export const leerCaja = async (cajaId) => {
  const snap = await getDoc(doc(db, COL.cajas, cajaId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
};

// Historial de una caja ('inventarios' | 'reposiciones'), más reciente primero.
export const leerHistorialCaja = async (cajaId, tipo, maximo = 30) => {
  const snap = await getDocs(query(collection(db, COL.cajas, cajaId, tipo), orderBy('fecha', 'desc'), limit(maximo)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

// { id?, nombre, descripcion, activa, productos: [{ productoId, stockObjetivo }] } -> { id }
export const guardarCaja = (datos) => llamar('bodegaGuardarCaja')(datos);

// { cajaId, conteos: { [productoId]: contado } } -> { id, lineas, resumen }
export const inventariarCaja = (datos) => llamar('bodegaInventariarCaja')(datos);

// { cajaId, cantidades: { [productoId]: n } } -> { id, lineas, totalRepuesto, totalPendiente }.
// Descuenta de la Bodega General (FEFO por lote) y suma a la caja; refleja
// el nuevo disponible de los productos en la copia local.
export const reponerCaja = async (datos) => {
  const r = await llamar('bodegaReponerCaja')(datos);
  reflejarProductos(r.productos);
  return r;
};

// ---------------- Stock consignado ----------------

// Consignaciones registradas (una por empresa).
export const leerConsignaciones = async () => {
  const snap = await getDocs(query(collection(db, COL.consignaciones), limit(500)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

export const leerConsignacion = async (empresaId) => {
  const snap = await getDoc(doc(db, COL.consignaciones, empresaId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
};

// Lotes consignados (con dueño): todos o de una empresa. Incluye los que
// quedaron en cero (sirven para mostrar lo consignado ya consumido).
const MAX_LOTES_CONSIGNADOS = 5000;
export const leerLotesConsignados = async (empresaId = null) => {
  const filtro = empresaId ? where('propietarioId', '==', empresaId) : where('propietarioId', '>', '');
  const snap = await getDocs(query(collection(db, COL.lotes), filtro, limit(MAX_LOTES_CONSIGNADOS)));
  return { lotes: snap.docs.map((d) => ({ id: d.id, ...d.data() })), completo: snap.size < MAX_LOTES_CONSIGNADOS };
};

// { empresaId, observacion, lineas: [{ productoId, lote, vencimiento, cantidadConsignada }] }
//   -> { id, empresaNombre, lineas, cantidadLineas, totalConsignado, observacion }
export const guardarConsignacion = (datos) => llamar('bodegaGuardarConsignacion')(datos);
