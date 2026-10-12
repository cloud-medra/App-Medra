import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, onSnapshot } from 'firebase/firestore';
import {
  BellRing, Plus, Pencil, Trash2, Power, History, Loader2, X, Save, Search, ShieldAlert, AlertTriangle, CheckCircle2,
} from 'lucide-react';
import { db } from '../../../../firebaseConfig';
import { useUser } from '../../../../context/UserContext';
import { useToast } from '../../../../context/ToastContext';
import { useModal } from '../../../../context/ModalContext';
import { useGranularPermission } from '../../../../hooks/useGranularPermission';
import {
  DIAS_SEMANA, MAX_TITULO, MAX_DESCRIPCION, RUTA_MIS_RECORDATORIOS, RUTA_ADMINISTRAR_RECORDATORIOS,
  validarTarea, textoDias, fechaEnSantiago, puedeRecibirRecordatorios,
} from './recordatoriosConfig';
import {
  refTareas, consultaTareasDe, crearTarea, actualizarTarea, cambiarActivaTarea, borrarTarea, leerHistorialTarea,
} from './recordatoriosServicio';
import { useRecordatoriosPendientes } from './useRecordatoriosPendientes';

const FORM_VACIO = { titulo: '', descripcion: '', dias: [], asignados: [] };
const nombreUsuario = (u) => u?.nombreCompleto || u?.email || u?.id || 'Usuario';
const formatoFecha = (f) => String(f || '').split('-').reverse().join('-');
const formatoHora = (ts) => (ts?.toDate ? ts.toDate().toLocaleString('es-CL', { timeZone: 'America/Santiago' }) : '—');

