import GestionGestiones from '../../shared/gestion/GestionGestiones';
import { DrawersOverlay, LogDrawer, ConfigDrawer } from './GestionesHemodinamiaDrawers';
import { useGestionesHemodinamia } from './hooks/useGestionesHemodinamia';
import { formatearFecha } from './utils/gestionesImportExport';
import GestionesHemodinamiaDetalleView from './components/GestionesHemodinamiaDetalleView';

// Hemodinamia → Gestion: la misma pantalla que Implantes (formulario
// colapsable, filtros por día y estado, paginación, Sincronizar OC…; ver
// shared/gestion/GestionGestiones.jsx), con el hook de datos (colecciones,
// precios con recargo de Hemodinamia) y el detalle propios del módulo.
const COMPONENTES = {
  useGestiones: useGestionesHemodinamia,
  DetalleView: GestionesHemodinamiaDetalleView,
  DrawersOverlay,
  LogDrawer,
  ConfigDrawer,
  formatearFecha,
};

const GestionHemodinamia = ({ apertura } = {}) => (
  <GestionGestiones modulo="hemodinamia" componentes={COMPONENTES} apertura={apertura} />
);

export default GestionHemodinamia;
