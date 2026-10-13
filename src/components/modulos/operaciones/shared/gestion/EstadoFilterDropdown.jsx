import React, { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useDropdownFlotante } from '../../../../../hooks/useDropdownFlotante';
import { ListFilter, ChevronDown, Check } from 'lucide-react';
import { coloresEstadoGestion } from '../estadoGestion/estadosGestion';

export const EstadoFilterDropdown = ({
  opcionesEstados,
  filtrosEstados,
  toggleFiltroEstado,
  limpiarFiltroEstados
}) => {
  const [open, setOpen] = useState(false);
  const cerrar = useCallback(() => setOpen(false), []);
  const { anclaRef, panelRef, estilo } = useDropdownFlotante({ abierto: open, cerrar, alturaMax: 256 });

  const hayFiltroActivo = filtrosEstados.length > 0;
  const label = !hayFiltroActivo
    ? 'Estado (Todos)'
    : filtrosEstados.length === 1
      ? filtrosEstados[0]
      : `${filtrosEstados.length} estados`;

  return (
    <div className="relative" ref={anclaRef}>
      <button
        onClick={() => setOpen(o => !o)}
        className={`h-7 px-2 border rounded text-[11px] flex items-center gap-1.5 transition
          ${hayFiltroActivo
            ? 'border-[#2383C2] text-[#2383C2] bg-blue-50 dark:bg-blue-950/30 font-semibold'
            : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-900'}`}
      >
        <ListFilter size={12} />
        {label}
        <ChevronDown size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && createPortal(
        <div
          ref={panelRef}
          style={estilo}
          className="z-[1000] w-48 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg py-1 overflow-auto"
        >
          <button
            onClick={limpiarFiltroEstados}
            className="w-full flex items-center justify-between px-2.5 py-1.5 text-[11px] font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 border-b border-gray-100 dark:border-gray-700"
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
                className="w-full flex items-center justify-between px-2.5 py-1.5 text-[11px] text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <span className="flex items-center gap-1.5">
                  <span className={`h-2 w-2 rounded-full inline-block ${coloresEstadoGestion(estado).punto}`} />
                  {estado}
                </span>
                {seleccionado && <Check size={13} className="text-[#2383C2]" />}
              </button>
            );
          })}

          {opcionesEstados.length === 0 && (
            <div className="px-2.5 py-1.5 text-[11px] text-gray-400">Sin estados disponibles</div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
};