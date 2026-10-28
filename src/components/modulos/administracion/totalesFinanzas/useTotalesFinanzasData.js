import { useEffect, useMemo, useState } from 'react';
import { useCierresAnio } from '../controlMensual/cierresAnioStore';
import { obtenerCelda } from '../controlMensual/resumenImputacionesStore';
import { celdasAConsultar } from './totalesFinanzas';

// Celdas (módulo, mes) de un total de Finanzas, con las lecturas que ya
// hacen Control Mensual y Período actual (y compartiendo sus cachés):
//   - Estados del año: el listener compartido de cierres_periodos.
//   - Mes cerrado: snapshot de imputaciones_periodos (una consulta por año)
//     o, en Bodega, la foto de bodega_periodos.
//   - Mes abierto: count()/sum() sobre las imputadas o los movimientos de
//     Bodega (1 lectura por cada 1.000 documentos), recordado 5 minutos.
//   - Mes nunca abierto: 0, sin leer.
// `errorEstados`: no se pudo escuchar cierres_periodos. Sin estados todo
// parecería "sin abrir" ($0), así que quien muestre el total debe tratarlo
// como no disponible.
export const useTotalesFinanzasData = ({ moduloIds, anio, mes }) => {
  const { estadosModulos, cargando: cargandoEstados, error: errorEstados } = useCierresAnio(anio);
  const [resultado, setResultado] = useState({ clave: null, celdas: [] });

  const celdas = useMemo(
    () => (cargandoEstados ? null : celdasAConsultar(moduloIds, estadosModulos, mes)),
    [cargandoEstados, moduloIds, estadosModulos, mes]
  );
  const firma = celdas ? `${anio}|${mes}|${celdas.map((c) => `${c.modulo}:${c.mes}:${c.estado}`).join(',')}` : null;

  useEffect(() => {
    if (!firma) return undefined;
    let cancelado = false;
    Promise.all(celdas.map((c) => obtenerCelda(anio, c.modulo, c.mes, c.estado)
      .then((r) => ({ ...c, ...r }))
      .catch((error) => {
        console.error(`Error al obtener ${c.modulo} ${c.mes} ${anio}:`, error);
        return { ...c, cantidad: 0, montoTotal: 0, error: true };
      })))
      .then((lista) => { if (!cancelado) setResultado({ clave: firma, celdas: lista }); });
    return () => { cancelado = true; };
    // `firma` resume año, mes y estados de las celdas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firma]);

  return {
    celdas: resultado.clave === firma ? resultado.celdas : [],
    estadosModulos,
    errorEstados: errorEstados || null,
    cargando: !firma || resultado.clave !== firma,
  };
};
