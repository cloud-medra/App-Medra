// Ícono de archivo con la extensión y el color típico de su tipo (PDF rojo,
// Word azul, Excel verde, imagen, etc.), para los listados de documentos.
import { tipoArchivoDesdeNombre } from './tiposArchivo';

export const IconoArchivo = ({ nombre, size = 22 }) => {
  const { etiqueta, color } = tipoArchivoDesdeNombre(nombre);
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-label={etiqueta} role="img" className="shrink-0">
      {/* Hoja con la esquina doblada */}
      <path d="M6 1.5h8.5L20 7v14a1.5 1.5 0 0 1-1.5 1.5h-12A1.5 1.5 0 0 1 5 21V3a1.5 1.5 0 0 1 1-1.5z" fill="#fff" stroke="#CBD5E1" strokeWidth="1" />
      <path d="M14.5 1.5V6a1 1 0 0 0 1 1H20" fill="none" stroke="#CBD5E1" strokeWidth="1" />
      {/* Banda de color con la extensión */}
      <rect x="2" y="12" width="16" height="7.5" rx="1.2" fill={color} />
      <text x="10" y="17.6" textAnchor="middle" fontSize={etiqueta.length > 3 ? 4.6 : 5.6} fontWeight="700" fill="#fff" fontFamily="system-ui, sans-serif">
        {etiqueta}
      </text>
    </svg>
  );
};

export default IconoArchivo;
