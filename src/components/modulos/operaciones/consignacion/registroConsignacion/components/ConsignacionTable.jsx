import React, { useState, useRef, useCallback } from 'react';
import { Trash2, RefreshCw, RotateCcw, Pencil, Lock } from 'lucide-react';
import { esRegistroEditable, mensajeRegistroNoEditable } from '../../utils/registroConsignacionService';
import { CeldaOrdenConsignacion } from './CeldaOrdenConsignacion';

const COLUMNAS = [
  { key: 'numero', label: '#', ancho: 40, min: 28, align: 'center' },
  { key: 'id', label: 'ID', ancho: 90, min: 60 },
  { key: 'nombre', label: 'Nombre', ancho: 150, min: 80 },
  { key: 'medico', label: 'Médico', ancho: 130, min: 70 },
  { key: 'fecha', label: 'Fecha', ancho: 90, min: 70 },
  { key: 'codigo', label: 'Código', ancho: 90, min: 60 },
  { key: 'descripcion', label: 'Descripción', ancho: 170, min: 80 },
  { key: 'cantidad', label: 'Cant.', ancho: 60, min: 40, align: 'center' },
  { key: 'costo', label: 'Costo', ancho: 90, min: 60 },
  { key: 'estado', label: 'Estado', ancho: 90, min: 60 },
  { key: 'orden', label: 'Orden', ancho: 100, min: 70 },
  { key: 'guias', label: 'Guía', ancho: 100, min: 70 },
  { key: 'despachado', label: 'Despachado', ancho: 110, min: 80 },
  { key: 'delivery', label: 'Delivery', ancho: 110, min: 60 },

  { key: 'referencia', label: 'Referencia', ancho: 150, min: 80 },
  { key: 'centro', label: 'Centro', ancho: 90, min: 60 },
  { key: 'atributo', label: 'Atributo', ancho: 100, min: 60 },
  { key: 'convenio', label: 'Convenio', ancho: 90, min: 60 },
  { key: 'prevision', label: 'Previsión', ancho: 90, min: 60 },
  { key: 'descripcionPabellon', label: 'Desc. Pabellón', ancho: 150, min: 80 },

  { key: 'acciones', label: 'Acciones', ancho: 110, min: 90, align: 'center' }
];

const anchosPorDefecto = () => COLUMNAS.reduce((acc, col) => ({ ...acc, [col.key]: col.ancho }), {});

// Paleta fija por estado de "Guía/Recibido": se calcula siempre a partir de
// si la columna "Guía" tiene un número cargado, así el badge nunca queda
// desincronizado del valor real de la guía (ver calcularEstadoGuia).
const ESTADO_GUIA_ESTILOS = {
  PENDIENTE: 'bg-orange-100 dark:bg-orange-950/40 text-orange-700 dark:text-orange-400',
  RECIBIDO: 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400'
};

const calcularEstadoGuia = (guias) => (guias && String(guias).trim() ? 'RECIBIDO' : 'PENDIENTE');

// Paleta fija por cada valor posible de la columna "Estado" del registro
// (ver ESTADOS_SEMILLA en CargasConsignacion.jsx para el ciclo de vida
// completo: INGRESADO -> ... -> CARGADO -> SOLICITADO).
const ESTADO_ESTILOS = {
  INGRESADO: 'bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400',
  PENDIENTE: 'bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400',
  REVISAR: 'bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-400',
  CARGADO: 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400',
  SOLICITADO: 'bg-purple-100 dark:bg-purple-950/40 text-purple-700 dark:text-purple-400'
};
const ESTADO_ESTILO_DEFECTO = 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300';

const formatearFechaTabla = (fechaString) => {
  if (!fechaString || !fechaString.includes('-')) return fechaString || '-';
  const partes = fechaString.split('-');
  if (partes.length !== 3) return fechaString;
  const [yyyy, mm, dd] = partes;
  return `${dd}-${mm}-${yyyy}`;
};

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

