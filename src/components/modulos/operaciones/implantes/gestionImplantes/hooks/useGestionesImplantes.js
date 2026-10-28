import { useGestionesImplantesData } from './useGestionesImplantesData';
import { useGestionesFiltros } from '../../../shared/gestion/useGestionesFiltros';
import { moduloGestion } from '../../../shared/modulosGestion';
import { useFiltroInicial } from '../../../../../../stores/filtroInicialStore';

export const useGestionesImplantes = (opciones) => {
  const data = useGestionesImplantesData(opciones);
  // Modo admisión (p. ej. desde Reporte Info): sin filtro de período, para
  // que se vean todas sus gestiones.
  // Filtro pedido desde el panel del Inicio (no en modo admisión).
  const filtroInicial = useFiltroInicial(opciones?.admision ? null : moduloGestion('implantes').rutas.gestion);
  const filtros = useGestionesFiltros(data.implantes, { sinPeriodo: Boolean(opciones?.admision), filtroInicial });

  return {
    ...data,
    ...filtros
  };
};