import { Building2, ChevronDown } from 'lucide-react';

// Selector de institución/sucursal del header (Dashboard.jsx). Por ahora solo
// reserva el espacio: no despliega nada hasta conectarlo al maestro de
// instituciones. Bajo md se ve solo el ícono.
const SelectorInstitucion = () => (
  <button
    type="button"
    title="Seleccionar institución (próximamente)"
    className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors min-w-0 flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2383C2]/60"
  >
    <Building2 size={18} className="shrink-0 text-[#2383C2] dark:text-sky-400" aria-hidden="true" />
    <span className="hidden md:block max-w-48 truncate text-[13px] font-bold">Seleccionar institución</span>
    <ChevronDown size={16} className="hidden md:block shrink-0 text-gray-400 dark:text-gray-500" aria-hidden="true" />
    <span className="md:hidden sr-only">Seleccionar institución</span>
  </button>
);

export default SelectorInstitucion;
