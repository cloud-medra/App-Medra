import { Search, ChevronUp, ChevronDown, X } from 'lucide-react';
import { formatoNumero } from './formato';

// Piezas compartidas por las tablas de Estadísticas.

// Tabla principal de una pestaña: bordes separados (con border-collapse el
// borde del encabezado sticky se queda atrás al hacer scroll). Cada celda
// pone su borde inferior y derecho; la última fila no lleva el inferior
// porque ya está el superior del pie.
export const CLASE_TABLA = 'w-full text-secundario border-separate border-spacing-0 [&>tbody>tr:last-child>td]:border-b-0';

// Contenedor de la tabla principal: alto limitado al espacio libre (desde
// 1024 px) con el scroll, vertical y horizontal, dentro.
export const ContenedorTabla = ({ children }) => (
  <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden flex flex-col flex-1 min-w-0 lg:min-h-0">
    {children}
  </div>
);

export const ZonaScroll = ({ children }) => <div className="overflow-auto lg:flex-1 lg:min-h-0">{children}</div>;

export const Encabezado = ({ columna, children, orden, onOrdenar, alinear = 'right', title }) => {
  const activa = orden.columna === columna;
  const Icono = activa && orden.sentido === 'asc' ? ChevronUp : ChevronDown;
  return (
    <th className={`sticky top-0 z-10 bg-gray-50 dark:bg-gray-900 px-3 py-1.5 border-b border-r last:border-r-0 border-gray-200 dark:border-gray-700 text-etiqueta whitespace-nowrap text-${alinear}`} aria-sort={activa ? (orden.sentido === 'asc' ? 'ascending' : 'descending') : 'none'} title={title}>
      <button type="button" onClick={() => onOrdenar(columna)} className={`inline-flex items-center gap-0.5 uppercase hover:text-[#2383C2] ${activa ? 'text-[#2383C2]' : ''}`}>
        {children}
        <Icono size={12} className={activa ? '' : 'opacity-30'} />
      </button>
    </th>
  );
};

export const BarraBusqueda = ({ busqueda, onBuscar, placeholder, total }) => (
  <div className="shrink-0 px-3 py-2 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2 flex-wrap">
    <div className="relative w-64 max-w-full">
      <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
      <input value={busqueda} onChange={(e) => onBuscar(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') onBuscar(''); }}
        placeholder={placeholder} aria-label={placeholder.replace('…', '')}
        className="w-full h-7 pl-8 pr-7 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-secundario text-tinta-principal focus:outline-none focus:border-[#2383C2]" />
      {busqueda && (
        <button type="button" onClick={() => onBuscar('')} title="Limpiar búsqueda" aria-label="Limpiar búsqueda" className="absolute right-2 top-1/2 -translate-y-1/2 text-tinta-atenuada hover:text-[#2383C2]"><X size={13} /></button>
      )}
    </div>
    <span className="ml-auto text-secundario text-tinta-secundaria">{formatoNumero(total)} {total === 1 ? 'fila' : 'filas'} · clic en una fila para ver el detalle</span>
  </div>
);
