import React, { useState, useCallback, useMemo, useRef } from 'react';
import { Trash2, RefreshCw, RotateCcw, Eye, Lock } from 'lucide-react';
import { textoOCs } from '../../../shared/ocIndex/indiceOC';
import { ordenesDeRegistro, esOrdenSincronizada } from '../../utils/registroConsignacionService';

const COLUMNAS = [
  { key: 'colorEstado', label: '', ancho: 28, min: 28, align: 'center', sinResize: true },
  { key: 'numero', label: '#', ancho: 40, min: 28, align: 'center' },
  { key: 'id', label: 'ID', ancho: 90, min: 60 },
  { key: 'nombre', label: 'Nombre', ancho: 160, min: 80 },
  { key: 'fecha', label: 'Fecha', ancho: 90, min: 70 },
  { key: 'empresa', label: 'Empresa', ancho: 140, min: 80 },
  { key: 'orden', label: 'Orden', ancho: 110, min: 60 },
  { key: 'centro', label: 'Centro', ancho: 100, min: 60 },
  { key: 'atributo', label: 'Atributo', ancho: 110, min: 60 },
  { key: 'estado', label: 'Estado', ancho: 100, min: 60 },
  { key: 'costo', label: 'Costo', ancho: 100, min: 60 },
  { key: 'solicitud', label: 'Solicitud', ancho: 100, min: 60 },
  { key: 'convenio', label: 'Convenio', ancho: 100, min: 60 },
  { key: 'prevision', label: 'Previsión', ancho: 100, min: 60 },
  { key: 'medico', label: 'Médico', ancho: 130, min: 70 },
  { key: 'descripcionPabellon', label: 'Desc. Pabellón', ancho: 160, min: 80 },
  { key: 'registradoPor', label: 'Registrado Por', ancho: 130, min: 80 },
  { key: 'acciones', label: 'Acciones', ancho: 100, min: 90, align: 'center', sinResize: true }
];

const anchosPorDefecto = () => COLUMNAS.reduce((acc, col) => ({ ...acc, [col.key]: col.ancho }), {});

// Ajustar esta paleta cuando se definan todos los estados reales del flujo.
const ESTADO_COLOR = {
  AGENDADO: 'bg-slate-400',
  PENDIENTE: 'bg-slate-400',
  INGRESADO: 'bg-blue-500',
  REVISAR: 'bg-amber-500',
  INCOMPLETO: 'bg-red-500',
  'S/COTIZACION': 'bg-slate-400',
  CARGADO: 'bg-emerald-500',
  SOLICITADO: 'bg-purple-500'
};

const ESTADO_BADGE = {
  AGENDADO: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300',
  PENDIENTE: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300',
  INGRESADO: 'bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400',
  REVISAR: 'bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400',
  INCOMPLETO: 'bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-400',
  'S/COTIZACION': 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300',
  CARGADO: 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400',
  SOLICITADO: 'bg-purple-100 dark:bg-purple-950/40 text-purple-700 dark:text-purple-400'
};

const formatearFechaTabla = (fechaString) => {
  if (!fechaString || !fechaString.includes('-')) return fechaString || '-';
  const partes = fechaString.split('-');
  if (partes.length !== 3) return fechaString;
  const [yyyy, mm, dd] = partes;
  return `${dd}-${mm}-${yyyy}`;
};

const renderP = (valor) => (valor === '' || valor === undefined || valor === null ? 'P' : valor);

const ManijaRedimension = ({ colKey, anchoActual, anchoMin, onResize }) => {
  const arrastrando = useRef(false);
  const xInicial = useRef(0);
  const anchoInicial = useRef(0);

  const handleMouseDown = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    arrastrando.current = true;
    xInicial.current = e.clientX;
    anchoInicial.current = anchoActual;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const handleMouseMove = (ev) => {
      if (!arrastrando.current) return;
      const delta = ev.clientX - xInicial.current;
      const nuevoAncho = Math.max(anchoMin, Math.round(anchoInicial.current + delta));
      onResize(colKey, nuevoAncho);
    };

    const handleMouseUp = () => {
      arrastrando.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [colKey, anchoActual, anchoMin, onResize]);

  return (
    <div
      onMouseDown={handleMouseDown}
      title="Arrastra para redimensionar"
      className="absolute top-0 right-0 h-full w-2 cursor-col-resize select-none z-20 group/handle flex items-center justify-center"
    >
      <div className="h-3/5 w-[2px] bg-transparent group-hover/handle:bg-[#2383C2] rounded-full transition-colors" />
    </div>
  );
};

