import React, { useEffect, useMemo, useState } from 'react';
import { Copy, Download, FilePen, History, Info, Loader2, RefreshCw } from 'lucide-react';
import { useUser } from '../../../../../context/UserContext';
import { useToast } from '../../../../../context/ToastContext';
import { useModal } from '../../../../../context/ModalContext';
import { useGranularPermission } from '../../../../../hooks/useGranularPermission';
import { useColumnResize } from '../../../../../hooks/useColumnResize';
import { TablaCodigos } from '../../../maestros/codigosMaestrosV2/ui/TablaCodigos';
import {
  useSolicitudModificacionesData, useTotalesModificaciones, listarHistorialModificaciones, descargarCopia
} from './useSolicitudModificacionesData';
import { construirFilasModificaciones, textoPeriodoSolicitud } from './modificacionesSolicitud';

const pesos = (n) => `${n < 0 ? '-' : ''}$${Math.abs(Math.round(Number(n) || 0)).toLocaleString('es-CL')}`;
const conSigno = (n) => (n > 0 ? `+${n}` : String(n));
const fecha = (v) => {
  if (!v) return '—';
  const d = v.toDate ? v.toDate() : new Date(v);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};
const fechaISO = (f) => (f && f.includes('-') ? f.split('-').reverse().join('-') : f || '—');

const COLUMNAS_BLOQUES = [
  { key: 'sel', label: '', ancho: 34, min: 34, align: 'center' },
  { key: 'admision', label: 'Admisión', ancho: 90, min: 70 },
  { key: 'paciente', label: 'Paciente', ancho: 190, min: 100 },
  { key: 'empresa', label: 'Empresa', ancho: 160, min: 90 },
  { key: 'fecha', label: 'Fecha', ancho: 90, min: 70 },
  { key: 'solicitud', label: 'Solicitud original', ancho: 140, min: 100 },
  { key: 'periodo', label: 'Período', ancho: 110, min: 80 },
  { key: 'agregados', label: 'Agreg.', ancho: 64, min: 50, align: 'right' },
  { key: 'modificados', label: 'Modif.', ancho: 64, min: 50, align: 'right' },
  { key: 'eliminados', label: 'Elim.', ancho: 64, min: 50, align: 'right' },
  { key: 'difVenta', label: 'Dif. venta', ancho: 110, min: 80, align: 'right' },
];

const COLUMNAS_CAMBIOS = [
  { key: 'MOVIMIENTO', label: 'Movimiento', ancho: 100, min: 80 },
  { key: 'ID', label: 'Admisión', ancho: 90, min: 70 },
  { key: 'CODIGO', label: 'Código', ancho: 100, min: 70 },
  { key: 'DESCRIPCION', label: 'Descripción', ancho: 220, min: 100 },
  { key: 'CANTIDAD ANTERIOR', label: 'Cant. ant.', ancho: 76, min: 60, align: 'right' },
  { key: 'CANTIDAD', label: 'Cant.', ancho: 64, min: 50, align: 'right' },
  { key: 'DIFERENCIA CANTIDAD', label: 'Dif. cant.', ancho: 76, min: 60, align: 'right' },
  { key: 'VENTA ANTERIOR', label: 'Venta ant.', ancho: 100, min: 80, align: 'right' },
  { key: 'VENTA', label: 'Venta', ancho: 100, min: 80, align: 'right' },
  { key: 'DIFERENCIA VENTA', label: 'Dif. venta', ancho: 100, min: 80, align: 'right' },
];

const TONO_MOVIMIENTO = {
  AGREGADO: 'text-emerald-700 dark:text-emerald-400',
  MODIFICADO: 'text-amber-700 dark:text-amber-400',
  ELIMINADO: 'text-red-600 dark:text-red-400',
};

const Diferencia = ({ valor, moneda = false }) => (
  <span className={`font-semibold ${valor > 0 ? 'text-emerald-700 dark:text-emerald-400' : valor < 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-500'}`}>
    {moneda ? (valor > 0 ? `+${pesos(valor)}` : pesos(valor)) : conSigno(valor)}
  </span>
);

