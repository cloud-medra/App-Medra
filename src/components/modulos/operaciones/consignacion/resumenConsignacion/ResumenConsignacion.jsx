import React from 'react';
import { FileBarChart, Search, Calendar as CalendarIcon, FilterX, RotateCcw, RefreshCw } from 'lucide-react';
import Spinner from '../../../../ui/Spinner'; // AJUSTAR ruta
import {
  useResumenConsignacionData,
  NOMBRES_MESES,
  ATRIBUTO_OPTIONS,
  TODOS_LOS_MESES
} from './hooks/useResumenConsignacionData';
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
  { key: 'costo', label: 'Costo', ancho: 95, min: 60 },
  { key: 'recargo', label: 'Recargo', ancho: 80, min: 55 },
  { key: 'venta', label: 'Venta', ancho: 95, min: 60 },
  { key: 'lote', label: 'Lote', ancho: 85, min: 50 },
  { key: 'vencimiento', label: 'Vencimiento', ancho: 100, min: 65 },
  { key: 'numGuia', label: 'N° Guía', ancho: 95, min: 65 },
  { key: 'atributo', label: 'Atributo', ancho: 110, min: 70 },
  { key: 'periodo', label: 'Período', ancho: 110, min: 70 }
];

const formatearFechaTabla = (fechaString) => {
  if (!fechaString || !fechaString.includes('-')) return fechaString || '-';
  const [yyyy, mm, dd] = fechaString.split('-');
  return `${dd}-${mm}-${yyyy}`;
};

const getAtributoEstilo = (atributo) => {
  const estilos = {
    CONSIGNACION: 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400',
    COTIZACION: 'bg-sky-50 dark:bg-sky-950/30 text-sky-700 dark:text-sky-400'
  };
  return estilos[atributo] || 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300';
};

const CELDA = 'py-1.5 px-2 border-r border-gray-200 dark:border-gray-700/70 whitespace-nowrap overflow-hidden text-ellipsis';

// Fila "No lleva OC" (producto de la guía del delivery), con el mismo
// criterio que en Solicitud: sin costo y con el N° de guía de su producto.
const FilaGuiaResumen = ({ d, f }) => (
  <tr className="border-b border-gray-200 dark:border-gray-700/70 bg-slate-50/60 dark:bg-gray-900/30 text-gray-500 dark:text-gray-400">
    <td className={CELDA}>{d.gestionId}</td>
    <td className={CELDA}>{d.nombre}</td>
    <td className={CELDA}>{d.medico}</td>
    <td className={CELDA}>{f.empresa}</td>
    <td className={CELDA}>{formatearFechaTabla(d.fecha)}</td>
    <td className={`${CELDA} italic`}>No lleva OC</td>
    <td className="py-1.5 px-2 border-r border-gray-200 dark:border-gray-700/70 truncate max-w-[180px]" title={f.descripcion}>{f.descripcion}</td>
    <td className={`${CELDA} text-center`}>{f.cantidad}</td>
    <td className={CELDA}>$0</td>
    <td className={`${CELDA} text-center`}>-</td>
    <td className={CELDA}>$0</td>
    <td className={CELDA}>{f.lote}</td>
    <td className={CELDA}>{f.vencimiento}</td>
    <td className={CELDA}>{f.numeroGuia ?? 0}</td>
    <td className={CELDA}>{f.atributo}</td>
    <td className="py-1.5 px-2 whitespace-nowrap overflow-hidden text-ellipsis">
      {(NOMBRES_MESES[d.periodoMes] || d.periodoMes)} {d.periodoAnio}
    </td>
  </tr>
);

