import { useId, useMemo, useState, useEffect, forwardRef } from 'react';
import { Search, X } from 'lucide-react';
import { buscarEnMenu } from '../../config/buscadorMenu';

// Buscador del sidebar (config/buscadorMenu.js): campo + resultados con
// código, nombre y módulo; flechas para moverse, Enter abre el marcado (un
// código exacto queda primero, así "LABFOL" + Enter va directo) y Escape
// limpia (o cierra, en el modal). `indice`: solo lo que el usuario ve en su
// menú (lo arma el Dashboard). `children`: lo que se muestra sin búsqueda
// (la lista de módulos). `onCerrar`: solo en el modal de Ctrl+K. `oculto`:
// sin campo (sidebar colapsado), solo `children`.
const BuscadorMenu = forwardRef(({ indice, onElegir, onCerrar, autoFocus = false, oculto = false, children }, ref) => {
  const [texto, setTexto] = useState('');
  const [marcado, setMarcado] = useState(0);
  const idLista = useId();
  const resultados = useMemo(() => buscarEnMenu(indice, texto), [indice, texto]);
  const buscando = texto.trim() !== '';
  const idOpcion = (i) => `${idLista}-${i}`;

  // El marcado vuelve al primero con cada búsqueda nueva.
  const cambiarTexto = (valor) => { setTexto(valor); setMarcado(0); };

  // Mantiene visible la opción marcada al moverse con las flechas.
  useEffect(() => {
    if (buscando) document.getElementById(idOpcion(marcado))?.scrollIntoView?.({ block: 'nearest' });
  });

  const elegir = (r) => {
    if (!r) return;
    setTexto('');
    onElegir(r);
  };

  const alTeclear = (e) => {
    if (e.key === 'ArrowDown' && resultados.length) { e.preventDefault(); setMarcado((m) => (m + 1) % resultados.length); }
    else if (e.key === 'ArrowUp' && resultados.length) { e.preventDefault(); setMarcado((m) => (m - 1 + resultados.length) % resultados.length); }
    else if (e.key === 'Enter') { e.preventDefault(); elegir(resultados[marcado]); }
    else if (e.key === 'Escape') {
      e.stopPropagation();
      if (buscando) cambiarTexto('');
      else if (onCerrar) onCerrar();
      else e.currentTarget.blur();
    }
  };

  if (oculto) return children;

  return (
    <div className="flex flex-col min-h-0">
      <div className="relative mb-2">
        <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input
          ref={ref}
          value={texto}
          onChange={(e) => cambiarTexto(e.target.value)}
          onKeyDown={alTeclear}
          autoFocus={autoFocus}
          placeholder="Buscar nombre o código…"
          aria-label="Buscar en el menú"
          role="combobox"
          aria-expanded={buscando}
          aria-controls={idLista}
          aria-autocomplete="list"
          aria-activedescendant={buscando && resultados.length ? idOpcion(marcado) : undefined}
          className="w-full h-7 pl-7 pr-12 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-[11.5px] text-gray-800 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:border-[#2383C2]"
        />
        {buscando ? (
          <button type="button" onClick={() => cambiarTexto('')} aria-label="Limpiar búsqueda" className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-[#2383C2]"><X size={12} /></button>
        ) : (
          <kbd className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] font-semibold text-gray-400 border border-gray-200 dark:border-gray-600 rounded px-1 pointer-events-none">Ctrl K</kbd>
        )}
      </div>

      {buscando ? (
        resultados.length === 0 ? (
          <p className="px-2 py-3 text-[11px] text-gray-400">Sin resultados en tu menú.</p>
        ) : (
          <ul id={idLista} role="listbox" aria-label="Resultados del menú" className="space-y-0.5 overflow-y-auto">
            {resultados.map((r, i) => (
              <li
                key={r.id}
                id={idOpcion(i)}
                role="option"
                aria-selected={i === marcado}
                // mousedown: elegir antes de que el input pierda el foco.
                onMouseDown={(e) => { e.preventDefault(); elegir(r); }}
                onMouseEnter={() => setMarcado(i)}
                className={`px-2 py-1.5 rounded-md cursor-pointer ${i === marcado ? 'bg-[#2383C2]/10 dark:bg-[#2383C2]/20' : 'hover:bg-gray-100 dark:hover:bg-gray-700/60'}`}
              >
                <div className="flex items-baseline gap-1.5 min-w-0">
                  <span className="shrink-0 font-mono text-[10px] font-semibold text-gray-500 dark:text-gray-400">{r.codigo}</span>
                  <span className="truncate text-gray-800 dark:text-gray-100 font-medium">{r.nombre}</span>
                </div>
                <div className="text-[10px] text-gray-400 dark:text-gray-500 truncate">{r.tipo === 'modulo' ? 'Módulo' : r.modulo}</div>
              </li>
            ))}
          </ul>
        )
      ) : children}
    </div>
  );
});
BuscadorMenu.displayName = 'BuscadorMenu';

// Ctrl+K cuando el campo del sidebar no está a la vista (sidebar colapsado,
// un módulo abierto, Ajustes o el drawer móvil cerrado): el mismo buscador
// en un cuadro flotante. Se cierra con Escape, al hacer clic fuera o al
// elegir un resultado.
export const BuscadorMenuModal = ({ indice, onElegir, onCerrar }) => (
  <div className="fixed inset-0 z-[95] flex items-start justify-center p-4 pt-[12vh]" role="dialog" aria-modal="true" aria-label="Buscar en el menú">
    <button type="button" className="absolute inset-0 bg-black/30 cursor-default" aria-label="Cerrar buscador" onClick={onCerrar} />
    <div className="relative w-full max-w-md max-h-[70vh] flex flex-col rounded-xl bg-white dark:bg-gray-800 shadow-2xl p-3 text-xs">
      <BuscadorMenu indice={indice} onElegir={(r) => { onCerrar(); onElegir(r); }} onCerrar={onCerrar} autoFocus>
        <p className="px-2 py-2 text-[11px] text-gray-400">Escribe un nombre o un código (ej. LAB o LABFOL) y presiona Enter.</p>
      </BuscadorMenu>
    </div>
  </div>
);

export default BuscadorMenu;
