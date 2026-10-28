import { useGestionesHemodinamiaData } from './useGestionesHemodinamiaData';
import { useGestionesFiltros } from '../../../shared/gestion/useGestionesFiltros';

export const useGestionesHemodinamia = (opciones) => {
  const data = useGestionesHemodinamiaData(opciones);
  // Mismos filtros que Implantes (paginación, días, hasta hoy…). Modo
  // admisión: sin filtro de período, para que se vean todas sus gestiones.
  const filtros = useGestionesFiltros(data.implantes, { sinPeriodo: Boolean(opciones?.admision) });

  return {
    ...data,
    ...filtros
  };
};
