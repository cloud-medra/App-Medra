import React from 'react';
import { ChevronLeft, ChevronRight, Inbox, RotateCcw, Search, X } from 'lucide-react';
import { ManijaRedimension } from '../../../../ui/ManijaRedimension';
import Spinner from '../../../../ui/Spinner';

// Tabla de la vista nueva de Códigos: encabezado fijo, columnas
// redimensionables, alineación por columna (`align`: left | right | center)
// y fila clicable opcional. Las columnas (y sus permisos) las define cada
// pestaña; esta tabla solo pinta las que recibe.

const ALINEACION = { right: 'text-right', center: 'text-center', left: 'text-left' };

export const TablaCodigos = ({
  columnas,
  anchos,
  onResize,
  anchoTotal,
  filas,
  renderCelda,
  onFilaClick,
  filaActiva,
  cargando,
  mensajeVacio = 'No hay registros para mostrar.'
}) => (
  <div className="relative flex-1 min-h-0 overflow-auto">
    {cargando && (
      <div className="absolute inset-0 z-30 flex items-center justify-center bg-white/70 dark:bg-gray-900/70">
        <Spinner size="md" color="#2383C2" />
      </div>
    )}
    <table className="text-[12px] border-separate border-spacing-0" style={{ tableLayout: 'fixed', width: anchoTotal, minWidth: '100%' }}>
      <colgroup>
        {columnas.map((col) => <col key={col.key} style={{ width: anchos[col.key] }} />)}
        <col />
      </colgroup>
      <thead>
        <tr>
          {columnas.map((col) => (
            <th
              key={col.key}
              title={col.label}
              className={`sticky top-0 z-20 h-9 px-3 bg-slate-50 dark:bg-gray-800 border-b border-slate-200 dark:border-gray-700 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-gray-400 whitespace-nowrap overflow-hidden ${ALINEACION[col.align] || 'text-left'}`}
            >
              <span className="block truncate">{col.label}</span>
              <ManijaRedimension colKey={col.key} anchoActual={anchos[col.key]} anchoMin={col.min} onResize={onResize} />
            </th>
          ))}
          <th className="sticky top-0 z-20 bg-slate-50 dark:bg-gray-800 border-b border-slate-200 dark:border-gray-700" />
        </tr>
      </thead>
      <tbody>
        {filas.map((item, index) => {
          const activa = filaActiva === item.id;
          return (
            <tr
              key={item.id}
              onClick={onFilaClick ? () => onFilaClick(item) : undefined}
              className={`group transition-colors ${onFilaClick ? 'cursor-pointer' : ''} ${activa ? 'bg-[#2383C2]/[0.06] dark:bg-[#2383C2]/10' : 'hover:bg-slate-50 dark:hover:bg-gray-800/60'}`}
            >
              {columnas.map((col, i) => (
                <td
                  key={col.key}
                  className={`h-9 px-3 border-b border-slate-100 dark:border-gray-800 text-slate-700 dark:text-gray-200 whitespace-nowrap overflow-hidden text-ellipsis ${ALINEACION[col.align] || 'text-left'} ${i === 0 ? `border-l-2 ${activa ? 'border-l-[#2383C2]' : 'border-l-transparent group-hover:border-l-slate-300 dark:group-hover:border-l-gray-600'}` : ''}`}
                >
                  {renderCelda(col, item, index)}
                </td>
              ))}
              <td className="border-b border-slate-100 dark:border-gray-800" />
            </tr>
          );
        })}
        {!cargando && filas.length === 0 && (
          <tr>
            <td colSpan={columnas.length + 1} className="py-16">
              <div className="flex flex-col items-center gap-2 text-slate-400 dark:text-gray-500">
                <Inbox size={28} strokeWidth={1.5} />
                <span className="text-[13px]">{mensajeVacio}</span>
              </div>
            </td>
          </tr>
        )}
      </tbody>
    </table>
  </div>
);

