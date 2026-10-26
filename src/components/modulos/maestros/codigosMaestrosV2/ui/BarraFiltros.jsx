import React from 'react';
import { FilterX } from 'lucide-react';
import { Buscador, FiltroSelect } from './TablaCodigos';
import { CLASES_CODIGO } from '../../codigosMaestros/clasesCodigo';
import { TIPOS_CODIGO, SEGMENTOS_CODIGO } from '../camposCodigo';

// Barra de búsqueda + filtros de la vista nueva (todo en memoria).
const BarraFiltros = ({ f, camposBusqueda, conBusqueda = true, acciones }) => (
  <div className="shrink-0 px-4 py-2.5 flex flex-wrap items-center gap-2 border-b border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-900">
    {conBusqueda && (
      <div className="flex items-center">
        <select
          value={f.campo}
          onChange={(e) => f.setCampo(e.target.value)}
          title="Buscar en"
          className="h-8 pl-2.5 pr-6 rounded-l-md border border-r-0 border-slate-300 dark:border-gray-700 bg-slate-50 dark:bg-gray-800 text-[12px] text-slate-600 dark:text-gray-300 outline-none cursor-pointer"
        >
          <option value="">Todos los campos</option>
          {camposBusqueda.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        <Buscador
          value={f.busqueda}
          onChange={f.setBusqueda}
          className="w-64 [&_input]:rounded-l-none"
          placeholder={`Buscar${f.campo ? ` por ${camposBusqueda.find((c) => c.value === f.campo)?.label.toLowerCase()}` : ''}…`}
        />
      </div>
    )}
    <FiltroSelect value={f.filtros.empresa} onChange={(v) => f.setFiltro('empresa', v)} opciones={f.empresas} todos="Empresa: todas" className="max-w-[190px]" />
    <FiltroSelect value={f.filtros.tipo} onChange={(v) => f.setFiltro('tipo', v)} opciones={TIPOS_CODIGO} todos="Tipo: todos" />
    <FiltroSelect value={f.filtros.segmento} onChange={(v) => f.setFiltro('segmento', v)} opciones={SEGMENTOS_CODIGO} todos="Segmento: todos" />
    <FiltroSelect value={f.filtros.clase} onChange={(v) => f.setFiltro('clase', v)} opciones={CLASES_CODIGO} todos="Clase: todas" />
    {f.hayFiltros && (
      <button type="button" onClick={f.limpiar} className="inline-flex items-center gap-1 h-8 px-2 rounded-md text-[12px] text-slate-500 hover:text-slate-800 hover:bg-slate-100 dark:hover:bg-gray-800 dark:hover:text-gray-200">
        <FilterX size={14} /> Limpiar
      </button>
    )}
    <div className="ml-auto flex items-center gap-2">{acciones}</div>
  </div>
);

export default BarraFiltros;
