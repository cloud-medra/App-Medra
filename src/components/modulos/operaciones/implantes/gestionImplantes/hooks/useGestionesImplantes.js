import { useGestionesImplantesData } from './useGestionesImplantesData';
import { useGestionesFiltros } from '../../../shared/gestion/useGestionesFiltros';

export const useGestionesImplantes = (opciones) => {
  const data = useGestionesImplantesData(opciones);
  // Modo admisión (p. ej. desde Reporte Info): sin filtro de período, para
  // que se vean todas sus gestiones.
  const filtros = useGestionesFiltros(data.implantes, { sinPeriodo: Boolean(opciones?.admision) });

  return {
    ...data,
    ...filtros
  };
};