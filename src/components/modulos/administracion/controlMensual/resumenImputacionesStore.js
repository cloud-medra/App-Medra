import { collection, count, getAggregateFromServer, getDocs, query, sum, where } from 'firebase/firestore';
import { db } from '../../../../firebaseConfig';
import { COLECCIONES, MODULO_BODEGA } from './constants';
import { obtenerSnapshotMensual } from './snapshotMensual';
import { celdaBodega } from './bodegaPeriodoStore';

// Cantidad y monto imputado por (año, módulo, mes), compartido por Control
// Mensual y Resumen Periodo Abierto. Antes cada montaje hacía 60 getDocs
// (5 módulos × 12 meses) descargando todas las imputadas del año.
//
//   - Mes nunca abierto (sin documento en cierres_periodos): 0, sin leer.
//   - Mes CERRADO: snapshot de imputaciones_periodos, con UNA consulta por
//     año para todos los meses (si falta, se calcula y guarda una vez).
//   - Mes ABIERTO/REABIERTO: getAggregateFromServer con count() y
//     sum('total') (1 lectura por cada 1.000 documentos). Se recuerda
//     TTL_ABIERTO_MS porque sigue cambiando mientras se imputa.
// "Actualizar" y abrir/cerrar/reabrir un mes invalidan el año.

const TTL_ABIERTO_MS = 5 * 60 * 1000;
const CERO = Object.freeze({ cantidad: 0, montoTotal: 0 });
export const ESTADOS_ABIERTOS = ['ABIERTO', 'REABIERTO'];

const celdas = new Map(); // `${anio}|${modulo}|${mes}` -> { estado, ts, promesa }
const snapshotsPorAnio = new Map(); // anio -> Promise<Map(idSnapshot -> data)>

const leerSnapshotsAnio = (anio) => {
  if (!snapshotsPorAnio.has(anio)) {
    const promesa = getDocs(query(collection(db, COLECCIONES.IMPUTACIONES), where('anio', '==', String(anio))))
      .then((snap) => new Map(snap.docs.map((d) => [d.id, d.data()])))
      .catch((error) => { snapshotsPorAnio.delete(anio); throw error; });
    snapshotsPorAnio.set(anio, promesa);
  }
  return snapshotsPorAnio.get(anio);
};

const desdeSnapshot = async (anio, modulo, mes) => {
  const snapshots = await leerSnapshotsAnio(anio);
  const guardado = snapshots.get(`${anio}_${mes}_${modulo}`);
  if (guardado) return { cantidad: guardado.cantidad || 0, montoTotal: guardado.montoTotal || 0 };
  // Mes cerrado antes de que existieran los snapshots: se calcula y guarda una vez.
  return obtenerSnapshotMensual(modulo, anio, mes);
};

const agregarMesAbierto = async (anio, modulo, mes) => {
  const ref = collection(db, `${modulo}_imputadas`, String(anio), 'meses', mes, 'documentos');
  const agg = await getAggregateFromServer(ref, { cantidad: count(), montoTotal: sum('total') });
  const { cantidad, montoTotal } = agg.data();
  return { cantidad: cantidad || 0, montoTotal: montoTotal || 0 };
};

/** Total de una celda según el estado del mes en cierres_periodos. */
export const obtenerCelda = (anio, modulo, mes, estado) => {
  if (!estado) return Promise.resolve(CERO);
  const clave = `${anio}|${modulo}|${mes}`;
  const abierto = ESTADOS_ABIERTOS.includes(estado);
  const previo = celdas.get(clave);
  if (previo && previo.estado === estado && (!abierto || Date.now() - previo.ts < TTL_ABIERTO_MS)) {
    return previo.promesa;
  }
  // Bodega no imputa: movimientos y saldo valorizado del periodo (bodegaPeriodoStore).
  const calcular = modulo === MODULO_BODEGA
    ? celdaBodega(anio, mes, abierto)
    : (abierto ? agregarMesAbierto(anio, modulo, mes) : desdeSnapshot(anio, modulo, mes));
  const promesa = calcular.catch((error) => { celdas.delete(clave); throw error; });
  celdas.set(clave, { estado, ts: Date.now(), promesa });
  return promesa;
};

/** Olvida todo lo calculado del año (Actualizar, o tras abrir/cerrar/reabrir). */
export const invalidarResumenAnio = (anio) => {
  const prefijo = `${anio}|`;
  [...celdas.keys()].forEach((k) => { if (k.startsWith(prefijo)) celdas.delete(k); });
  snapshotsPorAnio.delete(String(anio));
  snapshotsPorAnio.delete(anio);
};
