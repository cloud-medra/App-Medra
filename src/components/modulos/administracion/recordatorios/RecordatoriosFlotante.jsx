import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { BellRing, Check, Clock, GripHorizontal, Loader2, Minus, AlertTriangle } from 'lucide-react';
import { db } from '../../../../firebaseConfig';
import { useUser } from '../../../../context/UserContext';
import { useToast } from '../../../../context/ToastContext';
import { obtenerNombreMostrar } from '../../../../utils/nombreMostrar';
import { useRecordatoriosPendientes } from './useRecordatoriosPendientes';
import { marcarRealizado } from './recordatoriosServicio';
import {
  limitarPosicion, clavePosicion, claveMinimizado, claveAbiertasPorHora, textoAtrasada, idRealizado,
} from './recordatoriosConfig';

const ANCHO = 300;
// Movimiento mínimo (px) para que soltar el ícono minimizado no cuente como clic.
const UMBRAL_ARRASTRE = 4;

const leerJSON = (clave, defecto) => {
  try {
    const v = localStorage.getItem(clave);
    return v === null ? defecto : JSON.parse(v);
  } catch {
    return defecto;
  }
};
const guardarJSON = (clave, valor) => {
  try { localStorage.setItem(clave, JSON.stringify(valor)); } catch { /* almacenamiento lleno o bloqueado */ }
};

const ventana = () => ({ anchoVentana: window.innerWidth, altoVentana: window.innerHeight });

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

