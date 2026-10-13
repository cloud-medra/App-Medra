import { useCallback, useMemo, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import {
  FileSpreadsheet, Upload, X, Loader2, AlertTriangle,
  Search, CalendarSearch, Database, Trash2
} from 'lucide-react';
import { useToast } from '../../../../../context/ToastContext';
import { useGranularPermission } from '../../../../../hooks/useGranularPermission';
import Spinner from '../../../../ui/Spinner';
import PaginacionSimple from '../../../../ui/PaginacionSimple';
import { procesarImportacionDetallesOC, SnapshotAntiguoError } from './utils/procesarImportacionDetallesOC';
import { reconstruirSnapshotDetallesOC } from './utils/snapshotStorageDetallesOC';
import { ResumenImportacion } from './components/ResumenImportacion';
import { ModalEliminarFilas } from './components/ModalEliminarFilas';
import { eliminarFilasDetallesOC } from './utils/eliminarFilasDetallesOC';
import { useModal } from '../../../../../context/ModalContext';
import { useDetallesOCData } from './hooks/useDetallesOCData';
import { useDetallesOCFiltros, CAMPOS_BUSQUEDA_OC } from './hooks/useDetallesOCFiltros';
import { useUser } from '../../../../../context/UserContext';
import { esRolAdministrador } from '../../../../../../functions/permisos/nucleo.mjs';
import { useColumnResize } from '../../../../../hooks/useColumnResize';
import { ThRedimensionable, ColgroupRedimensionable, ThRelleno, TdRelleno } from '../../../../ui/ThRedimensionable';
import { BotonRestablecerAnchos } from '../../../../ui/BotonRestablecerAnchos';
import { nombreDeMes } from '../../../../../utils/ordenarMeses';

const PATH_VISTA = '/documentos/importarDetallesOC';

const TH = 'px-2 py-1.5 border-b border-r border-slate-200 dark:border-gray-700';
const TD = 'px-2 py-1 border-b border-r border-slate-200/60 dark:border-gray-700/70 truncate';

// Columnas de la tabla (anchos en px, redimensionables; useColumnResize los
// recuerda por usuario en este navegador). `valor` es lo que se muestra y
// va también en el tooltip cuando no cabe.
const COLUMNAS = [
  { key: 'id', label: 'ID', ancho: 90, min: 60, td: 'font-num text-slate-600 dark:text-gray-400', valor: (i) => i.id },
  { key: 'admision', label: 'Admisión', ancho: 80, min: 60, td: 'font-semibold text-[#2383C2]', valor: (i) => i.admision },
  { key: 'paciente', label: 'Paciente', ancho: 160, min: 60, valor: (i) => i.paciente || '-' },
  { key: 'medico', label: 'Médico', ancho: 140, min: 60, valor: (i) => i.medico || '-' },
  { key: 'fecha_cx', label: 'Fecha Cx', ancho: 85, min: 60, valor: (i) => formatearFechaCelda(i.fecha_cx) },
  { key: 'proveedor', label: 'Proveedor', ancho: 160, min: 60, valor: (i) => i.proveedor || '-' },
  { key: 'codigo', label: 'Código', ancho: 85, min: 60, td: 'font-num text-emerald-600 dark:text-emerald-400', valor: (i) => i.codigo || '-' },
  { key: 'descripcion', label: 'Descripción', ancho: 200, min: 60, valor: (i) => i.descripcion || '-' },
  { key: 'cantidad', label: 'Cant.', ancho: 60, min: 60, th: 'text-center', td: 'text-center', valor: (i) => i.cantidad ?? '-' },
  { key: 'oc', label: 'OC', ancho: 95, min: 60, valor: (i) => i.oc || '-' },
  { key: 'estado', label: 'Estado', ancho: 95, min: 60, valor: (i) => i.estado || '-' },
  { key: 'numero_guia', label: 'N° Guía', ancho: 90, min: 60, valor: (i) => i.numero_guia || '-' },
  { key: 'numero_factura', label: 'N° Factura', ancho: 90, min: 60, valor: (i) => i.numero_factura || '-' }
];

function formatearFechaCelda(valor) {
  if (!valor) return '-';
  const fecha = valor.toDate ? valor.toDate() : new Date(valor);
  if (isNaN(fecha.getTime())) return '-';
  const dd = String(fecha.getDate()).padStart(2, '0');
  const mm = String(fecha.getMonth() + 1).padStart(2, '0');
  return `${dd}-${mm}-${fecha.getFullYear()}`;
}

const ImportarDetallesOC = () => {
  const { showToast } = useToast();
  const { hasPermission } = useGranularPermission();

  const [showModal, setShowModal] = useState(false);
  const [procesando, setProcesando] = useState(false);
  const [progreso, setProgreso] = useState(null);
  const [resumen, setResumen] = useState(null);
  const [snapshotAntiguo, setSnapshotAntiguo] = useState(false);
  const [reconstruyendo, setReconstruyendo] = useState(false);
  const [resultadoReconstruccion, setResultadoReconstruccion] = useState(null);
  const [ultimoArchivo, setUltimoArchivo] = useState(null);
  const { confirmAction } = useModal();
  const userData = useUser()?.userData;
  // Seleccionar/eliminar filas: rol Administrador/Desarrollador y la acción
  // (denegada por defecto).
  const esAdminODev = esRolAdministrador(userData?.rol) && hasPermission(PATH_VISTA, 'tabla_registros', 'btn_eliminar_filas');

  const {
    anio, setAnio, anios, cargandoAnios,
    mes, setMes, meses, cargandoMeses,
    filas, cargandoFilas, huboTope,
    recargarFilas, quitarFilas
  } = useDetallesOCData();

  const {
    busquedaAdmisionPaciente, setBusquedaAdmisionPaciente,
    campoBusquedaOC, setCampoBusquedaOC,
    textoBusquedaOC, setTextoBusquedaOC,
    filasFiltradas, filasPagina, totalFilas,
    pagina, setPagina, totalPaginas
  } = useDetallesOCFiltros(filas);
  const usuario = userData?.uid;
  const { anchos, handleResize, restablecerAnchos, anchoTotalTabla, personalizados } =
    useColumnResize(COLUMNAS, { clave: 'importarDetallesOC', usuario });

  // "Eliminar filas seleccionadas" (solo admin/dev). La selección guarda
  // refPath; solo cuentan las filas que siguen en el período cargado.
  const [seleccion, setSeleccion] = useState(() => new Set());
  const [modalEliminar, setModalEliminar] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const [progresoEliminar, setProgresoEliminar] = useState(null);
  const [resultadoEliminacion, setResultadoEliminacion] = useState(null);
  const seleccionadas = useMemo(() => filas.filter(f => seleccion.has(f.refPath)), [filas, seleccion]);
  const todasFiltradasSeleccionadas = filasFiltradas.length > 0 && filasFiltradas.every(f => seleccion.has(f.refPath));
  const algunaFiltradaSeleccionada = filasFiltradas.some(f => seleccion.has(f.refPath));
  const alternarFila = (refPath) => setSeleccion((prev) => {
    const s = new Set(prev);
    if (s.has(refPath)) s.delete(refPath); else s.add(refPath);
    return s;
  });
  const alternarTodasFiltradas = () => setSeleccion((prev) => {
    const s = new Set(prev);
    if (todasFiltradasSeleccionadas) filasFiltradas.forEach(f => s.delete(f.refPath));
    else filasFiltradas.forEach(f => s.add(f.refPath));
    return s;
  });
  const ANCHO_SELECCION = 30;
  const anchoTabla = anchoTotalTabla + (esAdminODev ? ANCHO_SELECCION : 0);

  const handleEliminar = async ({ liberarOC }) => {
    setEliminando(true);
    setProgresoEliminar({ actual: 0, total: seleccionadas.length });
    try {
      const r = await eliminarFilasDetallesOC(seleccionadas, { liberarOC, usuario: userData, onProgreso: setProgresoEliminar });
      const errores = new Set(r.errores.map(e => e.id));
      const eliminadas = seleccionadas.filter(f => !errores.has(f.id)).map(f => f.refPath);
      quitarFilas(eliminadas);
      setSeleccion(prev => { const s = new Set(prev); eliminadas.forEach(p => s.delete(p)); return s; });
      setResultadoEliminacion(r);
      setModalEliminar(false);
      showToast(`${r.eliminadas} fila(s) eliminada(s)${r.errores.length ? `, ${r.errores.length} con error` : ''}.`, r.errores.length ? 'error' : 'success');
    } catch (err) {
      console.error('Error al eliminar filas de Detalles OC:', err);
      showToast(err instanceof SnapshotAntiguoError ? err.message : 'No se pudieron eliminar las filas: ' + err.message, 'error');
      if (err instanceof SnapshotAntiguoError) { setSnapshotAntiguo(true); setModalEliminar(false); }
    } finally {
      setEliminando(false);
      setProgresoEliminar(null);
    }
  };

  const periodoSeleccionado = Boolean(anio && mes);
  const cargando = cargandoFilas;

  const importarArchivo = useCallback(async (file) => {
    if (!file) return;
    setUltimoArchivo(file);
    setProcesando(true);
    setResumen(null);
    setProgreso({ etapa: 'verificando' });

    try {
      const resultado = await procesarImportacionDetallesOC(file, { onProgreso: setProgreso, usuario: userData });
      setSnapshotAntiguo(false);
      setResumen(resultado);
      showToast(
        `Importación completa: ${resultado.nuevas} nueva(s), ${resultado.actualizadas} actualizada(s), ${resultado.sinCambios} sin cambios${resultado.errores.length ? `, ${resultado.errores.length} con error` : ''}`,
        resultado.errores.length || resultado.pendientes ? 'info' : 'success'
      );
      if (!resultado.indiceOC?.ok) showToast(resultado.indiceOC?.error || 'No se actualizó el índice de OC', 'error');
      if (resultado.nuevas + resultado.actualizadas + resultado.fechasCambiadas.length > 0) recargarFilas();
    } catch (err) {
      console.error('Error al importar Detalles OC:', err);
      if (err instanceof SnapshotAntiguoError) {
        setSnapshotAntiguo(true);
        showToast(err.message, 'error');
      } else {
        showToast('Error al importar: ' + err.message, 'error');
      }
    } finally {
      setProcesando(false);
      setProgreso(null);
    }
  }, [showToast, recargarFilas, userData]);

  const onDrop = useCallback((acceptedFiles) => importarArchivo(acceptedFiles[0]), [importarArchivo]);

  // Acción de una sola vez (admin/dev): snapshot formato 2 leyendo todas las
  // filas guardadas. Muestra las lecturas usadas.
  const handleReconstruir = () => {
    confirmAction(
      'Reconstruir snapshot',
      'Se leerán TODAS las filas guardadas de Detalles OC (1 lectura por fila) para armar el snapshot de comparación nuevo. Solo hace falta una vez. ¿Continuar?',
      async () => {
        setReconstruyendo(true);
        try {
          const r = await reconstruirSnapshotDetallesOC();
          setResultadoReconstruccion(r);
          setSnapshotAntiguo(false);
          showToast(`Snapshot reconstruido: ${r.totalFilas} fila(s), ${r.lecturas} lectura(s).`, 'success');
        } catch (err) {
          console.error('Error al reconstruir el snapshot de Detalles OC:', err);
          showToast('No se pudo reconstruir el snapshot: ' + err.message, 'error');
        } finally {
          setReconstruyendo(false);
        }
      },
      { confirmText: 'Reconstruir', type: 'warning' }
    );
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    maxFiles: 1,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls']
    }
  });

  const textoProgreso = () => {
    if (!progreso) return '';
    if (progreso.etapa === 'verificando') return 'Verificando la versión del snapshot...';
    if (progreso.etapa === 'leyendo') return 'Leyendo el archivo Excel...';
    if (progreso.etapa === 'comparando') return `Comparando ${progreso.total ?? ''} fila(s) con lo guardado...`;
    if (progreso.etapa === 'escribiendo') return `Guardando en Firestore... (${progreso.actual}/${progreso.total})`;
    if (progreso.etapa === 'gestiones_oc') return 'Marcando gestiones con OC cambiada...';
    if (progreso.etapa === 'guardando_snapshot') return 'Guardando snapshot de comparación...';
    if (progreso.etapa === 'indice_oc') return 'Actualizando índice de OC...';
    return 'Procesando...';
  };

  const porcentajeProgreso = () => {
    if (!progreso || !progreso.total) return null;
    return Math.round((progreso.actual / progreso.total) * 100);
  };

  return (
    <div className="w-full h-full flex flex-col bg-slate-50 dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-lg shadow-sm overflow-hidden p-0 relative font-sans text-[11px]">
      {procesando && (
        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-slate-900/30 dark:bg-black/50 backdrop-blur-[2px]">
          <div className="bg-white dark:bg-gray-800 p-5 rounded-xl shadow-xl flex flex-col items-center gap-2 border border-slate-100 dark:border-gray-700 min-w-[260px]">
            <Spinner size="md" color="#2383C2" />
            <h3 className="text-[#2383C2] font-normal text-[12px] text-center">{textoProgreso()}</h3>
            {porcentajeProgreso() !== null && (
              <div className="w-full h-1.5 bg-slate-100 dark:bg-gray-700 rounded-full overflow-hidden mt-1">
                <div className="h-full bg-[#2383C2] rounded-full transition-all" style={{ width: `${porcentajeProgreso()}%` }} />
              </div>
            )}
          </div>
        </div>
      )}

      <header className="bg-white dark:bg-gray-800 border-b border-slate-200 dark:border-gray-700 px-3 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileSpreadsheet size={16} className="text-[#2383C2]" />
          <span className="text-[12px] font-normal text-slate-800 dark:text-gray-100 tracking-wide uppercase">
            Importar Detalles OC
          </span>
        </div>

        <div className="flex items-center gap-1.5">
        {esAdminODev && (
          <button
            type="button"
            onClick={handleReconstruir}
            disabled={reconstruyendo || procesando}
            title="Solo admin/dev: rearma el snapshot de comparación leyendo todas las filas guardadas (una vez)"
            className="px-2 py-1 rounded text-[10px] border border-slate-300 dark:border-gray-600 text-slate-600 dark:text-gray-300 hover:border-[#2383C2] hover:text-[#2383C2] disabled:opacity-50 flex items-center gap-1"
          >
            {reconstruyendo ? <Loader2 size={11} className="animate-spin" /> : <Database size={11} />} Reconstruir snapshot
          </button>
        )}
        {hasPermission(PATH_VISTA, 'cabecera_acciones', 'btn_importar') && (
          <button
            onClick={() => setShowModal(true)}
            className="bg-[#2383C2] hover:bg-[#1c6fa6] text-white px-2.5 py-1 rounded text-[10px] font-normal flex items-center gap-1.5 transition shadow-sm"
          >
            <Upload size={11} /> Importar Excel
          </button>
        )}
        </div>
      </header>

      {snapshotAntiguo && (
        <div className="shrink-0 bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-800 px-3 py-2 flex flex-wrap items-center gap-2 text-[10.5px] text-amber-800 dark:text-amber-300">
          <AlertTriangle size={13} className="shrink-0" />
          <span className="flex-1 min-w-[200px]">
            El snapshot de comparación está en el formato antiguo. Antes de importar, un administrador debe ejecutar
            <strong> "Reconstruir snapshot"</strong> (una sola vez: lee todas las filas guardadas).
          </span>
          {esAdminODev && (
            <button
              type="button"
              onClick={handleReconstruir}
              disabled={reconstruyendo}
              className="px-2 py-1 rounded bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-50 flex items-center gap-1"
            >
              {reconstruyendo ? <Loader2 size={11} className="animate-spin" /> : <Database size={11} />} Reconstruir snapshot
            </button>
          )}
        </div>
      )}

      {resultadoReconstruccion && (
        <div className="shrink-0 bg-emerald-50 dark:bg-emerald-950/30 border-b border-emerald-200 dark:border-emerald-800 px-3 py-1.5 flex items-center gap-2 text-[10.5px] text-emerald-800 dark:text-emerald-300">
          <Database size={12} /> Snapshot reconstruido: {resultadoReconstruccion.totalFilas} fila(s) · Firestore: {resultadoReconstruccion.lecturas} lectura(s), {resultadoReconstruccion.escrituras} escritura(s). Ya puedes importar.
          <button type="button" onClick={() => setResultadoReconstruccion(null)} className="ml-auto p-0.5 rounded hover:bg-emerald-100 dark:hover:bg-emerald-900/40"><X size={12} /></button>
        </div>
      )}

      {resultadoEliminacion && (
        <div className="shrink-0 bg-slate-50 dark:bg-gray-800/60 border-b border-slate-200 dark:border-gray-700 px-3 py-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px] text-slate-700 dark:text-gray-200">
          <span className="flex items-center gap-1 font-semibold text-red-700 dark:text-red-400"><Trash2 size={12} /> {resultadoEliminacion.eliminadas} fila(s) eliminada(s) (con respaldo)</span>
          {resultadoEliminacion.gestionesOC && (
            <span title={resultadoEliminacion.gestionesOC.error || undefined}>
              {resultadoEliminacion.gestionesOC.error
                ? `OC a liberar: ${resultadoEliminacion.gestionesOC.ocLiberadas} — ${resultadoEliminacion.gestionesOC.error}`
                : `OC liberada en ${resultadoEliminacion.gestionesOC.itemsLiberados} ítem(s) de ${resultadoEliminacion.gestionesOC.gestionesActualizadas} gestión(es)`}
            </span>
          )}
          {resultadoEliminacion.errores.length > 0 && <span className="text-red-600 dark:text-red-400">{resultadoEliminacion.errores.length} no se pudieron eliminar ({resultadoEliminacion.errores[0].error})</span>}
          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-100 dark:bg-gray-700/60"><Database size={11} /> Firestore: {resultadoEliminacion.lecturasFirestore} lectura(s) · {resultadoEliminacion.escriturasFirestore} escritura(s)</span>
          <button type="button" onClick={() => setResultadoEliminacion(null)} className="ml-auto p-0.5 rounded hover:bg-slate-200 dark:hover:bg-gray-700"><X size={12} /></button>
        </div>
      )}

      {modalEliminar && (
        <ModalEliminarFilas
          filas={seleccionadas}
          eliminando={eliminando}
          progreso={progresoEliminar}
          onConfirmar={handleEliminar}
          onCerrar={() => setModalEliminar(false)}
        />
      )}

      {resumen && (
        <ResumenImportacion
          resumen={resumen}
          onCerrar={() => setResumen(null)}
          onReintentar={ultimoArchivo ? () => importarArchivo(ultimoArchivo) : null}
          reintentando={procesando}
        />
      )}

      {hasPermission(PATH_VISTA, 'barra_filtros') && (
        <div className="bg-gray-50 dark:bg-gray-800/50 px-3 py-1.5 flex flex-wrap items-center gap-2 border-b border-gray-200 dark:border-gray-700">
          {!cargandoAnios && anios.length === 0 ? (
            <span className="flex items-center gap-1.5 h-7 text-[11px] text-slate-500 dark:text-gray-400">
              <AlertTriangle size={12} /> No hay detalles importados.
            </span>
          ) : (
          <div className="flex items-center gap-1.5">
            <select
              value={anio}
              onChange={(e) => setAnio(e.target.value)}
              disabled={cargandoAnios}
              className="h-7 px-2 border border-gray-300 dark:border-gray-600 rounded text-[11px] bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 outline-none focus:border-[#2383C2] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="">{cargandoAnios ? 'Cargando años...' : 'Año'}</option>
              {anios.map((yyyy) => (
                <option key={yyyy} value={yyyy}>{yyyy}</option>
              ))}
            </select>

            <select
              value={mes}
              onChange={(e) => setMes(e.target.value)}
              disabled={!anio || cargandoMeses}
              className="h-7 px-2 border border-gray-300 dark:border-gray-600 rounded text-[11px] bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 outline-none focus:border-[#2383C2] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="">{cargandoMeses ? 'Cargando meses...' : 'Mes'}</option>
              {meses.map((mm) => (
                <option key={mm} value={mm}>{nombreDeMes(mm)}</option>
              ))}
            </select>
          </div>
          )}

          <div className="relative w-56">
            <Search className="absolute left-2 top-1.5 text-gray-400 dark:text-gray-500" size={13} />
            <input
              value={busquedaAdmisionPaciente}
              onChange={(e) => setBusquedaAdmisionPaciente(e.target.value)}
              disabled={!periodoSeleccionado}
              className="w-full h-7 pl-7 pr-2 border border-gray-300 dark:border-gray-600 rounded text-[11px] outline-none bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 focus:border-[#2383C2] disabled:opacity-50 disabled:cursor-not-allowed"
              placeholder="Buscar por admisión o paciente..."
            />
          </div>

          <div className="flex items-center h-7 border border-gray-300 dark:border-gray-600 rounded overflow-hidden">
            <select
              value={campoBusquedaOC}
              onChange={(e) => setCampoBusquedaOC(e.target.value)}
              disabled={!periodoSeleccionado}
              className="h-full px-2 border-r border-gray-300 dark:border-gray-600 text-[11px] bg-gray-100 dark:bg-gray-900 text-gray-700 dark:text-gray-200 outline-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {Object.entries(CAMPOS_BUSQUEDA_OC).map(([clave, { label }]) => (
                <option key={clave} value={clave}>{label}</option>
              ))}
            </select>
            <input
              value={textoBusquedaOC}
              onChange={(e) => setTextoBusquedaOC(e.target.value)}
              disabled={!periodoSeleccionado}
              className="h-full w-36 px-2 text-[11px] outline-none bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
              placeholder="Buscar valor..."
            />
          </div>

          {esAdminODev && seleccionadas.length > 0 && (
            <div className="ml-auto flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setSeleccion(new Set())}
                className="h-7 px-2 rounded border border-gray-300 dark:border-gray-600 text-[10.5px] text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                Quitar selección
              </button>
              <button
                type="button"
                onClick={() => setModalEliminar(true)}
                className="h-7 px-2 rounded bg-red-600 hover:bg-red-700 text-white text-[10.5px] font-semibold flex items-center gap-1"
              >
                <Trash2 size={12} /> Eliminar seleccionadas ({seleccionadas.length})
              </button>
            </div>
          )}
          <BotonRestablecerAnchos onClick={restablecerAnchos} personalizados={personalizados} className={esAdminODev && seleccionadas.length > 0 ? '' : 'ml-auto'} />
        </div>
      )}

      {!periodoSeleccionado ? (
        <div className="flex-grow flex flex-col items-center justify-center gap-2 text-center text-slate-400 dark:text-gray-500 px-6">
          <CalendarSearch size={26} className="text-slate-300 dark:text-gray-600" />
          <span className="text-[11px] font-medium">Selecciona un año y mes para ver los registros</span>
        </div>
      ) : cargando ? (
        <div className="flex-grow flex items-center justify-center gap-2 text-slate-400 dark:text-gray-500 text-[11px]">
          <Loader2 size={14} className="animate-spin" /> Cargando registros...
        </div>
      ) : (
        <>
          {huboTope && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800 px-3 py-1 text-[10.5px] text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
              <AlertTriangle size={11} /> Este período tiene muchos registros — puede que no se estén mostrando todos.
            </div>
          )}
          <div className="flex-grow min-h-0 overflow-auto relative">
            <table
              className="text-left text-[11px] border-collapse"
              style={{ tableLayout: 'fixed', width: anchoTabla, minWidth: '100%' }}
            >
              {esAdminODev && <colgroup><col style={{ width: ANCHO_SELECCION }} /></colgroup>}
              <ColgroupRedimensionable columnas={COLUMNAS} anchos={anchos} relleno />
              <thead className="bg-slate-100 dark:bg-gray-900/80 sticky top-0 z-10">
                <tr className="text-slate-600 dark:text-gray-400 uppercase font-normal text-[10px] tracking-wider">
                  {esAdminODev && (
                    <th className={`${TH} text-center`}>
                      <input
                        type="checkbox"
                        aria-label="Seleccionar todas las filas filtradas"
                        title="Seleccionar todas las filas filtradas (todas las páginas)"
                        checked={todasFiltradasSeleccionadas}
                        ref={el => { if (el) el.indeterminate = algunaFiltradaSeleccionada && !todasFiltradasSeleccionadas; }}
                        onChange={alternarTodasFiltradas}
                      />
                    </th>
                  )}
                  {COLUMNAS.map(col => (
                    <ThRedimensionable key={col.key} col={col} anchos={anchos} onResize={handleResize} className={`${TH} ${col.th || ''}`} title={col.label}>
                      {col.label}
                    </ThRedimensionable>
                  ))}
                  <ThRelleno className="border-b border-slate-200 dark:border-gray-700" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/60 dark:divide-gray-700/50 bg-white dark:bg-gray-800">
                {filasPagina.length === 0 ? (
                  <tr>
                    <td colSpan={COLUMNAS.length + 1 + (esAdminODev ? 1 : 0)} className="px-4 py-6 text-center text-slate-400 dark:text-gray-500 text-xs">
                      No hay registros para los filtros seleccionados.
                    </td>
                  </tr>
                ) : (
                  filasPagina.map((item) => (
                    <tr key={item.refPath} className={`transition-all duration-150 ${seleccion.has(item.refPath) ? 'bg-red-50/60 dark:bg-red-950/20' : 'hover:bg-slate-50 dark:hover:bg-gray-700/40'}`}>
                      {esAdminODev && (
                        <td className={`${TD} text-center`}>
                          <input type="checkbox" aria-label={`Seleccionar fila ${item.id}`} checked={seleccion.has(item.refPath)} onChange={() => alternarFila(item.refPath)} />
                        </td>
                      )}
                      {COLUMNAS.map(col => {
                        const valor = col.valor(item);
                        return <td key={col.key} className={`${TD} ${col.td || ''}`} title={String(valor)}>{valor}</td>;
                      })}
                      <TdRelleno className="border-b border-slate-200/60 dark:border-gray-700/70" />
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <PaginacionSimple pagina={pagina} totalPaginas={totalPaginas} totalFilas={totalFilas} setPagina={setPagina} />
        </>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/60 dark:bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 font-sans">
          <div className="bg-white dark:bg-gray-800 w-full max-w-md rounded-xl shadow-2xl overflow-hidden border border-slate-200 dark:border-gray-700">
            <div className="px-4 py-3 border-b border-slate-100 dark:border-gray-700 flex justify-between items-center bg-slate-50/50 dark:bg-gray-900/40">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-[#2383C2]/10 rounded-lg">
                  <Upload size={16} className="text-[#2383C2]" />
                </div>
                <h3 className="font-normal text-xs text-slate-800 dark:text-gray-100">Importar Detalles OC</h3>
              </div>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-gray-300 transition p-1">
                <X size={16} />
              </button>
            </div>
            <div className="p-6">
              <div {...getRootProps()} className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer flex flex-col items-center justify-center gap-3 transition ${isDragActive ? 'border-[#2383C2] bg-[#2383C2]/5' : 'border-slate-200 dark:border-gray-700 hover:border-[#2383C2]/50 hover:bg-slate-50 dark:hover:bg-gray-700/30'}`}>
                <input {...getInputProps()} />
                <div className="bg-slate-100 dark:bg-gray-900 p-3 rounded-full">
                  <FileSpreadsheet size={24} className="text-slate-400 dark:text-gray-500" />
                </div>
                <div>
                  <p className="text-xs font-normal text-slate-700 dark:text-gray-200">Arrastra tu archivo Excel aquí</p>
                  <p className="text-[10px] text-slate-400 dark:text-gray-400 mt-0.5">Hoja "planilla" — solo se escriben las filas nuevas o modificadas respecto a la importación anterior.</p>
                </div>
              </div>
            </div>
            <div className="px-4 py-3 bg-slate-50 dark:bg-gray-900/40 border-t border-slate-100 dark:border-gray-700 flex justify-end">
              <button onClick={() => setShowModal(false)} className="text-[11px] font-normal text-slate-500 dark:text-gray-400 hover:text-slate-800 dark:hover:text-gray-200 px-3 py-1 rounded-lg transition">
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ImportarDetallesOC;
