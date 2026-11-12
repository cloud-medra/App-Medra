import { useState, useRef, useEffect } from 'react';
import { Layers, ChevronDown, Check } from 'lucide-react';
import { ORIGEN_LABEL, ORIGENES_DISPONIBLES } from '../utils/normalizarFila';

// Mismo patrón que EstadoFilterDropdown.jsx (Implantes): arreglo vacío =
// "Todas" (sin restricción), sin necesidad de un estado especial para
// "Todas" ni de exclusión mutua explícita en la UI — marcar/desmarcar
// opciones individuales ya alcanza para cubrir cualquier combinación
// (una, dos, o ninguna = todas).
const ORIGEN_DOT_COLOR = {
  IMPLANTES: 'bg-violet-500',
  CONSIGNACION: 'bg-blue-500',
  HEMODINAMIA: 'bg-rose-500'
};

export const OrigenFilterDropdown = ({ origenesSeleccionados, toggleOrigen, limpiarOrigenes }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const hayFiltroActivo = origenesSeleccionados.length > 0;
  const label = !hayFiltroActivo
    ? 'Origen (Todas)'
    : origenesSeleccionados.length === 1
      ? ORIGEN_LABEL[origenesSeleccionados[0]]
      : `${origenesSeleccionados.length} orígenes`;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`h-7 px-2 border rounded flex items-center gap-1.5 transition
          ${hayFiltroActivo
            ? 'border-[#2383C2] text-[#2383C2] bg-blue-50 dark:bg-blue-950/30 text-etiqueta'
            : 'border-gray-300 dark:border-gray-600 text-secundario text-tinta-principal bg-white dark:bg-gray-900'}`}
      >
        <Layers size={12} />
        {label}
        <ChevronDown size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-44 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg py-1">
          <button
            type="button"
            onClick={limpiarOrigenes}
            className="w-full flex items-center justify-between px-2.5 py-1.5 text-etiqueta text-tinta-secundaria hover:bg-gray-100 dark:hover:bg-gray-700 border-b border-gray-100 dark:border-gray-700"
          >
            Todas
            {!hayFiltroActivo && <Check size={13} className="text-[#2383C2]" />}
          </button>

          {ORIGENES_DISPONIBLES.map(origen => {
            const seleccionado = origenesSeleccionados.includes(origen);
            return (
              <button
                type="button"
                key={origen}
                onClick={() => toggleOrigen(origen)}
                className="w-full flex items-center justify-between px-2.5 py-1.5 text-secundario text-tinta-principal hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <span className="flex items-center gap-1.5">
                  <span className={`h-2 w-2 rounded-full inline-block ${ORIGEN_DOT_COLOR[origen]}`} />
                  {ORIGEN_LABEL[origen]}
                </span>
                {seleccionado && <Check size={13} className="text-[#2383C2]" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default OrigenFilterDropdown;
