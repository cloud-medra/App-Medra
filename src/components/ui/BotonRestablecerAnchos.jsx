import { Columns3 } from 'lucide-react';

// "Restablecer anchos" de las tablas con columnas redimensionables
// (useColumnResize). Solo se activa si algún ancho cambió.
export const BotonRestablecerAnchos = ({ onClick, personalizados, className = '' }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={!personalizados}
    title={personalizados ? 'Volver a los anchos de columna por defecto' : 'Los anchos de columna ya están por defecto'}
    className={`h-7 px-2 inline-flex items-center gap-1 border border-gray-300 dark:border-gray-600 rounded text-pequeno bg-white dark:bg-gray-900 text-tinta-secundaria hover:border-[#2383C2] hover:text-[#2383C2] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-gray-300 disabled:hover:text-tinta-secundaria transition ${className}`}
  >
    <Columns3 size={12} /> Restablecer anchos
  </button>
);

export default BotonRestablecerAnchos;
