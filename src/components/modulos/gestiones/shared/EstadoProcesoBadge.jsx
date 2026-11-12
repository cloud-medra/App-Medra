import { getEstadoProcesoClase } from './estadosProceso';

const TAMANOS = {
  xs: 'px-1.5 py-0.5 text-pequeno',
  sm: 'px-2 py-0.5 text-pequeno',
};

// Badge de estado de Procesos (Laboratorio / Vacunatorio). El color sale del
// mapeo centralizado en estadosProceso.js.
const EstadoProcesoBadge = ({ estado, fallback = '', size = 'sm', className = '' }) => {
  const texto = estado || fallback;
  if (!texto) return null;
  return (
    <span className={`inline-block rounded-full text-etiqueta border whitespace-nowrap ${TAMANOS[size] || TAMANOS.sm} ${getEstadoProcesoClase(texto)} ${className}`}>
      {texto}
    </span>
  );
};

export default EstadoProcesoBadge;
