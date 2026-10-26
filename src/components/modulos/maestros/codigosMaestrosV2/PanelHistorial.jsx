import React, { useEffect, useState } from 'react';
import { History, User } from 'lucide-react';
import PanelLateral from './ui/PanelLateral';
import { Insignia } from './ui/TablaCodigos';
import Spinner from '../../../ui/Spinner';
import { CAMPOS_AUDITABLES_REGISTRO } from '../shared/codigos/camposAuditablesRegistro';
import { cargarLogsCodigo } from './accionesCodigos';
import { formatearFecha, formatearPrecio } from './camposCodigo';

const ACCIONES = {
  CREACION: { texto: 'Creación manual', tono: 'exito' },
  CREACION_MASIVA: { texto: 'Creación por importación', tono: 'exito' },
  EDICION: { texto: 'Edición', tono: 'aviso' },
  ACTUALIZACION_REGISTRO: { texto: 'Modificación', tono: 'aviso' },
  ACTUALIZACION_PRECIO_IMPORTACION: { texto: 'Precio por importación', tono: 'aviso' },
  ASIGNACION_CODIGO: { texto: 'Asignación de código', tono: 'acento' },
  ELIMINACION: { texto: 'Eliminación', tono: 'peligro' }
};

const ETIQUETAS = {
  ...Object.fromEntries(CAMPOS_AUDITABLES_REGISTRO.map(({ key, label }) => [key, label])),
  descriptorEmpresa: 'Descriptor empresa',
  descriptorAuto: 'Descriptor auto',
  observacion: 'Observación',
  observacionModificacion: 'Motivo',
  codigoAsignado: 'Código asignado',
  metodoRegistro: 'Método',
  registradoPor: 'Registrado por'
};

const OCULTOS = new Set(['fechaRegistro', 'tieneCodigo']);

const valorLegible = (campo, valor) => {
  if (campo.startsWith('precioNeto') || campo === 'precioNeto') return formatearPrecio(valor);
  if (valor === null || valor === undefined || valor === '') return 'Vacío';
  if (typeof valor === 'object') return valor.toDate ? formatearFecha(valor) : JSON.stringify(valor);
  if (campo === 'metodoRegistro') return valor === 'IMPORTACION' ? 'Importación' : 'Manual';
  return String(valor);
};

// Detalle genérico: pares `xAnterior`/`xNuevo` como "antes → después" y el
// resto como "campo: valor". Cubre los logs de ambas vistas.
const DetalleLog = ({ detalles = {} }) => {
  const claves = Object.keys(detalles).filter((k) => !OCULTOS.has(k));
  const cambios = claves.filter((k) => k.endsWith('Anterior')).map((k) => k.slice(0, -'Anterior'.length));
  const simples = claves.filter((k) => !k.endsWith('Anterior') && !(k.endsWith('Nuevo') && cambios.includes(k.slice(0, -'Nuevo'.length))));
  if (cambios.length === 0 && simples.length === 0) return null;

  return (
    <dl className="mt-2 grid grid-cols-[minmax(0,auto)_1fr] gap-x-3 gap-y-1 text-[12px]">
      {cambios.map((campo) => (
        <React.Fragment key={campo}>
          <dt className="text-slate-500 dark:text-gray-400">{ETIQUETAS[campo] || campo}</dt>
          <dd className="text-slate-700 dark:text-gray-200 min-w-0 break-words">
            <span className="line-through decoration-slate-300 text-slate-400">{valorLegible(campo, detalles[`${campo}Anterior`])}</span>
            {' → '}
            <span className="font-medium">{valorLegible(campo, detalles[`${campo}Nuevo`])}</span>
          </dd>
        </React.Fragment>
      ))}
      {simples.map((campo) => (
        <React.Fragment key={campo}>
          <dt className="text-slate-500 dark:text-gray-400">{ETIQUETAS[campo] || campo}</dt>
          <dd className="text-slate-700 dark:text-gray-200 min-w-0 break-words">{valorLegible(campo, detalles[campo])}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
};

// Historial (subcolección logs): se lee solo al abrir el panel.
const PanelHistorial = ({ abierto, registro, onCerrar }) => {
  const [logs, setLogs] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!abierto || !registro?.id) return undefined;
    let vigente = true;
    setCargando(true);
    setError(null);
    setLogs([]);
    cargarLogsCodigo(registro.id)
      .then((datos) => { if (vigente) setLogs(datos); })
      .catch((err) => { console.error('Error cargando logs:', err); if (vigente) setError('No se pudo cargar el historial.'); })
      .finally(() => { if (vigente) setCargando(false); });
    return () => { vigente = false; };
  }, [abierto, registro?.id]);

  useEffect(() => {
    if (!abierto) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onCerrar(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [abierto, onCerrar]);

  const encabezado = (
    <div>
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-slate-400 dark:text-gray-500">
        <History size={12} /> Historial de cambios
      </div>
      <h3 className="mt-1.5 text-[17px] font-semibold font-mono text-slate-900 dark:text-gray-50 truncate">{registro?.codigo || 'Sin código'}</h3>
      <p className="mt-0.5 text-[13px] text-slate-500 dark:text-gray-400 truncate">
        {registro?.referencia} · {registro?.empresa}
      </p>
    </div>
  );

  return (
    <PanelLateral abierto={abierto} onSolicitarCierre={onCerrar} encabezado={encabezado} ancho="max-w-[460px]">
      <div className="px-5 py-4">
        {cargando ? (
          <div className="flex flex-col items-center gap-2 py-16 text-[12px] text-slate-400"><Spinner size="sm" color="#2383C2" />Cargando historial…</div>
        ) : error ? (
          <p className="py-16 text-center text-[13px] text-red-600">{error}</p>
        ) : logs.length === 0 ? (
          <p className="py-16 text-center text-[13px] text-slate-400">Este registro no tiene historial.</p>
        ) : (
          <ol className="relative border-l border-slate-200 dark:border-gray-700 ml-1.5 space-y-5">
            {logs.map((log) => {
              const accion = ACCIONES[log.accion] || { texto: log.accion, tono: 'neutro' };
              return (
                <li key={log.id} className="pl-5 relative">
                  <span className="absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full bg-white dark:bg-gray-900 ring-2 ring-slate-300 dark:ring-gray-600" />
                  <div className="flex items-center justify-between gap-2">
                    <Insignia tono={accion.tono}>{accion.texto}</Insignia>
                    <span className="text-[11px] text-slate-400 tabular-nums">{formatearFecha(log.fecha)}</span>
                  </div>
                  <p className="mt-1 flex items-center gap-1 text-[12px] text-slate-500 dark:text-gray-400"><User size={12} />{log.usuario || '—'}</p>
                  <DetalleLog detalles={log.detalles} />
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </PanelLateral>
  );
};

export default PanelHistorial;
