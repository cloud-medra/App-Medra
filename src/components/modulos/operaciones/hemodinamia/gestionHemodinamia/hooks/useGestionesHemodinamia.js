import { useGestionesHemodinamiaData } from './useGestionesHemodinamiaData';
import { useGestionesFiltros, usePeriodoGestiones } from '../../../shared/gestion/useGestionesFiltros';
import { useConteosPeriodosGestiones, useMesInicialConDatos } from '../../../shared/gestion/usePeriodosConDatos';
import { moduloGestion } from '../../../shared/modulosGestion';

export const useGestionesHemodinamia = (opciones) => {
  // Mismos filtros que Implantes (paginación, días, hasta hoy…). Modo
  // admisión: sin filtro de período, para que se vean todas sus gestiones.
  // El año/mes lo comparten la consulta (escucha el mes completo) y los filtros.
  const sinPeriodo = Boolean(opciones?.admision);
  const periodo = usePeriodoGestiones({ sinPeriodo });
  // Años/meses con gestiones y mes inicial (igual que Implantes).
  const conteos = useConteosPeriodosGestiones(moduloGestion('hemodinamia').coleccionGestiones, periodo.filtroAnio, { habilitado: !sinPeriodo });
  useMesInicialConDatos(periodo, conteos, { habilitado: !sinPeriodo });
  const data = useGestionesHemodinamiaData({ ...opciones, periodo: { anio: periodo.filtroAnio, mes: periodo.filtroMes } });
  const filtros = useGestionesFiltros(data.implantes, { sinPeriodo, periodo, conteos });

  return {
    ...data,
    ...filtros
  };
};
