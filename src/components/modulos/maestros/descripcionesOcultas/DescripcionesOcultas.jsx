import { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, updateDoc, serverTimestamp } from 'firebase/firestore';
import { EyeOff, Search, X, Loader2, ArrowDown, ArrowUp, Check } from 'lucide-react';
import { db } from '../../../../firebaseConfig';
import { useUser } from '../../../../context/UserContext';
import { useToast } from '../../../../context/ToastContext';
import { useGranularPermission } from '../../../../hooks/useGranularPermission';
import { useColumnasPermitidas } from '../../../../hooks/useColumnasPermitidas';
import {
  COLECCION_DESCRIPCIONES, ESTADOS_DESCRIPCION, normalizarDescripcion, estadoDescripcion,
} from '../../../../../functions/descripcionesReporte/nucleo.mjs';

// Maestros → Descripciones ocultas (Reporte Info): cada descripción distinta
// de Reporte Info con su cantidad de filas y dos switches, "Ocultar en
// Implantes" y "Ocultar en Documentos". Las entradas y el contador los
// mantiene la Cloud Function (functions/descripcionesReporte): una
// descripción nueva aparece sola, visible y pendiente de revisión. Al
// cambiar un switch, la función recalcula las filas de esa descripción (en
// Implantes, las filas cuya admisión tiene gestión se siguen mostrando, con
// aviso).
//
// Estado de cada una (estadoDescripcion en nucleo.mjs): Pendiente (amarillo,
// nueva sin revisar), Visible (verde) u Oculta (gris). Cualquier cambio
// desde acá (un switch o "Marcar como revisada") escribe `actualizadoEl` y
// la deja revisada.

const PATH_VISTA = '/maestros/descripcionesOcultas';
const MODULOS = [
  { campo: 'ocultaImplantes', nombre: 'Implantes' },
  { campo: 'ocultaDocumentos', nombre: 'Documentos' },
];

const COLUMNAS = [
  { key: 'descripcion', label: 'Descripción', fija: true },
  { key: 'filas', label: 'Filas' },
  { key: 'ocultaImplantes', label: 'Ocultar en Implantes' },
  { key: 'ocultaDocumentos', label: 'Ocultar en Documentos' },
];

