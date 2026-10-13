import GestionGestiones from '../../shared/gestion/GestionGestiones';
import { DrawersOverlay, LogDrawer, ConfigDrawer } from './GestionesImplanteDrawers';
import { useGestionesImplantes } from './hooks/useGestionesImplantes';
import { formatearFecha } from './utils/gestionesImportExport';
import GestionesImplantesDetalleView from './components/GestionesImplantesDetalleView';

// Implantes → Gestion: pantalla compartida con Hemodinamia (ver
// shared/gestion/GestionGestiones.jsx); aquí, lo propio de Implantes.
// onAbrirZonasDiagnostico (opcional, del Dashboard): enlace del Bodymap al
// Maestro "Zonas por diagnóstico".
// apertura (opcional, del Dashboard, desde Reporte Info → "Gestión
// implante"): { admision, refPath? }. Con refPath abre directo el detalle de
// esa gestión; sin él, el listado filtrado por la admisión (todas sus
// gestiones, sin la ventana de las más recientes). Solo valor inicial: el
// Dashboard remonta la vista en cada apertura.
const COMPONENTES = {
  useGestiones: useGestionesImplantes,
  DetalleView: GestionesImplantesDetalleView,
  DrawersOverlay,
  LogDrawer,
  ConfigDrawer,
  formatearFecha,
};

const GestionesImplantes = ({ onAbrirZonasDiagnostico, apertura } = {}) => (
  <GestionGestiones modulo="implantes" componentes={COMPONENTES} onAbrirZonasDiagnostico={onAbrirZonasDiagnostico} apertura={apertura} />
);

export default GestionesImplantes;
