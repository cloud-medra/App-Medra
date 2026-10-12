import React from 'react';
import { Search, FilterX } from 'lucide-react';
import { EstadoFilterDropdown } from './EstadoFilterDropdown';

const NOMBRES_MESES = {
  "01": "Enero", "02": "Febrero", "03": "Marzo", "04": "Abril",
  "05": "Mayo", "06": "Junio", "07": "Julio", "08": "Agosto",
  "09": "Septiembre", "10": "Octubre", "11": "Noviembre", "12": "Diciembre"
};

const CargasConsignacionFiltros = ({
  busqueda,
  setBusqueda,

  filtroAnio,
  setFiltroAnio,
  filtroMes,
  setFiltroMes,
  filtroDia,
  setFiltroDia,
  opcionesFechas,

  filtrosEstados,
  toggleFiltroEstado,
  limpiarFiltroEstados,
  opcionesEstados = [],

  filtroSoloHastaHoy,
  setFiltroSoloHastaHoy,
  hayFiltrosActivos,

  limpiarFiltros
}) => {
  return (
    <div className="bg-gray-50 dark:bg-gray-800/50 px-3 py-1.5 flex flex-wrap items-center gap-2 border-b border-gray-200 dark:border-gray-700">

      <div className="relative w-64">
        <Search className="absolute left-2 top-1.5 text-gray-400 dark:text-gray-500" size={13} />
        <input
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          className="w-full h-7 pl-7 pr-2 border border-gray-300 dark:border-gray-600 rounded text-[11px] outline-none bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 focus:border-[#2383C2]"
          placeholder="Buscar por ID, nombre, médico, empresa u orden..."
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

        <EstadoFilterDropdown
          opcionesEstados={opcionesEstados}
          filtrosEstados={filtrosEstados}
          toggleFiltroEstado={toggleFiltroEstado}
          limpiarFiltroEstados={limpiarFiltroEstados}
        />

        <div className="flex items-center h-7 border border-gray-300 dark:border-gray-600 rounded overflow-hidden text-[11px] shrink-0">
          <button
            type="button"
            onClick={() => setFiltroSoloHastaHoy(true)}
            title="Solo muestra filas con fecha de hoy o anterior (oculta fechas futuras)"
            className={`h-full px-2 font-medium transition ${filtroSoloHastaHoy
              ? 'bg-[#2383C2] text-white'
              : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
          >
            Hasta hoy
          </button>
          <button
            type="button"
            onClick={() => setFiltroSoloHastaHoy(false)}
            title="Muestra todas las fechas, incluidas las futuras"
            className={`h-full px-2 font-medium border-l border-gray-300 dark:border-gray-600 transition ${!filtroSoloHastaHoy
              ? 'bg-[#2383C2] text-white'
              : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
          >
            Todos los días
          </button>
        </div>

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

export default CargasConsignacionFiltros;