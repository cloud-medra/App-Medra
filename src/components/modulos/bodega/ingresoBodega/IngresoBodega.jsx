import { ArrowDownToLine } from 'lucide-react';
import PantallaDocumento from '../shared/documentos/PantallaDocumento';

// Ingreso de stock a la Bodega General con guía de despacho o factura.
// Genera movimientos INGRESO al confirmar (functions/bodega).
const PATH_VISTA = '/bodega/ingresoBodega';

const IngresoBodega = () => (
  <PantallaDocumento tipo="INGRESO" ruta={PATH_VISTA} seccion="documento" titulo="Ingreso por documento · Bodega General" icono={ArrowDownToLine} />
);

export default IngresoBodega;
