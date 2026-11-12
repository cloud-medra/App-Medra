import { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown, Check, Search } from 'lucide-react';
import { incluyeTexto } from '../../utils/normalizarTexto';

// Filtro de selección múltiple con buscador. Mismo criterio que
// OrigenFilterDropdown / EstadoFilterDropdown: arreglo vacío = "Todos"
// (sin restricción).
const MultiSelectFiltro = ({
  opciones,              // string[]
  seleccionados,         // string[]
  onChange,              // (string[]) => void
  etiqueta = 'Opciones', // "Arancel (Todos)", "3 Arancel"
  icono = null,
  anchoMenu = 'w-72',
}) => {
  const [open, setOpen] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const visibles = useMemo(
    () => opciones.filter(o => incluyeTexto(o, busqueda)),
    [opciones, busqueda]
  );

  const setSeleccionados = useMemo(() => new Set(seleccionados), [seleccionados]);
  const hayFiltroActivo = seleccionados.length > 0;

  const toggle = (opcion) => {
    onChange(setSeleccionados.has(opcion)
      ? seleccionados.filter(s => s !== opcion)
      : [...seleccionados, opcion]);
  };

  // "Seleccionar todos" actúa sobre lo visible (respeta el buscador).
  const seleccionarVisibles = () => {
    const nuevos = new Set(seleccionados);
    visibles.forEach(v => nuevos.add(v));
    onChange([...nuevos]);
  };

  const label = !hayFiltroActivo
    ? `${etiqueta} (Todos)`
    : seleccionados.length === 1
      ? seleccionados[0]
      : `${seleccionados.length} ${etiqueta.toLowerCase()}`;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        title={hayFiltroActivo ? seleccionados.join('\n') : undefined}
        className={`h-6 max-w-[220px] px-2 border rounded flex items-center gap-1.5 transition
          ${hayFiltroActivo
            ? 'border-[#2383C2] text-[#2383C2] bg-blue-50 dark:bg-blue-950/30 text-etiqueta'
            : 'border-slate-300 dark:border-gray-600 text-secundario text-tinta-principal bg-white dark:bg-gray-900'}`}
      >
        {icono}
        <span className="truncate">{label}</span>
        <ChevronDown size={12} className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className={`absolute z-50 mt-1 ${anchoMenu} bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg`}>
          <div className="p-1.5 border-b border-gray-100 dark:border-gray-700">
            <div className="relative">
              <Search className="absolute left-2 top-1.5 text-slate-400 dark:text-gray-500" size={12} />
              <input
                autoFocus
                value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
                placeholder="Buscar..."
                className="w-full h-6 pl-7 pr-2 border border-slate-300 dark:border-gray-600 rounded text-secundario outline-none bg-white dark:bg-gray-900 text-tinta-principal focus:border-[#2383C2]"
              />
            </div>
          </div>

          <div className="flex items-center justify-between px-2.5 py-1 border-b border-gray-100 dark:border-gray-700 text-pequeno">
            <button type="button" onClick={seleccionarVisibles} disabled={visibles.length === 0} className="text-[#2383C2] hover:underline disabled:opacity-40">
              Seleccionar todos
            </button>
            <button type="button" onClick={() => onChange([])} disabled={!hayFiltroActivo} className="text-tinta-secundaria hover:underline disabled:opacity-40">
              Limpiar
            </button>
          </div>

          <div className="max-h-64 overflow-y-auto py-1">
            {visibles.length === 0 ? (
              <div className="px-2.5 py-2 text-secundario text-tinta-atenuada">Sin coincidencias</div>
            ) : visibles.map(opcion => {
              const activo = setSeleccionados.has(opcion);
              return (
                <button
                  key={opcion}
                  type="button"
                  onClick={() => toggle(opcion)}
                  className="w-full flex items-center gap-2 px-2.5 py-1 text-secundario text-left text-tinta-principal hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <span className={`w-3.5 h-3.5 shrink-0 rounded border flex items-center justify-center ${activo ? 'bg-[#2383C2] border-[#2383C2]' : 'border-slate-300 dark:border-gray-600'}`}>
                    {activo && <Check size={10} className="text-white" />}
                  </span>
                  <span className="truncate" title={opcion}>{opcion}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default MultiSelectFiltro;
