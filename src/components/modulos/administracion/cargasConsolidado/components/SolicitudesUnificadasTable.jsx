import { Download, Loader2, Lock, Unlock, RotateCcw } from 'lucide-react';
import { useColumnResize } from '../../../../../hooks/useColumnResize';
import { ManijaRedimension } from '../../../../ui/ManijaRedimension';
import { useSolicitudesUnificadasData } from '../hooks/useSolicitudesUnificadasData';
import { ORIGEN, ORIGEN_LABEL, ORIGEN_BADGE_STYLE } from '../utils/normalizarFila';
import FiltrosBusquedaOrigen from './FiltrosBusquedaOrigen';

// Mismas columnas, mismo orden y mismos encabezados que las pantallas
// nativas de Solicitud (SolicitudConsignacion.jsx / SolicitudHemodinamia.jsx
// / SolicitudImplantes.jsx) — con dos columnas agregadas al principio
// (selección y Origen) porque acá se combinan las 3 colecciones en una
// sola tabla, algo que ninguna pantalla nativa necesita por separado.
const COLUMNAS = [
  { key: 'sel', label: '', ancho: 32, min: 28 },
  { key: 'origen', label: 'Origen', ancho: 100, min: 85 },
  { key: 'admision', label: 'Admisión', ancho: 90, min: 60 },
  { key: 'paciente', label: 'Paciente', ancho: 150, min: 80 },
  { key: 'medico', label: 'Médico', ancho: 110, min: 70 },
  { key: 'fecha', label: 'Fecha', ancho: 90, min: 65 },
  { key: 'empresa', label: 'Empresa', ancho: 150, min: 80 },
  { key: 'codigo', label: 'Código', ancho: 90, min: 60 },
  { key: 'descripcion', label: 'Descripción', ancho: 170, min: 90 },
  { key: 'cantidad', label: 'Cantidad', ancho: 75, min: 50 },
  { key: 'precio', label: 'Precio', ancho: 95, min: 60 },
  { key: 'atributo', label: 'Atributo', ancho: 110, min: 70 },
  { key: 'fechaRegistro', label: 'Fecha de Registro', ancho: 115, min: 75 },
  { key: 'fechaCarga', label: 'Fecha de Carga', ancho: 105, min: 75 },
  // Consignación tiene N° de Guía; Implantes/Hemodinamia no tienen "guía",
  // tienen N° de Cotización — se unifican bajo esta misma columna visual
  // (nombrada como en Consignación, la pantalla de referencia), tomando
  // el campo que corresponda según el origen de cada fila (ver fila.numGuia
  // en normalizarFila.js).
  { key: 'numGuia', label: 'N° Guía', ancho: 95, min: 65 },
  { key: 'fechaIngreso', label: 'Fecha de Ingreso', ancho: 105, min: 75 },
  { key: 'lote', label: 'Lote', ancho: 85, min: 50 },
  { key: 'vencimiento', label: 'Vencimiento', ancho: 100, min: 65 }
];

const formatearFechaTabla = (fechaString) => {
  if (!fechaString || !fechaString.includes('-')) return fechaString || '-';
  const [yyyy, mm, dd] = fechaString.split('-');
  return `${dd}-${mm}-${yyyy}`;
};

const formatearFechaDeTimestamp = (valor) => {
  if (!valor) return '-';
  const date = valor.toDate ? valor.toDate() : new Date(valor);
  if (isNaN(date.getTime())) return '-';
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
};

const obtenerFechaHoyTexto = () => {
  const hoy = new Date();
  const dd = String(hoy.getDate()).padStart(2, '0');
  const mm = String(hoy.getMonth() + 1).padStart(2, '0');
  const yyyy = hoy.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
};

