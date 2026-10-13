import React, { useMemo } from 'react';
import { FileBarChart, Search, Calendar as CalendarIcon, FilterX, RotateCcw, RefreshCw } from 'lucide-react';
import Spinner from '../../../../ui/Spinner';
import {
  useResumenGestionesData,
  NOMBRES_MESES,
  ESTADO_CARGA_OPTIONS,
  TODOS_LOS_MESES
} from './useResumenGestionesData';
import { moduloGestion } from '../modulosGestion';
import { useColumnResize } from '../../../../../hooks/useColumnResize';
import { ManijaRedimension } from '../../../../ui/ManijaRedimension';

const COLUMNAS = [
  { key: 'id', label: 'ID', ancho: 90, min: 60 },
  { key: 'paciente', label: 'Paciente', ancho: 150, min: 80 },
  { key: 'medico', label: 'Médico', ancho: 110, min: 70 },
  { key: 'empresa', label: 'Empresa', ancho: 150, min: 80 },
  { key: 'fecha', label: 'Fecha', ancho: 90, min: 65 },
  { key: 'codigo', label: 'Código', ancho: 90, min: 60 },
  { key: 'descripcion', label: 'Descripción', ancho: 170, min: 90 },
  { key: 'cantidad', label: 'Cant.', ancho: 60, min: 45 },
  { key: 'precio', label: 'Precio', ancho: 95, min: 60 },
  { key: 'total', label: 'Total', ancho: 100, min: 65 },
  { key: 'numCotizacion', label: 'N° Cotización', ancho: 105, min: 70 },
  { key: 'venta', label: 'Venta', ancho: 95, min: 60 },
  { key: 'lote', label: 'Lote', ancho: 85, min: 50 },
  { key: 'vencimiento', label: 'Vencimiento', ancho: 100, min: 65 },
  { key: 'estadoCarga', label: 'Estado Carga', ancho: 110, min: 75 },
  { key: 'periodo', label: 'Período', ancho: 110, min: 70 }
];

const formatearFechaTabla = (fechaString) => {
  if (!fechaString || !fechaString.includes('-')) return fechaString || '-';
  const [yyyy, mm, dd] = fechaString.split('-');
  return `${dd}-${mm}-${yyyy}`;
};

const getEstadoCargaEstilo = (estado) => {
  const estilos = {
    PENDIENTE: 'bg-orange-50 dark:bg-orange-950/30 text-orange-700 dark:text-orange-400',
    CARGADO: 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400',
    REVISAR: 'bg-sky-50 dark:bg-sky-950/30 text-sky-700 dark:text-sky-400',
    'S/COTIZACION': 'bg-purple-50 dark:bg-purple-950/30 text-purple-700 dark:text-purple-400'
  };
  return estilos[estado] || estilos.PENDIENTE;
};

