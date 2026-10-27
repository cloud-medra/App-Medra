import { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, updateDoc, addDoc, getDocs, query, orderBy, serverTimestamp } from 'firebase/firestore';
import { PersonStanding, Search, X, Pencil, Check, History, AlertTriangle, Loader2 } from 'lucide-react';
import { db } from '../../../../firebaseConfig';
import { useUser } from '../../../../context/UserContext';
import { useToast } from '../../../../context/ToastContext';
import { useGranularPermission } from '../../../../hooks/useGranularPermission';
import { useColumnasPermitidas } from '../../../../hooks/useColumnasPermitidas';
import CuerpoCompleto from '../../../ui/bodymap/CuerpoCompleto';
import {
  ZONAS, LADOS, ESTADOS, zonaPorId, nombreLado, normalizarDescripcion,
  SIN_ZONA_ESPECIFICA, NOMBRE_SIN_ZONA_ESPECIFICA, esSinZonaEspecifica, nombreZona,
} from '../../../../../functions/bodymap/nucleo.mjs';

// Maestros → Zonas por diagnóstico (Bodymap de Implantes): cada descripción
// distinta de las gestiones de Implantes con su(s) zona(s) del cuerpo, la
// lateralidad, el estado y cuántas gestiones la usan. Las entradas y el
// contador los mantiene la Cloud Function (functions/bodymap): una
// descripción nueva aparece sola como "Sugerida" o "Sin asignar". Aquí se
// asignan o corrigen las zonas (queda "Confirmada") con la acción "Editar".
// "Sin zona específica" (nucleo.mjs) se asigna como una zona más, excluye a
// las demás y también queda "Confirmada"; tiene su opción en el filtro.

const PATH_VISTA = '/maestros/zonasDiagnostico';
const COLECCION = 'maestros_zonas_diagnostico';

const COLUMNAS = [
  { key: 'descripcion', label: 'Descripción', fija: true },
  { key: 'zonas', label: 'Zona(s)' },
  { key: 'lado', label: 'Lateralidad' },
  { key: 'estado', label: 'Estado' },
  { key: 'gestiones', label: 'Gestiones' }
];

