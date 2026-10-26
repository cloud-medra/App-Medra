import React, { useState, useRef, useCallback } from 'react';
import { Copy, History, Pencil, Trash2, Eye, RotateCcw } from 'lucide-react';
import { construirTextoAdmisionNombre } from '../../implantes/gestionImplantes/utils/gestionesImportExport';
import EstadoBadge from '../estadoGestion/EstadoBadge';
import { coloresEstadoGestion, normalizarEstadoGestion } from '../estadoGestion/estadosGestion';
import { ocsDeGestion, textoOCs } from '../ocIndex/indiceOC';
import { moduloGestion } from '../modulosGestion';
import { estadoOrdenGestion } from '../ordenesOC/estadoOrdenGestion';

// Color de la fila según la Orden y su PDF (estadoOrdenGestion): fondo suave
// en la fila, el mismo tono (opaco) en las columnas fijas para que tapen al
// hacer scroll horizontal, un tono más al pasar el mouse, y el badge de la
// columna Orden más marcado.
const TONOS_ORDEN = {
  conPdf: {
    fila: 'bg-emerald-50 hover:bg-emerald-100 dark:bg-[#11291f] dark:hover:bg-[#173a2b]',
    fija: 'bg-emerald-50 group-hover:bg-emerald-100 dark:bg-[#11291f] dark:group-hover:bg-[#173a2b]',
    badge: 'bg-emerald-100 text-emerald-800 ring-emerald-300 dark:bg-emerald-900/70 dark:text-emerald-200 dark:ring-emerald-700',
    punto: 'bg-emerald-500',
    leyenda: 'Con orden y PDF'
  },
  sinPdf: {
    fila: 'bg-orange-50 hover:bg-orange-100 dark:bg-[#33220f] dark:hover:bg-[#45301a]',
    fija: 'bg-orange-50 group-hover:bg-orange-100 dark:bg-[#33220f] dark:group-hover:bg-[#45301a]',
    badge: 'bg-orange-100 text-orange-800 ring-orange-300 dark:bg-orange-900/70 dark:text-orange-200 dark:ring-orange-700',
    punto: 'bg-orange-500',
    leyenda: 'Con orden, sin PDF'
  },
  sinOrden: {
    fila: 'bg-gray-100/70 hover:bg-gray-200/70 dark:bg-[#252c37] dark:hover:bg-[#2f3845]',
    fija: 'bg-gray-100 group-hover:bg-gray-200 dark:bg-[#252c37] dark:group-hover:bg-[#2f3845]',
    badge: '',
    punto: 'bg-gray-400',
    leyenda: 'Sin orden'
  },
  // Con OC, mientras se lee el registro de PDF (o si no se pudo leer).
  cargando: {
    fila: 'hover:bg-gray-50/80 dark:hover:bg-gray-700/40',
    fija: 'bg-white dark:bg-gray-800 group-hover:bg-gray-50 dark:group-hover:bg-gray-700',
    badge: 'bg-gray-100 text-gray-700 ring-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:ring-gray-600'
  }
};

const COLUMNAS = [
  { key: 'estado', label: '•', ancho: 32, min: 24, align: 'center' },
  { key: 'numero', label: '#', ancho: 40, min: 28, align: 'center' },
  { key: 'id', label: 'ID', ancho: 90, min: 60 },
  { key: 'nombre', label: 'Nombre', ancho: 190, min: 80 },
  { key: 'fecha', label: 'Fecha', ancho: 95, min: 70 },
  { key: 'empresa', label: 'Empresa', ancho: 170, min: 80 },
  { key: 'orden', label: 'Orden', ancho: 110, min: 60 },
  { key: 'admisionNombre', label: 'Admisión - Nombre', ancho: 230, min: 140 },
  { key: 'centro', label: 'Centro', ancho: 95, min: 60 },
  { key: 'atributo', label: 'Atributo', ancho: 95, min: 60 },
  { key: 'estadoTexto', label: 'Estado', ancho: 125, min: 60 },
  { key: 'fechaCarga', label: 'Fecha Carga', ancho: 100, min: 70 },
  { key: 'costo', label: 'Costo', ancho: 90, min: 60 },
  { key: 'solicitud', label: 'Solicitud', ancho: 95, min: 60 },
  { key: 'periodo', label: 'Período', ancho: 110, min: 70 },
  { key: 'informe', label: 'Informe', ancho: 95, min: 60 },
  { key: 'convenio', label: 'Convenio', ancho: 95, min: 60 },
  { key: 'prevision', label: 'Previsión', ancho: 110, min: 60 },
  { key: 'medico', label: 'Médico', ancho: 130, min: 60 },
  { key: 'descripcion', label: 'Descripción', ancho: 170, min: 80 },
  { key: 'observacion', label: 'Observación', ancho: 170, min: 80 },
  { key: 'registradoPor', label: 'Registrado Por', ancho: 120, min: 70 },
  { key: 'acciones', label: 'Acciones', ancho: 95, min: 80, align: 'center' }
];