// Recuadro flotante (presentación). `pendientes`: [{ tarea, fecha, hora,
// atrasada }], atrasadas primero. Se arrastra desde su barra (o el ícono,
// minimizado) sin salir de la ventana; posición y minimizado se recuerdan
// por usuario (localStorage). Sin pendientes no se muestra. No se puede
// cerrar: solo minimizar, y se vuelve a abrir solo cuando aparece una tarea
// de hoy con hora (al llegar esa hora).
export const RecordatoriosFlotanteVista = ({ uid, pendientes, onRealizado, marcando = null }) => {
  const cajaRef = useRef(null);
  const arrastreRef = useRef(null);
  const [minimizado, setMinimizado] = useState(() => leerJSON(claveMinimizado(uid), false));
  const [posicion, setPosicion] = useState(() => leerJSON(clavePosicion(uid), null));

  // Repeticiones de hoy con hora que ya están a la vista: si alguna no había
  // abierto el recuadro antes, lo abre (aunque esté minimizado). Se guarda
  // cuáles ya lo abrieron para no reabrirlo cada vez que se minimiza (ni al
  // recargar). Sin ninguna a la vista (p. ej. mientras cargan) no se toca.
  const clavesConHora = pendientes.filter((p) => !p.atrasada && p.hora).map((p) => idRealizado(p.tarea.id, p.fecha)).join('|');
  const [clavesRevisadas, setClavesRevisadas] = useState('');
  if (clavesConHora && clavesConHora !== clavesRevisadas) {
    setClavesRevisadas(clavesConHora);
    const yaAbiertas = leerJSON(claveAbiertasPorHora(uid), []);
    if (clavesConHora.split('|').some((c) => !yaAbiertas.includes(c))) setMinimizado(false);
  }
  useEffect(() => {
    if (clavesConHora) guardarJSON(claveAbiertasPorHora(uid), clavesConHora.split('|'));
  }, [uid, clavesConHora]);
  useEffect(() => { guardarJSON(claveMinimizado(uid), minimizado); }, [uid, minimizado]);

  // Dentro de la ventana con el tamaño real del recuadro (al montarse, al
  // minimizar/expandir, al cambiar la lista y al redimensionar la ventana).
  const ajustar = useCallback(() => {
    const caja = cajaRef.current;
    if (!caja) return;
    const { width, height } = caja.getBoundingClientRect();
    setPosicion((prev) => {
      const base = prev || { x: window.innerWidth - ANCHO - 16, y: window.innerHeight - height - 16 };
      const nueva = limitarPosicion(base, { ancho: width, alto: height }, ventana());
      return prev && nueva.x === prev.x && nueva.y === prev.y ? prev : nueva;
    });
  }, []);

  const hayPendientes = pendientes.length > 0;
  useLayoutEffect(() => { if (hayPendientes) ajustar(); }, [ajustar, hayPendientes, minimizado, pendientes.length]);
  useEffect(() => {
    window.addEventListener('resize', ajustar);
    return () => window.removeEventListener('resize', ajustar);
  }, [ajustar]);

  useEffect(() => { if (posicion) guardarJSON(clavePosicion(uid), posicion); }, [uid, posicion]);

  const alternarMinimizado = (valor) => setMinimizado(valor);

  const iniciarArrastre = (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    const caja = cajaRef.current;
    if (!caja || !posicion) return;
    const { width, height } = caja.getBoundingClientRect();
    arrastreRef.current = { dx: e.clientX - posicion.x, dy: e.clientY - posicion.y, x0: e.clientX, y0: e.clientY, movio: false, ancho: width, alto: height };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const moverArrastre = (e) => {
    const a = arrastreRef.current;
    if (!a) return;
    if (Math.abs(e.clientX - a.x0) + Math.abs(e.clientY - a.y0) > UMBRAL_ARRASTRE) a.movio = true;
    setPosicion(limitarPosicion({ x: e.clientX - a.dx, y: e.clientY - a.dy }, { ancho: a.ancho, alto: a.alto }, ventana()));
  };
  const terminarArrastre = () => {
    const movio = arrastreRef.current?.movio;
    arrastreRef.current = null;
    return movio;
  };
  const eventosArrastre = { onPointerDown: iniciarArrastre, onPointerMove: moverArrastre };

  if (!hayPendientes) return null;

  const estilo = posicion
    ? { left: posicion.x, top: posicion.y }
    : { right: 16, bottom: 16, visibility: 'hidden' };
  const atrasadas = pendientes.filter((p) => p.atrasada).length;
  const textoPendientes = plural(pendientes.length, 'tarea pendiente', 'tareas pendientes');

  if (minimizado) {
    return (
      <button
        ref={cajaRef}
        type="button"
        style={estilo}
        {...eventosArrastre}
        onPointerUp={(e) => { if (!terminarArrastre()) alternarMinimizado(false); e.currentTarget.releasePointerCapture?.(e.pointerId); }}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); alternarMinimizado(false); } }}
        aria-label={`Recordatorios: ${pendientes.length} pendiente(s)${atrasadas ? `, ${atrasadas} atrasada(s)` : ''}. Abrir`}
        title={`${textoPendientes}${atrasadas ? ` (${plural(atrasadas, 'atrasada', 'atrasadas')})` : ''} — arrastra para mover, clic para abrir`}
        data-atrasadas={atrasadas > 0 || undefined}
        className={`fixed z-[90] w-12 h-12 rounded-full backdrop-blur-sm text-white shadow-lg border-2 border-white flex items-center justify-center touch-none cursor-grab active:cursor-grabbing select-none ${atrasadas
          ? 'bg-red-600/95 ring-4 ring-red-500/40 animate-pulse'
          : 'bg-[#2383C2]/90 ring-4 ring-[#2383C2]/30'}`}
      >
        <BellRing size={19} />
        <span className={`absolute -top-1.5 -right-1.5 min-w-[20px] h-[20px] px-1 rounded-full border-2 border-white text-[10.5px] font-bold flex items-center justify-center ${atrasadas ? 'bg-red-700' : 'bg-amber-500'}`}>
          {pendientes.length}
        </span>
      </button>
    );
  }

  return (
    <section
      ref={cajaRef}
      style={{ ...estilo, width: ANCHO }}
      aria-label="Recordatorios de hoy"
      data-atrasadas={atrasadas > 0 || undefined}
      className={`fixed z-[90] max-h-[60vh] flex flex-col rounded-xl overflow-hidden border-2 bg-white/90 dark:bg-gray-900/90 backdrop-blur-md shadow-2xl text-[11px] text-slate-800 dark:text-gray-100 ${atrasadas
        ? 'border-red-500 ring-4 ring-red-500/30'
        : 'border-[#2383C2] ring-4 ring-[#2383C2]/20'}`}
    >
      <div
        {...eventosArrastre}
        onPointerUp={(e) => { terminarArrastre(); e.currentTarget.releasePointerCapture?.(e.pointerId); }}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 text-white cursor-grab active:cursor-grabbing touch-none select-none ${atrasadas ? 'bg-red-600' : 'bg-[#2383C2]'}`}
        title="Arrastra para mover"
      >
        <GripHorizontal size={13} className="text-white/70 shrink-0" />
        <BellRing size={14} className="shrink-0" />
        <div className="min-w-0">
          <h2 className="font-bold text-[11.5px] uppercase tracking-wide leading-tight">{textoPendientes}</h2>
          {atrasadas > 0 && (
            <p className="text-[10px] font-semibold leading-tight">{plural(atrasadas, 'atrasada', 'atrasadas')}: márcalas como realizadas</p>
          )}
        </div>
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => alternarMinimizado(true)}
          aria-label="Minimizar recordatorios"
          title="Minimizar"
          className="ml-auto p-0.5 rounded text-white/90 hover:text-white hover:bg-white/20"
        >
          <Minus size={14} />
        </button>
      </div>
      <ul className="overflow-y-auto p-1.5 space-y-1">
        {pendientes.map(({ tarea, fecha, hora, atrasada }) => {
          const clave = idRealizado(tarea.id, fecha);
          return (
            <li
              key={clave}
              data-atrasada={atrasada || undefined}
              className={`flex items-start gap-2 px-2 py-1.5 rounded-lg border ${atrasada
                ? 'bg-red-50 dark:bg-red-950/60 border-red-300 dark:border-red-800 text-red-700 dark:text-red-300'
                : 'bg-white dark:bg-gray-800 border-slate-200 dark:border-gray-700'}`}
            >
              <div className="min-w-0 flex-grow">
                <p className="font-semibold leading-snug break-words">
                  {hora && (
                    <span className={`mr-1 inline-flex items-center gap-0.5 font-num text-[10px] font-bold ${atrasada ? '' : 'text-[#2383C2]'}`}>
                      <Clock size={10} /> {hora}
                    </span>
                  )}
                  {tarea.titulo}
                </p>
                {tarea.descripcion && (
                  <p className={`text-[10px] break-words whitespace-pre-wrap ${atrasada ? 'text-red-600/90 dark:text-red-300/90' : 'text-slate-600 dark:text-gray-300'}`}>{tarea.descripcion}</p>
                )}
                {atrasada && (
                  <p className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-bold text-red-600 dark:text-red-400">
                    <AlertTriangle size={10} /> {textoAtrasada(fecha)}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => onRealizado({ tarea, fecha })}
                disabled={marcando === clave}
                aria-label={`Marcar "${tarea.titulo}"${atrasada ? ` del ${fecha.split('-').reverse().join('-')}` : ''} como realizado`}
                className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-600/90 hover:bg-emerald-600 text-white font-semibold text-[10px] disabled:opacity-60"
              >
                {marcando === clave ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />} Realizado
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
};

// Montado en el marco de la app (Dashboard.jsx): aparece en todas las vistas.
const RecordatoriosFlotante = () => {
  const { userData } = useUser();
  const { showToast } = useToast();
  const { pendientes, habilitado } = useRecordatoriosPendientes();
  const [marcando, setMarcando] = useState(null);

  if (!habilitado || !userData?.uid) return null;

  const handleRealizado = async ({ tarea, fecha }) => {
    setMarcando(idRealizado(tarea.id, fecha));
    try {
      await marcarRealizado(db, { uid: userData.uid, usuarioNombre: obtenerNombreMostrar(userData), tarea, fecha });
    } catch (err) {
      console.error('Error al marcar el recordatorio:', err);
      showToast('No se pudo marcar como realizado', 'error');
    } finally {
      setMarcando(null);
    }
  };

  return <RecordatoriosFlotanteVista uid={userData.uid} pendientes={pendientes} onRealizado={handleRealizado} marcando={marcando} />;
};

export default RecordatoriosFlotante;
