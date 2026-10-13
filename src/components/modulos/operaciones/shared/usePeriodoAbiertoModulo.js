import { usePeriodoAbiertoStore } from '../../../../hooks/usePeriodoAbiertoStore';

/**
 * Período ABIERTO o REABIERTO del módulo, en tiempo real, desde el listener
 * compartido de cierres_periodos (src/stores/periodosStore.js). La fuente de
 * verdad es cierres_periodos (el documento 'periodo_activo_{modulo}' es solo
 * un puntero que no se actualiza al cerrar, por eso no se usa aquí).
 */
export const usePeriodoAbiertoModulo = (moduloId) => {
  const { periodo, cargando } = usePeriodoAbiertoStore(moduloId); // { id, anio, mes, modulo, estado }
  return { periodoAbierto: periodo, cargandoPeriodo: cargando };
};
