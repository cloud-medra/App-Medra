import React from 'react';
import { History, X } from 'lucide-react';
import EstadoProcesoBadge from '../../../../shared/EstadoProcesoBadge';

const HistorialDocumentos = ({
  showLogModal,
  onClose,
  selectedFacturaForLog,
  logsList,
  loadingLogs
}) => {
  const getAccionBadgeClass = (accion) => {
    switch (accion) {
      case 'MODIFICACION_FACTURA':
        return 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400';
      case 'INICIO_PROCESO':
        return 'bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400';
      case 'VINCULACION_CODIGOS':
        return 'bg-purple-100 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300';
      case 'VINCULACION_OC':
        return 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300';
      case 'SOLICITUD_DIFERENCIAS_EXPORTADA':
        return 'bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-400';
      case 'ACTA INGRESADA':
        return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400';
      case 'CREACION':
        return 'bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-400';
      case 'EDICION':
        return 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400';
      default:
        return 'bg-gray-100 text-tinta-principal dark:bg-gray-800';
    }
  };

  const formatearFechaLog = (log) => {
    if (log.fechaHora) return log.fechaHora;
    if (log.timestamp?.toDate) return log.timestamp.toDate().toLocaleString('es-CL');
    return 'N/A';
  };

  const renderResumenLog = (resumen) => {
    if (!resumen) return null;

    if ('sinDiferencias' in resumen) {
      return (
        <div className="text-pequeno text-tinta-secundaria pt-1 flex gap-2 flex-wrap">
          <span>✅ Sin diferencias: {resumen.sinDiferencias ?? 0}</span>
          <span>⚠️ Con diferencias: {resumen.conDiferencias ?? 0}</span>
          <span>❌ Sin vincular: {resumen.sinVincular ?? 0}</span>
        </div>
      );
    }

    if ('numeroOrden' in resumen || 'numeroActa' in resumen || 'numeroSalida' in resumen) {
      return (
        <div className="text-pequeno text-tinta-secundaria pt-1 grid grid-cols-2 gap-x-3 gap-y-0.5">
          <span>Orden: <strong className="text-tinta-principal">{resumen.numeroOrden || '-'}</strong></span>
          <span>Acta: <strong className="text-tinta-principal">{resumen.numeroActa || '-'}</strong></span>
          <span>Salida: <strong className="text-tinta-principal">{resumen.numeroSalida || '-'}</strong></span>
          <span>F. Acta: <strong className="text-tinta-principal">{resumen.fechaActa || '-'}</strong></span>
          <span>F. Salida: <strong className="text-tinta-principal">{resumen.fechaSalida || '-'}</strong></span>
        </div>
      );
    }

    return (
      <div className="text-pequeno text-tinta-secundaria pt-1 flex gap-2 flex-wrap">
        {Object.entries(resumen).map(([key, value]) => (
          <span key={key}>{key}: <strong className="text-tinta-principal">{String(value)}</strong></span>
        ))}
      </div>
    );
  };

  const formatValorLog = (val) => {
    if (val === null || val === undefined || val === '') return '-';
    if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
      return String(val);
    }
    if (Array.isArray(val)) {
      if (val.length === 0) return '-';
      return val.map((item) => formatValorLog(item)).join(', ');
    }
    if (typeof val === 'object') {
      if (val.nombre) return val.nombre;
      if (val.codigo) return val.codigo;
      return Object.entries(val)
        .map(([k, v]) => `${k}: ${typeof v === 'object' && v !== null ? formatValorLog(v) : v}`)
        .join(', ');
    }
    return String(val);
  };

  const renderCambiosLog = (cambios) => {
    if (!cambios) return null;

    if (Array.isArray(cambios)) {
      if (cambios.length === 0) return null;
      return (
        <ul className="text-pequeno text-tinta-secundaria pt-1 space-y-0.5 list-disc list-inside">
          {cambios.map((c, idx) => (
            <li key={idx}>
              {typeof c === 'string'
                ? c
                : `${c.campo || c.label || 'Campo'}: ${formatValorLog(c.anterior ?? c.valorAnterior)} ➔ ${formatValorLog(c.nuevo ?? c.valorNuevo)}`}
            </li>
          ))}
        </ul>
      );
    }

    return (
      <ul className="text-pequeno text-tinta-secundaria pt-1 space-y-0.5 list-disc list-inside">
        {Object.entries(cambios).map(([campo, val]) => (
          <li key={campo}>
            {campo}: {formatValorLog(val?.anterior)} ➔ {formatValorLog(val?.nuevo ?? val)}
          </li>
        ))}
      </ul>
    );
  };

  return (
    <>
      <div
        className={`fixed inset-0 z-50 bg-black/30 backdrop-blur-[1px] transition-opacity duration-300 ${
          showLogModal ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      <aside
        className={`fixed top-0 right-0 z-50 h-full w-full max-w-md bg-white dark:bg-gray-800 shadow-2xl border-l border-gray-200 dark:border-gray-700 flex flex-col transition-transform duration-300 ease-in-out text-secundario ${
          showLogModal ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50/80 dark:bg-gray-900/80 shrink-0">
          <div className="flex items-center gap-2 overflow-hidden">
            <div className="p-1.5 rounded-md bg-[#2383C2]/10 dark:bg-[#2383C2]/20 text-[#2383C2]">
              <History size={16} />
            </div>
            <div className="truncate">
              <h3 className="text-subtitulo text-tinta-principal truncate">
                Historial de cambios
              </h3>
              <p className="text-pequeno text-tinta-secundaria truncate">
                Folio: {selectedFacturaForLog?.folio} - {selectedFacturaForLog?.rznSoc}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-pequeno bg-gray-200 dark:bg-gray-700 text-tinta-secundaria px-2 py-0.5 rounded-full">
              {logsList.length} logs
            </span>
            <button
              onClick={onClose}
              className="p-1 rounded-md text-tinta-atenuada hover:text-tinta-principal hover:bg-gray-100 dark:hover:bg-gray-700 transition"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loadingLogs ? (
            <div className="flex flex-col items-center justify-center h-48 text-tinta-secundaria">
              <div className="w-6 h-6 border-2 border-[#2383C2] border-t-transparent rounded-full animate-spin mb-2" />
              <p className="text-pequeno">Cargando historial...</p>
            </div>
          ) : logsList.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-tinta-atenuada text-center px-4">
              <History size={32} className="mb-2 opacity-30" />
              <p className="text-secundario">Sin registros</p>
              <p className="text-pequeno">No hay registros de actividad para este documento.</p>
            </div>
          ) : (
            logsList.map((log) => (
              <div key={log.id} className="p-3 border border-gray-200 dark:border-gray-700/80 rounded-lg bg-gray-50/50 dark:bg-gray-900/30 text-pequeno space-y-2">
                <div className="flex justify-between items-center">
                  <span className={`px-2 py-0.5 rounded text-pequeno uppercase tracking-wider ${getAccionBadgeClass(log.accion)}`}>
                    {log.accion}
                  </span>
                  <span className="text-tinta-atenuada text-pequeno tabular-nums">
                    {formatearFechaLog(log)}
                  </span>
                </div>

                <p className="text-tinta-principal text-etiqueta">
                  Usuario: <span className="text-tinta-secundaria">{log.usuario?.nombre || log.usuario?.email || "Usuario"}</span>
                </p>

                <div className="text-tinta-secundaria bg-white dark:bg-gray-800 p-2 rounded border border-gray-200/80 dark:border-gray-700 text-pequeno space-y-1">
                  {log.detalle && <p>{log.detalle}</p>}

                  {log.estadoAnterior && log.nuevoEstado && (
                    <div className="text-tinta-principal pt-1 border-t border-slate-100 dark:border-gray-700">
                      Estado: <EstadoProcesoBadge estado={log.estadoAnterior} size="xs" /> ➔ <EstadoProcesoBadge estado={log.nuevoEstado} size="xs" />
                    </div>
                  )}

                  {log.resumen && renderResumenLog(log.resumen)}

                  {log.cambios && renderCambiosLog(log.cambios)}

                  {(log.ocVinculadaId || log.estadoResultante) && (
                    <div className="text-pequeno text-tinta-secundaria pt-1 flex gap-3 flex-wrap">
                      {log.ocVinculadaId && <span>OC vinculada: <strong className="text-tinta-principal text-numero-tabla">{log.ocVinculadaId}</strong></span>}
                      {log.estadoResultante && <span>Resultado: <strong className="text-tinta-principal">{log.estadoResultante}</strong></span>}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="px-4 py-2.5 border-t border-gray-200 dark:border-gray-700 flex justify-end bg-gray-50 dark:bg-gray-900/80 shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-tinta-principal rounded text-pequeno transition"
          >
            Cerrar
          </button>
        </div>
      </aside>
    </>
  );
};

export default HistorialDocumentos;