const ESTILO_ESTADO = {
  [ESTADOS.CONFIRMADA]: { texto: 'Confirmada', clase: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' },
  [ESTADOS.SUGERIDA]: { texto: 'Sugerida', clase: 'bg-[#2383C2]/10 text-[#1d6fa5] dark:text-blue-300' },
  [ESTADOS.SIN_ASIGNAR]: { texto: 'Sin asignar', clase: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' },
};
const ORDEN_ESTADO = { [ESTADOS.SIN_ASIGNAR]: 0, [ESTADOS.SUGERIDA]: 1, [ESTADOS.CONFIRMADA]: 2 };

// Grupos para el editor de zonas.
const GRUPOS = [
  { titulo: 'Cabeza y tronco', zonas: ['cabeza', 'cara', 'columna_cervical', 'torax', 'abdomen', 'columna_dorsal', 'columna_lumbar', 'pelvis'] },
  { titulo: 'Miembro superior', zonas: ['hombro', 'brazo', 'codo', 'antebrazo', 'muneca', 'mano'] },
  { titulo: 'Miembro inferior', zonas: ['cadera', 'muslo', 'rodilla', 'pierna', 'tobillo', 'pie'] },
];

const fecha = (ts) => (ts?.toDate ? ts.toDate().toLocaleString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');

export const EstadoZona = ({ estado }) => {
  const e = ESTILO_ESTADO[estado] || ESTILO_ESTADO[ESTADOS.SIN_ASIGNAR];
  return <span className={`inline-flex text-[10px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap ${e.clase}`}>{e.texto}</span>;
};

const Modal = ({ titulo, onCerrar, children, ancho = 'max-w-3xl' }) => (
  <div className="fixed inset-0 z-[90] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={titulo}>
    <button type="button" className="absolute inset-0 bg-black/30 cursor-default" aria-label="Cerrar" onClick={onCerrar} />
    <div className={`relative w-full ${ancho} max-h-[92vh] overflow-hidden rounded-xl bg-white dark:bg-gray-800 shadow-2xl flex flex-col`}>
      {children}
    </div>
  </div>
);

// Editor de zonas y lado de una descripción, con el cuerpo como vista previa.
const EditorZonas = ({ entrada, onGuardar, onCerrar, guardando }) => {
  const [sinZona, setSinZona] = useState(esSinZonaEspecifica(entrada.zonas));
  const [zonas, setZonas] = useState((entrada.zonas || []).filter((z) => z !== SIN_ZONA_ESPECIFICA));
  const [lado, setLado] = useState(entrada.lado || 'no_especificado');
  // Una zona real desmarca "Sin zona específica" y viceversa.
  const alternar = (z) => { setSinZona(false); setZonas((prev) => (prev.includes(z) ? prev.filter((x) => x !== z) : [...prev, z])); };
  const alternarSinZona = () => {
    setSinZona((prev) => !prev);
    setZonas([]);
    setLado('no_especificado');
  };
  const ordenadas = ZONAS.map((z) => z.id).filter((z) => zonas.includes(z));
  const resultado = sinZona ? [SIN_ZONA_ESPECIFICA] : ordenadas;
  return (
    <Modal titulo="Asignar zonas" onCerrar={onCerrar}>
      <header className="shrink-0 px-5 py-3.5 border-b border-gray-200 dark:border-gray-700">
        <p className="text-[10.5px] font-semibold uppercase tracking-wide text-[#2383C2]">Asignar zonas</p>
        <h3 className="text-[13.5px] font-bold text-gray-800 dark:text-gray-100 break-words">{entrada.descripcion}</h3>
        {entrada.estado === ESTADOS.SUGERIDA && (
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">Sugerida automáticamente: revisa y guarda para confirmarla.</p>
        )}
      </header>
      <div className="flex-1 overflow-y-auto grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_260px] gap-4 p-5">
        <div className="flex flex-col gap-4">
          <label className={`flex items-start gap-2 text-[11.5px] px-2 py-1.5 rounded-md border cursor-pointer ${sinZona ? 'border-violet-400/50 bg-violet-50 dark:bg-violet-900/20 text-gray-800 dark:text-gray-100' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/40'}`}>
            <input type="checkbox" checked={sinZona} onChange={alternarSinZona} className="accent-violet-600 mt-0.5" />
            <span>
              <b className="font-semibold">{NOMBRE_SIN_ZONA_ESPECIFICA}</b>
              <span className="block text-[10.5px] text-gray-500 dark:text-gray-400">Para diagnósticos sin zona fija (ej. biopsia, reparación de ligamento): cuenta como revisada.</span>
            </span>
          </label>
          {GRUPOS.map((g) => (
            <fieldset key={g.titulo}>
              <legend className="text-[10.5px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1.5">{g.titulo}</legend>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {g.zonas.map((z) => (
                  <label key={z} className={`flex items-center gap-2 text-[11.5px] px-2 py-1.5 rounded-md border cursor-pointer ${zonas.includes(z) ? 'border-[#2383C2]/40 bg-[#2383C2]/5 text-gray-800 dark:text-gray-100' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/40'}`}>
                    <input type="checkbox" checked={zonas.includes(z)} onChange={() => alternar(z)} className="accent-[#2383C2]" />
                    {zonaPorId(z).nombre}
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
          <label className="flex items-center gap-2 text-[11.5px] font-semibold text-gray-700 dark:text-gray-200">
            Lateralidad
            <select value={lado} onChange={(e) => setLado(e.target.value)} aria-label="Lateralidad" disabled={sinZona}
              className="disabled:opacity-50 h-8 px-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-[11.5px] font-normal text-gray-800 dark:text-gray-100">
              {LADOS.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
            </select>
            <span className="font-normal text-[10.5px] text-gray-400">El "Lado" de cada gestión tiene prioridad.</span>
          </label>
        </div>
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-slate-50/60 dark:bg-gray-900/40 p-2">
          <CuerpoCompleto zonas={ordenadas} lado={lado} compacto />
        </div>
      </div>
      <footer className="shrink-0 px-5 py-3 border-t border-gray-200 dark:border-gray-700 flex items-center justify-end gap-2">
        <span className="mr-auto text-[11px] text-gray-500 dark:text-gray-400">
          {resultado.length ? `Quedará Confirmada: ${resultado.map(nombreZona).join(', ')}` : 'Sin zonas: quedará "Sin asignar".'}
        </span>
        <button type="button" onClick={onCerrar} className="h-8 px-3.5 rounded-md border border-gray-300 dark:border-gray-600 text-[12px] font-semibold text-gray-700 dark:text-gray-200">Cancelar</button>
        <button type="button" onClick={() => onGuardar(resultado, sinZona ? 'no_especificado' : lado)} disabled={guardando}
          className="h-8 px-3.5 rounded-md bg-[#2383C2] hover:bg-[#1d6fa5] text-white text-[12px] font-semibold inline-flex items-center gap-1.5 disabled:opacity-50">
          {guardando ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Guardar
        </button>
      </footer>
    </Modal>
  );
};

const Historial = ({ entrada, onCerrar }) => {
  const [logs, setLogs] = useState(null);
  useEffect(() => {
    let activo = true;
    getDocs(query(collection(db, COLECCION, entrada.id, 'logs'), orderBy('fecha', 'desc')))
      .then((s) => { if (activo) setLogs(s.docs.map((d) => ({ id: d.id, ...d.data() }))); })
      .catch((err) => { console.error('Error al leer el historial:', err); if (activo) setLogs([]); });
    return () => { activo = false; };
  }, [entrada.id]);
  const zonas = (ids) => (ids || []).map(nombreZona).join(', ') || '—';
  return (
    <Modal titulo="Historial" onCerrar={onCerrar} ancho="max-w-lg">
      <header className="shrink-0 px-5 py-3.5 border-b border-gray-200 dark:border-gray-700 flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-[10.5px] font-semibold uppercase tracking-wide text-[#2383C2]">Historial</p>
          <h3 className="text-[13px] font-bold text-gray-800 dark:text-gray-100 break-words">{entrada.descripcion}</h3>
        </div>
        <button type="button" onClick={onCerrar} aria-label="Cerrar historial" className="p-1 text-gray-400 hover:text-gray-600"><X size={16} /></button>
      </header>
      <div className="flex-1 overflow-y-auto p-4 text-[11.5px]">
        {logs === null ? <p className="text-gray-400"><Loader2 size={13} className="inline animate-spin mr-1" />Cargando…</p>
          : logs.length === 0 ? <p className="text-gray-400">Sin cambios registrados (creada automáticamente).</p>
            : (
              <ul className="flex flex-col gap-2">
                {logs.map((l) => (
                  <li key={l.id} className="rounded-md border border-gray-200 dark:border-gray-700 px-3 py-2">
                    <p className="font-semibold text-gray-700 dark:text-gray-200">{l.accion === 'CONFIRMACION' ? 'Confirmó la sugerencia' : 'Asignó zonas'} · {l.usuario}</p>
                    <p className="text-gray-500 dark:text-gray-400">{fecha(l.fecha)}</p>
                    <p className="text-gray-600 dark:text-gray-300 mt-1">{zonas(l.antes?.zonas)} ({nombreLado(l.antes?.lado)}) → <b>{zonas(l.despues?.zonas)}</b> ({nombreLado(l.despues?.lado)})</p>
                  </li>
                ))}
              </ul>
            )}
      </div>
    </Modal>
  );
};

const ZonasDiagnostico = ({ busquedaInicial = '' }) => {
  const { userData } = useUser();
  const { showToast } = useToast();
  const { hasPermission } = useGranularPermission();
  const { ver } = useColumnasPermitidas(PATH_VISTA, 'tabla_datos', COLUMNAS);
  const puede = {
    buscar: hasPermission(PATH_VISTA, 'barra_busqueda', 'input_buscar'),
    filtrar: hasPermission(PATH_VISTA, 'barra_busqueda', 'select_estado'),
    editar: hasPermission(PATH_VISTA, 'tabla_datos', 'action_editar'),
    confirmar: hasPermission(PATH_VISTA, 'tabla_datos', 'action_confirmar'),
    historial: hasPermission(PATH_VISTA, 'tabla_datos', 'action_log'),
  };

  const [entradas, setEntradas] = useState(null);
  const [busqueda, setBusqueda] = useState(busquedaInicial);
  const [filtroEstado, setFiltroEstado] = useState('todos');
  const [editando, setEditando] = useState(null);
  const [historial, setHistorial] = useState(null);
  const [guardando, setGuardando] = useState(null);

  useEffect(() => onSnapshot(
    collection(db, COLECCION),
    (snap) => setEntradas(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => { console.error('Error al leer las zonas por diagnóstico:', err); setEntradas([]); }
  ), []);

  const lista = useMemo(() => {
    const q = normalizarDescripcion(busqueda);
    return (entradas || [])
      .filter((e) => filtroEstado === 'todos' || (filtroEstado === SIN_ZONA_ESPECIFICA ? esSinZonaEspecifica(e.zonas) : e.estado === filtroEstado))
      .filter((e) => !q || e.descripcion?.includes(q))
      .sort((a, b) => (ORDEN_ESTADO[a.estado] ?? 0) - (ORDEN_ESTADO[b.estado] ?? 0) || (b.gestiones || 0) - (a.gestiones || 0) || a.descripcion.localeCompare(b.descripcion));
  }, [entradas, busqueda, filtroEstado]);
  const cuenta = (estado) => (entradas || []).filter((e) => e.estado === estado).length;

  const guardar = async (entrada, zonas, lado, accion = 'EDICION') => {
    setGuardando(entrada.id);
    try {
      const despues = { zonas, lado, estado: zonas.length ? ESTADOS.CONFIRMADA : ESTADOS.SIN_ASIGNAR };
      await updateDoc(doc(db, COLECCION, entrada.id), {
        ...despues, actualizadoPor: userData?.nombreCompleto || 'Usuario', actualizadoPorUid: userData?.uid || null, actualizadoEl: serverTimestamp(),
      });
      await addDoc(collection(db, COLECCION, entrada.id, 'logs'), {
        accion, antes: { zonas: entrada.zonas || [], lado: entrada.lado || 'no_especificado', estado: entrada.estado || ESTADOS.SIN_ASIGNAR }, despues,
        usuario: userData?.nombreCompleto || 'Usuario', usuarioUid: userData?.uid || null, fecha: serverTimestamp(),
      });
      showToast(esSinZonaEspecifica(zonas) ? 'Guardada como "Sin zona específica".' : zonas.length ? 'Zonas guardadas y confirmadas.' : 'La descripción quedó sin zonas asignadas.', 'success');
      setEditando(null);
    } catch (err) {
      console.error('Error al guardar las zonas:', err);
      showToast('No se pudieron guardar las zonas.', 'error');
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
        <span className="w-8 h-8 rounded-lg bg-[#2383C2] text-white flex items-center justify-center shrink-0"><PersonStanding size={16} /></span>
        <div className="min-w-0 mr-auto">
          <h2 className="text-[14px] font-bold leading-tight text-gray-800 dark:text-gray-100">Zonas por diagnóstico</h2>
          <p className="text-[11px] text-gray-500 dark:text-gray-400">Zona del cuerpo de cada descripción de las gestiones de Implantes (Bodymap). Las descripciones nuevas aparecen solas.</p>
        </div>
        {entradas && (
          <span className="flex items-center gap-2 text-[11px]">
            <EstadoZona estado={ESTADOS.SIN_ASIGNAR} /> {cuenta(ESTADOS.SIN_ASIGNAR)}
            <EstadoZona estado={ESTADOS.SUGERIDA} /> {cuenta(ESTADOS.SUGERIDA)}
            <EstadoZona estado={ESTADOS.CONFIRMADA} /> {cuenta(ESTADOS.CONFIRMADA)}
            <span className="text-gray-500 dark:text-gray-400">(de ellas, {(entradas || []).filter((e) => esSinZonaEspecifica(e.zonas)).length} sin zona específica)</span>
          </span>
        )}
        {puede.filtrar && (
          <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)} aria-label="Filtrar por estado"
            className="h-7 px-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-[11.5px] text-gray-800 dark:text-gray-100">
            <option value="todos">Todos los estados</option>
            <option value={ESTADOS.SIN_ASIGNAR}>Sin asignar</option>
            <option value={ESTADOS.SUGERIDA}>Sugerida</option>
            <option value={ESTADOS.CONFIRMADA}>Confirmada</option>
            <option value={SIN_ZONA_ESPECIFICA}>{NOMBRE_SIN_ZONA_ESPECIFICA}</option>
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
                {columnas.map((c) => <th key={c.key} className={`${encabezado} ${c.key === 'gestiones' ? 'text-right' : ''}`}>{c.label}</th>)}
                <th className={`${encabezado} text-center`}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {lista.length === 0 && (
                <tr><td colSpan={columnas.length + 1} className="py-10 text-center text-gray-400">{entradas.length ? 'Ninguna descripción coincide con el filtro.' : 'Aún no hay descripciones: se cargan con el script inicial y luego solas.'}</td></tr>
              )}
              {lista.map((e) => {
                const sinZona = !e.zonas?.length;
                return (
                  <tr key={e.id} data-estado={e.estado} className={sinZona ? 'bg-amber-50/70 dark:bg-amber-900/10' : 'hover:bg-gray-50 dark:hover:bg-gray-700/30'}>
                    <td className={`${celda} font-medium text-gray-800 dark:text-gray-100`}>
                      <span className="inline-flex items-center gap-1.5">{sinZona && <AlertTriangle size={12} className="text-amber-600 shrink-0" aria-label="Sin zona asignada" />}{e.descripcion}</span>
                    </td>
                    {ver('zonas') && (
                      <td className={celda}>
                        {sinZona ? <span className="text-amber-700 dark:text-amber-400">—</span> : (
                          <span className="flex flex-wrap gap-1">
                            {e.zonas.map((z) => <span key={z} className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${z === SIN_ZONA_ESPECIFICA ? 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300' : 'bg-slate-100 dark:bg-gray-700 text-slate-700 dark:text-gray-200'}`}>{nombreZona(z)}</span>)}
                          </span>
                        )}
                      </td>
                    )}
                    {ver('lado') && <td className={`${celda} text-gray-600 dark:text-gray-300 whitespace-nowrap`}>{nombreLado(e.lado)}</td>}
                    {ver('estado') && <td className={celda}><EstadoZona estado={e.estado} /></td>}
                    {ver('gestiones') && <td className={`${celda} text-right tabular-nums`}>{e.gestiones ?? 0}</td>}
                    <td className="px-3 py-1.5 border-b border-gray-100 dark:border-gray-700/60">
                      <span className="flex justify-center gap-2">
                        {puede.confirmar && e.estado === ESTADOS.SUGERIDA && (
                          <button type="button" onClick={() => guardar(e, e.zonas || [], e.lado || 'no_especificado', 'CONFIRMACION')} disabled={guardando === e.id}
                            title="Confirmar la sugerencia" aria-label={`Confirmar ${e.descripcion}`} className="text-green-600 hover:text-green-800 disabled:opacity-50"><Check size={14} /></button>
                        )}
                        {puede.editar && (
                          <button type="button" onClick={() => setEditando(e)} title="Asignar / corregir zonas" aria-label={`Editar ${e.descripcion}`} className="text-blue-600 dark:text-blue-400 hover:text-blue-800"><Pencil size={13} /></button>
                        )}
                        {puede.historial && (
                          <button type="button" onClick={() => setHistorial(e)} title="Ver historial" aria-label={`Historial de ${e.descripcion}`} className="text-gray-500 hover:text-[#2383C2]"><History size={13} /></button>
                        )}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {editando && <EditorZonas entrada={editando} guardando={guardando === editando.id} onCerrar={() => setEditando(null)} onGuardar={(z, l) => guardar(editando, z, l)} />}
      {historial && <Historial entrada={historial} onCerrar={() => setHistorial(null)} />}
    </div>
  );
};

export default ZonasDiagnostico;