const ResumenConsignacion = () => {
  const {
    anio, setAnio,
    mes, setMes,
    busqueda, setBusqueda,
    filtroAtributo, setFiltroAtributo,
    aniosDisponibles,
    mesesDelAnioActual,
    documentosFiltrados,
    filasGuiaPorDocumento,
    totales,
    cargando,
    actualizar
  } = useResumenConsignacionData();

  const { anchos, handleResize, restablecerAnchos, anchoTotalTabla } = useColumnResize(COLUMNAS);

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
          IMPUTADOS DE CONSIGNACIÓN
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
            value={filtroAtributo}
            onChange={e => setFiltroAtributo(e.target.value)}
            className="h-7 px-2 border border-gray-300 dark:border-gray-600 rounded text-[11px] bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 outline-none focus:border-[#2383C2] cursor-pointer"
          >
            <option value="">Atributo (Todos)</option>
            {ATRIBUTO_OPTIONS.map(op => (
              <option key={op} value={op}>{op}</option>
            ))}
          </select>

          {(busqueda || filtroAtributo) && (
            <button
              onClick={() => { setBusqueda(''); setFiltroAtributo(''); }}
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
          {totales.totalRegistros} registro(s) · {totales.totalCantidad} unidad(es) · Total ${totales.totalVenta.toLocaleString('es-CL')}
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
                Costo
                <ManijaRedimension colKey="costo" anchoActual={anchos.costo} anchoMin={COLUMNAS[8].min} onResize={handleResize} />
              </th>
              <th className="relative py-1.5 px-2 border-b border-r border-gray-200 dark:border-gray-700 text-center overflow-hidden">
                Recargo
                <ManijaRedimension colKey="recargo" anchoActual={anchos.recargo} anchoMin={COLUMNAS[9].min} onResize={handleResize} />
              </th>
              <th className="relative py-1.5 px-2 border-b border-r border-gray-200 dark:border-gray-700 overflow-hidden">
                Venta
                <ManijaRedimension colKey="venta" anchoActual={anchos.venta} anchoMin={COLUMNAS[10].min} onResize={handleResize} />
              </th>
              <th className="relative py-1.5 px-2 border-b border-r border-gray-200 dark:border-gray-700 overflow-hidden">
                Lote
                <ManijaRedimension colKey="lote" anchoActual={anchos.lote} anchoMin={COLUMNAS[11].min} onResize={handleResize} />
              </th>
              <th className="relative py-1.5 px-2 border-b border-r border-gray-200 dark:border-gray-700 overflow-hidden">
                Vencimiento
                <ManijaRedimension colKey="vencimiento" anchoActual={anchos.vencimiento} anchoMin={COLUMNAS[12].min} onResize={handleResize} />
              </th>
              <th className="relative py-1.5 px-2 border-b border-r border-gray-200 dark:border-gray-700 overflow-hidden">
                N° Guía
                <ManijaRedimension colKey="numGuia" anchoActual={anchos.numGuia} anchoMin={COLUMNAS[13].min} onResize={handleResize} />
              </th>
              <th className="relative py-1.5 px-2 border-b border-r border-gray-200 dark:border-gray-700 overflow-hidden">
                Atributo
                <ManijaRedimension colKey="atributo" anchoActual={anchos.atributo} anchoMin={COLUMNAS[14].min} onResize={handleResize} />
              </th>
              <th className="relative py-1.5 px-2 border-b border-gray-200 dark:border-gray-700 overflow-hidden">
                Período
                <ManijaRedimension colKey="periodo" anchoActual={anchos.periodo} anchoMin={COLUMNAS[15].min} onResize={handleResize} />
              </th>
            </tr>
          </thead>
          <tbody>
            {documentosFiltrados.length === 0 ? (
              <tr>
                <td colSpan={16} className="px-4 py-8 text-center text-gray-400 dark:text-gray-500 text-xs">
                  {!anio || !mes
                    ? 'Elige un año y un mes para ver los registros imputados.'
                    : 'No hay registros imputados para el período seleccionado.'}
                </td>
              </tr>
            ) : (
              documentosFiltrados.map(d => {
                const deliveryValor = (d.delivery || '').trim();
                const tieneVinculo = Boolean(d.deliveryVinculado);
                const lote = tieneVinculo && d.loteGuiaVinculado
                  ? d.loteGuiaVinculado
                  : (deliveryValor ? 'PAD' : 'Sin lote');
                const vencimiento = tieneVinculo && d.vencimientoGuiaVinculado
                  ? d.vencimientoGuiaVinculado
                  : (deliveryValor ? 'PAD' : 'Sin fecha');

                return (
                  <React.Fragment key={d.refPath}>
                  <tr
                    className="border-b border-gray-200 dark:border-gray-700/70 hover:bg-gray-50/80 dark:hover:bg-gray-700/40 transition-colors"
                  >
                    <td className="py-1.5 px-2 border-r border-gray-200 dark:border-gray-700/70 font-semibold text-[#2383C2] whitespace-nowrap overflow-hidden text-ellipsis">{d.gestionId}</td>
                    <td className="py-1.5 px-2 border-r border-gray-200 dark:border-gray-700/70 text-gray-700 dark:text-gray-200 font-medium whitespace-nowrap overflow-hidden text-ellipsis">{d.nombre}</td>
                    <td className="py-1.5 px-2 border-r border-gray-200 dark:border-gray-700/70 text-gray-600 dark:text-gray-300 whitespace-nowrap overflow-hidden text-ellipsis">{d.medico}</td>
                    <td className="py-1.5 px-2 border-r border-gray-200 dark:border-gray-700/70 text-gray-600 dark:text-gray-300 whitespace-nowrap overflow-hidden text-ellipsis">{d.empresa}</td>
                    <td className="py-1.5 px-2 border-r border-gray-200 dark:border-gray-700/70 text-gray-600 dark:text-gray-300 whitespace-nowrap overflow-hidden text-ellipsis">{formatearFechaTabla(d.fecha)}</td>
                    <td className="py-1.5 px-2 border-r border-gray-200 dark:border-gray-700/70 font-num text-emerald-600 dark:text-emerald-400 whitespace-nowrap overflow-hidden text-ellipsis">{d.codigo || 'S/C'}</td>
                    <td className="py-1.5 px-2 border-r border-gray-200 dark:border-gray-700/70 text-gray-600 dark:text-gray-300 truncate max-w-[180px]" title={d.descripcion}>{d.descripcion}</td>
                    <td className="py-1.5 px-2 border-r border-gray-200 dark:border-gray-700/70 text-center text-gray-600 dark:text-gray-300 whitespace-nowrap overflow-hidden text-ellipsis">{d.cantidad}</td>
                    <td className="py-1.5 px-2 border-r border-gray-200 dark:border-gray-700/70 text-gray-600 dark:text-gray-300 whitespace-nowrap overflow-hidden text-ellipsis">${Number(d.costo || 0).toLocaleString('es-CL')}</td>
                    <td className="py-1.5 px-2 border-r border-gray-200 dark:border-gray-700/70 text-center text-gray-600 dark:text-gray-300 whitespace-nowrap overflow-hidden text-ellipsis">
                      {d.recargoVecesCosto != null ? `${d.recargoVecesCosto} x` : '-'}
                    </td>
                    <td className="py-1.5 px-2 border-r border-gray-200 dark:border-gray-700/70 text-emerald-700 dark:text-emerald-400 font-semibold whitespace-nowrap overflow-hidden text-ellipsis">${Number(d.venta || 0).toLocaleString('es-CL')}</td>
                    <td className="py-1.5 px-2 border-r border-gray-200 dark:border-gray-700/70 text-gray-600 dark:text-gray-300 whitespace-nowrap overflow-hidden text-ellipsis">{lote}</td>
                    <td className="py-1.5 px-2 border-r border-gray-200 dark:border-gray-700/70 text-gray-600 dark:text-gray-300 whitespace-nowrap overflow-hidden text-ellipsis">{vencimiento}</td>
                    <td className="py-1.5 px-2 border-r border-gray-200 dark:border-gray-700/70 text-gray-600 dark:text-gray-300 whitespace-nowrap overflow-hidden text-ellipsis">{d.numeroGuia ?? 0}</td>
                    <td className="py-1.5 px-2 border-r border-gray-200 dark:border-gray-700/70 overflow-hidden">
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full uppercase font-semibold ${getAtributoEstilo(d.atributo)}`}>
                        {d.atributo || '-'}
                      </span>
                    </td>
                    <td className="py-1.5 px-2 text-gray-500 dark:text-gray-400 whitespace-nowrap overflow-hidden text-ellipsis">
                      {(NOMBRES_MESES[d.periodoMes] || d.periodoMes)} {d.periodoAnio}
                    </td>
                  </tr>
                  {(filasGuiaPorDocumento.get(d.refPath) || []).map((f, idx) => (
                    <FilaGuiaResumen key={`${d.refPath}-guia-${idx}`} d={d} f={f} />
                  ))}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ResumenConsignacion;