export const CargasConsignacionTable = ({
  registros = [],
  numeroInicial = 0,
  onAbrirDetalle,
  onEliminar,
  onActualizarVinculados
}) => {
  const [anchos, setAnchos] = useState(anchosPorDefecto);
  const [actualizandoId, setActualizandoId] = useState(null);

  const handleResize = useCallback((colKey, nuevoAncho) => {
    setAnchos(prev => (prev[colKey] === nuevoAncho ? prev : { ...prev, [colKey]: nuevoAncho }));
  }, []);

  const restablecerAnchos = () => setAnchos(anchosPorDefecto());
  const anchoTotalTabla = useMemo(
    () => COLUMNAS.reduce((suma, col) => suma + (anchos[col.key] || col.ancho), 0),
    [anchos]
  );

  const handleClickActualizarVinculados = async (registro, e) => {
    e.stopPropagation();
    setActualizandoId(registro.id);
    try {
      await onActualizarVinculados(registro);
    } finally {
      setActualizandoId(null);
    }
  };

  const celdaBase = 'py-1 px-2 border-b border-r border-gray-200 dark:border-gray-700/70 whitespace-nowrap overflow-hidden text-ellipsis';

  return (
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
            {COLUMNAS.map(col => (
              <th
                key={col.key}
                className={`relative py-1.5 px-2 border-b border-r border-gray-200 dark:border-gray-700 overflow-hidden ${col.align === 'center' ? 'text-center' : ''}`}
                title={col.label}
              >
                <span className="block truncate">{col.label}</span>
                {!col.sinResize && (
                  <ManijaRedimension
                    colKey={col.key}
                    anchoActual={anchos[col.key]}
                    anchoMin={col.min}
                    onResize={handleResize}
                  />
                )}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {registros.length === 0 ? (
            <tr>
              <td colSpan={COLUMNAS.length} className="text-center py-12 text-gray-400 dark:text-gray-500 text-[11px]">
                No hay registros de consignación.
              </td>
            </tr>
          ) : (
            registros.map((r, index) => {
              const estadoKey = (r.estado || 'INGRESADO').toUpperCase();
              const ordenTexto = textoOCs(ordenesDeRegistro(r));
              return (
                <tr
                  key={r.id}
                  onDoubleClick={() => onAbrirDetalle && onAbrirDetalle(r)}
                  title="Doble clic para ver el detalle"
                  className="border-l-2 border-transparent hover:border-[#2383C2] hover:bg-gray-50/80 dark:hover:bg-gray-700/40 transition-colors cursor-pointer"
                >
                  <td className={`${celdaBase} text-center`}>
                    <span
                      className={`inline-block w-2.5 h-2.5 rounded-full ${ESTADO_COLOR[estadoKey] || 'bg-slate-400'}`}
                      title={estadoKey}
                    />
                  </td>
                  <td className={`${celdaBase} text-gray-500 dark:text-gray-400 font-bold text-center`}>{numeroInicial + index + 1}</td>
                  <td className={`${celdaBase} font-semibold text-[#2383C2]`} title={r.gestionId}>{r.gestionId || '-'}</td>
                  <td className={`${celdaBase} text-gray-700 dark:text-gray-200 font-medium`} title={r.nombre}>{r.nombre || '-'}</td>
                  <td className={`${celdaBase} text-gray-600 dark:text-gray-300`}>{formatearFechaTabla(r.fecha)}</td>
                  <td className={`${celdaBase} text-gray-600 dark:text-gray-300`} title={r.empresa}>{renderP(r.empresa)}</td>
                  <td className={`${celdaBase} text-gray-700 dark:text-gray-200 font-num`} title={esOrdenSincronizada(r) ? `${ordenTexto} · Sincronizada desde OC` : ordenTexto}>
                    {ordenTexto
                      ? <span className="flex items-center gap-1">{esOrdenSincronizada(r) && <Lock size={10} className="shrink-0 text-slate-400" />}<span className="truncate">{ordenTexto}</span></span>
                      : '—'}
                  </td>
                  <td className={`${celdaBase} text-gray-600 dark:text-gray-300 font-medium`}>{r.centro || 'PABELLON'}</td>
                  <td className={`${celdaBase} text-gray-600 dark:text-gray-300 font-medium`}>{r.atributo || '-'}</td>
                  <td className={celdaBase}>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase ${ESTADO_BADGE[estadoKey] || 'bg-slate-100 text-slate-600'}`}>
                      {estadoKey}
                    </span>
                  </td>
                  <td className={`${celdaBase} text-emerald-700 dark:text-emerald-400 font-semibold`}>
                    {r.costo ? `$${Number(r.costo).toLocaleString('es-CL')}` : '-'}
                  </td>
                  <td className={`${celdaBase} text-gray-600 dark:text-gray-300`}>{renderP(r.solicitud)}</td>
                  <td className={`${celdaBase} text-gray-500 dark:text-gray-400`}>{renderP(r.convenio)}</td>
                  <td className={`${celdaBase} text-gray-500 dark:text-gray-400`}>{renderP(r.prevision)}</td>
                  <td className={`${celdaBase} text-gray-600 dark:text-gray-300`} title={r.medico}>{r.medico || '-'}</td>
                  <td className={`${celdaBase} text-gray-500 dark:text-gray-400`} title={r.descripcionPabellon}>{renderP(r.descripcionPabellon)}</td>
                  <td className={`${celdaBase} text-gray-500 dark:text-gray-400`} title={r.registradoPor}>{renderP(r.registradoPor)}</td>
                  <td className="py-1 px-2 border-b border-gray-200 dark:border-gray-700 text-center overflow-hidden">
                    <div className="flex items-center justify-center gap-1.5" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => onAbrirDetalle && onAbrirDetalle(r)}
                        title="Ver detalle"
                        className="text-blue-600 hover:text-blue-800 transition p-0.5 rounded hover:bg-blue-50 dark:hover:bg-blue-950/30"
                      >
                        <Eye size={13} />
                      </button>
                      <button
                        onClick={(e) => handleClickActualizarVinculados(r, e)}
                        disabled={actualizandoId === r.id}
                        title="Actualizar datos vinculados desde Reportes"
                        className="text-gray-500 hover:text-[#2383C2] transition p-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <RefreshCw size={13} className={actualizandoId === r.id ? 'animate-spin' : ''} />
                      </button>
                      <button
                        onClick={() => onEliminar && onEliminar(r)}
                        title="Eliminar"
                        className="text-red-500 hover:text-red-700 transition p-0.5 rounded hover:bg-red-50 dark:hover:bg-red-950/30"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
};

export default CargasConsignacionTable;