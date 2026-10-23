import { collection, count, doc, getAggregateFromServer, getDoc, getDocs, limit, orderBy, query, sum, where } from 'firebase/firestore';
import { db } from '../../../../firebaseConfig';
import {
  COL, COL_PERIODOS, LINEAS_PERIODO, idPeriodo, ordenPeriodo, lineasVacias, saldoFinalPeriodo,
} from '../../../../../functions/bodega/nucleo.mjs';

// Bodega en Control Mensual y Período Actual: saldo valorizado del periodo.
//   - Mes CERRADO: la foto fija bodega_periodos/{anio}_{mes} (la guarda el
//     trigger bodegaPeriodo al cerrar). 1 lectura.
//   - Mes ABIERTO/REABIERTO: en vivo. Saldo inicial = saldo final de la
//     foto anterior; cada línea de la cuadratura con sum() sobre
//     bodega_movimientos del periodo (más los hechos sin periodo abierto,
//     que se sumarán a este). 1 lectura por cada 1.000 movimientos por consulta.
// Devuelve { saldoInicial, lineas, saldoFinal, movimientos, saldoGeneral?,
// saldoTransito?, unidadesSinCosto?, cuadre?, enVivo }.

const sumarConsulta = async (filtro) => {
  const base = collection(db, COL.movimientos);
  const total = await getAggregateFromServer(query(base, filtro), { n: count() });
  const movimientos = total.data().n || 0;
  if (!movimientos) return { movimientos, lineas: lineasVacias() };
  const porLinea = await Promise.all(Object.keys(LINEAS_PERIODO).map(async (linea) => {
    const agg = await getAggregateFromServer(query(base, filtro, where('linea', '==', linea)), { unidades: sum('cantidad'), valor: sum('valor') });
    return [linea, { unidades: agg.data().unidades || 0, valor: agg.data().valor || 0 }];
  }));
  return { movimientos, lineas: Object.fromEntries(porLinea) };
};

const sumarLineasDe = (a, b) => Object.fromEntries(Object.keys(LINEAS_PERIODO).map((l) => [l, {
  unidades: (a[l]?.unidades || 0) + (b[l]?.unidades || 0), valor: (a[l]?.valor || 0) + (b[l]?.valor || 0),
}]));

// Saldo final de la foto anterior a (anio, mes); 0 si no hay.
export const saldoAnteriorBodega = async (anio, mes) => {
  const snap = await getDocs(query(collection(db, COL_PERIODOS), where('orden', '<', ordenPeriodo(anio, mes)), orderBy('orden', 'desc'), limit(1)));
  return snap.empty ? 0 : Number(snap.docs[0].get('saldoFinal')) || 0;
};

export const resumenBodegaEnVivo = async (anio, mes) => {
  const id = idPeriodo(String(anio), mes);
  const [saldoInicial, delPeriodo, sinPeriodo] = await Promise.all([
    saldoAnteriorBodega(String(anio), mes),
    sumarConsulta(where('periodoId', '==', id)),
    sumarConsulta(where('periodoId', '==', null)),
  ]);
  const lineas = sumarLineasDe(delPeriodo.lineas, sinPeriodo.lineas);
  return {
    saldoInicial, lineas, saldoFinal: saldoFinalPeriodo(saldoInicial, lineas),
    movimientos: delPeriodo.movimientos + sinPeriodo.movimientos, sinPeriodo: sinPeriodo.movimientos, enVivo: true,
  };
};

export const fotoBodega = async (anio, mes) => {
  const snap = await getDoc(doc(db, COL_PERIODOS, idPeriodo(String(anio), mes)));
  if (!snap.exists()) return null;
  const f = snap.data();
  return {
    saldoInicial: f.saldoInicial || 0, lineas: { ...lineasVacias(), ...(f.lineas || {}) }, saldoFinal: f.saldoFinal || 0,
    movimientos: f.movimientos || 0, saldoGeneral: f.saldoGeneral || 0, saldoTransito: f.saldoTransito || 0,
    unidadesSinCosto: f.unidadesSinCosto || 0, cuadre: f.cuadre || null, enVivo: false,
  };
};

// Resumen según el estado del mes. Un mes cerrado sin foto (el trigger aún
// no termina) se calcula en vivo.
export const resumenBodega = async (anio, mes, abierto) => {
  if (!abierto) {
    const foto = await fotoBodega(anio, mes);
    if (foto) return foto;
  }
  return resumenBodegaEnVivo(anio, mes);
};

// Celda de Control Mensual: movimientos y saldo final.
export const celdaBodega = async (anio, mes, abierto) => {
  const r = await resumenBodega(anio, mes, abierto);
  return { cantidad: r.movimientos, montoTotal: r.saldoFinal, bodega: r };
};
