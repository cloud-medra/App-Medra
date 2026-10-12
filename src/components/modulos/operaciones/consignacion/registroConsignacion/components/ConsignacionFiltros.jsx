import React from 'react';
import { Search, FilterX } from 'lucide-react';

const NOMBRES_MESES = {
  "01": "Enero", "02": "Febrero", "03": "Marzo", "04": "Abril",
  "05": "Mayo", "06": "Junio", "07": "Julio", "08": "Agosto",
  "09": "Septiembre", "10": "Octubre", "11": "Noviembre", "12": "Diciembre"
};

const ConsignacionFiltros = ({
  busqueda,
  setBusqueda,

  filtroAnio,
  setFiltroAnio,
  filtroMes,
  setFiltroMes,
  filtroDia,
  setFiltroDia,
  opcionesFechas,

  filtroDespachado,
  setFiltroDespachado,

  filtroEstado,
  setFiltroEstado,

  limpiarFiltros
}) => {
  const hayFiltrosActivos = filtroAnio || filtroMes || filtroDia || filtroDespachado || filtroEstado;

  return (
    <div className="bg-gray-50 dark:bg-gray-800/50 px-3 py-1.5 flex flex-wrap items-center gap-2 border-b border-gray-200 dark:border-gray-700">

      <div className="relative w-64">
        <Search className="absolute left-2 top-1.5 text-gray-400 dark:text-gray-500" size={13} />
        <input
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          className="w-full h-7 pl-7 pr-2 border border-gray-300 dark:border-gray-600 rounded text-[11px] outline-none bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 focus:border-[#2383C2]"
          placeholder="Buscar por ID, nombre, médico, referencia u orden..."
        />
      </div>

      <div className="flex items-center gap-1.5">
        <select
          value={filtroAnio}
          onChange={e => setFiltroAnio(e.target.value)}
          className="h-7 px-2 border border-gray-300 dark:border-gray-600 rounded text-[11px] bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 outline-none focus:border-[#2383C2] cursor-pointer"
        >
          <option value="">Año (Todos)</option>
          {opcionesFechas.anios.map(yyyy => (
            <option key={yyyy} value={yyyy}>{yyyy}</option>
          ))}
        </select>

        <select
          value={filtroMes}
          onChange={e => setFiltroMes(e.target.value)}
          className="h-7 px-2 border border-gray-300 dark:border-gray-600 rounded text-[11px] bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 outline-none focus:border-[#2383C2] cursor-pointer"
        >
          <option value="">Mes (Todos)</option>
          {opcionesFechas.meses.map(mm => (
            <option key={mm} value={mm}>{NOMBRES_MESES[mm] || mm}</option>
          ))}
        </select>

        <select
          value={filtroDia}
          onChange={e => setFiltroDia(e.target.value)}
          className="h-7 px-2 border border-gray-300 dark:border-gray-600 rounded text-[11px] bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 outline-none focus:border-[#2383C2] cursor-pointer"
        >
          <option value="">Día (Todos)</option>
          {opcionesFechas.dias.map(dd => (
            <option key={dd} value={dd}>{dd}</option>
          ))}
        </select>

        <select
          value={filtroDespachado}
          onChange={e => setFiltroDespachado(e.target.value)}
          className="h-7 px-2 border border-gray-300 dark:border-gray-600 rounded text-[11px] bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 outline-none focus:border-[#2383C2] cursor-pointer"
        >
          <option value="">Despachado (Todos)</option>
          <option value="PENDIENTE">PENDIENTE</option>
          <option value="RECIBIDO">RECIBIDO</option>
        </select>

        <select
          value={filtroEstado}
          onChange={e => setFiltroEstado(e.target.value)}
          className="h-7 px-2 border border-gray-300 dark:border-gray-600 rounded text-[11px] bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 outline-none focus:border-[#2383C2] cursor-pointer"
        >
          <option value="">Estado (Todos)</option>
          <option value="INGRESADO">INGRESADO</option>
          <option value="PENDIENTE">PENDIENTE</option>
          <option value="REVISAR">REVISAR</option>
          <option value="CARGADO">CARGADO</option>
          <option value="SOLICITADO">SOLICITADO</option>
        </select>

        {hayFiltrosActivos && (
          <button
            onClick={limpiarFiltros}
            className="h-7 px-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 rounded font-medium flex items-center gap-1 transition"
            title="Limpiar filtros"
          >
            <FilterX size={12} /> Limpiar
          </button>
        )}
      </div>
    </div>
  );
};

export default ConsignacionFiltros;