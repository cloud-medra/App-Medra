import React from 'react';
import {
  X,
  History,
  Settings,
  Download,
  Upload,
  FileSpreadsheet,
  FileDown,
  Package,
  ListChecks
} from 'lucide-react';
import Spinner from '../../../../ui/Spinner';
import EstadoBadge from '../../shared/estadoGestion/EstadoBadge';
import { moduloGestion } from '../../shared/modulosGestion';

export const DrawersOverlay = ({ show, onClick }) => {
  if (!show) return null;
  return (
    <div
      onClick={onClick}
      className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px] transition-opacity duration-300"
    />
  );
};

const ACCION_LABELS = {
  CREACION: 'Creación de Gestión',
  CREACION_MASIVA: 'Creación por Importación',
  IMPORTACION: 'Importación Masiva',
  EDICION: 'Edición de Gestión',
  SINCRONIZACION: 'Sincronización de Datos',
  ELIMINACION: 'Eliminación de Gestión',
  ITEM_CREADO: 'Ítem Registrado (Carga)',
  ITEM_EDITADO: 'Ítem Editado (Carga)',
  ITEM_ELIMINADO: 'Ítem Eliminado (Carga)',
  IMPUTACION_RESINCRONIZADA: 'Re-sincronización con Imputadas',
  SOLICITUD_EXPORTADA: 'Solicitud Exportada',
  DOCUMENTO_ELIMINADO: 'Documento Eliminado'
};

const ACCION_ESTILOS = {
  CREACION: 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400',
  CREACION_MASIVA: 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400',
  IMPORTACION: 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400',
  EDICION: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400',
  SINCRONIZACION: 'bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-400',
  ELIMINACION: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400',
  ITEM_CREADO: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400',
  ITEM_EDITADO: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400',
  ITEM_ELIMINADO: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400',
  IMPUTACION_RESINCRONIZADA: 'bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400',
  SOLICITUD_EXPORTADA: 'bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-400',
  DOCUMENTO_ELIMINADO: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400'
};

const getAccionEstilo = (accion) => ACCION_ESTILOS[accion] || 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';

const FilaCambio = ({ etiqueta, anterior, nuevo }) => (
  <li className="flex flex-col gap-0.5">
    <span className="text-gray-400 text-[9px] font-bold">{etiqueta}</span>
    <div className="flex items-center gap-1 flex-wrap">
      <span className="text-red-500 dark:text-red-400 font-medium">{anterior ?? '-'}</span>
      <span className="text-gray-400">→</span>
      <span className="text-green-600 dark:text-green-400 font-medium">{nuevo ?? '-'}</span>
    </div>
  </li>
);

