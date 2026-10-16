import React, { useState, useMemo, useLayoutEffect, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  FileText,
  Trash2,
  Pencil,
  Check,
  X,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Package,
  PackagePlus,
  Layers,
  Lock,
  RotateCcw
} from 'lucide-react';
import {
  formatearFechaTabla,
  calcularEmpresaNoCoincide,
  calcularCamposFinancieros,
  ESTADO_CARGA_OPTIONS,
  getEstadoCargaStyle,
  camposCambioEstadoCarga,
  ESTADO_SIN_CARGO,
  getEstadoCargaRowStyle,
  CODIGO_SIN_OC,
  VALOR_LOTE_VENCIMIENTO_PAD,
  tieneContenidoPad,
  anchosConExtra
} from './cargasHelpers';
import { ManijaRedimension } from '../../../../../../ui/ManijaRedimension';
import { useAutocompleteReferencia } from './useAutocompleteReferencia';
import { PadContenidoRow, crearFilaContenidoPadVacia, construirItemContenidoPadDesdeFila } from './PadContenidoRow';
import { formatearPesos } from '../../../../../../../utils/formatearMoneda';
import { CLASE_SIN_FLECHAS, SIN_CAMBIO_ACCIDENTAL } from '../../../../../../ui/numeroSinFlechas';

// Mismo sistema de columnas redimensionables que usa el CotizacionCard de
// Hemodinamia (Cargastab/CotizacionCard.jsx) — se agrega la columna "Veces
// Costo" que sí muestra este módulo (Hemodinamia no la tiene). Sin
// table-layout: fixed + un ancho mínimo por columna, el navegador podía
// achicar la columna Fecha lo suficiente como para partir "22-09-2026" en
// 3 líneas (el '-' es un punto de corte válido para el wrap de texto).
// `px` (opcional): relleno horizontal de la columna en encabezado y celdas
// (por defecto px-2.5); permite columnas más angostas sin cortar el contenido.
const COLUMNAS_ITEMS = [
  { key: 'id', label: 'ID', ancho: 60, min: 40 },
  { key: 'fecha', label: 'Fecha', ancho: 80, min: 40 },
  { key: 'codigo', label: 'Código', ancho: 70, min: 40 },
  { key: 'cantidad', label: 'Cant.', ancho: 50, min: 36, align: 'center' },
  { key: 'venta', label: 'Venta', ancho: 85, min: 40 },
  { key: 'referencia', label: 'Referencia', ancho: 130, min: 90 },
  { key: 'descriptorAuto', label: 'Desc. Auto', ancho: 130, min: 60 },
  { key: 'clase', label: 'Clase', ancho: 50, min: 32 },
  { key: 'tipo', label: 'Tipo', ancho: 50, min: 32 },
  { key: 'precio', label: 'Precio', ancho: 69, min: 40, px: 'px-1.5' },
  { key: 'vecesCosto', label: 'Veces Costo', ancho: 75, min: 55, align: 'center' },
  { key: 'totalItem', label: 'Total Ítem', ancho: 69, min: 40, px: 'px-1.5' },
  { key: 'lote', label: 'Lote', ancho: 60, min: 40 },
  { key: 'vencimiento', label: 'Vencimiento', ancho: 82, min: 40, px: 'px-2' },
  { key: 'estadoCarga', label: 'Estado Carga', ancho: 100, min: 60 },
  { key: 'acciones', label: 'Acciones', ancho: 80, min: 65, align: 'center' }
];
// Modo lectura (Reporte Info → detalle de la gestión): sin "Acciones".
const COLUMNAS_LECTURA = COLUMNAS_ITEMS.filter(col => col.key !== 'acciones');

const anchosItemsPorDefecto = () => COLUMNAS_ITEMS.reduce((acc, col) => ({ ...acc, [col.key]: col.ancho }), {});

// El listado de sugerencias vive dentro de la tabla de ítems, que tiene
// overflow-auto (para poder hacer scroll horizontal/vertical) — eso recorta
// cualquier dropdown posicionado con `absolute` que se salga de sus bordes.
// Se resuelve sacándolo del flujo de la tabla con un portal a document.body,
// posicionado en coordenadas de viewport (position: fixed) en base al
// elemento ancla, recalculadas en cada scroll/resize.
const DropdownReferenciaPortal = ({ anchorRef, portalRef, children }) => {
  const [rect, setRect] = useState(null);

  useLayoutEffect(() => {
    const actualizarPosicion = () => {
      if (anchorRef.current) setRect(anchorRef.current.getBoundingClientRect());
    };
    actualizarPosicion();
    window.addEventListener('scroll', actualizarPosicion, true);
    window.addEventListener('resize', actualizarPosicion);
    return () => {
      window.removeEventListener('scroll', actualizarPosicion, true);
      window.removeEventListener('resize', actualizarPosicion);
    };
  }, [anchorRef]);

  if (!rect) return null;

  return createPortal(
    <div
      ref={portalRef}
      style={{ position: 'fixed', top: rect.bottom + 4, left: rect.left, zIndex: 9999 }}
    >
      {children}
    </div>,
    document.body
  );
};

const BORRADOR_VACIO = {
  referencia: '', codigo: '', precio: '', empresaVinculada: '', tipoVinculado: '', detalle: '', descriptorAuto: '', clase: '',
  cantidad: '', lote: '', vencimiento: ''
};

