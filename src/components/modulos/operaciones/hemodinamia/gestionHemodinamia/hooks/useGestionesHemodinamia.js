import { useGestionesHemodinamiaData } from './useGestionesHemodinamiaData';
import { useGestionesFiltros, usePeriodoGestiones } from '../../../shared/gestion/useGestionesFiltros';

export const useGestionesHemodinamia = (opciones) => {
  // Mismos filtros que Implantes (paginación, días, hasta hoy…). Modo
  // admisión: sin filtro de período, para que se vean todas sus gestiones.
  // El año/mes lo comparten la consulta (escucha el mes completo) y los filtros.
  const sinPeriodo = Boolean(opciones?.admision);
  const periodo = usePeriodoGestiones({ sinPeriodo });
  const data = useGestionesHemodinamiaData({ ...opciones, periodo: { anio: periodo.filtroAnio, mes: periodo.filtroMes } });
  const filtros = useGestionesFiltros(data.implantes, { sinPeriodo, periodo });

  return {
    ...data,
    ...filtros
  };
};
