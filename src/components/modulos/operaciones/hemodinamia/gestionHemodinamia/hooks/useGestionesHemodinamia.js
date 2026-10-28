import { useGestionesHemodinamiaData } from './useGestionesHemodinamiaData';
import { useGestionesFiltros } from '../../../shared/gestion/useGestionesFiltros';
import { moduloGestion } from '../../../shared/modulosGestion';
import { useFiltroInicial } from '../../../../../../stores/filtroInicialStore';

export const useGestionesHemodinamia = (opciones) => {
  const data = useGestionesHemodinamiaData(opciones);
  // Mismos filtros que Implantes (paginación, días, hasta hoy…). Modo
  // admisión: sin filtro de período, para que se vean todas sus gestiones.
  // Filtro pedido desde el panel del Inicio (no en modo admisión).
  const filtroInicial = useFiltroInicial(opciones?.admision ? null : moduloGestion('hemodinamia').rutas.gestion);
  const filtros = useGestionesFiltros(data.implantes, { sinPeriodo: Boolean(opciones?.admision), filtroInicial });

  return {
    ...data,
    ...filtros
  };
};
