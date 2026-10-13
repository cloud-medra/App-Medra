import { GestionesTable } from '../../../shared/gestion/GestionesTable';

// Tabla de Gestión de Hemodinamia: la misma de Implantes (columna Orden,
// badge de estado, numeración por página…), con el centro y atributo del
// módulo (ver shared/gestion/GestionesTable.jsx y shared/modulosGestion.js).
export const GestionesHemodinamiaTable = (props) => <GestionesTable modulo="hemodinamia" {...props} />;
