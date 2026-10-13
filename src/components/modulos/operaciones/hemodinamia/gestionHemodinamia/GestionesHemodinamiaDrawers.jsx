// Drawers de Gestión de Hemodinamia: los mismos de Implantes (logs con el
// detalle de cada cambio, Configuración con Exportar / Importación masiva y
// "Marcar OC pendiente"), con los textos del módulo (ver
// shared/modulosGestion.js).
import {
  DrawersOverlay,
  HistorialLogsContenido as HistorialLogsImplantes,
  LogDrawer as LogDrawerImplantes,
  ConfigDrawer as ConfigDrawerImplantes,
} from '../../implantes/gestionImplantes/GestionesImplanteDrawers';

export { DrawersOverlay };
export const HistorialLogsContenido = (props) => <HistorialLogsImplantes modulo="hemodinamia" {...props} />;
export const LogDrawer = (props) => <LogDrawerImplantes modulo="hemodinamia" {...props} />;
export const ConfigDrawer = (props) => <ConfigDrawerImplantes modulo="hemodinamia" {...props} />;