export const Buscador = ({ value, onChange, placeholder, className = 'w-72' }) => (
  <div className={`relative ${className}`}>
    <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full h-8 pl-8 pr-7 rounded-md border border-slate-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-[12px] text-slate-800 dark:text-gray-100 outline-none focus:border-[#2383C2] focus:ring-2 focus:ring-[#2383C2]/15 placeholder:text-slate-400"
    />
    {value && (
      <button type="button" onClick={() => onChange('')} title="Limpiar búsqueda" className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-slate-400 hover:text-slate-600">
        <X size={13} />
      </button>
    )}
  </div>
);

export const FiltroSelect = ({ value, onChange, opciones, todos, className = '' }) => (
  <select
    value={value}
    onChange={(e) => onChange(e.target.value)}
    className={`h-8 pl-2.5 pr-7 rounded-md border text-[12px] outline-none cursor-pointer bg-white dark:bg-gray-950 focus:border-[#2383C2] ${value ? 'border-[#2383C2]/60 text-[#2383C2] dark:text-[#369BCE] font-medium' : 'border-slate-300 dark:border-gray-700 text-slate-600 dark:text-gray-300'} ${className}`}
  >
    <option value="">{todos}</option>
    {opciones.map((o) => <option key={o} value={o}>{o}</option>)}
  </select>
);

export const Boton = ({ variante = 'secundario', icono: Icono, children, className = '', ...props }) => {
  const estilos = {
    primario: 'bg-[#2383C2] hover:bg-[#1d6fa6] text-white border-transparent shadow-sm',
    secundario: 'bg-white dark:bg-gray-900 hover:bg-slate-50 dark:hover:bg-gray-800 text-slate-700 dark:text-gray-200 border-slate-300 dark:border-gray-700',
    fantasma: 'bg-transparent hover:bg-slate-100 dark:hover:bg-gray-800 text-slate-600 dark:text-gray-300 border-transparent',
    peligro: 'bg-white dark:bg-gray-900 hover:bg-red-50 dark:hover:bg-red-950/30 text-red-600 dark:text-red-400 border-slate-300 dark:border-gray-700'
  };
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-md border text-[12px] font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${estilos[variante]} ${className}`}
    >
      {Icono && <Icono size={14} />}
      {children}
    </button>
  );
};

export const BotonIcono = ({ icono: Icono, title, onClick, tono = 'neutro', activo }) => {
  const tonos = {
    neutro: 'text-slate-400 hover:text-slate-700 dark:hover:text-gray-200',
    acento: 'text-slate-400 hover:text-[#2383C2]',
    peligro: 'text-slate-400 hover:text-red-600 dark:hover:text-red-400',
    exito: 'text-emerald-600 dark:text-emerald-400'
  };
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={(e) => { e.stopPropagation(); onClick?.(e); }}
      className={`p-1 rounded hover:bg-slate-100 dark:hover:bg-gray-800 transition-colors ${tonos[activo ? 'exito' : tono]}`}
    >
      <Icono size={14} />
    </button>
  );
};

export const PieTabla = ({ pagina, totalPaginas, total, tamano, onPagina, onTamano, onRestablecerColumnas, extra }) => {
  const desde = total === 0 ? 0 : pagina * tamano + 1;
  const hasta = Math.min(total, (pagina + 1) * tamano);
  return (
    <div className="shrink-0 h-11 px-4 flex items-center justify-between gap-3 border-t border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-[12px] text-slate-500 dark:text-gray-400">
      <div className="flex items-center gap-3">
        <span>
          <span className="font-medium text-slate-700 dark:text-gray-200 tabular-nums">{desde.toLocaleString('es-ES')}–{hasta.toLocaleString('es-ES')}</span>
          {' '}de <span className="font-medium text-slate-700 dark:text-gray-200 tabular-nums">{total.toLocaleString('es-ES')}</span>
        </span>
        {extra}
        <button type="button" onClick={onRestablecerColumnas} title="Restablecer ancho de columnas" className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-[#2383C2]">
          <RotateCcw size={12} /> Columnas
        </button>
      </div>
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1.5">
          Filas
          <select value={tamano} onChange={(e) => onTamano(Number(e.target.value))} className="h-7 px-1.5 rounded border border-slate-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-slate-700 dark:text-gray-200 outline-none">
            {[25, 50, 100, 200].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <span className="tabular-nums">Pág. {pagina + 1} / {totalPaginas}</span>
        <button type="button" onClick={() => onPagina(pagina - 1)} disabled={pagina === 0} title="Página anterior" className="h-7 w-7 inline-flex items-center justify-center rounded border border-slate-300 dark:border-gray-700 hover:bg-slate-50 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed">
          <ChevronLeft size={14} />
        </button>
        <button type="button" onClick={() => onPagina(pagina + 1)} disabled={pagina >= totalPaginas - 1} title="Página siguiente" className="h-7 w-7 inline-flex items-center justify-center rounded border border-slate-300 dark:border-gray-700 hover:bg-slate-50 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed">
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
};

export const Insignia = ({ tono = 'neutro', icono: Icono, children }) => {
  const tonos = {
    neutro: 'bg-slate-100 text-slate-600 dark:bg-gray-800 dark:text-gray-300 ring-slate-200 dark:ring-gray-700',
    exito: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 ring-emerald-200 dark:ring-emerald-900',
    aviso: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 ring-amber-200 dark:ring-amber-900',
    peligro: 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400 ring-red-200 dark:ring-red-900',
    acento: 'bg-[#2383C2]/10 text-[#2383C2] dark:text-[#369BCE] ring-[#2383C2]/20'
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 h-5 rounded-full text-[11px] font-medium ring-1 ring-inset whitespace-nowrap ${tonos[tono]}`}>
      {Icono && <Icono size={11} />}
      {children}
    </span>
  );
};