// Historial de descargas (se monta solo al abrir su pestaña: recién ahí lee).
const HistorialModificaciones = ({ modulo, config, puedeCopiar }) => {
  const { showToast } = useToast();
  const [entradas, setEntradas] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [hayMas, setHayMas] = useState(false);
  const [cargando, setCargando] = useState(true);

  const cargar = async (mas = false) => {
    setCargando(true);
    try {
      const r = await listarHistorialModificaciones(modulo, mas ? cursor : null);
      setEntradas((prev) => (mas ? [...prev, ...r.entradas] : r.entradas));
      setCursor(r.cursor);
      setHayMas(r.hayMas);
    } catch (e) {
      console.error('Error al cargar el historial de modificaciones:', e);
      showToast('No se pudo cargar el historial', 'error');
    } finally {
      setCargando(false);
    }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { cargar(); }, [modulo]);

  return (
    <div className="flex-1 min-h-0 overflow-auto p-3 space-y-2">
      {cargando && entradas.length === 0 && <div className="py-10 flex justify-center"><Loader2 className="animate-spin text-[#2383C2]" /></div>}
      {!cargando && entradas.length === 0 && <p className="py-10 text-center text-[12px] text-gray-400">Todavía no se han descargado modificaciones.</p>}
      {entradas.map((e) => (
        <div key={e.id} className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 text-[12px]">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="font-semibold text-gray-800 dark:text-gray-100">{fecha(e.fecha)}</span>
            <span className="text-gray-500">por {e.usuario}</span>
            <span className="text-gray-500">{e.bloques?.length || 0} bloque(s) · {e.totalFilas || 0} cambio(s)</span>
            <span className="text-gray-400 font-mono text-[11px]">{e.nombreArchivo}</span>
            {puedeCopiar && (
              <button type="button" onClick={() => { descargarCopia(config, e); showToast('Copia descargada (no cambia ningún estado)', 'info'); }}
                className="ml-auto inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700">
                <Copy size={13} /> Descargar copia
              </button>
            )}
          </div>
          <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
            {(e.bloques || []).map((b) => `${b.gestionId} · ${b.nombre} (${b.empresa}, ${fechaISO(b.fecha)})`).join(' — ')}
          </p>
        </div>
      ))}
      {hayMas && (
        <div className="flex justify-center pt-1">
          <button type="button" onClick={() => cargar(true)} disabled={cargando}
            className="inline-flex items-center gap-1.5 h-7 px-3 rounded-md border border-gray-300 dark:border-gray-600 text-[12px] hover:bg-gray-50 dark:hover:bg-gray-700">
            {cargando && <Loader2 size={12} className="animate-spin" />} Cargar más
          </button>
        </div>
      )}
    </div>
  );
};