const SolicitudesUnificadasTable = () => {
  const { anchos, handleResize, restablecerAnchos, anchoTotalTabla } = useColumnResize(COLUMNAS);
  const {
    filas,
    cargando,
    exportando,
    seleccionados,
    toggleSeleccion,
    toggleSeleccionarTodos,
    busqueda,
    setBusqueda,
    origenesSeleccionados,
    toggleOrigen,
    limpiarOrigenes,
    periodoImplantes,
    periodoConsignacion,
    periodoHemodinamia,
    handleExportarYMarcarSolicitado
  } = useSolicitudesUnificadasData();

  const fechaIngresoHoy = obtenerFechaHoyTexto();
  const selectIdsUnicos = [...new Set(filas.map(f => f.selectId))];
  const todosSeleccionados = selectIdsUnicos.length > 0 && seleccionados.size === selectIdsUnicos.length;

  return (
    <div className="flex-grow flex flex-col overflow-hidden">
      <div className="px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-gray-700 bg-slate-50/60 dark:bg-gray-900/30 text-pequeno">
        <div className="flex items-center gap-3">
          <span className="text-tinta-secundaria">{filas.length} fila{filas.length === 1 ? '' : 's'} · {seleccionados.size} seleccionado{seleccionados.size === 1 ? '' : 's'}</span>
          <span className={`flex items-center gap-1 ${periodoImplantes ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
            {periodoImplantes ? <Unlock size={11} /> : <Lock size={11} />}
            Implantes: {periodoImplantes ? `${periodoImplantes.mes} ${periodoImplantes.anio}` : 'sin período abierto'}
          </span>
          <span className={`flex items-center gap-1 ${periodoConsignacion ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
            {periodoConsignacion ? <Unlock size={11} /> : <Lock size={11} />}
            Consignación: {periodoConsignacion ? `${periodoConsignacion.mes} ${periodoConsignacion.anio}` : 'sin período abierto'}
          </span>
          <span className={`flex items-center gap-1 ${periodoHemodinamia ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
            {periodoHemodinamia ? <Unlock size={11} /> : <Lock size={11} />}
            Hemodinamia: {periodoHemodinamia ? `${periodoHemodinamia.mes} ${periodoHemodinamia.anio}` : 'sin período abierto'}
          </span>
        </div>
        <button
          type="button"
          onClick={handleExportarYMarcarSolicitado}
          disabled={exportando || seleccionados.size === 0}
          className="h-7 px-3 bg-[#2383C2] hover:bg-[#1d6fa5] text-white rounded flex items-center gap-1.5 transition text-pequeno disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {exportando ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
          Exportar y Marcar Solicitado
        </button>
      </div>

      <div className="px-3 py-1.5 border-b border-slate-200 dark:border-gray-700">
        <FiltrosBusquedaOrigen
          busqueda={busqueda}
          setBusqueda={setBusqueda}
          origenesSeleccionados={origenesSeleccionados}
          toggleOrigen={toggleOrigen}
          limpiarOrigenes={limpiarOrigenes}
        />
      </div>

      <div className="flex-grow overflow-auto relative">
        <div className="sticky top-0 z-20 flex justify-end px-1 py-0.5 bg-slate-100 dark:bg-gray-900 border-b border-slate-200 dark:border-gray-700">
          <button
            type="button"
            onClick={restablecerAnchos}
            title="Restablecer ancho de columnas"
            className="flex items-center gap-1 text-pequeno text-tinta-atenuada hover:text-[#2383C2] dark:hover:text-[#2383C2] transition px-1.5 py-0.5 rounded hover:bg-white dark:hover:bg-gray-800"
          >
            <RotateCcw size={10} /> Restablecer columnas
          </button>
        </div>

        <table
          className="text-left text-pequeno border-collapse"
          style={{ tableLayout: 'fixed', width: anchoTotalTabla, minWidth: anchoTotalTabla }}
        >
          <colgroup>
            {COLUMNAS.map(col => (
              <col key={col.key} style={{ width: anchos[col.key] }} />
            ))}
          </colgroup>
          <thead className="bg-slate-50 dark:bg-gray-900/60 sticky top-[22px] z-10">
            <tr className="text-tinta-secundaria uppercase text-pequeno">
              {COLUMNAS.map(col => (
                <th
                  key={col.key}
                  className="relative px-2.5 py-1.5 border-b border-r border-slate-200 dark:border-gray-700 overflow-hidden"
                >
                  {col.key === 'sel' ? (
                    <input
                      type="checkbox"
                      checked={todosSeleccionados}
                      onChange={toggleSeleccionarTodos}
                      className="cursor-pointer"
                    />
                  ) : <span className="block truncate">{col.label}</span>}
                  <ManijaRedimension colKey={col.key} anchoActual={anchos[col.key]} anchoMin={col.min} onResize={handleResize} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cargando ? (
              <tr>
                <td colSpan={COLUMNAS.length} className="px-3 py-6 text-center text-tinta-atenuada">
                  <Loader2 size={14} className="animate-spin inline mr-1.5" /> Cargando candidatos...
                </td>
              </tr>
            ) : filas.length === 0 ? (
              <tr>
                <td colSpan={COLUMNAS.length} className="px-3 py-6 text-center text-tinta-atenuada">
                  Sin registros listos para solicitar
                </td>
              </tr>
            ) : (
              filas.map((fila) => {
                const seleccionado = seleccionados.has(fila.selectId);
                return (
                  <tr
                    key={fila.id}
                    onClick={() => toggleSeleccion(fila.selectId)}
                    className={`cursor-pointer transition ${
                      seleccionado
                        ? 'bg-blue-50/60 dark:bg-blue-950/20'
                        : fila.esFilaGuia
                          ? 'bg-slate-50/60 dark:bg-gray-900/30 hover:bg-slate-100/70 dark:hover:bg-gray-900/50'
                          : 'hover:bg-slate-50 dark:hover:bg-gray-800/60'
                    }`}
                  >
                    <td className="px-2.5 py-1.5 border-b border-r border-slate-100 dark:border-gray-700/60" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={seleccionado}
                        onChange={() => toggleSeleccion(fila.selectId)}
                        className="cursor-pointer"
                      />
                    </td>
                    <td className="px-2.5 py-1.5 border-b border-r border-slate-100 dark:border-gray-700/60">
                      <span className={`inline-block px-1.5 py-0.5 text-pequeno rounded border uppercase ${ORIGEN_BADGE_STYLE[fila.origen]}`}>
                        {ORIGEN_LABEL[fila.origen]}
                      </span>
                    </td>
                    <td className="px-2.5 py-1.5 border-b border-r border-slate-100 dark:border-gray-700/60 text-etiqueta text-[#2383C2] whitespace-nowrap overflow-hidden text-ellipsis">
                      {fila.gestionId}
                    </td>
                    <td className="px-2.5 py-1.5 border-b border-r border-slate-100 dark:border-gray-700/60 text-tinta-principal whitespace-nowrap overflow-hidden text-ellipsis">
                      {fila.paciente}
                    </td>
                    <td className="px-2.5 py-1.5 border-b border-r border-slate-100 dark:border-gray-700/60 text-tinta-secundaria whitespace-nowrap overflow-hidden text-ellipsis">
                      {fila.medico}
                    </td>
                    <td className="px-2.5 py-1.5 border-b border-r border-slate-100 dark:border-gray-700/60 text-tinta-secundaria whitespace-nowrap overflow-hidden text-ellipsis">
                      {formatearFechaTabla(fila.fecha)}
                    </td>
                    <td className="px-2.5 py-1.5 border-b border-r border-slate-100 dark:border-gray-700/60 text-tinta-secundaria truncate">
                      {fila.empresa}
                    </td>
                    <td className={`px-2.5 py-1.5 border-b border-r border-slate-100 dark:border-gray-700/60 whitespace-nowrap overflow-hidden text-ellipsis ${fila.esFilaGuia ? 'text-tinta-secundaria italic' : 'text-numero-tabla text-emerald-600 dark:text-emerald-400'}`}>
                      {fila.codigo}
                    </td>
                    <td className="px-2.5 py-1.5 border-b border-r border-slate-100 dark:border-gray-700/60 truncate" title={fila.descripcion}>
                      {fila.descripcion}
                    </td>
                    <td className="px-2.5 py-1.5 border-b border-r border-slate-100 dark:border-gray-700/60 text-center text-tinta-secundaria whitespace-nowrap overflow-hidden text-ellipsis">
                      {fila.cantidad}
                    </td>
                    <td className="px-2.5 py-1.5 border-b border-r border-slate-100 dark:border-gray-700/60 text-emerald-700 dark:text-emerald-400 text-etiqueta whitespace-nowrap overflow-hidden text-ellipsis">
                      ${Number(fila.precio || 0).toLocaleString('es-CL')}
                    </td>
                    <td className="px-2.5 py-1.5 border-b border-r border-slate-100 dark:border-gray-700/60 text-tinta-secundaria whitespace-nowrap overflow-hidden text-ellipsis">
                      {fila.atributo}
                    </td>
                    <td className="px-2.5 py-1.5 border-b border-r border-slate-100 dark:border-gray-700/60 text-tinta-secundaria whitespace-nowrap overflow-hidden text-ellipsis">
                      {formatearFechaDeTimestamp(fila.fechaRegistro)}
                    </td>
                    <td className="px-2.5 py-1.5 border-b border-r border-slate-100 dark:border-gray-700/60 text-tinta-secundaria whitespace-nowrap overflow-hidden text-ellipsis">
                      {formatearFechaTabla(fila.fechaCarga)}
                    </td>
                    <td className="px-2.5 py-1.5 border-b border-r border-slate-100 dark:border-gray-700/60 text-tinta-secundaria whitespace-nowrap overflow-hidden text-ellipsis">
                      {fila.numGuia}
                    </td>
                    <td className="px-2.5 py-1.5 border-b border-r border-slate-100 dark:border-gray-700/60 text-tinta-secundaria whitespace-nowrap overflow-hidden text-ellipsis">
                      {fechaIngresoHoy}
                    </td>
                    <td className="px-2.5 py-1.5 border-b border-r border-slate-100 dark:border-gray-700/60 text-tinta-secundaria whitespace-nowrap overflow-hidden text-ellipsis">
                      {fila.lote}
                    </td>
                    <td className="px-2.5 py-1.5 border-b border-slate-100 dark:border-gray-700/60 text-tinta-secundaria whitespace-nowrap overflow-hidden text-ellipsis">
                      {fila.origen === ORIGEN.CONSIGNACION ? fila.vencimiento : formatearFechaTabla(fila.vencimiento)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default SolicitudesUnificadasTable;
