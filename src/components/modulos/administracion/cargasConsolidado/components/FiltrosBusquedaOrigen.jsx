import { Search } from 'lucide-react';
import { OrigenFilterDropdown } from './OrigenFilterDropdown';

// Barra de filtros compartida por las 3 pestañas de Cargas Consolidado
// (Gestión, Solicitudes, Imputadas): búsqueda parcial por admisión/nombre +
// selector de Origen. Un solo componente en vez de repetir el mismo par de
// controles 3 veces — cada pestaña solo le pasa su propio estado
// (búsqueda/origen son independientes por pestaña, igual que ya lo son
// año/mes en Gestión e Imputadas).
export const FiltrosBusquedaOrigen = ({
  busqueda,
  setBusqueda,
  origenesSeleccionados,
  toggleOrigen,
  placeholder = 'Buscar por admisión o nombre...',
  ocultarOrigen = false,
  limpiarOrigenes
}) => (
  <div className="flex flex-wrap items-center gap-2">
    <div className="relative w-56">
      <Search className="absolute left-2 top-1.5 text-gray-400 dark:text-gray-500" size={13} />
      <input
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        className="w-full h-7 pl-7 pr-2 border border-gray-300 dark:border-gray-600 rounded text-[11px] outline-none bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 focus:border-[#2383C2]"
        placeholder={placeholder}
      />
    </div>

    {!ocultarOrigen && <OrigenFilterDropdown
      origenesSeleccionados={origenesSeleccionados}
      toggleOrigen={toggleOrigen}
      limpiarOrigenes={limpiarOrigenes}
    />}
  </div>
);

export default FiltrosBusquedaOrigen;