// `coleccionImputadas`: la del módulo de la gestión (ver modulosGestion.js).
const DetalleLog = ({ log, coleccionImputadas = 'implantes_imputadas' }) => {
  const d = log.detalles || {};

  switch (log.accion) {
    case 'CREACION':
    case 'CREACION_MASIVA':
    case 'IMPORTACION':
      return (
        <div className="space-y-0.5">
          {d.mensaje && <p className="font-semibold text-[#2383C2]">{d.mensaje}</p>}
          <p><strong>ID:</strong> {d.gestionId || d.agendaId || '-'}</p>
          <p><strong>Nombre:</strong> {d.nombre || '-'}</p>
          <p><strong>Empresa:</strong> {d.empresa || '-'}</p>
          <p><strong>Fecha:</strong> {d.fecha || '-'}</p>
          {(log.accion === 'CREACION_MASIVA' || log.accion === 'IMPORTACION') && (
            <p><strong>Método:</strong> Importación</p>
          )}
        </div>
      );

    case 'EDICION':
      return (
        <div className="space-y-0.5">
          <p className="text-gray-400 text-[9px] italic mb-1">Datos guardados en esta edición:</p>
          <p><strong>ID:</strong> {d.gestionId || d.agendaId || '-'}</p>
          <p><strong>Nombre:</strong> {d.nombre || '-'}</p>
          <p><strong>Empresa:</strong> {d.empresa || '-'}</p>
          <p><strong>Fecha:</strong> {d.fecha || '-'}</p>
          <p className="flex items-center gap-1"><strong>Estado:</strong> {d.estado ? <EstadoBadge estado={d.estado} ancho={false} /> : '-'}</p>
        </div>
      );

    case 'SINCRONIZACION':
      return (
        <div className="space-y-0.5">
          <p className="text-gray-400 text-[9px] italic mb-1">
            Datos vinculados actualizados desde Reportes — {d.idGestion ? `ID: ${d.idGestion}` : ''} {d.nombre || ''}
          </p>
          <p><strong>Convenio:</strong> {d.convenio || '-'}</p>
          <p><strong>Previsión:</strong> {d.prevision || '-'}</p>
          <p><strong>Médico:</strong> {d.medico || '-'}</p>
          <p><strong>Descripción:</strong> {d.descripcion || '-'}</p>
        </div>
      );

    case 'ELIMINACION':
      return (
        <p className="text-red-500 font-medium">
          Registro eliminado — ID: {d.idGestion || '-'} ({d.nombre || 'Sin nombre'})
        </p>
      );

    case 'ITEM_CREADO':
      return (
        <div className="space-y-1.5">
          <p>
            Se registró la referencia{' '}
            <span className="font-num font-bold text-[#2383C2]">{d.referencia || '-'}</span>
            {' '}(cantidad: <strong>{d.cantidad ?? '-'}</strong>)
            {d.paciente ? <> para <strong>{d.paciente}</strong></> : null}
            {d.admision ? <> — Admisión #{d.admision}</> : null}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {d.lote && d.lote !== 'P' && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                Lote: {d.lote}
              </span>
            )}
            {d.vencimiento && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                Venc: {d.vencimiento}
              </span>
            )}
            {d.estadoCarga && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                Estado: {d.estadoCarga}
              </span>
            )}
            {d.esPad && (
              <span className="flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded bg-fuchsia-100 dark:bg-fuchsia-950/40 text-fuchsia-700 dark:text-fuchsia-400 font-bold">
                <Package size={9} /> PAD
              </span>
            )}
            {d.contenidoDePad && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-fuchsia-100 dark:bg-fuchsia-950/40 text-fuchsia-700 dark:text-fuchsia-400">
                Contenido de PAD
              </span>
            )}
          </div>
        </div>
      );

    case 'ITEM_EDITADO':
      return (
        <ul className="space-y-1.5">
          {d.referenciaAnterior !== undefined && (
            <FilaCambio etiqueta="Referencia" anterior={d.referenciaAnterior} nuevo={d.referencia} />
          )}
          {d.cantidadAnterior !== undefined && (
            <FilaCambio etiqueta="Cantidad" anterior={d.cantidadAnterior} nuevo={d.cantidad} />
          )}
          {d.loteAnterior !== undefined && (
            <FilaCambio etiqueta="Lote" anterior={d.loteAnterior} nuevo={d.lote} />
          )}
          {d.vencimientoAnterior !== undefined && (
            <FilaCambio etiqueta="Vencimiento" anterior={d.vencimientoAnterior || '-'} nuevo={d.vencimiento || '-'} />
          )}
          {d.estadoCargaAnterior !== undefined && (
            <FilaCambio etiqueta="Estado de Carga" anterior={d.estadoCargaAnterior} nuevo={d.estadoCarga} />
          )}
          <li className="text-gray-400 text-[9px] italic pt-1.5 border-t border-gray-100 dark:border-gray-700/60">
            Referencia: <span className="font-num">{d.referencia || '-'}</span>
            {d.paciente ? <> · Paciente: {d.paciente}</> : null}
          </li>
        </ul>
      );

    case 'ITEM_ELIMINADO':
      return (
        <p className="text-red-500 font-medium">
          Se eliminó la referencia <span className="font-num">{d.referencia || '-'}</span>{' '}
          (cantidad: {d.cantidad ?? '-'}){d.paciente ? <> de <strong>{d.paciente}</strong></> : null}
        </p>
      );

    case 'IMPUTACION_RESINCRONIZADA': {
      const actualizados = d.itemsActualizados || [];
      const noSincronizados = d.itemsNoSincronizados || [];
      return (
        <div className="space-y-1.5">
          {actualizados.length > 0 && (
            <p className="text-emerald-600 dark:text-emerald-400">
              {actualizados.length} ítem{actualizados.length === 1 ? '' : 's'} actualizado{actualizados.length === 1 ? '' : 's'} en <strong>{coleccionImputadas}</strong>.
            </p>
          )}
          {noSincronizados.length > 0 && (
            <div className="space-y-0.5">
              <p className="text-purple-600 dark:text-purple-400 font-medium">
                {noSincronizados.length} ítem{noSincronizados.length === 1 ? '' : 's'} NO sincronizado{noSincronizados.length === 1 ? '' : 's'}:
              </p>
              <ul className="pl-3 list-disc text-gray-500 dark:text-gray-400">
                {noSincronizados.map((it, idx) => (
                  <li key={idx}>
                    <span className="font-num">{it.referencia || it.itemId}</span>
                    {' — '}
                    {it.motivo === 'PERIODO_CERRADO' ? 'período ya cerrado' : 'sin período asociado'}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      );
    }

    case 'SOLICITUD_EXPORTADA':
      return (
        <div className="space-y-0.5">
          <p className="text-sky-600 dark:text-sky-400">
            Exportado y marcado como <strong>SOLICITADO</strong>
            {d.periodo || (d.periodoMes && d.periodoAnio) ? <> — período {d.periodo || `${d.periodoMes} ${d.periodoAnio}`}</> : null}.
          </p>
          <p><strong>ID:</strong> {d.gestionId || '-'}</p>
          {d.empresa && <p><strong>Empresa:</strong> {d.empresa}</p>}
          {d.fecha && <p><strong>Fecha:</strong> {d.fecha}</p>}
          {d.cantidadItems !== undefined && <p><strong>Ítems exportados:</strong> {d.cantidadItems}</p>}
          {d.codigo && <p><strong>Código:</strong> {d.codigo}</p>}
          {d.cantidad !== undefined && <p><strong>Cantidad:</strong> {d.cantidad}</p>}
        </div>
      );

    // Pestaña Documentos (shared/documentosAdmision/DocumentosTab.jsx).
    case 'DOCUMENTO_ELIMINADO':
      return (
        <div className="space-y-0.5">
          <p className="text-red-500 font-medium break-all">Documento eliminado: {d.nombre || '-'}</p>
          <p><strong>Admisión:</strong> {d.idAdmision || '-'}</p>
          {d.archivoInexistente && (
            <p className="text-amber-600 dark:text-amber-400">El archivo ya no existía en el almacenamiento; solo se quitó del listado.</p>
          )}
        </div>
      );

    default:
      return (
        <p className="text-gray-500 dark:text-gray-400 italic">Sin detalles adicionales para esta acción.</p>
      );
  }
};

// `modulo` (opcional): Implantes o Hemodinamia, para los textos de imputadas.
export const HistorialLogsContenido = ({ logsList, loadingLogs, formatearFecha, modulo = 'implantes' }) => {
  const { coleccionImputadas } = moduloGestion(modulo);
  if (loadingLogs) {
    return (
      <div className="flex flex-col items-center justify-center h-48 gap-2">
        <Spinner size="sm" color="#2383C2" />
        <p className="text-[10px] text-gray-500 dark:text-gray-400">
          Cargando historial...
        </p>
      </div>
    );
  }

  if (!logsList || logsList.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400 dark:text-gray-500 text-[10px]">
        No hay registros de auditoría para este implante.
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {logsList.map((log) => (
        <div
          key={log.id}
          className="p-2.5 border border-gray-200 dark:border-gray-700/80 rounded-md bg-gray-50/60 dark:bg-gray-900/40 text-[10px] space-y-1.5 shadow-sm"
        >
          <div className="flex justify-between items-center">
            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${getAccionEstilo(log.accion)}`}>
              {ACCION_LABELS[log.accion] || log.accion}
            </span>
            <span className="text-gray-400 text-[9px]">
              {formatearFecha(log.fecha || log.timestamp)}
            </span>
          </div>

          <p className="text-gray-700 dark:text-gray-300 font-medium">
            Usuario:{' '}
            <span className="font-normal text-gray-600 dark:text-gray-400">
              {log.usuario}
            </span>
          </p>

          <div className="text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-800 p-2 rounded border border-gray-100 dark:border-gray-700/60 text-[10px]">
            <DetalleLog log={log} coleccionImputadas={coleccionImputadas} />
          </div>
        </div>
      ))}
    </div>
  );
};

export const LogDrawer = ({
  show,
  onClose,
  selectedImplante,
  logsList,
  loadingLogs,
  formatearFecha,
  modulo = 'implantes'
}) => {
  const idMostrado = selectedImplante?.gestionId || selectedImplante?.agendaId || 'N/A';

  return (
    <div
      className={`fixed top-0 right-0 z-50 h-full w-full max-w-sm bg-white dark:bg-gray-800 shadow-2xl border-l border-gray-200 dark:border-gray-700 flex flex-col transform transition-transform duration-300 ease-in-out ${
        show ? 'translate-x-0' : 'translate-x-full'
      }`}
    >
      <div className="px-3 py-2.5 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-900 shrink-0">
        <div className="flex items-center gap-2 truncate">
          <History size={15} className="text-[#2383C2] shrink-0" />
          <div className="truncate">
            <h3 className="text-[12px] font-bold text-gray-800 dark:text-gray-100 truncate">
              Historial de Cambios
            </h3>
            <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate">
              {selectedImplante?.nombre || 'Sin nombre'}{' '}
              <span className="font-semibold text-gray-700 dark:text-gray-300">
                (ID: {idMostrado})
              </span>
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 transition"
        >
          <X size={15} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        <HistorialLogsContenido logsList={logsList} loadingLogs={loadingLogs} formatearFecha={formatearFecha} modulo={modulo} />
      </div>

      <div className="px-3 py-2 border-t border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-900 shrink-0 text-[10px] text-gray-500">
        <span>{logsList.length} registros</span>
        <button
          onClick={onClose}
          className="px-3 py-1 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded font-bold transition"
        >
          Cerrar
        </button>
      </div>
    </div>
  );
};

export const ConfigDrawer = ({
  show,
  onClose,
  totalImplantes,
  onExportar,
  onDescargarPlantilla,
  importFile,
  onSelectFile,
  importing,
  onEjecutarImportacion,
  marcarOcPendiente, // solo admin/dev; null para el resto
  modulo = 'implantes' // Implantes o Hemodinamia (textos, ver modulosGestion.js)
}) => {
  const config = moduloGestion(modulo);
  return (
    <div
      className={`fixed top-0 right-0 z-50 h-full w-full max-w-sm bg-white dark:bg-gray-800 shadow-2xl border-l border-gray-200 dark:border-gray-700 flex flex-col transform transition-transform duration-300 ease-in-out ${
        show ? 'translate-x-0' : 'translate-x-full'
      }`}
    >
      <div className="px-3 py-2.5 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-900 shrink-0">
        <div className="flex items-center gap-2">
          <Settings size={16} className="text-[#2383C2]" />
          <div>
            <h3 className="text-[12px] font-bold text-gray-800 dark:text-gray-100">
              Configuración de {config.etiqueta}
            </h3>
            <p className="text-[10px] text-gray-500 dark:text-gray-400">
              Herramientas de importación y exportación
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 transition"
        >
          <X size={15} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        <div className="p-3 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50/50 dark:bg-gray-900/30 space-y-2">
          <div className="flex items-center gap-2 text-gray-800 dark:text-gray-200 font-bold text-[11px]">
            <Download size={14} className="text-emerald-600 dark:text-emerald-400" />
            <span>Exportar {config.etiqueta}</span>
          </div>
          <p className="text-[10px] text-gray-500 dark:text-gray-400 leading-relaxed">
            Descarga la lista actual de {config.textoRegistros} ({totalImplantes}{' '}
            registros) en un archivo compatible con Excel (CSV/XLSX).
          </p>
          <button
            onClick={onExportar}
            className="w-full h-8 mt-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded text-[11px] flex items-center justify-center gap-1.5 transition shadow-xs cursor-pointer"
          >
            <FileSpreadsheet size={14} />
            <span>Exportar a Excel / CSV</span>
          </button>
        </div>

        <div className="p-3 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50/50 dark:bg-gray-900/30 space-y-2.5">
          <div className="flex items-center gap-2 text-gray-800 dark:text-gray-200 font-bold text-[11px]">
            <Upload size={14} className="text-[#2383C2]" />
            <span>Importación Masiva</span>
          </div>
          <p className="text-[10px] text-gray-500 dark:text-gray-400 leading-relaxed">
            Carga masivamente {config.textoNuevosRegistros} seleccionando un archivo
            formateado en Excel o CSV.
          </p>
          <button
            onClick={onDescargarPlantilla}
            type="button"
            className="w-full h-7 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 font-semibold rounded text-[10px] flex items-center justify-center gap-1.5 border border-gray-300 dark:border-gray-600 transition cursor-pointer"
          >
            <FileDown size={13} className="text-[#2383C2]" />
            <span>Descargar Plantilla CSV</span>
          </button>

          <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-3 text-center bg-white dark:bg-gray-900 hover:border-[#2383C2] transition-colors cursor-pointer relative">
            <input
              type="file"
              accept=".csv, .xlsx, .xls"
              onChange={(e) => onSelectFile(e.target.files[0] || null)}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
            <FileSpreadsheet
              size={22}
              className="mx-auto text-gray-400 dark:text-gray-500 mb-1"
            />
            <span className="block text-[10px] font-semibold text-gray-600 dark:text-gray-300 truncate">
              {importFile
                ? importFile.name
                : 'Haz clic para seleccionar archivo (.xlsx, .csv)'}
            </span>
          </div>

          <div className="p-2 bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/50 rounded text-[9px] text-blue-800 dark:text-blue-300">
            <strong>Formato de columnas requerido:</strong>
            <div className="font-num mt-0.5 text-blue-600 dark:text-blue-400">
              NOMBRE | RUT | ESTADO
            </div>
          </div>

          <button
            onClick={onEjecutarImportacion}
            disabled={!importFile || importing}
            className={`w-full h-8 font-bold rounded text-[11px] flex items-center justify-center gap-1.5 transition ${
              !importFile || importing
                ? 'bg-gray-300 dark:bg-gray-700 text-gray-500 cursor-not-allowed'
                : 'bg-[#2383C2] hover:bg-[#1d6fa5] text-white shadow-xs cursor-pointer'
            }`}
          >
            {importing ? <Spinner size="sm" color="#ffffff" /> : <Upload size={14} />}
            <span>{importing ? 'Procesando...' : 'Cargar Registro'}</span>
          </button>
        </div>
        {marcarOcPendiente && <MarcarOcPendienteSeccion {...marcarOcPendiente} />}
      </div>

      <div className="px-3 py-2 border-t border-gray-200 dark:border-gray-700 flex justify-end bg-gray-50 dark:bg-gray-900 shrink-0">
        <button
          onClick={onClose}
          className="px-3 py-1 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded font-bold transition text-[10px]"
        >
          Cerrar
        </button>
      </div>
    </div>
  );
};
// Acción de una sola vez (admin/dev) para "Sincronizar OC": ver
// shared/ocIndex/marcarOcPendiente.js.
const MarcarOcPendienteSeccion = ({ desde, setDesde, hasta, setHasta, marcando, resultado, handleMarcarOcPendiente }) => (
  <div className="p-3 border border-amber-200 dark:border-amber-900/60 rounded-lg bg-amber-50/50 dark:bg-amber-950/20 space-y-2">
    <div className="flex items-center gap-2 text-gray-800 dark:text-gray-200 font-bold text-[11px]">
      <ListChecks size={14} className="text-amber-600 dark:text-amber-400" />
      <span>Marcar OC pendiente (una sola vez)</span>
    </div>
    <p className="text-[10px] text-gray-500 dark:text-gray-400 leading-relaxed">
      Agrega el campo <code>ocPendiente</code> a las gestiones antiguas para que "Sincronizar OC" las encuentre.
      Salta las que ya lo tienen. Lee 1 vez cada gestión del rango.
    </p>
    <div className="flex items-center gap-2 text-[10px] text-gray-600 dark:text-gray-300">
      <label className="flex-1">
        Desde
        <input type="month" value={desde} onChange={e => setDesde(e.target.value)} disabled={marcando}
          className="mt-0.5 w-full h-7 px-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-[11px]" />
      </label>
      <label className="flex-1">
        Hasta
        <input type="month" value={hasta} onChange={e => setHasta(e.target.value)} disabled={marcando}
          className="mt-0.5 w-full h-7 px-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-[11px]" />
      </label>
    </div>
    <button
      onClick={handleMarcarOcPendiente}
      disabled={marcando || !desde || !hasta}
      className={`w-full h-8 font-bold rounded text-[11px] flex items-center justify-center gap-1.5 transition ${
        marcando || !desde || !hasta
          ? 'bg-gray-300 dark:bg-gray-700 text-gray-500 cursor-not-allowed'
          : 'bg-amber-600 hover:bg-amber-700 text-white shadow-xs cursor-pointer'
      }`}
    >
      {marcando ? <Spinner size="sm" color="#ffffff" /> : <ListChecks size={14} />}
      <span>{marcando ? 'Marcando...' : 'Marcar gestiones'}</span>
    </button>
    {resultado && (
      <ul className="text-[10px] text-gray-600 dark:text-gray-300 space-y-0.5">
        <li>Revisadas: {resultado.revisadas} · ya tenían el campo: {resultado.yaTenian}</li>
        <li>Marcadas con OC pendiente: {resultado.marcadasPendiente} · sin pendiente: {resultado.marcadasSinPendiente}</li>
        {resultado.errores > 0 && <li className="text-red-600 dark:text-red-400">No se pudieron guardar: {resultado.errores}</li>}
        <li className="font-semibold">Firestore: {resultado.lecturasFirestore} lectura(s) · {resultado.escriturasFirestore} escritura(s)</li>
      </ul>
    )}
  </div>
);
