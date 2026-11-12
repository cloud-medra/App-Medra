import React, { useState, useRef, useEffect } from 'react';
import { ListFilter, ChevronDown, Check } from 'lucide-react';
import { ESTADO_PUNTO } from '../../utils/estadosConsignacion';

export const EstadoFilterDropdown = ({
  opcionesEstados,
  filtrosEstados,
  toggleFiltroEstado,
  limpiarFiltroEstados
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const hayFiltroActivo = filtrosEstados.length > 0;
  const label = !hayFiltroActivo
    ? 'Estado (Todos)'
    : filtrosEstados.length === 1
      ? filtrosEstados[0]
      : `${filtrosEstados.length} estados`;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className={`h-7 px-2 border rounded flex items-center gap-1.5 transition
          ${hayFiltroActivo
            ? 'border-[#2383C2] text-[#2383C2] bg-blue-50 dark:bg-blue-950/30 text-etiqueta'
            : 'border-gray-300 dark:border-gray-600 text-secundario text-tinta-principal bg-white dark:bg-gray-900'}`}
      >
        <ListFilter size={12} />
        {label}
        <ChevronDown size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (

        <div className="absolute z-50 mt-1 w-48 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg py-1 max-h-64 overflow-auto">
          <button
            onClick={limpiarFiltroEstados}
            className="w-full flex items-center justify-between px-2.5 py-1.5 text-etiqueta text-tinta-secundaria hover:bg-gray-100 dark:hover:bg-gray-700 border-b border-gray-100 dark:border-gray-700"
          >
            Mostrar todos
            {!hayFiltroActivo && <Check size={13} className="text-[#2383C2]" />}
          </button>

          {opcionesEstados.map(estado => {
            const seleccionado = filtrosEstados.includes(estado);
            return (
              <button
                key={estado}
                onClick={() => toggleFiltroEstado(estado)}
                className="w-full flex items-center justify-between px-2.5 py-1.5 text-secundario text-tinta-principal hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <span className="flex items-center gap-1.5">
                  <span className={`h-2 w-2 rounded-full inline-block ${ESTADO_PUNTO[estado] || 'bg-gray-400'}`} />
                  {estado}
                </span>
                {seleccionado && <Check size={13} className="text-[#2383C2]" />}
              </button>
            );
          })}

          {opcionesEstados.length === 0 && (
            <div className="px-2.5 py-1.5 text-secundario text-tinta-atenuada">Sin estados disponibles</div>
          )}
        </div>
      )}
    </div>
  );
};