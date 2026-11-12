import React from 'react';
import {
  X,
  History,
  Settings,
  Download,
  Upload,
  FileSpreadsheet,
  FileDown
} from 'lucide-react';
import Spinner from '../../../ui/Spinner';

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
  CREACION: 'Creación Manual',
  CREACION_MASIVA: 'Creación por Importación',
  EDICION: 'Edición',
  ELIMINACION: 'Eliminación'
};

export const LogDrawer = ({
  show,
  onClose,
  selectedLab,
  logsList,
  loadingLogs,
  formatearFecha
}) => {
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
            <h3 className="text-subtitulo text-tinta-principal truncate">
              Historial de cambios
            </h3>
            <p className="text-pequeno text-tinta-secundaria truncate">
              {selectedLab?.nombre}{' '}
              <span className="text-etiqueta text-tinta-principal">
                ({selectedLab?.rut})
              </span>
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-md text-tinta-atenuada hover:text-tinta-secundaria hover:bg-gray-200 dark:hover:bg-gray-700 transition"
        >
          <X size={15} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
        {loadingLogs ? (
          <div className="flex flex-col items-center justify-center h-48 gap-2">
            <Spinner size="sm" color="#2383C2" />
            <p className="text-pequeno text-tinta-secundaria">
              Cargando historial...
            </p>
          </div>
        ) : logsList.length === 0 ? (
          <div className="text-center py-12 text-tinta-atenuada text-pequeno">
            No hay registros de auditoría para esta empresa.
          </div>
        ) : (
          logsList.map((log) => (
            <div
              key={log.id}
              className="p-2.5 border border-gray-200 dark:border-gray-700/80 rounded-md bg-gray-50/60 dark:bg-gray-900/40 text-pequeno space-y-1.5 shadow-sm"
            >
              <div className="flex justify-between items-center">
                <span
                  className={`px-1.5 py-0.5 rounded text-pequeno ${
                    log.accion === 'CREACION' || log.accion === 'CREACION_MASIVA'
                      ? 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400'
                      : log.accion === 'EDICION'
                      ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400'
                      : 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400'
                  }`}
                >
                  {ACCION_LABELS[log.accion] || log.accion}
                </span>
                <span className="text-tinta-atenuada text-pequeno">
                  {formatearFecha(log.fecha)}
                </span>
              </div>

              <p className="text-tinta-principal">
                Usuario:{' '}
                <span className="text-tinta-secundaria">
                  {log.usuario}
                </span>
              </p>

              <div className="text-tinta-secundaria bg-white dark:bg-gray-800 p-2 rounded border border-gray-100 dark:border-gray-700/60 text-pequeno">
                {(log.accion === 'CREACION' || log.accion === 'CREACION_MASIVA') && (
                  <div className="space-y-0.5">
                    <p>
                      <strong>Nombre:</strong> {log.detalles?.nombre}
                    </p>
                    <p>
                      <strong>RUT:</strong> {log.detalles?.rut}
                    </p>
                    <p>
                      <strong>Estado:</strong> {log.detalles?.estado}
                    </p>
                    {log.accion === 'CREACION_MASIVA' && (
                      <p>
                        <strong>Método:</strong> Importación
                      </p>
                    )}
                  </div>
                )}

                {log.accion === 'EDICION' && (
                  <ul className="space-y-1">
                    {log.detalles?.nombreAnterior !== log.detalles?.nombreNuevo && (
                      <li className="flex flex-col gap-0.5">
                        <span className="text-tinta-atenuada text-pequeno">Nombre</span>
                        <div className="flex items-center gap-1 flex-wrap">
                          <span className="text-red-500 dark:text-red-400">
                            {log.detalles?.nombreAnterior}
                          </span>
                          <span className="text-tinta-atenuada">→</span>
                          <span className="text-green-600 dark:text-green-400">
                            {log.detalles?.nombreNuevo}
                          </span>
                        </div>
                      </li>
                    )}
                    {log.detalles?.rutAnterior !== log.detalles?.rutNuevo && (
                      <li className="flex flex-col gap-0.5">
                        <span className="text-tinta-atenuada text-pequeno">RUT</span>
                        <div className="flex items-center gap-1 flex-wrap">
                          <span className="text-red-500 dark:text-red-400">
                            {log.detalles?.rutAnterior}
                          </span>
                          <span className="text-tinta-atenuada">→</span>
                          <span className="text-green-600 dark:text-green-400">
                            {log.detalles?.rutNuevo}
                          </span>
                        </div>
                      </li>
                    )}
                    {log.detalles?.estadoAnterior !== log.detalles?.estadoNuevo && (
                      <li className="flex flex-col gap-0.5">
                        <span className="text-tinta-atenuada text-pequeno">Estado</span>
                        <div className="flex items-center gap-1 flex-wrap">
                          <span className="text-red-500 dark:text-red-400">
                            {log.detalles?.estadoAnterior}
                          </span>
                          <span className="text-tinta-atenuada">→</span>
                          <span className="text-green-600 dark:text-green-400">
                            {log.detalles?.estadoNuevo}
                          </span>
                        </div>
                      </li>
                    )}
                  </ul>
                )}

                {log.accion === 'ELIMINACION' && (
                  <p className="text-red-500">
                    Registro eliminado ({log.detalles?.nombre} - {log.detalles?.rut})
                  </p>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="px-3 py-2 border-t border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-900 shrink-0 text-pequeno text-tinta-secundaria">
        <span>{logsList.length} registros</span>
        <button
          onClick={onClose}
          className="px-3 py-1 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-tinta-principal rounded text-etiqueta transition"
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
  totalLaboratorios,
  onExportar,
  onDescargarPlantilla,
  importFile,
  onSelectFile,
  importing,
  onEjecutarImportacion
}) => {
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
            <h3 className="text-subtitulo text-tinta-principal">
              Configuración de empresas
            </h3>
            <p className="text-pequeno text-tinta-secundaria">
              Herramientas de importación y exportación
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-md text-tinta-atenuada hover:text-tinta-secundaria hover:bg-gray-200 dark:hover:bg-gray-700 transition"
        >
          <X size={15} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        <div className="p-3 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50/50 dark:bg-gray-900/30 space-y-2">
          <div className="flex items-center gap-2 text-tinta-principal text-etiqueta">
            <Download size={14} className="text-emerald-600 dark:text-emerald-400" />
            <span>Exportar Empresas</span>
          </div>
          <p className="text-pequeno text-tinta-secundaria">
            Descarga la lista actual de empresas registradas ({totalLaboratorios}{' '}
            registros) en un archivo compatible con Excel (CSV/XLSX).
          </p>
          <button
            onClick={onExportar}
            className="w-full h-8 mt-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-etiqueta flex items-center justify-center gap-1.5 transition shadow-xs cursor-pointer"
          >
            <FileSpreadsheet size={14} />
            <span>Exportar a Excel / CSV</span>
          </button>
        </div>

        <div className="p-3 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50/50 dark:bg-gray-900/30 space-y-2.5">
          <div className="flex items-center gap-2 text-tinta-principal text-etiqueta">
            <Upload size={14} className="text-[#2383C2]" />
            <span>Importación Masiva</span>
          </div>
          <p className="text-pequeno text-tinta-secundaria">
            Carga masivamente nuevas empresas seleccionando un archivo
            formateado en Excel o CSV.
          </p>
          <button
            onClick={onDescargarPlantilla}
            type="button"
            className="w-full h-7 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-tinta-principal rounded text-pequeno flex items-center justify-center gap-1.5 border border-gray-300 dark:border-gray-600 transition cursor-pointer"
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
            <span className="block text-pequeno text-tinta-secundaria truncate">
              {importFile
                ? importFile.name
                : 'Haz clic para seleccionar archivo (.xlsx, .csv)'}
            </span>
          </div>

          <div className="p-2 bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/50 rounded text-pequeno text-blue-800 dark:text-blue-300">
            <strong>Formato de columnas requerido:</strong>
            <div className="text-numero-tabla mt-0.5 text-blue-600 dark:text-blue-400">
              NOMBRE | RUT | ESTADO
            </div>
          </div>

          <button
            onClick={onEjecutarImportacion}
            disabled={!importFile || importing}
            className={`w-full h-8 rounded text-etiqueta flex items-center justify-center gap-1.5 transition ${
              !importFile || importing
                ? 'bg-gray-300 dark:bg-gray-700 text-tinta-secundaria cursor-not-allowed'
                : 'bg-[#2383C2] hover:bg-[#1d6fa5] text-white shadow-xs cursor-pointer'
            }`}
          >
            {importing ? <Spinner size="sm" color="#ffffff" /> : <Upload size={14} />}
            <span>{importing ? 'Procesando...' : 'Cargar Registro'}</span>
          </button>
        </div>
      </div>

      <div className="px-3 py-2 border-t border-gray-200 dark:border-gray-700 flex justify-end bg-gray-50 dark:bg-gray-900 shrink-0">
        <button
          onClick={onClose}
          className="px-3 py-1 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-tinta-principal rounded transition text-pequeno"
        >
          Cerrar
        </button>
      </div>
    </div>
  );
};