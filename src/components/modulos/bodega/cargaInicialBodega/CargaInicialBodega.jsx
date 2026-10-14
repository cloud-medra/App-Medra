import { PackagePlus } from 'lucide-react';
import PantallaDocumento from '../shared/documentos/PantallaDocumento';

// Carga inicial del stock existente (sin guía, factura ni orden). Genera
// movimientos CARGA_INICIAL. Confirmar es una acción sensible; además el
// servidor rechaza lotes que ya tengan movimientos de otro tipo y se puede
// cerrar para todos cuando termine la carga.
const PATH_VISTA = '/bodega/cargaInicialBodega';

const CargaInicialBodega = () => (
  <PantallaDocumento
    tipo="CARGA_INICIAL"
    ruta={PATH_VISTA}
    seccion="carga"
    titulo="Carga inicial de stock · Bodega General"
    icono={PackagePlus}
    aviso="Solo para registrar el stock que ya existe, por única vez. Un lote se puede cargar varias veces mientras solo tenga cargas iniciales; si ya tuvo ingresos o salidas, usa Ingreso."
  />
);

export default CargaInicialBodega;