// Resumen de Implantes y de Hemodinamia (misma pantalla; `modulo`, ver
// modulosGestion.js).
const ResumenGestiones = ({ modulo }) => {
  const config = moduloGestion(modulo);
  const {
    anio, setAnio,
    mes, setMes,
    busqueda, setBusqueda,
    filtroEstadoCarga, setFiltroEstadoCarga,
    aniosDisponibles,
    mesesDelAnioActual,
    documentosFiltrados,
    totales,
    cargando,
    actualizar
  } = useResumenGestionesData(modulo);

  const { anchos, handleResize, restablecerAnchos, anchoTotalTabla } = useColumnResize(COLUMNAS);

  // Agrupa las filas por admisión (d.admision), ordena los grupos entre sí
  // por la fecha más reciente de cada grupo (desc) y, dentro de cada grupo,
  // deja primero las filas CARGADO y después el resto (p.ej. PAD). No toca
  // documentosFiltrados ni totales (que siguen calculándose en el hook
  // sobre el orden original) — solo reordena lo que se pinta en la tabla.
  const documentosOrdenados = useMemo(() => {
    const grupos = new Map();
    documentosFiltrados.forEach(d => {
      const clave = d.admision || 'SIN_ADMISION';
      if (!grupos.has(clave)) grupos.set(clave, []);
      grupos.get(clave).push(d);
    });

    const rangoEstado = (estadoCarga) => (estadoCarga === 'CARGADO' ? 0 : 1);
    const fechaMasReciente = (grupo) =>
      grupo.reduce((max, d) => (String(d.fecha || '') > max ? String(d.fecha || '') : max), '');

    return Array.from(grupos.values())
      .sort((a, b) => fechaMasReciente(b).localeCompare(fechaMasReciente(a)))
      .flatMap(grupo => [...grupo].sort((a, b) => rangoEstado(a.estadoCarga) - rangoEstado(b.estadoCarga)));
  }, [documentosFiltrados]);

  return (
    <div className="w-full h-full flex flex-col bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm overflow-hidden p-0 relative text-[11px]">
      {cargando && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-gray-500/20 dark:bg-black/40 backdrop-blur-[2px]">
          <div className="bg-white/90 dark:bg-gray-800/90 p-4 rounded-xl shadow-xl flex flex-col items-center gap-3">
            <Spinner size="md" color="#2383C2" />
            <h3 className="text-[#2383C2] font-bold text-[13px]">Cargando resumen...</h3>
          </div>
        </div>
      )}

      {/* HEADER PRINCIPAL */}
      <div className="px-3 py-2 flex items-center justify-between border-b border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/80">
        <h2 className="text-[12px] font-bold text-gray-700 dark:text-gray-100 flex items-center gap-1.5">
          <FileBarChart size={15} className="text-[#2383C2]" />
          {config.tituloResumen}
        </h2>
      </div>

      {/* BARRA DE FILTROS */}
      <div className="bg-gray-50 dark:bg-gray-800/50 px-3 py-1.5 flex flex-wrap items-center gap-2 border-b border-gray-200 dark:border-gray-700">
        <div className="relative w-64">
          <Search className="absolute left-2 top-1.5 text-gray-400 dark:text-gray-500" size={13} />
          <input
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            className="w-full h-7 pl-7 pr-2 border border-gray-300 dark:border-gray-600 rounded text-[11px] outline-none bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 focus:border-[#2383C2]"
            placeholder="Buscar por ID, paciente, médico, empresa o código..."
          />
        </div>

        <div className="flex items-center gap-1.5">
          <CalendarIcon size={13} className="text-[#2383C2]" />
          <select
            value={anio}
            onChange={e => setAnio(e.target.value)}
            disabled={aniosDisponibles.length === 0}
            className="h-7 px-2 border border-gray-300 dark:border-gray-600 rounded text-[11px] bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 outline-none focus:border-[#2383C2] cursor-pointer disabled:opacity-50"
          >
            <option value="">
              {aniosDisponibles.length === 0 ? 'Sin datos' : 'Seleccionar año'}
            </option>
            {aniosDisponibles.map(a => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>

          <select
            value={mes}
            onChange={e => setMes(e.target.value)}
            disabled={!anio}
            className="h-7 px-2 border border-gray-300 dark:border-gray-600 rounded text-[11px] bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 outline-none focus:border-[#2383C2] cursor-pointer disabled:opacity-50"
          >
            <option value="">Seleccionar mes</option>
            <option value={TODOS_LOS_MESES}>Todos los meses</option>
            {mesesDelAnioActual.map(m => (
              <option key={m} value={m}>{NOMBRES_MESES[m] || m}</option>
            ))}
          </select>

          <select
            value={filtroEstadoCarga}
            onChange={e => setFiltroEstadoCarga(e.target.value)}
            className="h-7 px-2 border border-gray-300 dark:border-gray-600 rounded text-[11px] bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 outline-none focus:border-[#2383C2] cursor-pointer"
          >
            <option value="">Estado (Todos)</option>
            {ESTADO_CARGA_OPTIONS.map(op => (
              <option key={op} value={op}>{op}</option>
            ))}
          </select>

          {(busqueda || filtroEstadoCarga) && (
            <button
              onClick={() => { setBusqueda(''); setFiltroEstadoCarga(''); }}
              className="h-7 px-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 rounded font-medium flex items-center gap-1 transition"
              title="Limpiar filtros"
            >
              <FilterX size={12} /> Limpiar
            </button>
          )}

          <button
            onClick={actualizar}
            disabled={cargando}
            className="h-7 px-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 rounded font-medium flex items-center gap-1 transition disabled:opacity-50"
            title="Volver a leer los períodos y los datos del mes"
          >
            <RefreshCw size={12} /> Actualizar
          </button>
        </div>
      </div>

      {/* BARRA DE TOTALES */}
      <div className="bg-gray-50 dark:bg-gray-800/50 px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 dark:border-gray-700 text-[10px] text-gray-500 dark:text-gray-400">
        <span>
          {!anio
            ? 'Selecciona un año para comenzar'
            : !mes
              ? 'Selecciona un mes (o "Todos los meses")'
              : mes === TODOS_LOS_MESES
                ? `Todos los meses de ${anio}`
                : `${NOMBRES_MESES[mes]} ${anio}`}
        </span>
        <span className="flex items-center gap-1">
          {totales.totalRegistros} registro(s) · {totales.totalCantidad} unidad(es) · Total ${totales.totalMonto.toLocaleString('es-CL')}
        </span>
      </div>

      {/* TABLA */}
      <div className="flex-grow overflow-auto select-none relative">
        <div className="sticky top-0 z-20 flex justify-end px-1 py-0.5 bg-gray-100 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
          <button
            type="button"
            onClick={restablecerAnchos}
            title="Restablecer ancho de columnas"
            className="flex items-center gap-1 text-[9px] font-medium text-gray-400 hover:text-[#2383C2] dark:text-gray-500 dark:hover:text-[#2383C2] transition px-1.5 py-0.5 rounded hover:bg-white dark:hover:bg-gray-800"
          >
            <RotateCcw size={10} /> Restablecer columnas
          </button>
        </div>

        <table
          className="text-left text-[11px] border-collapse"
          style={{ tableLayout: 'fixed', width: anchoTotalTabla, minWidth: anchoTotalTabla }}
        >
          <colgroup>
            {COLUMNAS.map(col => (
              <col key={col.key} style={{ width: anchos[col.key] }} />
            ))}
          </colgroup>

          <thead className="bg-gray-100 dark:bg-gray-900 sticky top-[22px] z-10">
            <tr className="text-gray-600 dark:text-gray-400 uppercase font-bold text-[10px]">
              <th className="relative py-1.5 px-2 border-b border-r border-gray-200 dark:border-gray-700 overflow-hidden">
                ID
                <ManijaRedimension colKey="id" anchoActual={anchos.id} anchoMin={COLUMNAS[0].min} onResize={handleResize} />
              </th>
              <th className="relative py-1.5 px-2 border-b border-r border-gray-200 dark:border-gray-700 overflow-hidden">
                Paciente
                <ManijaRedimension colKey="paciente" anchoActual={anchos.paciente} anchoMin={COLUMNAS[1].min} onResize={handleResize} />
              </th>
              <th className="relative py-1.5 px-2 border-b border-r border-gray-200 dark:border-gray-700 overflow-hidden">
                Médico
                <ManijaRedimension colKey="medico" anchoActual={anchos.medico} anchoMin={COLUMNAS[2].min} onResize={handleResize} />
              </th>
              <th className="relative py-1.5 px-2 border-b border-r border-gray-200 dark:border-gray-700 overflow-hidden">
                Empresa
                <ManijaRedimension colKey="empresa" anchoActual={anchos.empresa} anchoMin={COLUMNAS[3].min} onResize={handleResize} />
              </th>
              <th className="relative py-1.5 px-2 border-b border-r border-gray-200 dark:border-gray-700 overflow-hidden">
                Fecha
                <ManijaRedimension colKey="fecha" anchoActual={anchos.fecha} anchoMin={COLUMNAS[4].min} onResize={handleResize} />
              </th>
              <th className="relative py-1.5 px-2 border-b border-r border-gray-200 dark:border-gray-700 overflow-hidden">
                Código
                <ManijaRedimension colKey="codigo" anchoActual={anchos.codigo} anchoMin={COLUMNAS[5].min} onResize={handleResize} />
              </th>
              <th className="relative py-1.5 px-2 border-b border-r border-gray-200 dark:border-gray-700 overflow-hidden">
                Descripción
                <ManijaRedimension colKey="descripcion" anchoActual={anchos.descripcion} anchoMin={COLUMNAS[6].min} onResize={handleResize} />
              </th>
              <th className="relative py-1.5 px-2 border-b border-r border-gray-200 dark:border-gray-700 text-center overflow-hidden">
                Cant.
                <ManijaRedimension colKey="cantidad" anchoActual={anchos.cantidad} anchoMin={COLUMNAS[7].min} onResize={handleResize} />
              </th>
              <th className="relative py-1.5 px-2 border-b border-r border-gray-200 dark:border-gray-700 overflow-hidden">
                Precio
                <ManijaRedimension colKey="precio" anchoActual={anchos.precio} anchoMin={COLUMNAS[8].min} onResize={handleResize} />
              </th>
              <th className="relative py-1.5 px-2 border-b border-r border-gray-200 dark:border-gray-700 overflow-hidden">
                Total
                <ManijaRedimension colKey="total" anchoActual={anchos.total} anchoMin={COLUMNAS[9].min} onResize={handleResize} />
              </th>
              <th className="relative py-1.5 px-2 border-b border-r border-gray-200 dark:border-gray-700 overflow-hidden">
                N° Cotización
                <ManijaRedimension colKey="numCotizacion" anchoActual={anchos.numCotizacion} anchoMin={COLUMNAS[10].min} onResize={handleResize} />
              </th>
              <th className="relative py-1.5 px-2 border-b border-r border-gray-200 dark:border-gray-700 overflow-hidden">
                Venta
                <ManijaRedimension colKey="venta" anchoActual={anchos.venta} anchoMin={COLUMNAS[11].min} onResize={handleResize} />
              </th>
              <th className="relative py-1.5 px-2 border-b border-r border-gray-200 dark:border-gray-700 overflow-hidden">
                Lote
                <ManijaRedimension colKey="lote" anchoActual={anchos.lote} anchoMin={COLUMNAS[12].min} onResize={handleResize} />
              </th>
              <th className="relative py-1.5 px-2 border-b border-r border-gray-200 dark:border-gray-700 overflow-hidden">
                Vencimiento
                <ManijaRedimension colKey="vencimiento" anchoActual={anchos.vencimiento} anchoMin={COLUMNAS[13].min} onResize={handleResize} />
              </th>
              <th className="relative py-1.5 px-2 border-b border-r border-gray-200 dark:border-gray-700 overflow-hidden">
                Estado Carga
                <ManijaRedimension colKey="estadoCarga" anchoActual={anchos.estadoCarga} anchoMin={COLUMNAS[14].min} onResize={handleResize} />
              </th>
              <th className="relative py-1.5 px-2 border-b border-gray-200 dark:border-gray-700 overflow-hidden">
                Período
                <ManijaRedimension colKey="periodo" anchoActual={anchos.periodo} anchoMin={COLUMNAS[15].min} onResize={handleResize} />
              </th>
            </tr>
          </thead>
          <tbody>
            {documentosOrdenados.length === 0 ? (
              <tr>
                <td colSpan={16} className="px-4 py-8 text-center text-gray-400 dark:text-gray-500 text-xs">
                  {!anio || !mes
                    ? 'Elige un año y un mes para ver los registros imputados.'
                    : 'No hay registros imputados para el período seleccionado.'}
                </td>
              </tr>
            ) : (
              documentosOrdenados.map(d => (
                <tr
                  key={d.refPath}
                  className="border-b border-gray-200 dark:border-gray-700/70 hover:bg-gray-50/80 dark:hover:bg-gray-700/40 transition-colors"
                >
                  <td className="py-1.5 px-2 border-r border-gray-200 dark:border-gray-700/70 font-semibold text-[#2383C2] whitespace-nowrap overflow-hidden text-ellipsis">{d.gestionId}</td>
                  <td className="py-1.5 px-2 border-r border-gray-200 dark:border-gray-700/70 text-gray-700 dark:text-gray-200 font-medium whitespace-nowrap overflow-hidden text-ellipsis">{d.paciente}</td>
                  <td className="py-1.5 px-2 border-r border-gray-200 dark:border-gray-700/70 text-gray-600 dark:text-gray-300 whitespace-nowrap overflow-hidden text-ellipsis">{d.medico}</td>
                  <td className="py-1.5 px-2 border-r border-gray-200 dark:border-gray-700/70 text-gray-600 dark:text-gray-300 whitespace-nowrap overflow-hidden text-ellipsis">{d.empresa}</td>
                  <td className="py-1.5 px-2 border-r border-gray-200 dark:border-gray-700/70 text-gray-600 dark:text-gray-300 whitespace-nowrap overflow-hidden text-ellipsis">{formatearFechaTabla(d.fecha)}</td>
                  <td className="py-1.5 px-2 border-r border-gray-200 dark:border-gray-700/70 font-num text-emerald-600 dark:text-emerald-400 whitespace-nowrap overflow-hidden text-ellipsis">{d.codigo || 'S/C'}</td>
                  <td className="py-1.5 px-2 border-r border-gray-200 dark:border-gray-700/70 text-gray-600 dark:text-gray-300 truncate max-w-[180px]" title={d.descriptorAuto}>{d.descriptorAuto}</td>
                  <td className="py-1.5 px-2 border-r border-gray-200 dark:border-gray-700/70 text-center text-gray-600 dark:text-gray-300 whitespace-nowrap overflow-hidden text-ellipsis">{d.cantidad}</td>
                  <td className="py-1.5 px-2 border-r border-gray-200 dark:border-gray-700/70 text-gray-600 dark:text-gray-300 whitespace-nowrap overflow-hidden text-ellipsis">${Number(d.precio || 0).toLocaleString('es-CL')}</td>
                  <td className="py-1.5 px-2 border-r border-gray-200 dark:border-gray-700/70 text-emerald-700 dark:text-emerald-400 font-semibold whitespace-nowrap overflow-hidden text-ellipsis">${Number(d.total || 0).toLocaleString('es-CL')}</td>
                  <td className="py-1.5 px-2 border-r border-gray-200 dark:border-gray-700/70 text-gray-600 dark:text-gray-300 whitespace-nowrap overflow-hidden text-ellipsis">{d.numCotizacion}</td>
                  <td className="py-1.5 px-2 border-r border-gray-200 dark:border-gray-700/70 text-gray-600 dark:text-gray-300 whitespace-nowrap overflow-hidden text-ellipsis">${Number(d.venta || 0).toLocaleString('es-CL')}</td>
                  <td className="py-1.5 px-2 border-r border-gray-200 dark:border-gray-700/70 text-gray-600 dark:text-gray-300 whitespace-nowrap overflow-hidden text-ellipsis">{d.lote}</td>
                  <td className="py-1.5 px-2 border-r border-gray-200 dark:border-gray-700/70 text-gray-600 dark:text-gray-300 whitespace-nowrap overflow-hidden text-ellipsis">{formatearFechaTabla(d.vencimiento)}</td>
                  <td className="py-1.5 px-2 border-r border-gray-200 dark:border-gray-700/70 overflow-hidden">
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full uppercase font-semibold ${getEstadoCargaEstilo(d.estadoCarga)}`}>
                      {d.estadoCarga || 'PENDIENTE'}
                    </span>
                  </td>
                  <td className="py-1.5 px-2 text-gray-500 dark:text-gray-400 whitespace-nowrap overflow-hidden text-ellipsis">
                    {(NOMBRES_MESES[d.periodoMes] || d.periodoMes)} {d.periodoAnio}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ResumenGestiones;