// Implantes / Hemodinamia / Consignación → Solicitudes de modificaciones.
// Solo cambios sobre solicitudes ya enviadas (nunca el bloque completo, sin
// volver a imputar). En Consignación cada "bloque" es una carga (un ítem).
// Permisos: los de esta vista si el usuario tiene configuración propia; si
// no, hereda el acceso de Solicitud (ver `heredaDe` en modulesConfig.jsx).
const SolicitudModificaciones = ({ modulo }) => {
  const { userData } = useUser();
  const { showToast } = useToast();
  const { confirmAction } = useModal();
  const { hasPermission } = useGranularPermission();
  const { config, bloques, cargando, exportando, exportar } = useSolicitudModificacionesData(modulo, { userData, showToast });
  const totales = useTotalesModificaciones(bloques);
  const [seccion, setSeccion] = useState('pendientes');
  const [seleccion, setSeleccion] = useState(new Set());

  const rutaPermisos = config.rutas.solicitudModificaciones;
  const configPropia = Boolean(userData?.permisosGranulares?.[rutaPermisos]);
  const puedeExportar = configPropia ? hasPermission(rutaPermisos, 'acciones', 'btn_exportar') : true;
  const puedeCopiar = configPropia ? hasPermission(rutaPermisos, 'historial', 'btn_descargar_copia') : true;

  // La selección solo guarda bloques que siguen pendientes.
  useEffect(() => {
    setSeleccion((prev) => {
      const vigentes = new Set(bloques.map((b) => b.refPath));
      const filtrada = new Set([...prev].filter((r) => vigentes.has(r)));
      return filtrada.size === prev.size ? prev : filtrada;
    });
  }, [bloques]);

  const alternar = (ref) => setSeleccion((prev) => {
    const s = new Set(prev);
    if (s.has(ref)) s.delete(ref); else s.add(ref);
    return s;
  });
  const todos = bloques.length > 0 && seleccion.size === bloques.length;

  const elegidos = useMemo(() => bloques.filter((b) => seleccion.has(b.refPath)), [bloques, seleccion]);
  const filasVista = useMemo(() => construirFilasModificaciones(elegidos.length ? elegidos : bloques, '')
    .map((f, i) => ({ id: `${f.ID}-${i}`, ...f })), [elegidos, bloques]);
  const filasBloques = useMemo(() => bloques.map((b) => ({
    ...b,
    id: b.refPath,
    difVenta: construirFilasModificaciones([b], '').reduce((s, f) => s + f['DIFERENCIA VENTA'], 0),
  })), [bloques]);

  const colB = useColumnResize(COLUMNAS_BLOQUES);
  const colC = useColumnResize(COLUMNAS_CAMBIOS);

  const descargar = () => {
    if (!elegidos.length) { showToast('Selecciona al menos un bloque', 'error'); return; }
    confirmAction(
      'Descargar modificaciones',
      `Se descargará un Excel con SOLO los cambios de ${elegidos.length} bloque(s) sobre lo ya solicitado. No se vuelve a imputar nada y estos cambios dejarán de estar pendientes (quedan en el Historial). ¿Continuar?`,
      async () => {
        try {
          const r = await exportar(seleccion);
          if (r.ok) {
            setSeleccion(new Set());
            showToast(`Modificaciones descargadas: ${r.bloques} bloque(s), ${r.filas} cambio(s)`, 'success');
          }
        } catch (e) {
          console.error('Error al descargar modificaciones:', e);
          showToast('Error al descargar: ' + e.message, 'error');
        }
      },
      { confirmText: 'Descargar' }
    );
  };

  const celdaBloque = (col, b) => {
    switch (col.key) {
      case 'sel': return <input type="checkbox" checked={seleccion.has(b.refPath)} onChange={() => alternar(b.refPath)} onClick={(e) => e.stopPropagation()} aria-label={`Seleccionar ${b.gestionId}`} className="accent-[#2383C2] cursor-pointer" />;
      case 'admision': return <span className="font-semibold text-[#2383C2]">{b.gestionId}</span>;
      case 'paciente': return <span title={b.nombre}>{b.nombre}</span>;
      case 'empresa': return <span title={b.empresa}>{b.empresa}</span>;
      case 'fecha': return fechaISO(b.fecha);
      case 'solicitud': return <span className="text-gray-500">{fecha(b.fechaSolicitud)}</span>;
      case 'periodo': return textoPeriodoSolicitud(b) || '—';
      case 'agregados': return b.resumen.agregados || '—';
      case 'modificados': return b.resumen.modificados || '—';
      case 'eliminados': return b.resumen.eliminados || '—';
      case 'difVenta': return <Diferencia valor={b.difVenta} moneda />;
      default: return null;
    }
  };

  const celdaCambio = (col, f) => {
    switch (col.key) {
      case 'MOVIMIENTO': return <span className={`font-bold ${TONO_MOVIMIENTO[f.MOVIMIENTO]}`}>{f.MOVIMIENTO}</span>;
      case 'CODIGO': return f.CODIGO && f['CODIGO ANTERIOR'] && f.CODIGO !== f['CODIGO ANTERIOR']
        ? <span title={`Antes: ${f['CODIGO ANTERIOR']}`}>{f['CODIGO ANTERIOR']} → {f.CODIGO}</span> : (f.CODIGO || f['CODIGO ANTERIOR']);
      case 'DESCRIPCION': return <span title={f.DESCRIPCION}>{f.DESCRIPCION}</span>;
      case 'VENTA ANTERIOR': return f['VENTA ANTERIOR'] === '' ? '' : pesos(f['VENTA ANTERIOR']);
      case 'VENTA': return f.VENTA === '' ? '' : pesos(f.VENTA);
      case 'DIFERENCIA CANTIDAD': return <Diferencia valor={f['DIFERENCIA CANTIDAD']} />;
      case 'DIFERENCIA VENTA': return <Diferencia valor={f['DIFERENCIA VENTA']} moneda />;
      default: return f[col.key];
    }
  };

  return (
    <div className="w-full h-full flex flex-col bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm overflow-hidden text-[11px]">
      <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/80 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[12px] font-bold text-gray-700 dark:text-gray-100 flex items-center gap-1.5">
          <FilePen size={15} className="text-[#2383C2]" />
          SOLICITUDES DE MODIFICACIONES DE {config.etiqueta.toUpperCase()}
        </h2>
        <div className="flex items-center gap-1 text-[11px]" role="tablist">
          {[['pendientes', `Pendientes (${bloques.length})`, FilePen], ['historial', 'Historial', History]].map(([id, etiqueta, Icono]) => (
            <button key={id} type="button" role="tab" aria-selected={seccion === id} onClick={() => setSeccion(id)}
              className={`inline-flex items-center gap-1 h-7 px-2.5 rounded-md border ${seccion === id ? 'bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600 text-[#2383C2] font-semibold' : 'border-transparent text-gray-500 hover:bg-white/60 dark:hover:bg-gray-700/40'}`}>
              <Icono size={12} /> {etiqueta}
            </button>
          ))}
        </div>
      </div>

      <p className="px-3 py-1.5 text-[11px] text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700 flex items-start gap-1.5">
        <Info size={12} className="shrink-0 mt-0.5 text-[#2383C2]" />
        Solo cambios hechos después de la solicitud (agregados, modificados y eliminados), con el valor anterior y el nuevo. No reemplaza ni duplica la Solicitud original y no vuelve a imputar: la imputación ya se actualizó al guardar cada edición.
      </p>

      {seccion === 'historial' ? (
        <HistorialModificaciones modulo={modulo} config={config} puedeCopiar={puedeCopiar} />
      ) : (
        <>
          <div className="px-3 py-1.5 flex flex-wrap items-center gap-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
            <label className="inline-flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={todos} onChange={() => setSeleccion(todos ? new Set() : new Set(bloques.map((b) => b.refPath)))} className="accent-[#2383C2]" />
              Seleccionar todos
            </label>
            <span className="text-gray-500">
              <span className="text-emerald-700 dark:text-emerald-400 font-semibold">{totales.agregados}</span> agregados ·{' '}
              <span className="text-amber-700 dark:text-amber-400 font-semibold">{totales.modificados}</span> modificados ·{' '}
              <span className="text-red-600 dark:text-red-400 font-semibold">{totales.eliminados}</span> eliminados
            </span>
            {puedeExportar && (
              <button type="button" onClick={descargar} disabled={!elegidos.length || exportando}
                className="ml-auto inline-flex items-center gap-1.5 h-7 px-3 rounded font-bold bg-[#2383C2] hover:bg-[#1d6fa5] text-white disabled:opacity-50">
                {exportando ? <RefreshCw size={13} className="animate-spin" /> : <Download size={13} />}
                Descargar modificaciones ({elegidos.length})
              </button>
            )}
          </div>

          <div className="flex-1 min-h-0 flex flex-col">
            <div className="min-h-[120px] max-h-[45%] flex flex-col">
              <TablaCodigos
                columnas={COLUMNAS_BLOQUES}
                anchos={colB.anchos}
                onResize={colB.handleResize}
                anchoTotal={colB.anchoTotalTabla}
                filas={filasBloques}
                renderCelda={celdaBloque}
                onFilaDobleClic={(b) => alternar(b.refPath)}
                cargando={cargando}
                mensajeVacio="No hay modificaciones pendientes: todo lo editado después de solicitar ya fue descargado."
              />
            </div>
            <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-gray-500 bg-gray-100 dark:bg-gray-900 border-y border-gray-200 dark:border-gray-700">
              Vista previa de cambios {elegidos.length ? `(${elegidos.length} bloque(s) seleccionado(s))` : '(todos los pendientes)'}
            </div>
            <div className="flex-1 min-h-0 flex flex-col">
              <TablaCodigos
                columnas={COLUMNAS_CAMBIOS}
                anchos={colC.anchos}
                onResize={colC.handleResize}
                anchoTotal={colC.anchoTotalTabla}
                filas={filasVista}
                renderCelda={celdaCambio}
                mensajeVacio="Sin cambios."
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default SolicitudModificaciones;
