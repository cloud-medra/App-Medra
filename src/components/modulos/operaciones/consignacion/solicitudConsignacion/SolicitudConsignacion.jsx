import React, { useMemo } from 'react';
import {
  ClipboardCheck,
  Download,
  Calendar as CalendarIcon,
  FileText,
  Lock,
  Unlock,
  RefreshCw,
  RotateCcw,
  AlertTriangle
} from 'lucide-react';
import Spinner from '../../../../ui/Spinner';
import { useSolicitudConsignacionData } from './hooks/useSolicitudConsignacionData';
import { usePeriodoAbiertoModulo } from '../../shared/usePeriodoAbiertoModulo';
import { useColumnResize } from '../../../../../hooks/useColumnResize';
import { ManijaRedimension } from '../../../../ui/ManijaRedimension';

const COLUMNAS = [
  { key: 'sel', ancho: 32, min: 28 },
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

// Regla estricta y literal: solo "P" o vacío (null/undefined/"") cuenta como
// incompleto. Valores como 0, "Sin lote", "Sin fecha" NO se tratan como
// inválidos a propósito (decisión explícita, ver conversación).
const esValorInvalido = (valor) => valor === 'P' || valor === '' || valor === null || valor === undefined;

const CLASE_CELDA_INVALIDA = 'bg-red-50 dark:bg-red-950/30 ring-1 ring-inset ring-red-400 dark:ring-red-700';

// Fuente de verdad de la validación: campos reales del documento
// (consignacion_registros), no solo las columnas visibles de esta tabla —
// mismo criterio que SolicitudImplantes.jsx, para el mismo tipo de bug
// (un campo real puede quedar en "P"/vacío sin columna propia acá y viajar
// igual a consignacion_imputadas, que copia el documento completo con
// `...it.datosOriginales`). `columna` es la key de COLUMNAS a resaltar en
// rojo; si es null, el campo no tiene columna propia y solo se nombra en
// el banner de arriba de la tabla.
//
// OJO: "convenio"/"previsión"/"descripcionPabellon" NO se incluyen a
// propósito — en este módulo se completan después, vía la acción
// "Actualizar Vinculados" (CargasConsignacion.jsx) que los trae desde
// ReportesInfo, así que suelen quedar vacíos legítimamente hasta que esa
// vinculación corre. Si igual los querés bloqueando el export, avisame.
const CAMPOS_A_VALIDAR = [
  { key: 'gestionId', label: 'Admisión', columna: 'admision', obtener: (it) => it.gestionId },
  { key: 'nombre', label: 'Paciente', columna: 'paciente', obtener: (it) => it.nombre },
  { key: 'medico', label: 'Médico', columna: 'medico', obtener: (it) => it.medico },
  { key: 'fecha', label: 'Fecha', columna: 'fecha', obtener: (it) => it.fecha },
  { key: 'empresa', label: 'Empresa', columna: 'empresa', obtener: (it) => it.empresa },
  { key: 'codigo', label: 'Código', columna: 'codigo', obtener: (it) => it.codigo },
  { key: 'descripcion', label: 'Descripción', columna: 'descripcion', obtener: (it) => it.descripcion },
  { key: 'cantidad', label: 'Cantidad', columna: 'cantidad', obtener: (it) => it.cantidad },
  { key: 'costo', label: 'Precio', columna: 'precio', obtener: (it) => it.costo },
  { key: 'atributo', label: 'Atributo', columna: 'atributo', obtener: (it) => it.atributo },
  { key: 'numeroGuia', label: 'N° Guía', columna: 'numGuia', obtener: (it) => it.numeroGuia },
  { key: 'lote', label: 'Lote', columna: 'lote', obtener: (it) => it.lote },
  { key: 'vencimiento', label: 'Vencimiento', columna: 'vencimiento', obtener: (it) => it.vencimiento },
  { key: 'centro', label: 'Centro/Unidad', columna: null, obtener: (it) => it.datosOriginales?.centro }
];

const SolicitudConsignacion = () => {
  const {
    items,
    cargando,
    exportando,
    seleccionados,
    toggleSeleccion,
    toggleSeleccionarTodos,
    handleExportarYMarcarSolicitado,
    refrescar
  } = useSolicitudConsignacionData();

  const { periodoAbierto, cargandoPeriodo } = usePeriodoAbiertoModulo('consignacion');

  const { anchos, handleResize, restablecerAnchos, anchoTotalTabla } = useColumnResize(COLUMNAS);

  const totalGeneral = items.reduce((acc, it) => acc + (Number(it.costoTotal) || 0), 0);
  const fechaIngresoHoy = obtenerFechaHoyTexto();

  // Mapa item.id -> Set de column keys con datos incompletos ("P" o
  // vacío), evaluado sobre TODAS las filas de la tabla (no solo las
  // seleccionadas). Las filas "de guía" (esFilaGuia) se excluyen: no tienen
  // documento propio y nunca llegan a imputadas (el export ya las filtra
  // con itemsSeleccionados.filter(it => it.ref) antes de escribir), así que
  // sus placeholders ("N/A", "No lleva OC") no son un error a corregir acá.
  const columnasInvalidasPorFila = useMemo(() => {
    const mapa = new Map();
    items.forEach(it => {
      if (it.esFilaGuia) return;
      const columnas = new Set();
      const camposOcultos = [];
      CAMPOS_A_VALIDAR.forEach(campo => {
        if (esValorInvalido(campo.obtener(it))) {
          if (campo.columna) columnas.add(campo.columna);
          else camposOcultos.push(campo.label);
        }
      });
      if (columnas.size > 0 || camposOcultos.length > 0) {
        mapa.set(it.id, { columnas, camposOcultos });
      }
    });
    return mapa;
  }, [items]);

  const filasInvalidas = items.filter(it => columnasInvalidasPorFila.has(it.id));
  const hayFilasInvalidas = filasInvalidas.length > 0;
  const admisionesConProblema = [...new Set(filasInvalidas.map(it => it.gestionId || 'P'))];
  const camposOcultosConProblema = [...new Set(
    filasInvalidas.flatMap(it => columnasInvalidasPorFila.get(it.id).camposOcultos)
  )];

  return (
    <div className="w-full h-full flex flex-col bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm overflow-hidden p-0 relative text-[11px]">
      {(cargando || exportando) && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-gray-500/20 dark:bg-black/40 backdrop-blur-[2px]">
          <div className="bg-white/90 dark:bg-gray-800/90 p-4 rounded-xl shadow-xl flex flex-col items-center gap-3">
            <Spinner size="md" color="#2383C2" />
            <h3 className="text-[#2383C2] font-bold text-[13px]">
              {exportando ? 'Exportando y actualizando...' : 'Cargando solicitudes...'}
            </h3>
          </div>
        </div>
      )}

      {/* HEADER PRINCIPAL */}
      <div className="px-3 py-2 flex items-center justify-between border-b border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/80">
        <h2 className="text-[12px] font-bold text-gray-700 dark:text-gray-100 flex items-center gap-1.5">
          <ClipboardCheck size={15} className="text-[#2383C2]" />
          SOLICITUD DE CONSIGNACIÓN
        </h2>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={refrescar}
            disabled={cargando}
            title="Actualizar lista (vuelve a leer guías y maestros)"
            className="p-1 rounded-md text-gray-500 hover:text-[#2383C2] dark:text-gray-400 dark:hover:text-[#2383C2] hover:bg-gray-100 dark:hover:bg-gray-700 transition disabled:opacity-40"
          >
            <RefreshCw size={14} className={cargando ? 'animate-spin' : ''} />
          </button>

          <button
            onClick={() => handleExportarYMarcarSolicitado(periodoAbierto)}
            disabled={seleccionados.size === 0 || exportando || hayFilasInvalidas}
            title={hayFilasInvalidas ? 'Hay filas con datos incompletos — corregilas antes de exportar' : undefined}
            className="px-3 py-1 bg-[#2383C2] hover:bg-[#1d6fa5] text-white rounded font-semibold flex items-center gap-1.5 transition text-[11px] shadow-xs active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Download size={13} />
            <span>Exportar Seleccionados ({seleccionados.size})</span>
          </button>
        </div>
      </div>

      {hayFilasInvalidas && (
        <div className="shrink-0 flex items-start gap-1.5 px-3 py-1.5 text-[10px] text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/20 border-b border-red-100 dark:border-red-900/40">
          <AlertTriangle size={12} className="shrink-0 mt-0.5" />
          <span>
            <strong>{filasInvalidas.length} fila(s)</strong> con datos incompletos ("P" o vacío) — el botón de exportar queda bloqueado hasta corregirlas. Revisá las celdas resaltadas en rojo.
            {' '}Admisión(es) afectada(s): <strong>{admisionesConProblema.slice(0, 6).join(', ')}{admisionesConProblema.length > 6 ? `, +${admisionesConProblema.length - 6} más` : ''}</strong>.
            {camposOcultosConProblema.length > 0 && (
              <> Además hay campos sin columna en esta tabla que igual se guardan en Imputadas: <strong>{camposOcultosConProblema.join(', ')}</strong>.</>
            )}
          </span>
        </div>
      )}

      {/* PERÍODO ABIERTO (Control Mensual) — solo referencial. */}
      {!cargandoPeriodo && (
        periodoAbierto ? (
          <div className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-[10px] text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 border-b border-emerald-100 dark:border-emerald-900/40">
            <Unlock size={11} className="shrink-0" />
            Período abierto para Consignación: <strong>{periodoAbierto.mes.toUpperCase()} {periodoAbierto.anio}</strong>
            <span className="text-emerald-600/70 dark:text-emerald-500/70 font-normal normal-case">
              — cada ítem se imputa según el período que estaba abierto cuando fue cargado, no necesariamente este.
            </span>
          </div>
        ) : (
          <div className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-[10px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-100 dark:border-amber-900/40">
            <Lock size={11} className="shrink-0" />
            No hay un período abierto para Consignación en Control Mensual.
          </div>
        )
      )}

      {/* BARRA INFORMATIVA */}
      <div className="bg-gray-50 dark:bg-gray-800/50 px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 dark:border-gray-700 text-[10px] text-gray-500 dark:text-gray-400">
        <span>
          Ítems con Estado <strong className="text-gray-700 dark:text-gray-200">CARGADO</strong>, pendientes de descargar y solicitar.
        </span>
        <span className="flex items-center gap-1">
          <FileText size={11} className="text-[#2383C2]" />
          {items.length} ítem(s) · Total ${totalGeneral.toLocaleString('es-CL')} · Fecha de ingreso: {fechaIngresoHoy}
        </span>
      </div>

      {/* TABLA PRINCIPAL — plana, sin subfilas */}
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
          className="text-left text-[10px] border-collapse"
          style={{ tableLayout: 'fixed', width: anchoTotalTabla, minWidth: anchoTotalTabla }}
        >
          <colgroup>
            {COLUMNAS.map(col => (
              <col key={col.key} style={{ width: anchos[col.key] }} />
            ))}
          </colgroup>

          <thead className="bg-gray-100 dark:bg-gray-900 sticky top-[22px] z-10">
            <tr className="text-gray-600 dark:text-gray-400 uppercase font-bold text-[9px]">
              <th className="relative py-1.5 px-2 border-b border-r border-gray-200 dark:border-gray-700 text-center overflow-hidden">
                <input
                  type="checkbox"
                  checked={items.length > 0 && seleccionados.size === items.length}
                  onChange={toggleSeleccionarTodos}
                  className="w-3.5 h-3.5 cursor-pointer accent-[#2383C2]"
                />
                <ManijaRedimension colKey="sel" anchoActual={anchos.sel} anchoMin={COLUMNAS[0].min} onResize={handleResize} />
              </th>
              <th className="relative py-1.5 px-2 border-b border-r border-gray-200 dark:border-gray-700 overflow-hidden">
                Admisión
                <ManijaRedimension colKey="admision" anchoActual={anchos.admision} anchoMin={COLUMNAS[1].min} onResize={handleResize} />
              </th>
              <th className="relative py-1.5 px-2 border-b border-r border-gray-200 dark:border-gray-700 overflow-hidden">
                Paciente
                <ManijaRedimension colKey="paciente" anchoActual={anchos.paciente} anchoMin={COLUMNAS[2].min} onResize={handleResize} />
              </th>
              <th className="relative py-1.5 px-2 border-b border-r border-gray-200 dark:border-gray-700 overflow-hidden">
                Médico
                <ManijaRedimension colKey="medico" anchoActual={anchos.medico} anchoMin={COLUMNAS[3].min} onResize={handleResize} />
              </th>
              <th className="relative py-1.5 px-2 border-b border-r border-gray-200 dark:border-gray-700 overflow-hidden">
                <span className="flex items-center gap-1"><CalendarIcon size={11} /> Fecha</span>
                <ManijaRedimension colKey="fecha" anchoActual={anchos.fecha} anchoMin={COLUMNAS[4].min} onResize={handleResize} />
              </th>
              <th className="relative py-1.5 px-2 border-b border-r border-gray-200 dark:border-gray-700 overflow-hidden">
                Empresa
                <ManijaRedimension colKey="empresa" anchoActual={anchos.empresa} anchoMin={COLUMNAS[5].min} onResize={handleResize} />
              </th>
              <th className="relative py-1.5 px-2 border-b border-r border-gray-200 dark:border-gray-700 overflow-hidden">
                Código
                <ManijaRedimension colKey="codigo" anchoActual={anchos.codigo} anchoMin={COLUMNAS[6].min} onResize={handleResize} />
              </th>
              <th className="relative py-1.5 px-2 border-b border-r border-gray-200 dark:border-gray-700 overflow-hidden">
                Descripción
                <ManijaRedimension colKey="descripcion" anchoActual={anchos.descripcion} anchoMin={COLUMNAS[7].min} onResize={handleResize} />
              </th>
              <th className="relative py-1.5 px-2 border-b border-r border-gray-200 dark:border-gray-700 text-center overflow-hidden">
                Cantidad
                <ManijaRedimension colKey="cantidad" anchoActual={anchos.cantidad} anchoMin={COLUMNAS[8].min} onResize={handleResize} />
              </th>
              <th className="relative py-1.5 px-2 border-b border-r border-gray-200 dark:border-gray-700 overflow-hidden">
                Precio
                <ManijaRedimension colKey="precio" anchoActual={anchos.precio} anchoMin={COLUMNAS[9].min} onResize={handleResize} />
              </th>
              <th className="relative py-1.5 px-2 border-b border-r border-gray-200 dark:border-gray-700 overflow-hidden">
                Atributo
                <ManijaRedimension colKey="atributo" anchoActual={anchos.atributo} anchoMin={COLUMNAS[10].min} onResize={handleResize} />
              </th>
              <th className="relative py-1.5 px-2 border-b border-r border-gray-200 dark:border-gray-700 overflow-hidden">
                Fecha de Registro
                <ManijaRedimension colKey="fechaRegistro" anchoActual={anchos.fechaRegistro} anchoMin={COLUMNAS[11].min} onResize={handleResize} />
              </th>
              <th className="relative py-1.5 px-2 border-b border-r border-gray-200 dark:border-gray-700 overflow-hidden">
                Fecha de Carga
                <ManijaRedimension colKey="fechaCarga" anchoActual={anchos.fechaCarga} anchoMin={COLUMNAS[12].min} onResize={handleResize} />
              </th>
              <th className="relative py-1.5 px-2 border-b border-r border-gray-200 dark:border-gray-700 overflow-hidden">
                N° Guía
                <ManijaRedimension colKey="numGuia" anchoActual={anchos.numGuia} anchoMin={COLUMNAS[13].min} onResize={handleResize} />
              </th>
              <th className="relative py-1.5 px-2 border-b border-r border-gray-200 dark:border-gray-700 overflow-hidden">
                Fecha de Ingreso
                <ManijaRedimension colKey="fechaIngreso" anchoActual={anchos.fechaIngreso} anchoMin={COLUMNAS[14].min} onResize={handleResize} />
              </th>
              <th className="relative py-1.5 px-2 border-b border-r border-gray-200 dark:border-gray-700 overflow-hidden">
                Lote
                <ManijaRedimension colKey="lote" anchoActual={anchos.lote} anchoMin={COLUMNAS[15].min} onResize={handleResize} />
              </th>
              <th className="relative py-1.5 px-2 border-b border-gray-200 dark:border-gray-700 overflow-hidden">
                Vencimiento
                <ManijaRedimension colKey="vencimiento" anchoActual={anchos.vencimiento} anchoMin={COLUMNAS[16].min} onResize={handleResize} />
              </th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={17} className="px-4 py-8 text-center text-gray-400 dark:text-gray-500 text-xs">
                  No hay ítems pendientes de solicitar por el momento.
                </td>
              </tr>
            ) : (
              items.map((it) => {
                const seleccionado = seleccionados.has(it.id);
                const invalidas = columnasInvalidasPorFila.get(it.id)?.columnas;
                const cc = (colKey, claseBase) => `${claseBase} ${invalidas?.has(colKey) ? CLASE_CELDA_INVALIDA : ''}`;
                const tt = (colKey, tituloBase) => invalidas?.has(colKey)
                  ? `Falta completar: ${COLUMNAS.find(c => c.key === colKey)?.label || colKey}`
                  : tituloBase;
                return (
                  <tr
                    key={it.id}
                    className={`border-b border-gray-200 dark:border-gray-700/70 transition-colors ${
                      seleccionado
                        ? 'bg-blue-50/60 dark:bg-blue-950/20'
                        : it.esFilaGuia
                          ? 'bg-slate-50/60 dark:bg-gray-900/30 hover:bg-slate-100/70 dark:hover:bg-gray-900/50'
                          : 'hover:bg-gray-50/80 dark:hover:bg-gray-700/40'
                    }`}
                  >
                    <td className="py-1 px-2 border-r border-gray-200 dark:border-gray-700/70 text-center">
                      <input
                        type="checkbox"
                        checked={seleccionado}
                        onChange={() => toggleSeleccion(it.id)}
                        className="w-3.5 h-3.5 cursor-pointer accent-[#2383C2]"
                      />
                    </td>
                    <td className={cc('admision', 'py-1 px-2 border-r border-gray-200 dark:border-gray-700/70 font-semibold text-[#2383C2] whitespace-nowrap overflow-hidden text-ellipsis')} title={tt('admision')}>
                      {it.gestionId}
                    </td>
                    <td className={cc('paciente', 'py-1 px-2 border-r border-gray-200 dark:border-gray-700/70 text-gray-700 dark:text-gray-200 font-medium whitespace-nowrap overflow-hidden text-ellipsis')} title={tt('paciente')}>
                      {it.nombre}
                    </td>
                    <td className={cc('medico', 'py-1 px-2 border-r border-gray-200 dark:border-gray-700/70 text-gray-600 dark:text-gray-300 whitespace-nowrap overflow-hidden text-ellipsis')} title={tt('medico')}>
                      {it.medico}
                    </td>
                    <td className={cc('fecha', 'py-1 px-2 border-r border-gray-200 dark:border-gray-700/70 text-gray-600 dark:text-gray-300 whitespace-nowrap overflow-hidden text-ellipsis')} title={tt('fecha')}>
                      {formatearFechaTabla(it.fecha)}
                    </td>
                    <td className={cc('empresa', 'py-1 px-2 border-r border-gray-200 dark:border-gray-700/70 text-gray-600 dark:text-gray-300 truncate max-w-[160px]')} title={tt('empresa', it.empresa)}>
                      {it.empresa}
                    </td>
                    <td className={cc('codigo', `py-1 px-2 border-r border-gray-200 dark:border-gray-700/70 whitespace-nowrap overflow-hidden text-ellipsis ${it.esFilaGuia ? 'text-slate-500 dark:text-gray-400 italic' : 'font-num text-emerald-600 dark:text-emerald-400'}`)} title={tt('codigo')}>
                      {it.codigo}
                    </td>
                    <td className={cc('descripcion', 'py-1 px-2 border-r border-gray-200 dark:border-gray-700/70 truncate max-w-[180px]')} title={tt('descripcion', it.descripcion)}>
                      {it.descripcion}
                    </td>
                    <td className={cc('cantidad', 'py-1 px-2 border-r border-gray-200 dark:border-gray-700/70 text-center text-gray-600 dark:text-gray-300 whitespace-nowrap overflow-hidden text-ellipsis')} title={tt('cantidad')}>
                      {it.cantidad}
                    </td>
                    <td className={cc('precio', 'py-1 px-2 border-r border-gray-200 dark:border-gray-700/70 text-emerald-700 dark:text-emerald-400 font-semibold whitespace-nowrap overflow-hidden text-ellipsis')} title={tt('precio')}>
                      ${Number(it.costo || 0).toLocaleString('es-CL')}
                    </td>
                    <td className={cc('atributo', 'py-1 px-2 border-r border-gray-200 dark:border-gray-700/70 text-gray-600 dark:text-gray-300 whitespace-nowrap overflow-hidden text-ellipsis')} title={tt('atributo')}>
                      {it.atributo}
                    </td>
                    <td className={cc('fechaRegistro', 'py-1 px-2 border-r border-gray-200 dark:border-gray-700/70 text-gray-600 dark:text-gray-300 whitespace-nowrap overflow-hidden text-ellipsis')} title={tt('fechaRegistro')}>
                      {formatearFechaDeTimestamp(it.fechaRegistro)}
                    </td>
                    <td className={cc('fechaCarga', 'py-1 px-2 border-r border-gray-200 dark:border-gray-700/70 text-gray-600 dark:text-gray-300 whitespace-nowrap overflow-hidden text-ellipsis')} title={tt('fechaCarga')}>
                      {formatearFechaTabla(it.fecha)}
                    </td>
                    <td className={cc('numGuia', 'py-1 px-2 border-r border-gray-200 dark:border-gray-700/70 text-gray-600 dark:text-gray-300 whitespace-nowrap overflow-hidden text-ellipsis')} title={tt('numGuia')}>
                      {it.numeroGuia}
                    </td>
                    <td className="py-1 px-2 border-r border-gray-200 dark:border-gray-700/70 text-gray-600 dark:text-gray-300 whitespace-nowrap overflow-hidden text-ellipsis">
                      {fechaIngresoHoy}
                    </td>
                    <td className={cc('lote', 'py-1 px-2 border-r border-gray-200 dark:border-gray-700/70 text-gray-600 dark:text-gray-300 whitespace-nowrap overflow-hidden text-ellipsis')} title={tt('lote')}>
                      {it.lote}
                    </td>
                    <td className={cc('vencimiento', 'py-1 px-2 text-gray-600 dark:text-gray-300 whitespace-nowrap overflow-hidden text-ellipsis')} title={tt('vencimiento')}>
                      {it.vencimiento}
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

export default SolicitudConsignacion;