import { useEffect, useState } from 'react';
import { MODULOS as TODOS_LOS_MODULOS, MESES, MODULO_BODEGA } from '../controlMensual/constants';
import { useCierresAnio } from '../controlMensual/cierresAnioStore';
import { obtenerCelda } from '../controlMensual/resumenImputacionesStore';

// Bodega no se compara con el mes anterior (su saldo no es un monto imputado).
const MODULOS = TODOS_LOS_MODULOS.filter((m) => m.id !== MODULO_BODEGA);

const mesAnteriorDe = (mesId, anioStr) => {
  const idx = MESES.findIndex(m => m.id === mesId);
  if (idx === -1) return null;
  if (idx === 0) {
    return { mesId: MESES[MESES.length - 1].id, anio: String(Number(anioStr) - 1) };
  }
  return { mesId: MESES[idx - 1].id, anio: anioStr };
};

// Total del mes anterior por módulo desde resumenImputacionesStore (el mismo
// que usa Control Mensual): snapshot de imputaciones_periodos si el mes está
// cerrado, count()/sum() si sigue abierto, 0 sin lecturas si nunca se abrió.
// Los estados salen del listener compartido de cierres del año (si el mes
// anterior es diciembre del año pasado, se escucha ese año).
export const useComparativoMesAnterior = (periodoAbiertoInfo) => {
  const [resultado, setResultado] = useState({ clave: null, datos: {} });

  const mesAnteriorInfo = periodoAbiertoInfo
    ? mesAnteriorDe(periodoAbiertoInfo.mesId, periodoAbiertoInfo.anio)
    : null;

  const anioEstados = mesAnteriorInfo?.anio ?? periodoAbiertoInfo?.anio ?? String(new Date().getFullYear());
  const { estadosModulos, cargando: cargandoEstados } = useCierresAnio(anioEstados);

  const firma = mesAnteriorInfo && !cargandoEstados
    ? `${mesAnteriorInfo.anio}|${mesAnteriorInfo.mesId}|${MODULOS.map(m => estadosModulos[m.id]?.[mesAnteriorInfo.mesId]?.estado || '-').join(',')}`
    : null;

  useEffect(() => {
    if (!firma) return undefined;
    let cancelado = false;
    const { anio, mesId } = mesAnteriorInfo;
    Promise.all(
      MODULOS.map(async (mod) => {
        const estado = estadosModulos[mod.id]?.[mesId]?.estado;
        try {
          return [mod.id, await obtenerCelda(anio, mod.id, mesId, estado)];
        } catch (error) {
          console.error(`Error al obtener el mes anterior de ${mod.id}:`, error);
          return [mod.id, { cantidad: 0, montoTotal: 0 }];
        }
      })
    ).then((entradas) => {
      if (!cancelado) setResultado({ clave: firma, datos: Object.fromEntries(entradas) });
    });
    return () => { cancelado = true; };
    // `firma` resume mes anterior + estados de ese mes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firma]);

  const mesAnteriorNombre = mesAnteriorInfo
    ? MESES.find(m => m.id === mesAnteriorInfo.mesId)?.nombre
    : null;

  return {
    datosMesAnterior: resultado.datos,
    cargandoMesAnterior: Boolean(mesAnteriorInfo) && (firma === null || resultado.clave !== firma),
    mesAnteriorInfo: mesAnteriorInfo ? { ...mesAnteriorInfo, nombre: mesAnteriorNombre } : null
  };
};
