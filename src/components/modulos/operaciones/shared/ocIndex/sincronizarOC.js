// "Sincronizar OC" de Gestión de Implantes y de Cargas de Consignación (ver
// ejecutarSincronizacionOCConsignacion al final). Implantes, lecturas por corrida:
//   1 (ocImport/meta) + las gestiones con ocPendiente == true cuya fecha cae
//   dentro del rango de fechas del índice (las demás no pueden cruzar).
// El índice sale de la caché local o, si cambió la versión, de Storage.
// Escrituras: solo las gestiones que obtuvieron al menos una OC (más su log
// de auditoría en el mismo batch), y las que tenían el flag desactualizado.
import {
  collectionGroup, query, where, getDocs, doc, collection, writeBatch, FieldPath, serverTimestamp
} from 'firebase/firestore';
import { db } from '../../../../../firebaseConfig';
import { agruparIndiceOC, cruzarGestionesOC, cruzarRegistrosConsignacionOC } from './indiceOC';
import { obtenerIndiceOC, registrarSincronizacionOC, limpiarInvalidacionesPendientes } from './indiceOCRemoto';
import { invalidarOCGestiones } from './invalidarOCGestiones';

const PREFIJO_IMPLANTES = 'implantes_gestiones/';
const PREFIJO_CONSIGNACION = 'consignacion_registros/';
// 2 operaciones por gestión con OC (update + log): 450 ops = 225 gestiones.
const MAX_OPS_BATCH = 450;

const logOCAsignada = (detalles, userData) => ({
  accion: 'OC_ASIGNADA',
  detalles,
  active: true,
  usuario: userData?.nombreCompleto || 'Usuario Desconocido',
  usuarioEmail: userData?.email || '',
  timestamp: serverTimestamp()
});

// Escribe `items` en batches de hasta MAX_OPS_BATCH operaciones.
// agregar(batch, item) agrega las operaciones del ítem y devuelve cuántas
// fueron (como máximo 2). Un batch que falla no detiene los siguientes:
// sus ítems quedan en erroresEscritura.
const escribirPorLotes = async (items, agregar) => {
  const erroresEscritura = [];
  const escritas = [];
  let escrituras = 0;
  let batch = writeBatch(db);
  let ops = 0;
  let pendientesDelBatch = [];

  const confirmar = async () => {
    if (ops === 0) return;
    try {
      await batch.commit();
      escritas.push(...pendientesDelBatch);
      escrituras += ops;
    } catch (err) {
      console.error('Error al guardar OC:', err);
      pendientesDelBatch.forEach(a => erroresEscritura.push({ refPath: a.refPath, error: err.message }));
    }
    batch = writeBatch(db);
    ops = 0;
    pendientesDelBatch = [];
  };

  for (const item of items) {
    if (ops + 2 > MAX_OPS_BATCH) await confirmar();
    ops += agregar(batch, item);
    pendientesDelBatch.push(item);
  }
  await confirmar();
  return { escritas, erroresEscritura, escrituras };
};

// Paso 1 (barato): meta + índice. Permite avisar "no hay importaciones
// nuevas" antes de consultar las gestiones pendientes.
export const prepararSincronizacionOC = async () => {
  const { meta, indice, desdeCache } = await obtenerIndiceOC();
  if (!meta || Object.keys(indice).length === 0) {
    throw new Error('Aún no hay un índice de OC: importa el Excel en Documentos → Importar Detalles OC.');
  }
  return { meta, indice, desdeCache, sinNovedades: meta.ultimaSyncVersion === meta.version };
};

