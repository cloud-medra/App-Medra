import React, { useState } from 'react';
import { AlertCircle, AlertTriangle, ChevronDown, Lock } from 'lucide-react';

// Controles de formulario de la vista nueva de Códigos. Editables con borde
// y fondo blanco; solo lectura sin borde, fondo gris y candado.

const BASE_CONTROL = 'w-full h-9 px-3 rounded-md text-[13px] text-slate-800 dark:text-gray-100 bg-white dark:bg-gray-950 border outline-none transition-colors placeholder:text-slate-400 dark:placeholder:text-gray-600';

const claseControl = (error, extra = '') =>
  `${BASE_CONTROL} ${error
    ? 'border-red-400 focus:border-red-500 focus:ring-2 focus:ring-red-500/15'
    : 'border-slate-300 dark:border-gray-700 hover:border-slate-400 dark:hover:border-gray-600 focus:border-[#2383C2] focus:ring-2 focus:ring-[#2383C2]/15'} ${extra}`;

export const Seccion = ({ titulo, descripcion, children }) => (
  <section className="px-5 py-4 border-b border-slate-100 dark:border-gray-800 last:border-b-0">
    <div className="mb-3">
      <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-gray-400">{titulo}</h4>
      {descripcion && <p className="mt-0.5 text-[12px] text-slate-400 dark:text-gray-500">{descripcion}</p>}
    </div>
    <div className="grid grid-cols-2 gap-x-3 gap-y-3.5">{children}</div>
  </section>
);

export const Campo = ({ etiqueta, requerido, error, aviso, ayuda, ancho = 'col-span-2', modificado, htmlFor, children }) => (
  <div className={ancho}>
    <label htmlFor={htmlFor} className="flex items-center gap-1.5 mb-1 text-[12px] font-medium text-slate-700 dark:text-gray-300">
      {etiqueta}
      {requerido && <span className="text-red-500" aria-hidden>*</span>}
      {modificado && <span className="w-1.5 h-1.5 rounded-full bg-amber-500" title="Modificado" />}
    </label>
    {children}
    {error ? (
      <p className="mt-1 flex items-center gap-1 text-[11px] text-red-600 dark:text-red-400"><AlertCircle size={12} />{error}</p>
    ) : aviso ? (
      <p className="mt-1 flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400"><AlertTriangle size={12} />{aviso}</p>
    ) : ayuda ? (
      <p className="mt-1 text-[11px] text-slate-400 dark:text-gray-500">{ayuda}</p>
    ) : null}
  </div>
);

export const Entrada = ({ error, className = '', ...props }) => (
  <input {...props} className={claseControl(error, className)} />
);

export const Selector = ({ error, opciones, vacio = 'Seleccione…', className = '', ...props }) => (
  <div className="relative">
    <select {...props} className={claseControl(error, `appearance-none pr-8 cursor-pointer ${className}`)}>
      {vacio !== null && <option value="">{vacio}</option>}
      {opciones.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
    <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
  </div>
);

export const SoloLectura = ({ valor, mono, title }) => (
  <div
    title={title}
    className={`w-full min-h-9 px-3 py-2 rounded-md bg-slate-100 dark:bg-gray-800/70 text-[13px] text-slate-600 dark:text-gray-300 flex items-center gap-2 ${mono ? 'font-mono' : ''}`}
  >
    <Lock size={12} className="shrink-0 text-slate-400 dark:text-gray-500" />
    <span className="truncate">{valor || '—'}</span>
  </div>
);

// Autocompletado de empresa sobre la lista ya cargada (sin consultas).
export const EntradaEmpresa = ({ value, onChange, empresas, error, id }) => {
  const [abierto, setAbierto] = useState(false);
  const termino = (value || '').toLowerCase();
  const filtradas = empresas.filter((e) => e.nombre.toLowerCase().includes(termino)).slice(0, 50);

  return (
    <div className="relative">
      <input
        id={id}
        value={value}
        onChange={(e) => { onChange(e.target.value.toUpperCase()); setAbierto(true); }}
        onFocus={() => setAbierto(true)}
        onBlur={() => setTimeout(() => setAbierto(false), 150)}
        placeholder="Buscar empresa…"
        autoComplete="off"
        className={claseControl(error, 'pr-8')}
      />
      <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
      {abierto && (
        <ul className="absolute z-10 left-0 right-0 mt-1 max-h-52 overflow-y-auto rounded-md border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg py-1">
          {filtradas.length > 0 ? filtradas.map((emp) => (
            <li
              key={emp.id}
              onMouseDown={() => { onChange(emp.nombre.toUpperCase()); setAbierto(false); }}
              className="px-3 py-1.5 text-[12px] uppercase truncate text-slate-700 dark:text-gray-200 hover:bg-slate-100 dark:hover:bg-gray-800 cursor-pointer"
            >
              {emp.nombre}
            </li>
          )) : (
            <li className="px-3 py-1.5 text-[12px] text-slate-400 italic">Sin coincidencias</li>
          )}
        </ul>
      )}
    </div>
  );
};
