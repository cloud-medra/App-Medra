import { coloresEstadoGestion } from './estadosGestion';

// Etiqueta del estado operativo de una gestión de Implantes: fondo suave,
// texto oscuro del mismo tono, borde sutil y punto del color del estado.
// `texto` es lo que se muestra (por defecto el propio estado); `ancho`
// fija un ancho mínimo para que la columna quede pareja.
const EstadoBadge = ({ estado, texto, ancho = true, className = '' }) => {
  const { badge, punto } = coloresEstadoGestion(estado);
  const etiqueta = texto ?? estado ?? '';

  return (
    <span
      className={`inline-flex items-center gap-1.5 max-w-full px-2 py-0.5 rounded-full border text-[10px] leading-4 font-semibold uppercase tracking-wide whitespace-nowrap ${ancho ? 'min-w-[96px]' : ''} ${badge} ${className}`}
      title={etiqueta}
    >
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full shrink-0 ${punto}`} />
      <span className="truncate">{etiqueta}</span>
    </span>
  );
};

export default EstadoBadge;