const CeldaTextoEditable = ({ valorInicial, onGuardar, placeholder, soloNumeros = false }) => {
  const [valor, setValor] = useState(valorInicial || '');

  return (
    <input
      type="text"
      inputMode={soloNumeros ? 'numeric' : 'text'}
      value={valor}
      onChange={e => setValor(soloNumeros ? e.target.value.replace(/\D/g, '') : e.target.value)}
      onBlur={() => {
        if (valor !== (valorInicial || '')) onGuardar(valor);
      }}
      placeholder={placeholder}
      className="w-full h-6 px-1.5 border border-transparent hover:border-gray-300 dark:hover:border-gray-600 focus:border-[#2383C2] rounded text-[10px] outline-none bg-transparent focus:bg-white dark:focus:bg-gray-900 text-gray-700 dark:text-gray-200 transition"
    />
  );
};

export const ConsignacionTable = ({ registros, numeroInicial = 0, onEliminar, onEditar, onActualizarOrden, onOrdenInvalida, onActualizarGuia, onActualizarVinculados }) => {
  const [anchos, setAnchos] = useState(anchosPorDefecto);
  const [actualizandoId, setActualizandoId] = useState(null);

  const handleResize = useCallback((colKey, nuevoAncho) => {
    setAnchos(prev => (prev[colKey] === nuevoAncho ? prev : { ...prev, [colKey]: nuevoAncho }));
  }, []);

  const restablecerAnchos = () => setAnchos(anchosPorDefecto());
  const anchoTotalTabla = COLUMNAS.reduce((suma, col) => suma + (anchos[col.key] || col.ancho), 0);

  const handleClickActualizarVinculados = async (registro) => {
    setActualizandoId(registro.id);
    try {
      await onActualizarVinculados(registro);
    } finally {
      setActualizandoId(null);
    }
  };

  // NOTA: ya no se usa "select-none" en el contenedor de la tabla — eso
  // bloqueaba poder seleccionar y copiar texto de cualquier celda. El
  // arrastre de columnas ya se protege aparte con
  // document.body.style.userSelect en ManijaRedimension, así que no hace
  // falta bloquear la selección en toda la tabla.
  const celdaBase = 'py-1 px-2 border-b border-r border-gray-200 dark:border-gray-700/70 whitespace-nowrap overflow-hidden text-ellipsis';

  return (
    <div className="flex-grow overflow-auto relative">
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
                className={`relative py-1.5 px-2 border-b border-r border-gray-200 dark:border-gray-700 overflow-hidden ${col.align === 'center' ? 'text-center' : ''
                  }`}
                title={col.label}
              >
                <span className="block truncate">{col.label}</span>
                <ManijaRedimension
                  colKey={col.key}
                  anchoActual={anchos[col.key]}
                  anchoMin={col.min}
                  onResize={handleResize}
                />
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
              const editable = esRegistroEditable(r);
              const estadoGuiaKey = calcularEstadoGuia(r.guias);

              return (
                <tr
                  key={r.id}
                  className="border-l-2 border-transparent hover:border-[#2383C2] hover:bg-gray-50/80 dark:hover:bg-gray-700/40 transition-colors"
                >
                  <td className={`${celdaBase} text-gray-500 dark:text-gray-400 font-bold text-center`}>{numeroInicial + index + 1}</td>
                  <td className={`${celdaBase} font-semibold text-[#2383C2]`} title={r.gestionId}>{r.gestionId || '-'}</td>
                  <td className={`${celdaBase} text-gray-700 dark:text-gray-200 font-medium`} title={r.nombre}>{r.nombre || '-'}</td>
                  <td className={`${celdaBase} text-gray-600 dark:text-gray-300`} title={r.medico}>{r.medico || '-'}</td>
                  <td className={`${celdaBase} text-gray-600 dark:text-gray-300`}>{formatearFechaTabla(r.fecha)}</td>
                  <td className={`${celdaBase} font-num text-emerald-600 dark:text-emerald-400`} title={r.codigo}>{r.codigo || 'S/C'}</td>
                  <td className={`${celdaBase} text-gray-500 dark:text-gray-400`} title={r.descripcion}>{r.descripcion || '-'}</td>
                  <td className={`${celdaBase} text-center font-semibold text-gray-700 dark:text-gray-200`}>{r.cantidad ?? 0}</td>
                  <td className={`${celdaBase} text-emerald-700 dark:text-emerald-400 font-semibold`}>
                    {r.costo ? `$${Number(r.costo).toLocaleString('es-CL')}` : '-'}
                  </td>
                  <td className={celdaBase}>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase ${ESTADO_ESTILOS[estadoKey] || ESTADO_ESTILO_DEFECTO}`}>
                      {estadoKey}
                    </span>
                  </td>
                  <td className="py-0.5 px-1 border-b border-r border-gray-200 dark:border-gray-700/70 overflow-hidden">
                    <CeldaOrdenConsignacion
                      key={`${r.id}_${r.orden || ''}_${r.ordenOrigen || ''}`}
                      registro={r}
                      onGuardar={(valor) => onActualizarOrden(r, valor)}
                      onInvalido={onOrdenInvalida}
                    />
                  </td>
                  <td className="py-0.5 px-1 border-b border-r border-gray-200 dark:border-gray-700/70 overflow-hidden">
                    <CeldaTextoEditable
                      valorInicial={r.guias}
                      placeholder="N° Guía"
                      soloNumeros
                      onGuardar={(valor) => onActualizarGuia(r, valor)}
                    />
                  </td>
                  <td className="py-1 px-1 border-b border-r border-gray-200 dark:border-gray-700/70 overflow-hidden">
                    <span
                      title="Se actualiza automáticamente al ingresar/quitar el N° de Guía"
                      className={`flex items-center justify-center w-full h-6 px-1 rounded text-[9px] font-bold uppercase ${ESTADO_GUIA_ESTILOS[estadoGuiaKey]}`}
                    >
                      {estadoGuiaKey}
                    </span>
                  </td>

                  <td className={`${celdaBase} text-gray-500 dark:text-gray-400`} title={r.delivery}>{r.delivery || '-'}</td>
                  <td className={`${celdaBase} text-gray-700 dark:text-gray-200 font-medium`} title={r.referencia}>{r.referencia || '-'}</td>
                  <td className={`${celdaBase} text-gray-600 dark:text-gray-300 font-medium`}>{r.centro || 'PABELLON'}</td>
                  <td className={`${celdaBase} text-gray-600 dark:text-gray-300 font-medium`}>{r.atributo || '-'}</td>
                  <td className={`${celdaBase} text-gray-500 dark:text-gray-400`}>{r.convenio || '-'}</td>
                  <td className={`${celdaBase} text-gray-500 dark:text-gray-400`}>{r.prevision || '-'}</td>
                  <td className={`${celdaBase} text-gray-500 dark:text-gray-400`} title={r.descripcionPabellon}>{r.descripcionPabellon || '-'}</td>

                  <td className="py-1 px-2 border-b border-gray-200 dark:border-gray-700 text-center overflow-hidden">
                    <div className="flex items-center justify-center gap-1.5" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => onEditar(r)}
                        disabled={!editable}
                        title={editable ? 'Editar registro' : mensajeRegistroNoEditable(r)}
                        className={`p-0.5 rounded transition ${!editable
                          ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
                          : 'text-blue-600 hover:text-blue-800 hover:bg-blue-50 dark:hover:bg-blue-950/30'
                          }`}
                      >
                        {editable ? <Pencil size={13} /> : <Lock size={13} />}
                      </button>
                      <button
                        onClick={() => handleClickActualizarVinculados(r)}
                        disabled={actualizandoId === r.id}
                        title="Actualizar Previsión / Convenio / Descripción Pabellón desde Reportes"
                        className="text-gray-500 hover:text-[#2383C2] transition p-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <RefreshCw size={13} className={actualizandoId === r.id ? 'animate-spin' : ''} />
                      </button>
                      <button
                        onClick={() => onEliminar(r)}
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

export default ConsignacionTable;