const anchosPorDefecto = () => COLUMNAS.reduce((acc, col) => ({ ...acc, [col.key]: col.ancho }), {});
const STICKY_KEYS = new Set(['estado', 'numero', 'id', 'nombre', 'fecha', 'empresa']);

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

// Tabla de Gestión de Implantes y de Hemodinamia (misma tabla; `modulo`,
// ver modulosGestion.js, solo cambia el centro y atributo por defecto).
export const GestionesTable = ({
  modulo = 'implantes',
  implantesFiltrados,
  numeroInicial = 0,
  handleCopiarTexto,
  abrirHistorialLogs,
  iniciarEdicion,
  handleDelete,
  onRowDoubleClick,
  // Registro de PDF de OC ({ [claveOC]: ... }, null mientras carga) y error
  // de lectura: ver useRegistroPdfGestiones en GestionGestiones.
  pdfsOC = null,
  errorPdfOC = null
}) => {
  const config = moduloGestion(modulo);
  const [anchos, setAnchos] = useState(anchosPorDefecto);

  const handleResize = useCallback((colKey, nuevoAncho) => {
    setAnchos(prev => (prev[colKey] === nuevoAncho ? prev : { ...prev, [colKey]: nuevoAncho }));
  }, []);

  const restablecerAnchos = () => setAnchos(anchosPorDefecto());

  const anchoTotalTabla = COLUMNAS.reduce((suma, col) => suma + (anchos[col.key] || col.ancho), 0);

  const stickyOffsets = {};
  {
    let acumulado = 0;
    COLUMNAS.forEach(col => {
      if (STICKY_KEYS.has(col.key)) {
        stickyOffsets[col.key] = acumulado;
        acumulado += (anchos[col.key] ?? col.ancho);
      }
    });
  }

  const getStickyStyle = (colKey) => {
    if (!STICKY_KEYS.has(colKey)) return undefined;
    return { position: 'sticky', left: stickyOffsets[colKey] };
  };

  const getStickyClass = (colKey, forHeader = false, tono = TONOS_ORDEN.cargando) => {
    if (!STICKY_KEYS.has(colKey)) return '';
    const clases = [forHeader ? 'z-20 bg-gray-100 dark:bg-gray-900' : `z-[5] ${tono.fija}`];
    if (colKey === 'empresa') clases.push('shadow-[4px_0_6px_-4px_rgba(0,0,0,0.35)]');
    return clases.join(' ');
  };

  const getStatusIndicator = (item) => {
    const idItem = item.gestionId || item.agendaId;
    const tieneCamposPendientes = [
      idItem,
      item.nombre,
      item.fecha,
      item.empresa
    ].some(val => val === 'P' || val === '' || val === null || val === undefined);

    if (tieneCamposPendientes) {
      return { colorClass: 'bg-red-500', label: 'Incompleto (Faltan datos básicos)' };
    }

    // Mismo mapa de colores que EstadoBadge y el filtro de estados. Sin
    // estado se muestra como AGENDANDO (valor inicial de una gestión).
    const estado = item.estado || 'AGENDANDO';
    return { colorClass: coloresEstadoGestion(estado).punto, label: normalizarEstadoGestion(estado) || 'Sin Estado' };
  };

  const getSolicitudEstilo = (solicitud) => {
    const sol = (solicitud || 'PENDIENTE').toUpperCase();
    const estilos = {
      PENDIENTE: 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400',
      SOLICITAR: 'bg-purple-100 dark:bg-purple-950/50 text-purple-700 dark:text-purple-400 font-bold',
      SOLICITADO: 'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400'
    };
    return { label: sol, className: estilos[sol] || estilos.PENDIENTE };
  };

  // Colores para el estado del Informe: PENDIENTE resalta fuerte (rojo) para
  // que sea imposible pasarlo por alto, DISPONIBLE en verde, NO APLICA neutro.
  const getInformeEstilo = (informe) => {
    const inf = (informe || 'PENDIENTE').toUpperCase().trim();
    const estilos = {
      PENDIENTE: 'bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-400 font-bold ring-1 ring-red-200 dark:ring-red-900',
      DISPONIBLE: 'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 font-semibold',
      'NO APLICA': 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
    };
    return { label: inf, className: estilos[inf] || estilos.PENDIENTE };
  };

  const formatearFechaTabla = (fechaString) => {
    if (!fechaString || !fechaString.includes('-')) return fechaString || '-';
    const partes = fechaString.split('-');
    if (partes.length !== 3) return fechaString;
    const [yyyy, mm, dd] = partes;
    return `${dd}-${mm}-${yyyy}`;
  };

  const formatearFechaCarga = (valor) => {
    if (!valor) return '-';
    const date = valor.toDate ? valor.toDate() : new Date(valor);
    if (isNaN(date.getTime())) return '-';
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const yyyy = date.getFullYear();
    return `${dd}-${mm}-${yyyy}`;
  };

  const celdaBase = 'py-1 px-2 border-b border-r border-gray-200 dark:border-gray-700/70 whitespace-nowrap overflow-hidden text-ellipsis';

  return (
    // Sin select-none en el contenedor: el texto de las celdas se puede
    // seleccionar y copiar. El encabezado sí lo mantiene (redimensionar
    // columnas no debe seleccionar los títulos).
    <div className="flex-grow overflow-auto relative">
      <div className="sticky top-0 z-20 flex items-center justify-between gap-2 px-1 py-0.5 bg-gray-100 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
        {/* Leyenda de colores de fila (Orden y PDF). */}
        <div className="flex items-center gap-3 pl-1 text-[9px] font-medium text-gray-500 dark:text-gray-400" aria-label="Leyenda de colores por Orden">
          <span className="uppercase tracking-wide text-gray-400 dark:text-gray-500">Orden:</span>
          {['conPdf', 'sinPdf', 'sinOrden'].map(clave => (
            <span key={clave} className="inline-flex items-center gap-1">
              <span className={`h-2 w-2 rounded-sm ${TONOS_ORDEN[clave].punto}`} />
              {TONOS_ORDEN[clave].leyenda}
            </span>
          ))}
          {errorPdfOC && <span className="text-amber-600 dark:text-amber-400" title={errorPdfOC}>· {errorPdfOC}</span>}
          {!errorPdfOC && pdfsOC === null && <span className="text-gray-400">· Cargando PDF…</span>}
        </div>
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

        <thead className="bg-gray-100 dark:bg-gray-900 sticky top-[22px] z-10 select-none">
          <tr className="text-gray-600 dark:text-gray-400 uppercase font-bold text-[10px]">
            {COLUMNAS.map(col => (
              <th
                key={col.key}
                style={getStickyStyle(col.key)}
                className={`relative py-1.5 px-2 border-b border-r border-gray-200 dark:border-gray-700 overflow-hidden ${col.align === 'center' ? 'text-center' : ''
                  } ${getStickyClass(col.key, true)}`}
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
          {implantesFiltrados.map((i, index) => {
            const status = getStatusIndicator(i);
            const idMostrado = i.gestionId || i.agendaId;
            const solicitudInfo = getSolicitudEstilo(i.solicitud);
            const informeInfo = getInformeEstilo(i.informe);
            const textoAdmisionNombre = construirTextoAdmisionNombre(idMostrado, i.nombre);
            const ordenTexto = textoOCs(ocsDeGestion(i));
            const estadoOrden = estadoOrdenGestion(i, pdfsOC);
            const tono = TONOS_ORDEN[estadoOrden];
            const fija = (colKey) => getStickyClass(colKey, false, tono);

            return (
              <tr
                key={i.id}
                data-estado-orden={estadoOrden}
                onDoubleClick={() => {
                  // Doble clic sobre una palabra la selecciona: en ese caso
                  // no se abre el detalle (se está copiando texto).
                  if (window.getSelection()?.toString().trim()) return;
                  if (onRowDoubleClick) onRowDoubleClick(i);
                }}
                className={`group border-l-2 border-transparent hover:border-[#2383C2] ${tono.fila} transition-colors cursor-pointer`}
                title="Doble clic en un espacio sin texto (o botón Ver Detalle) para abrir la vista detallada"
              >
                <td style={getStickyStyle('estado')} className={`${celdaBase} text-center ${fija('estado')}`}>
                  <div className="flex items-center justify-center">
                    <span className={`h-2.5 w-2.5 rounded-full inline-block shrink-0 ${status.colorClass}`} title={status.label} />
                  </div>
                </td>
                <td style={getStickyStyle('numero')} className={`${celdaBase} text-gray-500 dark:text-gray-400 font-bold text-center ${fija('numero')}`}>{numeroInicial + index + 1}</td>
                <td style={getStickyStyle('id')} className={`${celdaBase} font-semibold text-[#2383C2] ${fija('id')}`} title={idMostrado}>
                  <div className="flex items-center gap-1">
                    <span className="truncate">{idMostrado}</span>
                    <button onClick={(e) => { e.stopPropagation(); handleCopiarTexto(idMostrado); }} title="Copiar ID" className="p-0.5 rounded text-gray-400 hover:text-emerald-600 transition shrink-0">
                      <Copy size={11} />
                    </button>
                  </div>
                </td>
                <td style={getStickyStyle('nombre')} className={`${celdaBase} text-gray-700 dark:text-gray-200 font-medium ${fija('nombre')}`} title={i.nombre}>{i.nombre}</td>
                <td style={getStickyStyle('fecha')} className={`${celdaBase} text-gray-600 dark:text-gray-300 ${fija('fecha')}`}>{formatearFechaTabla(i.fecha)}</td>
                <td style={getStickyStyle('empresa')} className={`${celdaBase} text-gray-600 dark:text-gray-300 ${fija('empresa')}`} title={i.empresa}>{i.empresa || '-'}</td>
                <td
                  className={`${celdaBase} text-gray-700 dark:text-gray-200 font-num`}
                  title={ordenTexto ? `${ordenTexto} · ${tono.leyenda || 'Verificando PDF…'}` : 'Sin orden'}
                >
                  {ordenTexto
                    ? <span className={`inline-block max-w-full truncate align-middle px-1.5 py-px rounded font-semibold ring-1 ring-inset ${tono.badge}`}>{ordenTexto}</span>
                    : <span className="text-gray-400 dark:text-gray-500">—</span>}
                </td>
                <td className={`${celdaBase} text-gray-600 dark:text-gray-300`} title={textoAdmisionNombre}>
                  <div className="flex items-center gap-1">
                    <span className="truncate">{textoAdmisionNombre}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleCopiarTexto(textoAdmisionNombre); }}
                      title="Copiar Admisión - Nombre"
                      className="p-0.5 rounded text-gray-400 hover:text-emerald-600 transition shrink-0"
                    >
                      <Copy size={11} />
                    </button>
                  </div>
                </td>
                <td className={`${celdaBase} text-gray-600 dark:text-gray-300 font-medium`} title={config.centroDe(i)}>{config.centroDe(i)}</td>
                <td className={`${celdaBase} text-gray-600 dark:text-gray-300 font-medium`} title={i.atributo}>{i.atributo || config.atributoPorDefecto}</td>
                <td className={celdaBase} title={i.estado}><EstadoBadge estado={i.estado || 'AGENDANDO'} /></td>
                <td className={`${celdaBase} text-gray-600 dark:text-gray-300`}>{formatearFechaCarga(i.fechaCarga)}</td>
                <td className={`${celdaBase} text-emerald-700 dark:text-emerald-400 font-semibold`}>
                  {new Intl.NumberFormat('es-CL').format(i.costo ?? 0)}
                </td>
                <td className={celdaBase}>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full uppercase ${solicitudInfo.className}`}>
                    {solicitudInfo.label}
                  </span>
                </td>
                <td className={`${celdaBase} text-gray-600 dark:text-gray-300 font-medium`} title={i.periodo}>
                  {i.periodo || '-'}
                </td>
                <td className={celdaBase}>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full uppercase ${informeInfo.className}`}>
                    {informeInfo.label}
                  </span>
                </td>
                <td className={`${celdaBase} text-gray-500 dark:text-gray-400`} title={i.convenio}>{i.convenio || '-'}</td>
                <td className={`${celdaBase} text-gray-500 dark:text-gray-400`} title={i.prevision}>{i.prevision || '-'}</td>
                <td className={`${celdaBase} text-gray-500 dark:text-gray-400`} title={i.medico}>{i.medico || '-'}</td>
                <td className={`${celdaBase} text-gray-500 dark:text-gray-400`} title={i.descripcion}>{i.descripcion || '-'}</td>
                <td className={`${celdaBase} text-gray-500 dark:text-gray-400`} title={i.observacion}>{i.observacion || '-'}</td>
                <td className={`${celdaBase} text-gray-500 dark:text-gray-400`} title={i.registradoPor}>{i.registradoPor || 'N/A'}</td>
                <td className="py-1 px-2 border-b border-gray-200 dark:border-gray-700 text-center overflow-hidden">
                  <div className="flex justify-center gap-1.5" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => onRowDoubleClick && onRowDoubleClick(i)}
                      title="Ver Detalle Completo"
                      className="text-emerald-600 hover:text-emerald-800 transition p-0.5 rounded hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                    >
                      <Eye size={13} />
                    </button>
                    <button onClick={() => abrirHistorialLogs(i)} title="Ver Historial / Logs" className="text-gray-500 hover:text-[#2383C2] transition p-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700">
                      <History size={13} />
                    </button>
                    <button onClick={() => iniciarEdicion(i)} title="Editar" className="text-blue-600 hover:text-blue-800 transition p-0.5 rounded hover:bg-blue-50 dark:hover:bg-blue-950/30">
                      <Pencil size={13} />
                    </button>
                    <button onClick={() => handleDelete(i.id)} title="Eliminar" className="text-red-500 hover:text-red-700 transition p-0.5 rounded hover:bg-red-50 dark:hover:bg-red-700 transition">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};