// Etiqueta y colores de cada estado (en el orden de ESTADOS_DESCRIPCION).
const ESTADOS = {
  pendiente: { etiqueta: 'Pendiente', plural: 'Pendientes', insignia: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-700/60', fila: 'bg-amber-50/70 dark:bg-amber-950/20' },
  visible: { etiqueta: 'Visible', plural: 'Visibles', insignia: 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-700/60', fila: 'hover:bg-gray-50 dark:hover:bg-gray-700/30' },
  oculta: { etiqueta: 'Oculta', plural: 'Ocultas', insignia: 'bg-gray-200 text-gray-700 border-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600', fila: 'bg-slate-50/80 dark:bg-gray-900/30' },
};
const Insignia = ({ estado }) => (
  <span className={`inline-block px-1.5 py-px rounded border text-[9.5px] font-bold uppercase tracking-wide ${ESTADOS[estado].insignia}`}>
    {ESTADOS[estado].etiqueta}
  </span>
);

const Switch = ({ activo, onCambiar, deshabilitado, etiqueta }) => (
  <button type="button" role="switch" aria-checked={activo} aria-label={etiqueta} title={etiqueta}
    onClick={onCambiar} disabled={deshabilitado}
    className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${activo ? 'bg-[#2383C2]' : 'bg-gray-300 dark:bg-gray-600'}`}>
    <span className={`inline-block h-3 w-3 rounded-full bg-white shadow transition-transform ${activo ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
  </button>
);

const DescripcionesOcultas = () => {
  const { userData } = useUser();
  const { showToast } = useToast();
  const { hasPermission } = useGranularPermission();
  const { ver } = useColumnasPermitidas(PATH_VISTA, 'tabla_datos', COLUMNAS);
  const puede = {
    buscar: hasPermission(PATH_VISTA, 'barra_busqueda', 'input_buscar'),
    filtrar: hasPermission(PATH_VISTA, 'barra_busqueda', 'select_filtro'),
    editar: hasPermission(PATH_VISTA, 'tabla_datos', 'action_editar'),
  };

  const [entradas, setEntradas] = useState(null);
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState('todas');
  const [ordenDesc, setOrdenDesc] = useState(true);
  const [guardando, setGuardando] = useState(null);

  useEffect(() => onSnapshot(
    collection(db, COLECCION_DESCRIPCIONES),
    (snap) => setEntradas(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => { console.error('Error al leer las descripciones de Reporte Info:', err); setEntradas([]); }
  ), []);

  const conEstado = useMemo(() => (entradas || []).map((e) => ({ ...e, estado: estadoDescripcion(e) })), [entradas]);
  const conteo = useMemo(() => Object.fromEntries(
    ESTADOS_DESCRIPCION.map((s) => [s, conEstado.filter((e) => e.estado === s).length])
  ), [conEstado]);

  const lista = useMemo(() => {
    const q = normalizarDescripcion(busqueda);
    return conEstado
      .filter((e) => filtro === 'todas' || e.estado === filtro)
      .filter((e) => !q || e.descripcion?.includes(q))
      .sort((a, b) => ((a.filas || 0) - (b.filas || 0)) * (ordenDesc ? -1 : 1) || String(a.descripcion).localeCompare(String(b.descripcion)));
  }, [conEstado, busqueda, filtro, ordenDesc]);

  // Todo cambio deja la descripción revisada (actualizadoEl; ver estadoDescripcion).
  const firma = () => ({ actualizadoPor: userData?.nombreCompleto || 'Usuario', actualizadoPorUid: userData?.uid || null, actualizadoEl: serverTimestamp() });

  const cambiar = async (e, campo, valor, nombre) => {
    setGuardando(`${e.id}|${campo}`);
    try {
      await updateDoc(doc(db, COLECCION_DESCRIPCIONES, e.id), { [campo]: valor, ...firma() });
      showToast(`${valor ? 'Oculta' : 'Visible'} en ${nombre}: ${e.filas || 0} fila(s). Reporte Info se actualiza en unos segundos.`, 'success');
    } catch (err) {
      console.error('Error al cambiar la descripción:', err);
      showToast('No se pudo guardar el cambio.', 'error');
    } finally {
      setGuardando(null);
    }
  };

  // Pendiente → revisada, sin cambiar los switches (queda visible).
  const marcarRevisada = async (e) => {
    setGuardando(`${e.id}|revisada`);
    try {
      await updateDoc(doc(db, COLECCION_DESCRIPCIONES, e.id), firma());
      showToast('Descripción revisada: queda visible.', 'success');
    } catch (err) {
      console.error('Error al marcar la descripción como revisada:', err);
      showToast('No se pudo guardar el cambio.', 'error');
    } finally {
      setGuardando(null);
    }
  };

  const celda = 'px-3 py-1.5 border-b border-r last:border-r-0 border-gray-100 dark:border-gray-700/60';
  const encabezado = 'sticky top-0 z-10 bg-gray-50 dark:bg-gray-900 px-3 py-1.5 font-semibold whitespace-nowrap border-b border-r last:border-r-0 border-gray-200 dark:border-gray-700';
  const columnas = COLUMNAS.filter((c) => c.fija || ver(c.key));

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm overflow-hidden">
      <div className="shrink-0 px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="w-8 h-8 rounded-lg bg-[#2383C2] text-white flex items-center justify-center shrink-0"><EyeOff size={16} /></span>
        <div className="min-w-0 mr-auto">
          <h2 className="text-[14px] font-bold leading-tight text-gray-800 dark:text-gray-100">Descripciones ocultas</h2>
          <p className="text-[11px] text-gray-500 dark:text-gray-400">Descripciones de Reporte Info que no se muestran en Implantes o Documentos. Las filas se siguen guardando; las descripciones nuevas aparecen solas, visibles y pendientes de revisión.</p>
        </div>
        {entradas && (
          <span className="flex flex-wrap items-center gap-1.5 text-[11px] text-gray-500 dark:text-gray-400" aria-label="Cantidad por estado">
            {entradas.length} descripciones ·
            {ESTADOS_DESCRIPCION.map((s) => (
              <span key={s} className={`px-1.5 py-px rounded border text-[10.5px] font-semibold ${ESTADOS[s].insignia}`}>
                {conteo[s]} {ESTADOS[s].plural.toLowerCase()}
              </span>
            ))}
          </span>
        )}
        {puede.filtrar && (
          <select value={filtro} onChange={(e) => setFiltro(e.target.value)} aria-label="Filtrar descripciones"
            className="h-7 px-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-[11.5px] text-gray-800 dark:text-gray-100">
            <option value="todas">Todas ({conEstado.length})</option>
            {ESTADOS_DESCRIPCION.map((s) => <option key={s} value={s}>{ESTADOS[s].plural} ({conteo[s]})</option>)}
          </select>
        )}
        {puede.buscar && (
          <div className="relative w-64 max-w-full">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar descripción…" aria-label="Buscar descripción"
              className="w-full h-7 pl-8 pr-7 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-[11.5px] text-gray-800 dark:text-gray-100 focus:outline-none focus:border-[#2383C2]" />
            {busqueda && <button type="button" onClick={() => setBusqueda('')} aria-label="Limpiar búsqueda" className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-[#2383C2]"><X size={13} /></button>}
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        {entradas === null ? (
          <p className="py-10 text-center text-[12px] text-gray-400"><Loader2 size={14} className="inline animate-spin mr-1" />Cargando…</p>
        ) : (
          <table className="w-full text-left text-[11.5px] border-separate border-spacing-0 [&>tbody>tr:last-child>td]:border-b-0">
            <thead className="text-[10px] uppercase text-gray-500 dark:text-gray-400">
              <tr>
                {columnas.map((c) => (
                  <th key={c.key} className={`${encabezado} ${c.key === 'filas' ? 'text-right' : c.key === 'descripcion' ? '' : 'text-center w-40'}`}>
                    {c.key === 'filas' ? (
                      <button type="button" onClick={() => setOrdenDesc((v) => !v)} aria-label="Ordenar por cantidad de filas"
                        className="inline-flex items-center gap-1 uppercase hover:text-[#2383C2]">
                        {c.label}{ordenDesc ? <ArrowDown size={11} /> : <ArrowUp size={11} />}
                      </button>
                    ) : c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lista.length === 0 && (
                <tr><td colSpan={columnas.length} className="py-10 text-center text-gray-400">{entradas.length ? 'Ninguna descripción coincide con el filtro.' : 'Aún no hay descripciones: se cargan con el script inicial y luego solas.'}</td></tr>
              )}
              {lista.map((e) => (
                <tr key={e.id} data-estado={e.estado} className={ESTADOS[e.estado].fila}>
                  <td className={`${celda} font-medium ${e.estado === 'oculta' ? 'text-gray-500 dark:text-gray-400' : 'text-gray-800 dark:text-gray-100'}`}>
                    <span className="flex items-center gap-2">
                      <Insignia estado={e.estado} />
                      <span className="min-w-0" data-descripcion>{e.descripcion}</span>
                      {e.estado === 'pendiente' && puede.editar && (
                        <button type="button" onClick={() => marcarRevisada(e)} disabled={guardando === `${e.id}|revisada`}
                          aria-label={`Marcar como revisada: ${e.descripcion}`} title="Dejarla visible y revisada"
                          className="ml-auto shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-emerald-300 dark:border-emerald-700/60 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 disabled:opacity-50">
                          <Check size={11} />Marcar como revisada
                        </button>
                      )}
                    </span>
                  </td>
                  {ver('filas') && <td className={`${celda} text-right tabular-nums`}>{e.filas ?? 0}</td>}
                  {MODULOS.filter((m) => ver(m.campo)).map((m) => (
                    <td key={m.campo} className={`${celda} text-center`}>
                      <span className="inline-flex items-center gap-1.5">
                        <Switch
                          activo={e[m.campo] === true}
                          deshabilitado={!puede.editar || guardando === `${e.id}|${m.campo}`}
                          etiqueta={`Ocultar en ${m.nombre}: ${e.descripcion}`}
                          onCambiar={() => cambiar(e, m.campo, e[m.campo] !== true, m.nombre)}
                        />
                        <span className={`text-[10px] w-12 text-left ${e[m.campo] === true ? 'text-[#2383C2] font-semibold' : 'text-gray-400'}`}>{e[m.campo] === true ? 'Oculta' : 'Visible'}</span>
                      </span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default DescripcionesOcultas;
