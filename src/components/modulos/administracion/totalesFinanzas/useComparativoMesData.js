import { useEffect, useState } from 'react';
import { collection, count, getAggregateFromServer, query, sum, where } from 'firebase/firestore';
import { db } from '../../../../firebaseConfig';
import { FUENTES_COMPARATIVO, periodosAConsultar } from './comparativoMes';

// Totales del Comparativo mensual (ver comparativoMes.js). Por módulo y mes
// se hace un count()/sum('total') con rango sobre la fecha del documento en
// cada período donde puede estar imputado (hasta 3): 1 lectura por cada
// 1.000 documentos del rango (mínimo 1 por consulta). Un sum() con filtro
// necesita un índice compuesto con el campo sumado: `documentos` (fecha,
// total) y (fchEmis, total), ver indicesAgregaciones.test.js. Se recuerda 5 minutos para
// no repetir lecturas al mover el rango de un lado a otro.
const TTL_MS = 5 * 60 * 1000;
const cache = new Map(); // clave -> { ts, promesa }

const sumarRango = (modulo, periodo, campo, inicio, fin) => {
  const clave = `${modulo}|${periodo.anio}|${periodo.mesId}|${campo}|${inicio}|${fin}`;
  const previo = cache.get(clave);
  if (previo && Date.now() - previo.ts < TTL_MS) return previo.promesa;
  const ref = collection(db, `${modulo}_imputadas`, periodo.anio, 'meses', periodo.mesId, 'documentos');
  const promesa = getAggregateFromServer(
    query(ref, where(campo, '>=', inicio), where(campo, '<=', fin)),
    { cantidad: count(), montoTotal: sum('total') }
  )
    .then((agg) => ({ cantidad: agg.data().cantidad || 0, montoTotal: agg.data().montoTotal || 0 }))
    .catch((error) => { cache.delete(clave); throw error; });
  cache.set(clave, { ts: Date.now(), promesa });
  return promesa;
};

// Total de un módulo en un rango de fechas, sumando los períodos posibles.
const totalModulo = async (modulo, campo, rango, tope) => {
  const partes = await Promise.all(periodosAConsultar(rango, tope)
    .map((p) => sumarRango(modulo, p, campo, rango.inicio, rango.fin)));
  return partes.reduce((acc, p) => ({ cantidad: acc.cantidad + p.cantidad, montoTotal: acc.montoTotal + p.montoTotal }), { cantidad: 0, montoTotal: 0 });
};

const totalFuente = async ({ moduloIds, campoFecha }, rangos, tope) => {
  const porModulo = await Promise.all(moduloIds.map(async (moduloId) => {
    try {
      const [anterior, actual] = await Promise.all([
        totalModulo(moduloId, campoFecha, rangos.anterior, tope),
        totalModulo(moduloId, campoFecha, rangos.actual, tope),
      ]);
      return { moduloId, anterior, actual, error: false };
    } catch (error) {
      console.error(`Error en el comparativo de ${moduloId}:`, error);
      const cero = { cantidad: 0, montoTotal: 0 };
      return { moduloId, anterior: cero, actual: cero, error: true };
    }
  }));
  const suma = (lado) => porModulo.reduce((s, m) => s + m[lado].montoTotal, 0);
  return { porModulo, anterior: suma('anterior'), actual: suma('actual'), conError: porModulo.some((m) => m.error) };
};

// `rangos`: rangosComparativo(...). Devuelve { consumos, facturas } o null mientras carga.
export const useComparativoMesData = (rangos) => {
  const firma = `${rangos.anterior.inicio}|${rangos.anterior.fin}|${rangos.actual.inicio}|${rangos.actual.fin}`;
  const [resultado, setResultado] = useState({ firma: null, datos: null });

  useEffect(() => {
    let cancelado = false;
    const tope = { anio: rangos.actual.anio, mes: rangos.actual.mes };
    Promise.all(Object.entries(FUENTES_COMPARATIVO).map(async ([clave, fuente]) => [clave, await totalFuente(fuente, rangos, tope)]))
      .then((entradas) => { if (!cancelado) setResultado({ firma, datos: Object.fromEntries(entradas) }); });
    return () => { cancelado = true; };
    // `firma` resume los dos rangos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firma]);

  return resultado.firma === firma ? resultado.datos : null;
};
