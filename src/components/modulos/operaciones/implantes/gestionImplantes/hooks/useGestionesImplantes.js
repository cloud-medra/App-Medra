import { useGestionesImplantesData } from './useGestionesImplantesData';
import { useGestionesFiltros, usePeriodoGestiones } from '../../../shared/gestion/useGestionesFiltros';
import { useConteosPeriodosGestiones, useMesInicialConDatos } from '../../../shared/gestion/usePeriodosConDatos';
import { moduloGestion } from '../../../shared/modulosGestion';
import { useFiltroInicial } from '../../../../../../stores/filtroInicialStore';

export const useGestionesImplantes = (opciones) => {
  // Modo admisión (p. ej. desde Reporte Info): sin filtro de período, para
  // que se vean todas sus gestiones.
  // Filtro pedido desde el panel del Inicio (no en modo admisión).
  const filtroInicial = useFiltroInicial(opciones?.admision ? null : moduloGestion('implantes').rutas.gestion);
  const sinPeriodo = Boolean(opciones?.admision);
  // El año/mes del filtro decide qué escucha la consulta (el mes completo),
  // así que se crea acá y lo comparten el hook de datos y el de filtros.
  const periodo = usePeriodoGestiones({ sinPeriodo, filtroInicial });
  // Años/meses con gestiones (conteos, sin cargarlas) y mes inicial: el
  // actual si tiene gestiones, si no el más reciente. Ver usePeriodosConDatos.
  const conteos = useConteosPeriodosGestiones(moduloGestion('implantes').coleccionGestiones, periodo.filtroAnio, { habilitado: !sinPeriodo });
  useMesInicialConDatos(periodo, conteos, { habilitado: !sinPeriodo && !filtroInicial?.mes });
  const data = useGestionesImplantesData({ ...opciones, periodo: { anio: periodo.filtroAnio, mes: periodo.filtroMes } });
  const filtros = useGestionesFiltros(data.implantes, { sinPeriodo, filtroInicial, periodo, conteos });

  return {
    ...data,
    ...filtros
  };
};