export const CotizacionCard = ({
  cotizacion,
  bloqueEmpresa,
  gestionId,
  bloqueFecha,
  recargosActivos,
  periodoAbierto,
  onAgregarItem,
  onEliminarItem,
  onEliminarCotizacion,
  onActualizarEstadoItem,
  onEditarItem,
  defaultOpen = false,
  soloLectura = false,
  // Permiso "Agregar Contenido de PAD" (tabla_cotizaciones.formulario_contenido_pad).
  puedeAgregarContenidoPad = true,
  // Solo lectura de verdad (Reporte Info): sin acciones ni edición, el estado
  // de carga como etiqueta, el contenido de cada PAD plegable y la tabla con
  // encabezado fijo y scroll interno. No carga el catálogo de códigos.
  modoLectura = false
}) => {
  const COLUMNAS = modoLectura ? COLUMNAS_LECTURA : COLUMNAS_ITEMS;
  const [abierto, setAbierto] = useState(defaultOpen);
  // Modo lectura: PAD principales con su contenido desplegado.
  const [padsAbiertos, setPadsAbiertos] = useState(() => new Set());
  const alternarPad = (id) => setPadsAbiertos(prev => {
    const s = new Set(prev);
    if (s.has(id)) s.delete(id); else s.add(id);
    return s;
  });
  const [anchos, setAnchos] = useState(anchosItemsPorDefecto);
  // Ancho disponible del contenedor de la tabla (para repartir el espacio
  // sobrante; sin ResizeObserver, p. ej. en pruebas, no se reparte).
  const contenedorTablaRef = useRef(null);
  const [anchoDisponible, setAnchoDisponible] = useState(0);
  useEffect(() => {
    const el = contenedorTablaRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const observador = new ResizeObserver(([entrada]) => setAnchoDisponible(Math.floor(entrada.contentRect.width)));
    observador.observe(el);
    return () => observador.disconnect();
  }, [abierto]); // la tabla solo existe con la cotización desplegada
  const anchoBase = COLUMNAS.reduce((suma, col) => suma + (anchos[col.key] ?? col.ancho), 0);
  const anchosVisibles = anchosConExtra(anchos, anchoDisponible - anchoBase - 2);
  const anchoTotalTabla = COLUMNAS.reduce((suma, col) => suma + (anchosVisibles[col.key] ?? col.ancho), 0);
  // Al redimensionar a mano se parte de lo que se ve (con el reparto
  // incluido), así la columna sigue al mouse 1:1.
  const handleResize = useCallback((colKey, nuevoAncho) => {
    setAnchos(prev => {
      const suma = COLUMNAS.reduce((t, col) => t + (prev[col.key] ?? col.ancho), 0);
      const base = anchosConExtra(prev, anchoDisponible - suma - 2);
      return base[colKey] === nuevoAncho ? base : { ...base, [colKey]: nuevoAncho };
    });
  }, [anchoDisponible, COLUMNAS]);
  const [editandoId, setEditandoId] = useState(null);
  const [borrador, setBorrador] = useState(BORRADOR_VACIO);
  const [edicionEsPad, setEdicionEsPad] = useState(false);
  const [edicionEsContenidoPad, setEdicionEsContenidoPad] = useState(false);
  const [edicionEsLoteAdicional, setEdicionEsLoteAdicional] = useState(false);

  const [agregandoContenidoDePadId, setAgregandoContenidoDePadId] = useState(null);
  const [filasNuevoContenido, setFilasNuevoContenido] = useState([]);

  const {
    sugerencias, buscando, mostrarSug, setMostrarSug, containerRef, portalRef, skipNext
  } = useAutocompleteReferencia(editandoId ? borrador.referencia : '', !modoLectura);

  const items = cotizacion.items || [];

  const idMostrado = gestionId || 'P';
  const fechaMostrada = formatearFechaTabla(bloqueFecha);

  // Un ítem puede ser "hijo" de otro por dos vías: contenido de un PAD
  // (padPadreId) o lote adicional de una referencia normal (lotePadreId).
  // Ambas se agrupan igual bajo su principal para el orden visual de la tabla.
  const obtenerPadreId = (it) => it.padPadreId || it.lotePadreId || null;

  const itemsOrdenados = useMemo(() => {
    const principales = items.filter(it => !obtenerPadreId(it));
    const hijosPorPadre = {};
    items.forEach(it => {
      const padreId = obtenerPadreId(it);
      if (padreId) {
        (hijosPorPadre[padreId] ||= []).push(it);
      }
    });
    const resultado = [];
    principales.forEach(p => {
      resultado.push(p);
      (hijosPorPadre[p.id] || []).forEach(c => resultado.push(c));
    });
    Object.keys(hijosPorPadre).forEach(padreId => {
      if (!principales.some(p => p.id === padreId)) {
        resultado.push(...hijosPorPadre[padreId]);
      }
    });
    return resultado;
  }, [items]);

  const totalItems = items.reduce((acc, it) => acc + (Number(it.totalItem) || 0), 0);
  const tieneTotalIngresado = Number(cotizacion.totalCotizacion || 0) > 0;
  const diferencia = Number(cotizacion.totalCotizacion || 0) - totalItems;
  const totalCoincide = !tieneTotalIngresado || Math.abs(diferencia) < 1;
  const hayItemsSinCodigo = items.some(it => it.sinCodigo);
  const hayEmpresaNoCoincide = items.some(it => calcularEmpresaNoCoincide(it, bloqueEmpresa));
  const hayItemsSinRecargo = items.some(it => !it.sinCodigo && !it.padPadreId && !it.recargoEncontrado);

  const iniciarEdicion = (it) => {
    setEditandoId(it.id);
    setEdicionEsPad(!!it.esPad);
    setEdicionEsContenidoPad(!!it.padPadreId);
    setEdicionEsLoteAdicional(!!it.lotePadreId);
    setBorrador({
      referencia: it.referencia || '',
      codigo: it.codigo || '',
      precio: it.precio ?? '',
      empresaVinculada: it.empresaVinculada || '',
      tipoVinculado: it.tipoVinculado || '',
      detalle: it.detalle || '',
      descriptorAuto: it.descriptorAuto || '',
      clase: it.clase || '',
      cantidad: String(it.cantidad ?? ''),
      lote: (it.lote === 'P' || it.lote === 'Sin lote') ? '' : (it.lote || ''),
      vencimiento: it.vencimiento || ''
    });
  };
  const cancelarEdicion = () => {
    setEditandoId(null);
    setBorrador(BORRADOR_VACIO);
    setMostrarSug(false);
    setEdicionEsPad(false);
    setEdicionEsContenidoPad(false);
    setEdicionEsLoteAdicional(false);
  };

  const handleReferenciaChange = (value) => {
    setBorrador(prev => ({
      ...prev,
      referencia: value,
      codigo: '',
      precio: '',
      empresaVinculada: '',
      tipoVinculado: '',
      detalle: '',
      descriptorAuto: '',
      clase: ''
    }));
  };

  const handleSeleccionarSugerencia = (sug) => {
    skipNext.current = true;
    const forzarSinCosto = edicionEsContenidoPad || edicionEsLoteAdicional;
    setBorrador(prev => ({
      ...prev,
      referencia: sug.referencia || prev.referencia,
      codigo: forzarSinCosto ? CODIGO_SIN_OC : (sug.codigo || ''),
      precio: forzarSinCosto ? 0 : (sug.precioNeto ?? 0),
      empresaVinculada: sug.empresa || '',
      tipoVinculado: sug.tipo || '',
      detalle: sug.descriptorEmpresa || sug.descriptorAuto || '',
      descriptorAuto: sug.descriptorAuto || '',
      clase: sug.clase || ''
    }));
    setMostrarSug(false);
  };

  const guardarEdicion = () => {
    const cantidadNum = Number(borrador.cantidad);
    if (!borrador.referencia.trim() || !borrador.cantidad || isNaN(cantidadNum) || cantidadNum <= 0) return;

    if (!edicionEsContenidoPad && !edicionEsLoteAdicional) {
      const precioValido = Number(borrador.precio);
      if (borrador.precio === '' || isNaN(precioValido) || precioValido <= 0) return;
    }

    if (edicionEsContenidoPad) {
      onEditarItem(editandoId, {
        referencia: borrador.referencia.trim(),
        codigo: CODIGO_SIN_OC,
        precio: 0,
        empresaVinculada: borrador.empresaVinculada || '',
        tipoVinculado: borrador.tipoVinculado || 'P',
        detalle: borrador.detalle || 'P',
        descriptorAuto: borrador.descriptorAuto || 'P',
        clase: borrador.clase || 'P',
        cantidad: cantidadNum,
        lote: borrador.lote.trim() || 'P',
        vencimiento: borrador.vencimiento || '',
        sinCodigo: false,
        vecesCosto: 1,
        recargoEncontrado: true,
        venta: 0,
        totalItem: 0,
        estadoCarga: 'PAD'
      });
      cancelarEdicion();
      return;
    }

    if (edicionEsLoteAdicional) {
      onEditarItem(editandoId, {
        referencia: borrador.referencia.trim(),
        codigo: CODIGO_SIN_OC,
        precio: 0,
        empresaVinculada: borrador.empresaVinculada || '',
        tipoVinculado: borrador.tipoVinculado || 'P',
        detalle: borrador.detalle || 'P',
        descriptorAuto: borrador.descriptorAuto || 'P',
        clase: borrador.clase || 'P',
        cantidad: cantidadNum,
        lote: borrador.lote.trim() || 'Sin lote',
        vencimiento: borrador.vencimiento || 'Sin fecha',
        sinCodigo: false,
        vecesCosto: 1,
        recargoEncontrado: true,
        venta: 0,
        totalItem: 0
      });
      cancelarEdicion();
      return;
    }

    const { vecesCosto, recargoEncontrado, venta, totalItem } = calcularCamposFinancieros(
      borrador.precio, cantidadNum, recargosActivos
    );

    onEditarItem(editandoId, {
      referencia: borrador.referencia.trim(),
      codigo: borrador.codigo || '',
      precio: Number(borrador.precio) || 0,
      empresaVinculada: borrador.empresaVinculada || '',
      tipoVinculado: borrador.tipoVinculado || 'P',
      detalle: borrador.detalle || 'P',
      descriptorAuto: borrador.descriptorAuto || 'P',
      clase: borrador.clase || 'P',
      cantidad: cantidadNum,
      lote: edicionEsPad ? VALOR_LOTE_VENCIMIENTO_PAD : (borrador.lote.trim() || 'Sin lote'),
      vencimiento: edicionEsPad ? VALOR_LOTE_VENCIMIENTO_PAD : (borrador.vencimiento || 'Sin fecha'),
      sinCodigo: !borrador.codigo,
      vecesCosto,
      recargoEncontrado,
      venta,
      totalItem
    });
    cancelarEdicion();
  };

  const abrirFormularioContenido = (padPadreId) => {
    if (!puedeAgregarContenidoPad) return;
    setAgregandoContenidoDePadId(padPadreId);
    setFilasNuevoContenido([crearFilaContenidoPadVacia()]);
  };

  const cerrarFormularioContenido = () => {
    setAgregandoContenidoDePadId(null);
    setFilasNuevoContenido([]);
  };

  const guardarNuevoContenido = (itPadre) => {
    if (!periodoAbierto || !puedeAgregarContenidoPad) return;
    const filasValidas = filasNuevoContenido.filter(f => f.referencia.trim() && Number(f.cantidad) > 0);
    if (filasValidas.length === 0) return;

    filasValidas.forEach(fila => {
      onAgregarItem(construirItemContenidoPadDesdeFila(fila, itPadre.id, {
        numCotizacion: cotizacion.numCotizacion,
        totalCotizacion: cotizacion.totalCotizacion,
        periodoAnio: periodoAbierto.anio,
        periodoMes: periodoAbierto.mes
      }));
    });

    cerrarFormularioContenido();
  };

  // Ítems PAD (principal o contenido) quedan fuera de la carga masiva: no
  // exponen un <select> real de Estado Carga (ver render más abajo), su
  // estado se maneja con la lógica propia del flujo PAD. Los que ya están
  // en CARGADO tampoco se tocan (no hay nada que cambiar).
  const itemsElegiblesCargaMasiva = items.filter(it =>
    !it.esPad && !it.padPadreId && !it.sinCodigo && (it.estadoCarga || 'PENDIENTE') !== 'CARGADO' && it.estadoCarga !== ESTADO_SIN_CARGO
  );

  // Cambiar Estado Carga: entrar o salir de SIN CARGO también cambia
  // código, precio y totales (camposCambioEstadoCarga); el resto solo el estado.
  const cambiarEstadoCarga = (it, nuevoEstado) => {
    const campos = camposCambioEstadoCarga(it, nuevoEstado, recargosActivos);
    if (Object.keys(campos).length === 1) onActualizarEstadoItem(it.id, nuevoEstado);
    else onEditarItem(it.id, campos);
  };
  const cantidadElegibles = itemsElegiblesCargaMasiva.length;
  const textoCantidadElegibles = `${cantidadElegibles} ítem${cantidadElegibles === 1 ? '' : 's'}`;

  const [mostrarConfirmCargaMasiva, setMostrarConfirmCargaMasiva] = useState(false);

  const marcarTodosComoCargado = () => {
    if (cantidadElegibles === 0) return;
    setMostrarConfirmCargaMasiva(true);
  };

  const confirmarCargaMasiva = () => {
    itemsElegiblesCargaMasiva.forEach(it => onActualizarEstadoItem(it.id, 'CARGADO'));
    setMostrarConfirmCargaMasiva(false);
  };

  return (
    <div className="bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700/80 rounded-lg shadow-xs overflow-hidden">
      <div className="w-full px-3 py-2 flex items-center justify-between gap-2 bg-slate-50/80 dark:bg-gray-800/80">
        <button
          type="button"
          onClick={() => setAbierto(o => !o)}
          className="flex items-center gap-2 flex-grow text-left"
        >
          {abierto ? <ChevronUp size={13} className="text-slate-400" /> : <ChevronDown size={13} className="text-slate-400" />}
          <FileText size={13} className="text-[#2383C2]" />
          <span className="text-[11px] font-bold text-slate-700 dark:text-gray-200">{cotizacion.numCotizacion}</span>
          <span className="text-[10px] text-slate-400 dark:text-gray-500">({items.length} ítem{items.length !== 1 ? 's' : ''})</span>
        </button>

        <div className="flex items-center gap-2">
          {hayItemsSinCodigo && (
            <span className="flex items-center gap-1 text-[9px] font-semibold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 px-1.5 py-0.5 rounded">
              <AlertCircle size={10} /> Sin código
            </span>
          )}
          {hayEmpresaNoCoincide && (
            <span className="flex items-center gap-1 text-[9px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-1.5 py-0.5 rounded">
              <AlertTriangle size={10} /> Empresa no coincide
            </span>
          )}
          {hayItemsSinRecargo && (
            <span className="flex items-center gap-1 text-[9px] font-semibold text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 px-1.5 py-0.5 rounded">
              <AlertTriangle size={10} /> Sin rango de recargo
            </span>
          )}
          {items.length > 0 && tieneTotalIngresado && !totalCoincide && (
            <span className="flex items-center gap-1 text-[9px] font-semibold text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 px-1.5 py-0.5 rounded">
              <AlertCircle size={10} /> Total no coincide
            </span>
          )}
          <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400">
            {tieneTotalIngresado ? `$${formatearPesos(cotizacion.totalCotizacion)}` : 'Sin total'}
          </span>
          {!modoLectura && <button
            type="button"
            onClick={() => onEliminarCotizacion(cotizacion.id)}
            disabled={soloLectura}
            title={soloLectura ? 'Bloqueado: ya imputado' : 'Eliminar cotización completa'}
            className="text-red-500 hover:text-red-700 transition p-0.5 rounded hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
          >
            <Trash2 size={12} />
          </button>}
        </div>
      </div>

      {abierto && (
        <div className="p-3 space-y-2.5 border-t border-slate-100 dark:border-gray-700/60">
          {items.length > 0 && tieneTotalIngresado && !totalCoincide && (
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800 rounded text-[10px] text-orange-700 dark:text-orange-400">
              <AlertCircle size={12} className="shrink-0" />
              <span>
                La suma de los ítems (${formatearPesos(totalItems)}) no coincide con el Total de la Cotización
                (${formatearPesos(cotizacion.totalCotizacion || 0)}). Diferencia: ${formatearPesos(Math.abs(diferencia))}
              </span>
            </div>
          )}

          <div className="flex items-center justify-between gap-2">
            {items.length > 0 && tieneTotalIngresado && totalCoincide ? (
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 rounded text-[9px] text-emerald-700 dark:text-emerald-400 w-fit">
                <CheckCircle2 size={11} /> Total cuadrado
              </div>
            ) : <span />}

            {!modoLectura && <button
              type="button"
              onClick={marcarTodosComoCargado}
              disabled={itemsElegiblesCargaMasiva.length === 0 || soloLectura}
              title={soloLectura ? 'Bloqueado: ya imputado' : 'Marca como CARGADO todos los ítems de esta cotización (los ítems PAD no se modifican)'}
              className="flex items-center gap-1 h-6 px-2 text-[9px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-300 dark:border-emerald-800 rounded hover:bg-emerald-100 dark:hover:bg-emerald-950/50 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <CheckCircle2 size={11} /> Marcar todos como Cargado
            </button>}
          </div>

          <div ref={contenedorTablaRef} className={`overflow-auto rounded border border-slate-200 dark:border-gray-700 ${modoLectura ? 'max-h-[55vh]' : ''}`}>
            <div className="flex justify-end px-1 py-0.5 bg-slate-50 dark:bg-gray-900/60 border-b border-slate-200 dark:border-gray-700">
              <button
                type="button"
                onClick={() => setAnchos(anchosItemsPorDefecto())}
                title="Restablecer ancho de columnas"
                className="flex items-center gap-1 text-[9px] font-medium text-gray-400 hover:text-[#2383C2] transition px-1.5 py-0.5 rounded hover:bg-white dark:hover:bg-gray-800"
              >
                <RotateCcw size={10} /> Restablecer columnas
              </button>
            </div>
            <table
              className="text-left text-[10px] border-collapse [&_td:not([colspan])]:whitespace-nowrap [&_td:not([colspan])]:overflow-hidden [&_td:not([colspan])]:text-ellipsis [&_th]:overflow-hidden"
              style={{ tableLayout: 'fixed', width: anchoTotalTabla, minWidth: anchoTotalTabla }}
            >
              <colgroup>
                {COLUMNAS.map(col => (
                  <col key={col.key} style={{ width: anchosVisibles[col.key] }} />
                ))}
              </colgroup>
              <thead className={`bg-slate-50 dark:bg-gray-900 ${modoLectura ? 'sticky top-0 z-[1]' : ''}`}>
                <tr className="text-slate-500 dark:text-gray-400 uppercase font-bold text-[9px]">
                  {COLUMNAS.map((col, idx) => (
                    <th
                      key={col.key}
                      title={col.label}
                      className={`relative ${col.px || 'px-2.5'} py-1.5 border-b border-slate-200 dark:border-gray-700 ${idx < COLUMNAS.length - 1 ? 'border-r' : ''} ${col.align === 'center' ? 'text-center' : ''}`}
                    >
                      <span className="block truncate">{col.label}</span>
                      <ManijaRedimension colKey={col.key} anchoActual={anchosVisibles[col.key]} anchoMin={col.min} onResize={handleResize} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {itemsOrdenados.length === 0 ? (
                  <tr>
                    <td colSpan={COLUMNAS.length} className="px-3 py-4 text-center text-slate-400 dark:text-gray-500">
                      Sin ítems en esta cotización
                    </td>
                  </tr>
                ) : (
                  itemsOrdenados.map(it => {
                    const empresaNoCoincide = calcularEmpresaNoCoincide(it, bloqueEmpresa);
                    const estilo = getEstadoCargaStyle(it.estadoCarga);
                    const enEdicion = editandoId === it.id;
                    const esPrincipalPad = !!it.esPad;
                    const esContenidoPad = !!it.padPadreId;
                    const esLoteAdicional = !!it.lotePadreId;
                    const esSateliteSinCosto = esContenidoPad || esLoteAdicional;
                    const sinContenidoAun = esPrincipalPad && !tieneContenidoPad(items, it.id);
                    const mostrandoFormularioContenido = agregandoContenidoDePadId === it.id;
                    // Modo lectura: el contenido de un PAD solo con su PAD desplegado.
                    if (modoLectura && esContenidoPad && !padsAbiertos.has(it.padPadreId)) return null;
                    const cantidadContenidoPad = esPrincipalPad ? items.filter(x => x.padPadreId === it.id).length : 0;

                    // Preview en vivo de recargo/venta/total mientras se edita el precio
                    // (mismo cálculo que se usa al guardar, ver guardarEdicion).
                    const financierosPreview = (enEdicion && !edicionEsContenidoPad && !edicionEsLoteAdicional)
                      ? calcularCamposFinancieros(borrador.precio, borrador.cantidad, recargosActivos)
                      : null;

                    if (enEdicion) {
                      return (
                        <tr key={it.id} className={`bg-blue-50/60 dark:bg-blue-950/20 ${esContenidoPad ? 'border-l-2 border-fuchsia-400 dark:border-fuchsia-700' : esLoteAdicional ? 'border-l-2 border-sky-400 dark:border-sky-700' : ''}`}>
                          <td className="px-2 py-1.5 border-b border-r border-slate-100 dark:border-gray-700/60 text-[9px] text-slate-500 dark:text-gray-400">
                            {idMostrado}
                          </td>
                          <td className="px-2 py-1.5 border-b border-r border-slate-100 dark:border-gray-700/60 text-[9px] text-slate-500 dark:text-gray-400">
                            {fechaMostrada}
                          </td>
                          <td className="px-2 py-1.5 border-b border-r border-slate-100 dark:border-gray-700/60 text-[9px]">
                            {edicionEsContenidoPad ? (
                              <span className="text-fuchsia-600 dark:text-fuchsia-400 italic">{CODIGO_SIN_OC}</span>
                            ) : edicionEsLoteAdicional ? (
                              <span className="text-sky-600 dark:text-sky-400 italic">{CODIGO_SIN_OC}</span>
                            ) : (
                              borrador.codigo || <span className="text-red-500 font-bold">S/C</span>
                            )}
                          </td>

                          <td className="px-2 py-1.5 border-b border-r border-slate-100 dark:border-gray-700/60 text-center">
                            <input
                              type="number"
                              {...SIN_CAMBIO_ACCIDENTAL}
                              value={borrador.cantidad}
                              onChange={e => setBorrador(prev => ({ ...prev, cantidad: e.target.value }))}
                              className={`${CLASE_SIN_FLECHAS} w-full min-w-0 h-6.5 px-1 text-[10px] border border-blue-300 dark:border-blue-700 rounded bg-white dark:bg-gray-900 text-slate-800 dark:text-gray-100 outline-none text-center`}
                            />
                          </td>

                          <td className="px-2 py-1.5 border-b border-r border-slate-100 dark:border-gray-700/60 text-[9px] text-emerald-700 dark:text-emerald-400 font-medium">
                            {financierosPreview ? `$${formatearPesos(financierosPreview.venta)}` : <span className="text-slate-400">—</span>}
                          </td>

                          <td className="px-2 py-1.5 border-b border-r border-slate-100 dark:border-gray-700/60 relative" ref={containerRef}>
                            <div className="flex items-center gap-1">
                              {esContenidoPad && <span className="text-fuchsia-400 dark:text-fuchsia-600 text-[10px]">↳</span>}
                              {esLoteAdicional && <span className="text-sky-400 dark:text-sky-600 text-[10px]">↳</span>}
                              <input
                                type="text"
                                value={borrador.referencia}
                                onChange={e => handleReferenciaChange(e.target.value)}
                                onFocus={() => sugerencias.length > 0 && setMostrarSug(true)}
                                autoComplete="off"
                                autoFocus
                                className="w-full h-6.5 px-1.5 text-[10px] border border-blue-300 dark:border-blue-700 rounded bg-white dark:bg-gray-900 text-slate-800 dark:text-gray-100 outline-none"
                              />
                            </div>
                            {mostrarSug && (
                              <DropdownReferenciaPortal anchorRef={containerRef} portalRef={portalRef}>
                                <div className="w-56 max-h-48 overflow-y-auto bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded shadow-lg">
                                  {buscando ? (
                                    <div className="px-2.5 py-2 text-[10px] text-slate-400 flex items-center gap-1.5">
                                      <Loader2 size={11} className="animate-spin" /> Buscando...
                                    </div>
                                  ) : sugerencias.length === 0 ? (
                                    <div className="px-2.5 py-2 text-[10px] text-slate-400">Sin coincidencias</div>
                                  ) : (
                                    sugerencias.map(sug => (
                                      <button
                                        key={sug.id}
                                        type="button"
                                        onClick={() => handleSeleccionarSugerencia(sug)}
                                        className="w-full text-left px-2.5 py-1.5 hover:bg-slate-100 dark:hover:bg-gray-700/60 border-b border-slate-100 dark:border-gray-700/50 last:border-b-0"
                                      >
                                        <div className="text-[10px] font-semibold text-slate-700 dark:text-gray-200 truncate">{sug.referencia}</div>
                                        <div className="text-[9px] text-slate-400 dark:text-gray-500 flex items-center gap-1.5">
                                          <span className="font-num text-emerald-600 dark:text-emerald-400">{sug.codigo || 'S/C'}</span>
                                          <span>·</span>
                                          <span className="truncate">{sug.empresa}</span>
                                        </div>
                                      </button>
                                    ))
                                  )}
                                </div>
                              </DropdownReferenciaPortal>
                            )}
                          </td>

                          <td className="px-2 py-1.5 border-b border-r border-slate-100 dark:border-gray-700/60 text-[9px] text-slate-500 dark:text-gray-400" title={borrador.descriptorAuto}>
                            {borrador.descriptorAuto || 'P'}
                          </td>
                          <td className="px-2 py-1.5 border-b border-r border-slate-100 dark:border-gray-700/60 text-[9px]" title={borrador.clase || 'P'}>{borrador.clase || 'P'}</td>
                          <td className="px-2 py-1.5 border-b border-r border-slate-100 dark:border-gray-700/60 text-[9px]" title={borrador.tipoVinculado || 'P'}>{borrador.tipoVinculado || 'P'}</td>
                          <td className="px-1 py-1.5 border-b border-r border-slate-100 dark:border-gray-700/60 text-[9px]">
                            {edicionEsContenidoPad ? (
                              <span className="text-fuchsia-600 dark:text-fuchsia-400 italic">$0</span>
                            ) : edicionEsLoteAdicional ? (
                              <span className="text-sky-600 dark:text-sky-400 italic">$0</span>
                            ) : (
                              <input
                                type="number"
                                {...SIN_CAMBIO_ACCIDENTAL}
                                min="0"
                                value={borrador.precio}
                                onChange={e => setBorrador(prev => ({ ...prev, precio: e.target.value }))}
                                className={`${CLASE_SIN_FLECHAS} w-full min-w-0 h-6.5 px-1 text-[10px] border border-blue-300 dark:border-blue-700 rounded bg-white dark:bg-gray-900 text-slate-800 dark:text-gray-100 outline-none`}
                              />
                            )}
                          </td>
                          <td className="px-2 py-1.5 border-b border-r border-slate-100 dark:border-gray-700/60 text-center text-[9px]">
                            {financierosPreview ? (
                              financierosPreview.recargoEncontrado ? (
                                <span className="font-semibold text-slate-700 dark:text-gray-200">{financierosPreview.vecesCosto}</span>
                              ) : (
                                <span className="text-purple-600 dark:text-purple-400 font-semibold" title="No hay rango configurado para este precio">1*</span>
                              )
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>

                          <td
                            className="px-1.5 py-1.5 border-b border-r border-slate-100 dark:border-gray-700/60 text-[9px] text-emerald-700 dark:text-emerald-400 font-medium"
                            title={financierosPreview ? `$${formatearPesos(financierosPreview.totalItem)}` : undefined}
                          >
                            {financierosPreview ? `$${formatearPesos(financierosPreview.totalItem)}` : <span className="text-slate-400">—</span>}
                          </td>

                          <td className="px-1 py-1.5 border-b border-r border-slate-100 dark:border-gray-700/60">
                            {edicionEsPad ? (
                              <input
                                type="text"
                                value={VALOR_LOTE_VENCIMIENTO_PAD}
                                disabled
                                className="w-full min-w-0 h-6.5 px-1 text-[10px] border border-slate-200 dark:border-gray-700 rounded bg-slate-100 dark:bg-gray-800 text-slate-500 dark:text-gray-400 outline-none"
                              />
                            ) : (
                              <input
                                type="text"
                                value={borrador.lote}
                                onChange={e => setBorrador(prev => ({ ...prev, lote: e.target.value }))}
                                className="w-full min-w-0 h-6.5 px-1 text-[10px] border border-blue-300 dark:border-blue-700 rounded bg-white dark:bg-gray-900 text-slate-800 dark:text-gray-100 outline-none"
                              />
                            )}
                          </td>

                          {/* px-0: el input de fecha necesita ~78px para mostrar el año completo */}
                          <td className="px-0 py-1.5 border-b border-r border-slate-100 dark:border-gray-700/60">
                            {edicionEsPad ? (
                              <input
                                type="text"
                                value={VALOR_LOTE_VENCIMIENTO_PAD}
                                disabled
                                className="w-full min-w-0 h-6.5 px-1 text-[10px] border border-slate-200 dark:border-gray-700 rounded bg-slate-100 dark:bg-gray-800 text-slate-500 dark:text-gray-400 outline-none"
                              />
                            ) : (
                              <input
                                type="date"
                                value={borrador.vencimiento}
                                onChange={e => setBorrador(prev => ({ ...prev, vencimiento: e.target.value }))}
                                className="w-full min-w-0 h-6.5 px-1 text-[10px] border border-blue-300 dark:border-blue-700 rounded bg-white dark:bg-gray-900 text-slate-800 dark:text-gray-100 outline-none"
                              />
                            )}
                          </td>

                          <td className="px-2 py-1.5 border-b border-r border-slate-100 dark:border-gray-700/60 text-center text-[9px]">
                            {edicionEsContenidoPad ? (
                              <span className="font-bold text-fuchsia-600 dark:text-fuchsia-400">PAD</span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>

                          <td className="px-2 py-1.5 border-b border-slate-100 dark:border-gray-700/60 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                type="button"
                                onClick={guardarEdicion}
                                title="Guardar cambios"
                                className="text-emerald-600 hover:text-emerald-800 transition p-0.5 rounded hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                              >
                                <Check size={13} />
                              </button>
                              <button
                                type="button"
                                onClick={cancelarEdicion}
                                title="Cancelar edición"
                                className="text-slate-400 hover:text-slate-600 transition p-0.5 rounded hover:bg-slate-100 dark:hover:bg-gray-700"
                              >
                                <X size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    }

                    return (
                      <React.Fragment key={it.id}>
                        <tr
                          className={`border-l-2 border-transparent hover:border-[#2383C2] transition ${it.sinCodigo
                            ? 'bg-red-50/70 dark:bg-red-950/20 hover:bg-red-50 dark:hover:bg-red-950/30'
                            : esContenidoPad
                              ? 'bg-fuchsia-50/30 dark:bg-fuchsia-950/10 hover:bg-fuchsia-50/60 dark:hover:bg-fuchsia-950/20'
                              // Cualquier ítem con <select> real de Estado Carga (normal,
                              // PAD principal o lote adicional) se colorea según su estado.
                              : getEstadoCargaRowStyle(it.estadoCarga)
                            }`}
                        >
                          <td className="px-2.5 py-1.5 border-b border-r border-slate-100 dark:border-gray-700/60 text-slate-500 dark:text-gray-400">
                            {idMostrado}
                          </td>
                          <td className="px-2.5 py-1.5 border-b border-r border-slate-100 dark:border-gray-700/60 text-slate-600 dark:text-gray-300">
                            {fechaMostrada}
                          </td>
                          <td className={`px-2.5 py-1.5 border-b border-r border-slate-100 dark:border-gray-700/60 ${esContenidoPad
                            ? 'text-fuchsia-600 dark:text-fuchsia-400 italic'
                            : esLoteAdicional
                              ? 'text-sky-600 dark:text-sky-400 italic'
                              : it.sinCodigo
                                ? 'text-red-600 dark:text-red-400 font-bold'
                                : 'text-emerald-600 dark:text-emerald-400'
                            }`}>
                            {it.codigo || 'S/C'}
                          </td>
                          <td className="px-2.5 py-1.5 border-b border-r border-slate-100 dark:border-gray-700/60 text-center text-slate-600 dark:text-gray-300">
                            {it.cantidad}
                          </td>
                          <td className="px-2.5 py-1.5 border-b border-r border-slate-100 dark:border-gray-700/60 text-slate-700 dark:text-gray-200 font-medium">
                            ${formatearPesos(it.venta || 0)}
                          </td>
                          <td className="px-2.5 py-1.5 border-b border-r border-slate-100 dark:border-gray-700/60 font-medium text-slate-700 dark:text-gray-200" title={it.referencia}>
                            <span className="flex items-center gap-1">
                              {esContenidoPad && <span className="text-fuchsia-400 dark:text-fuchsia-600 shrink-0">↳</span>}
                              {esLoteAdicional && <span className="text-sky-400 dark:text-sky-600 shrink-0">↳</span>}
                              <span className="truncate">{it.referencia}</span>
                              {esPrincipalPad && (
                                <span className="flex items-center gap-0.5 text-[8px] px-1 rounded bg-fuchsia-100 dark:bg-fuchsia-950/40 text-fuchsia-700 dark:text-fuchsia-400 font-bold shrink-0">
                                  <Package size={9} /> PAD
                                </span>
                              )}
                              {modoLectura && esPrincipalPad && cantidadContenidoPad > 0 && (
                                <button
                                  type="button"
                                  onClick={() => alternarPad(it.id)}
                                  aria-expanded={padsAbiertos.has(it.id)}
                                  aria-label={`${padsAbiertos.has(it.id) ? 'Ocultar' : 'Ver'} contenido del PAD ${it.referencia}`}
                                  className="flex items-center gap-0.5 text-[8px] font-semibold text-fuchsia-600 dark:text-fuchsia-400 hover:underline shrink-0"
                                >
                                  {padsAbiertos.has(it.id) ? <ChevronUp size={9} /> : <ChevronDown size={9} />} Contenido ({cantidadContenidoPad})
                                </button>
                              )}
                              {esLoteAdicional && (
                                <span className="flex items-center gap-0.5 text-[8px] px-1 rounded bg-sky-100 dark:bg-sky-950/40 text-sky-700 dark:text-sky-400 font-bold shrink-0">
                                  <Layers size={9} /> LOTE
                                </span>
                              )}
                            </span>
                          </td>
                          <td className="px-2.5 py-1.5 border-b border-r border-slate-100 dark:border-gray-700/60 text-slate-500 dark:text-gray-400" title={it.descriptorAuto}>
                            {it.descriptorAuto || 'P'}
                          </td>
                          <td className="px-2.5 py-1.5 border-b border-r border-slate-100 dark:border-gray-700/60 text-slate-600 dark:text-gray-300" title={it.clase || 'P'}>
                            {it.clase || 'P'}
                          </td>
                          <td className="px-2.5 py-1.5 border-b border-r border-slate-100 dark:border-gray-700/60 text-slate-600 dark:text-gray-300" title={it.tipoVinculado || 'P'}>
                            {it.tipoVinculado || 'P'}
                          </td>
                          <td className={`px-1.5 py-1.5 border-b border-r border-slate-100 dark:border-gray-700/60 ${esContenidoPad ? 'text-fuchsia-500 dark:text-fuchsia-400 italic' : esLoteAdicional ? 'text-sky-500 dark:text-sky-400 italic' : 'text-slate-600 dark:text-gray-300'}`} title={`$${formatearPesos(it.precio || 0)}`}>
                            ${formatearPesos(it.precio || 0)}
                          </td>
                          <td className="px-2.5 py-1.5 border-b border-r border-slate-100 dark:border-gray-700/60 text-center">
                            {esSateliteSinCosto ? (
                              <span className="text-slate-400 dark:text-gray-500">—</span>
                            ) : it.recargoEncontrado ? (
                              <span className="font-semibold text-slate-700 dark:text-gray-200">{it.vecesCosto}</span>
                            ) : (
                              <span className="text-purple-600 dark:text-purple-400 font-semibold" title="No hay rango configurado para este precio">1*</span>
                            )}
                          </td>
                          <td className="px-1.5 py-1.5 border-b border-r border-slate-100 dark:border-gray-700/60 text-emerald-700 dark:text-emerald-400 font-semibold" title={`$${formatearPesos(it.totalItem || 0)}`}>
                            ${formatearPesos(it.totalItem || 0)}
                          </td>
                          <td className="px-2.5 py-1.5 border-b border-r border-slate-100 dark:border-gray-700/60 text-slate-600 dark:text-gray-300" title={it.lote}>
                            {it.lote}
                          </td>
                          <td className="px-2 py-1.5 border-b border-r border-slate-100 dark:border-gray-700/60 text-slate-600 dark:text-gray-300">
                            {esPrincipalPad || esContenidoPad ? (it.vencimiento || 'PAD') : formatearFechaTabla(it.vencimiento)}
                          </td>
                          <td className="px-2.5 py-1.5 border-b border-r border-slate-100 dark:border-gray-700/60">
                            {esContenidoPad ? (
                              <span className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded border bg-fuchsia-50 dark:bg-fuchsia-950/30 border-fuchsia-300 dark:border-fuchsia-800 text-fuchsia-700 dark:text-fuchsia-400">
                                PAD
                              </span>
                            ) : it.sinCodigo ? (
                              <span className="flex items-center gap-1 text-[9px] font-semibold text-red-600 dark:text-red-400">
                                <AlertCircle size={10} /> Sin código
                              </span>
                            ) : modoLectura ? (
                              <span data-estado-carga={it.estadoCarga || 'PENDIENTE'} className={`inline-flex items-center text-[9px] font-bold px-1.5 py-0.5 rounded border ${estilo.bg} ${estilo.border} ${estilo.text}`}>
                                {it.estadoCarga || 'PENDIENTE'}
                              </span>
                            ) : (
                              <div className="flex flex-col gap-0.5">
                                <select
                                  value={it.estadoCarga || 'PENDIENTE'}
                                  onChange={(e) => cambiarEstadoCarga(it, e.target.value)}
                                  disabled={soloLectura}
                                  className={`w-full min-w-0 h-6 px-1.5 text-[9px] font-bold rounded border outline-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${estilo.bg} ${estilo.border} ${estilo.text}`}
                                >
                                  {ESTADO_CARGA_OPTIONS.map(op => (
                                    <option key={op} value={op}>{op}</option>
                                  ))}
                                </select>
                                {empresaNoCoincide && (
                                  <span className="flex items-center gap-0.5 text-[8px] text-amber-600 dark:text-amber-400">
                                    <AlertTriangle size={8} /> Empresa distinta
                                  </span>
                                )}
                                {!it.recargoEncontrado && (
                                  <span className="flex items-center gap-0.5 text-[8px] text-purple-600 dark:text-purple-400">
                                    <AlertTriangle size={8} /> Sin recargo
                                  </span>
                                )}
                              </div>
                            )}
                            {sinContenidoAun && (
                              <span className="flex items-center gap-0.5 text-[8px] text-amber-600 dark:text-amber-400 mt-0.5">
                                <AlertTriangle size={8} /> Contenido pendiente
                              </span>
                            )}
                          </td>
                          {!modoLectura && <td className="px-2.5 py-1.5 border-b border-slate-100 dark:border-gray-700/60 text-center">
                            <div className="flex items-center justify-center gap-1">
                              {esPrincipalPad && puedeAgregarContenidoPad && (
                                <button
                                  type="button"
                                  onClick={() => mostrandoFormularioContenido ? cerrarFormularioContenido() : abrirFormularioContenido(it.id)}
                                  disabled={soloLectura}
                                  title={soloLectura ? 'Bloqueado: ya imputado' : sinContenidoAun ? "Agregar contenido del PAD" : "Agregar más contenido a este PAD"}
                                  className="text-fuchsia-600 hover:text-fuchsia-800 transition p-0.5 rounded hover:bg-fuchsia-50 dark:hover:bg-fuchsia-950/30 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                                >
                                  <PackagePlus size={13} />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => iniciarEdicion(it)}
                                disabled={soloLectura}
                                title={soloLectura ? 'Bloqueado: ya imputado' : 'Editar ítem'}
                                className="text-blue-600 hover:text-blue-800 transition p-0.5 rounded hover:bg-blue-50 dark:hover:bg-blue-950/30 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                              >
                                <Pencil size={12} />
                              </button>
                              <button
                                type="button"
                                onClick={() => onEliminarItem(it.id)}
                                disabled={soloLectura}
                                title={soloLectura ? 'Bloqueado: ya imputado' : 'Eliminar ítem'}
                                className="text-red-500 hover:text-red-700 transition p-0.5 rounded hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </td>}
                        </tr>

                        {mostrandoFormularioContenido && !modoLectura && (
                          <tr className="bg-fuchsia-50/40 dark:bg-fuchsia-950/10">
                            <td colSpan={16} className="p-2.5 border-b border-fuchsia-200 dark:border-fuchsia-900">
                              {!periodoAbierto ? (
                                <div className="flex items-center gap-2 px-2.5 py-2 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded text-[10px] text-red-700 dark:text-red-400">
                                  <Lock size={12} className="shrink-0" />
                                  <span>No hay un período abierto para Implantes en Control Mensual. No se puede agregar contenido ahora.</span>
                                </div>
                              ) : (
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-bold text-fuchsia-700 dark:text-fuchsia-400 uppercase flex items-center gap-1">
                                      <Package size={12} /> Agregar contenido al PAD "{it.referencia}"
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => setFilasNuevoContenido(prev => [...prev, crearFilaContenidoPadVacia()])}
                                      className="text-[9px] font-semibold text-[#2383C2] hover:underline"
                                    >
                                      + Agregar línea
                                    </button>
                                  </div>

                                  {filasNuevoContenido.map((fila, idx) => (
                                    <PadContenidoRow
                                      key={fila.tempId}
                                      fila={fila}
                                      onChange={(nueva) => setFilasNuevoContenido(prev => prev.map((f, i) => i === idx ? nueva : f))}
                                      onRemove={() => setFilasNuevoContenido(prev => prev.filter((_, i) => i !== idx))}
                                      puedeEliminar={filasNuevoContenido.length > 1}
                                    />
                                  ))}

                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => guardarNuevoContenido(it)}
                                      className="h-7 px-3 bg-[#2383C2] hover:bg-[#1d6fa5] text-white rounded font-semibold text-[10px] transition"
                                    >
                                      Guardar contenido
                                    </button>
                                    <button
                                      type="button"
                                      onClick={cerrarFormularioContenido}
                                      className="h-7 px-3 text-slate-500 dark:text-gray-400 hover:text-slate-700 dark:hover:text-gray-200 font-medium text-[10px] transition"
                                    >
                                      Cerrar
                                    </button>
                                  </div>
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
              {items.length > 0 && (
                <tfoot>
                  <tr className="bg-slate-50 dark:bg-gray-900/60 font-bold">
                    <td colSpan={11} className="px-2.5 py-1.5 border-t border-r border-slate-200 dark:border-gray-700 text-slate-600 dark:text-gray-300 text-right">
                      Suma de ítems:
                    </td>
                    {/* Sin recorte: la suma puede ser más ancha que la columna Total Ítem
                        y se extiende sobre la celda vacía de la derecha. */}
                    <td className={`px-1.5 py-1.5 border-t border-r border-slate-200 dark:border-gray-700 !overflow-visible ${totalCoincide ? 'text-emerald-700 dark:text-emerald-400' : 'text-orange-600 dark:text-orange-400'}`}>
                      ${formatearPesos(totalItems)}
                    </td>
                    <td colSpan={COLUMNAS.length - 12} className="border-t border-slate-200 dark:border-gray-700"></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {mostrarConfirmCargaMasiva && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-[1px]">
          <div className="bg-white dark:bg-gray-800 w-full max-w-sm rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2 bg-emerald-50/60 dark:bg-emerald-950/20">
              <CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
              <h3 className="text-[12px] font-bold text-gray-800 dark:text-gray-100">Confirmar carga masiva</h3>
              <button
                type="button"
                onClick={() => setMostrarConfirmCargaMasiva(false)}
                className="ml-auto text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition"
              >
                <X size={15} />
              </button>
            </div>

            <div className="px-4 py-3">
              <p className="text-[11px] text-gray-600 dark:text-gray-300">
                Esta acción marcará como "Cargado" {textoCantidadElegibles} de esta cotización. Los ítems con referencia PAD
                no se verán afectados y mantendrán su estado actual.
              </p>
              <p className="text-[11px] text-gray-600 dark:text-gray-300 mt-2">
                ¿Deseas continuar?
              </p>
            </div>

            <div className="px-4 py-3 bg-gray-50/60 dark:bg-gray-900/40 border-t border-gray-100 dark:border-gray-700 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setMostrarConfirmCargaMasiva(false)}
                className="h-8 px-3 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 font-medium transition text-[11px]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmarCargaMasiva}
                className="h-8 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-semibold transition text-[11px]"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CotizacionCard;