const Pestana = ({ activa, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    className={`px-3 py-1.5 text-[11px] font-semibold border-b-2 transition ${activa
      ? 'border-[#2383C2] text-[#2383C2]'
      : 'border-transparent text-slate-500 dark:text-gray-400 hover:text-slate-700 dark:hover:text-gray-200'}`}
  >
    {children}
  </button>
);

// --- Mis recordatorios: tareas asignadas al usuario conectado ---
const MisRecordatorios = ({ uid }) => {
  const [tareas, setTareas] = useState(null);
  const { pendientes } = useRecordatoriosPendientes();
  const pendientesPorTarea = useMemo(() => new Map(pendientes.map((p) => [p.tarea.id, p])), [pendientes]);

  useEffect(() => onSnapshot(
    consultaTareasDe(db, uid),
    (snap) => setTareas(snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((t) => t.activa !== false)),
    (err) => { console.error('Error al leer mis recordatorios:', err); setTareas([]); }
  ), [uid]);

  if (tareas === null) return <p className="p-4 text-slate-400 flex items-center gap-1.5"><Loader2 size={13} className="animate-spin" /> Cargando…</p>;
  if (tareas.length === 0) return <p className="p-4 text-slate-400">No tienes recordatorios asignados.</p>;

  return (
    <ul className="p-3 space-y-1.5 max-w-3xl">
      {tareas.sort((a, b) => a.titulo.localeCompare(b.titulo)).map((t) => {
        const p = pendientesPorTarea.get(t.id);
        return (
          <li key={t.id} className="flex items-start gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800">
            <div className="min-w-0 flex-grow">
              <p className="font-semibold">{t.titulo}</p>
              {t.descripcion && <p className="text-[10.5px] text-slate-500 dark:text-gray-400 whitespace-pre-wrap">{t.descripcion}</p>}
              <p className="text-[10px] text-slate-400 mt-0.5">{textoDias(t.dias)}</p>
            </div>
            {p ? (
              <span className={`shrink-0 text-[10px] font-bold uppercase ${p.atrasada ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'}`}>
                {p.atrasada ? 'Atrasada' : 'Pendiente hoy'}
              </span>
            ) : (
              <span className="shrink-0 flex items-center gap-1 text-[10px] font-bold uppercase text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 size={11} /> Al día
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
};

// --- Historial de Realizados de una tarea ---
const HistorialTarea = ({ tarea, usuariosPorId }) => {
  const [filas, setFilas] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    let vigente = true;
    leerHistorialTarea(db, tarea)
      .then((r) => { if (vigente) setFilas(r); })
      .catch((err) => { console.error('Error al leer el historial:', err); if (vigente) setError('No se pudo cargar el historial.'); });
    return () => { vigente = false; };
  }, [tarea]);

  if (error) return <p className="text-red-600 text-[10px]">{error}</p>;
  if (filas === null) return <p className="text-slate-400 text-[10px] flex items-center gap-1"><Loader2 size={11} className="animate-spin" /> Cargando historial…</p>;
  if (filas.length === 0) return <p className="text-slate-400 text-[10px]">Aún no se ha marcado como realizada.</p>;
  return (
    <ul className="text-[10px] divide-y divide-slate-100 dark:divide-gray-700/60">
      {filas.map((f) => (
        <li key={`${f.uid}_${f.id}`} className="py-1 flex gap-3">
          <span className="font-num w-20 shrink-0">{formatoFecha(f.fecha)}</span>
          <span className="flex-grow">{usuariosPorId.get(f.uid) ? nombreUsuario(usuariosPorId.get(f.uid)) : (f.usuarioNombre || f.uid)}</span>
          <span className="text-slate-400">Realizado: {formatoHora(f.realizadoEn)}</span>
        </li>
      ))}
    </ul>
  );
};

// --- Formulario de tarea ---
const FormularioTarea = ({ inicial, usuarios, guardando, onGuardar, onCancelar }) => {
  const [form, setForm] = useState(inicial);
  const [errores, setErrores] = useState({});
  const [filtro, setFiltro] = useState('');

  const usuariosFiltrados = usuarios.filter((u) => {
    const t = filtro.trim().toLowerCase();
    return !t || nombreUsuario(u).toLowerCase().includes(t) || String(u.email || '').toLowerCase().includes(t);
  });
  const alternar = (campo, valor) => setForm((f) => ({
    ...f, [campo]: f[campo].includes(valor) ? f[campo].filter((v) => v !== valor) : [...f[campo], valor],
  }));

  const enviar = (e) => {
    e.preventDefault();
    const err = validarTarea(form);
    setErrores(err);
    if (Object.keys(err).length === 0) onGuardar(form);
  };

  const error = (campo) => errores[campo] && <p className="text-red-600 dark:text-red-400 text-[10px] mt-0.5">{errores[campo]}</p>;

  return (
    <form onSubmit={enviar} className="p-3 rounded-lg border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 space-y-2.5">
      <div>
        <label htmlFor="rec-titulo" className="block font-semibold mb-0.5">Título</label>
        <input id="rec-titulo" value={form.titulo} maxLength={MAX_TITULO} onChange={(e) => setForm({ ...form, titulo: e.target.value })}
          placeholder="Ej: Revisar facturas" className="w-full h-7 px-2 rounded border border-slate-300 dark:border-gray-600 bg-transparent outline-none focus:border-[#2383C2]" />
        {error('titulo')}
      </div>
      <div>
        <label htmlFor="rec-descripcion" className="block font-semibold mb-0.5">Descripción <span className="font-normal text-slate-400">(opcional)</span></label>
        <textarea id="rec-descripcion" value={form.descripcion} maxLength={MAX_DESCRIPCION} rows={2} onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
          className="w-full px-2 py-1 rounded border border-slate-300 dark:border-gray-600 bg-transparent outline-none focus:border-[#2383C2]" />
        {error('descripcion')}
      </div>
      <fieldset>
        <legend className="font-semibold mb-1">Se repite los días</legend>
        <div className="flex flex-wrap gap-1">
          {DIAS_SEMANA.map((d) => (
            <button key={d.valor} type="button" aria-pressed={form.dias.includes(d.valor)} onClick={() => alternar('dias', d.valor)}
              className={`px-2.5 py-1 rounded-full border text-[10.5px] font-semibold transition ${form.dias.includes(d.valor)
                ? 'bg-[#2383C2] border-[#2383C2] text-white'
                : 'border-slate-300 dark:border-gray-600 text-slate-600 dark:text-gray-300 hover:border-[#2383C2]'}`}>
              {d.label}
            </button>
          ))}
        </div>
        {error('dias')}
      </fieldset>
      <fieldset>
        <legend className="font-semibold mb-1">Usuarios asignados ({form.asignados.length})</legend>
        <div className="relative mb-1 max-w-xs">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Buscar usuario…" aria-label="Buscar usuario"
            className="w-full h-7 pl-6 pr-2 rounded border border-slate-300 dark:border-gray-600 bg-transparent outline-none focus:border-[#2383C2]" />
        </div>
        <div className="max-h-44 overflow-y-auto rounded border border-slate-200 dark:border-gray-700 divide-y divide-slate-100 dark:divide-gray-700/60">
          {usuariosFiltrados.map((u) => {
            const recibe = puedeRecibirRecordatorios({ ...u, uid: u.id });
            return (
              <label key={u.id} className="flex items-center gap-2 px-2 py-1 cursor-pointer hover:bg-slate-50 dark:hover:bg-gray-700/40">
                <input type="checkbox" checked={form.asignados.includes(u.id)} onChange={() => alternar('asignados', u.id)} />
                <span className="flex-grow">{nombreUsuario(u)} <span className="text-slate-400">{u.email}</span></span>
                {!recibe && (
                  <span className="flex items-center gap-1 text-[9.5px] text-amber-600 dark:text-amber-400" title='Dale la pestaña "Mis recordatorios" en el formulario de usuarios'>
                    <AlertTriangle size={10} /> Sin permiso: no lo verá
                  </span>
                )}
              </label>
            );
          })}
        </div>
        {error('asignados')}
      </fieldset>
      <div className="flex gap-2">
        <button type="submit" disabled={guardando} className="h-7 px-3 rounded bg-[#2383C2] hover:bg-[#1d6fa5] text-white font-semibold flex items-center gap-1.5 disabled:opacity-60">
          {guardando ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Guardar
        </button>
        <button type="button" onClick={onCancelar} className="h-7 px-3 rounded border border-slate-300 dark:border-gray-600 flex items-center gap-1.5">
          <X size={12} /> Cancelar
        </button>
      </div>
    </form>
  );
};

// --- Administrar tareas ---
const AdministrarRecordatorios = ({ userData }) => {
  const { showToast } = useToast();
  const { confirmAction } = useModal();
  const [tareas, setTareas] = useState(null);
  const [usuarios, setUsuarios] = useState([]);
  const [editando, setEditando] = useState(null); // null | 'nueva' | tarea
  const [guardando, setGuardando] = useState(false);
  const [historialAbierto, setHistorialAbierto] = useState(null);

  useEffect(() => onSnapshot(
    refTareas(db),
    (snap) => setTareas(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => { console.error('Error al leer las tareas:', err); setTareas([]); }
  ), []);

  useEffect(() => {
    getDocs(collection(db, 'usuarios'))
      .then((snap) => setUsuarios(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => nombreUsuario(a).localeCompare(nombreUsuario(b)))))
      .catch((err) => console.error('Error al leer usuarios:', err));
  }, []);

  const usuariosPorId = useMemo(() => new Map(usuarios.map((u) => [u.id, u])), [usuarios]);

  const guardar = async (form) => {
    setGuardando(true);
    try {
      if (editando === 'nueva') {
        await crearTarea(db, form, { desde: fechaEnSantiago(), creadoPor: userData?.nombreCompleto || userData?.email || '' });
        showToast('Recordatorio creado', 'success');
      } else {
        await actualizarTarea(db, editando.id, { ...form, activa: editando.activa !== false });
        showToast('Recordatorio actualizado', 'success');
      }
      setEditando(null);
    } catch (err) {
      console.error('Error al guardar el recordatorio:', err);
      showToast('No se pudo guardar el recordatorio', 'error');
    } finally {
      setGuardando(false);
    }
  };

  const alternarActiva = async (t) => {
    try {
      await cambiarActivaTarea(db, t.id, t.activa === false);
    } catch (err) {
      console.error('Error al cambiar el estado:', err);
      showToast('No se pudo cambiar el estado', 'error');
    }
  };

  const borrar = (t) => confirmAction(
    'Borrar recordatorio',
    `¿Borrar "${t.titulo}"? Deja de aparecer para todos sus usuarios. El historial de Realizados se conserva.`,
    async () => {
      try {
        await borrarTarea(db, t.id);
        showToast('Recordatorio borrado', 'info');
      } catch (err) {
        console.error('Error al borrar el recordatorio:', err);
        showToast('No se pudo borrar', 'error');
      }
    },
    { confirmText: 'Borrar', type: 'danger' }
  );

  const lista = (tareas || []).slice().sort((a, b) => (a.activa === false) - (b.activa === false) || a.titulo.localeCompare(b.titulo));

  return (
    <div className="p-3 space-y-3 max-w-4xl">
      {editando ? (
        <FormularioTarea
          key={editando === 'nueva' ? 'nueva' : editando.id}
          inicial={editando === 'nueva' ? FORM_VACIO : {
            titulo: editando.titulo, descripcion: editando.descripcion || '', dias: editando.dias || [], asignados: editando.asignados || [],
          }}
          usuarios={usuarios}
          guardando={guardando}
          onGuardar={guardar}
          onCancelar={() => setEditando(null)}
        />
      ) : (
        <button type="button" onClick={() => setEditando('nueva')}
          className="h-7 px-3 rounded bg-[#2383C2] hover:bg-[#1d6fa5] text-white font-semibold flex items-center gap-1.5">
          <Plus size={13} /> Nuevo recordatorio
        </button>
      )}

      {tareas === null ? (
        <p className="text-slate-400 flex items-center gap-1.5"><Loader2 size={13} className="animate-spin" /> Cargando…</p>
      ) : lista.length === 0 ? (
        <p className="text-slate-400">Aún no hay recordatorios.</p>
      ) : (
        <ul className="space-y-1.5">
          {lista.map((t) => (
            <li key={t.id} className={`rounded-lg border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 ${t.activa === false ? 'opacity-60' : ''}`}>
              <div className="flex items-start gap-2 px-3 py-2">
                <div className="min-w-0 flex-grow">
                  <p className="font-semibold">
                    {t.titulo}
                    {t.activa === false && <span className="ml-2 text-[9.5px] font-bold uppercase text-slate-400">Desactivado</span>}
                  </p>
                  {t.descripcion && <p className="text-[10.5px] text-slate-500 dark:text-gray-400 whitespace-pre-wrap">{t.descripcion}</p>}
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    {textoDias(t.dias)} · {(t.asignados || []).map((uid) => nombreUsuario(usuariosPorId.get(uid) || { id: uid })).join(', ')}
                  </p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button type="button" onClick={() => setHistorialAbierto(historialAbierto === t.id ? null : t.id)} title="Historial de Realizados" aria-label={`Historial de ${t.titulo}`}
                    className="p-1 rounded text-slate-500 hover:text-[#2383C2] hover:bg-slate-100 dark:hover:bg-gray-700"><History size={13} /></button>
                  <button type="button" onClick={() => setEditando(t)} title="Editar" aria-label={`Editar ${t.titulo}`}
                    className="p-1 rounded text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30"><Pencil size={13} /></button>
                  <button type="button" onClick={() => alternarActiva(t)} title={t.activa === false ? 'Activar' : 'Desactivar'} aria-label={`${t.activa === false ? 'Activar' : 'Desactivar'} ${t.titulo}`}
                    className={`p-1 rounded hover:bg-slate-100 dark:hover:bg-gray-700 ${t.activa === false ? 'text-emerald-600' : 'text-amber-600'}`}><Power size={13} /></button>
                  <button type="button" onClick={() => borrar(t)} title="Borrar" aria-label={`Borrar ${t.titulo}`}
                    className="p-1 rounded text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"><Trash2 size={13} /></button>
                </div>
              </div>
              {historialAbierto === t.id && (
                <div className="px-3 pb-2 border-t border-slate-100 dark:border-gray-700/60 pt-1.5">
                  <HistorialTarea tarea={t} usuariosPorId={usuariosPorId} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

// Administración → Recordatorios. Dos pestañas, asignables por separado en
// el formulario de usuarios: "Mis recordatorios" (recibe) y "Administrar
// tareas" (crear/editar/desactivar/borrar e historial). Admin y dev: ambas.
const Recordatorios = () => {
  const { userData } = useUser();
  const { hasAccesoProceso } = useGranularPermission();
  const verMis = hasAccesoProceso(RUTA_MIS_RECORDATORIOS);
  const verAdministrar = hasAccesoProceso(RUTA_ADMINISTRAR_RECORDATORIOS);
  const [pestana, setPestana] = useState(null);
  const actual = pestana || (verAdministrar ? 'administrar' : 'mis');

  return (
    <div className="w-full h-full flex flex-col bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm overflow-hidden text-[11px] text-slate-700 dark:text-gray-200">
      <div className="px-3 py-2 flex items-center gap-1.5 border-b border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/80">
        <BellRing size={15} className="text-[#2383C2]" />
        <h2 className="text-[12px] font-bold">RECORDATORIOS</h2>
      </div>
      {!verMis && !verAdministrar ? (
        <div className="p-6 flex items-center gap-2 text-amber-700 dark:text-amber-400">
          <ShieldAlert size={16} /> Tu perfil no tiene ninguna pestaña de Recordatorios.
        </div>
      ) : (
        <>
          <div className="flex gap-1 px-2 border-b border-gray-200 dark:border-gray-700">
            {verAdministrar && <Pestana activa={actual === 'administrar'} onClick={() => setPestana('administrar')}>Administrar tareas</Pestana>}
            {verMis && <Pestana activa={actual === 'mis'} onClick={() => setPestana('mis')}>Mis recordatorios</Pestana>}
          </div>
          <div className="flex-grow overflow-y-auto bg-slate-50/50 dark:bg-gray-900">
            {actual === 'administrar' && verAdministrar && <AdministrarRecordatorios userData={userData} />}
            {actual === 'mis' && verMis && <MisRecordatorios uid={userData?.uid} />}
          </div>
        </>
      )}
    </div>
  );
};

export default Recordatorios;