// Paso 2: consulta pendientes, cruza y escribe.
export const ejecutarSincronizacionOC = async ({ meta, indice }, { userData } = {}) => {
  // OC cambiadas por una reimportación que no se pudieron aplicar a las
  // gestiones (quien importó no tenía permiso de Implantes): se aplican antes
  // de buscar pendientes, para que esas gestiones entren en esta corrida.
  let invalidacion = null;
  const pendientes = meta.ocInvalidacionesPendientes || [];
  if (pendientes.length > 0) {
    invalidacion = { ...(await invalidarOCGestiones(pendientes, { usuario: userData })), correcciones: pendientes.length };
    if (!invalidacion.error) await limpiarInvalidacionesPendientes();
  }

  const q = query(
    collectionGroup(db, 'detalles'),
    where('ocPendiente', '==', true),
    where('fecha', '>=', meta.fechaMin),
    where('fecha', '<=', meta.fechaMax)
  );
  const snap = await getDocs(q);
  const gestiones = snap.docs
    .filter(d => d.ref.path.startsWith(PREFIJO_IMPLANTES))
    .map(d => ({ id: d.id, refPath: d.ref.path, ...d.data() }));

  const { actualizaciones, detalle, contadores } = cruzarGestionesOC(gestiones, agruparIndiceOC(indice));

  const { escritas, erroresEscritura, escrituras } = await escribirPorLotes(actualizaciones, (batch, act) => {
    const ref = doc(db, act.refPath);
    // Rutas de campo puntuales (ocPorItem.<itemId>): no se reescribe el
    // mapa completo ni el arreglo de cotizaciones.
    const pares = Object.entries(act.asignaciones).flatMap(([itemId, oc]) => [new FieldPath('ocPorItem', itemId), oc]);
    batch.update(ref, 'ocPendiente', act.ocPendiente, 'ocActualizadoEn', serverTimestamp(), ...pares);
    if (pares.length === 0) return 1;
    batch.set(doc(collection(ref, 'logs')), logOCAsignada({ asignaciones: act.asignaciones, origen: 'SINCRONIZAR_OC' }, userData));
    return 2;
  });
  let escriturasMeta = 0;

  try {
    await registrarSincronizacionOC(meta.version);
    escriturasMeta = 1;
  } catch (err) {
    console.warn('No se pudo registrar la sincronización en ocImport/meta:', err);
  }

  const asignadasEscritas = escritas.reduce((n, a) => n + Object.keys(a.asignaciones).length, 0);
  return {
    gestionesRevisadas: gestiones.length,
    gestionesActualizadas: escritas.filter(a => Object.keys(a.asignaciones).length > 0).length,
    itemsActualizados: asignadasEscritas,
    contadores,
    detalle,
    erroresEscritura,
    invalidacion,
    lecturasFirestore: 1 + Math.max(1, snap.size) + (invalidacion?.lecturas || 0),
    escriturasFirestore: escrituras + escriturasMeta + (invalidacion?.escrituras || 0) + (invalidacion && !invalidacion.error ? 1 : 0)
  };
};

// Consignación: mismo índice y mismo cruce (cruzarRegistrosConsignacionOC),
// pero cada registro es un ítem y la OC va en su campo `orden` (la columna
// ORDEN de Registro). Pendientes = registros con orden == '' dentro del
// rango de fechas del índice (índice compuesto orden + fecha). Un `orden`
// escrito a mano no se toca. No registra la versión en ocImport/meta (eso es
// de Implantes y Consignación no puede escribir ese documento), así que no
// hay aviso de "sin importaciones nuevas".
export const ejecutarSincronizacionOCConsignacion = async ({ meta, indice }, { userData } = {}) => {
  const q = query(
    collectionGroup(db, 'detalles'),
    where('orden', '==', ''),
    where('fecha', '>=', meta.fechaMin),
    where('fecha', '<=', meta.fechaMax)
  );
  const snap = await getDocs(q);
  const registros = snap.docs
    .filter(d => d.ref.path.startsWith(PREFIJO_CONSIGNACION))
    .map(d => ({ id: d.id, refPath: d.ref.path, ...d.data() }));

  const { asignaciones, detalle, contadores } = cruzarRegistrosConsignacionOC(registros, agruparIndiceOC(indice));

  const { escritas, erroresEscritura, escrituras } = await escribirPorLotes(asignaciones, (batch, { refPath, oc }) => {
    const ref = doc(db, refPath);
    batch.update(ref, { orden: oc, ocActualizadoEn: serverTimestamp() });
    batch.set(doc(collection(ref, 'logs')), logOCAsignada({ orden: oc, origen: 'SINCRONIZAR_OC' }, userData));
    return 2;
  });

  return {
    gestionesRevisadas: registros.length,
    gestionesActualizadas: escritas.length,
    itemsActualizados: escritas.length,
    contadores,
    detalle,
    erroresEscritura,
    invalidacion: null,
    lecturasFirestore: 1 + Math.max(1, snap.size),
    escriturasFirestore: escrituras
  };
};
