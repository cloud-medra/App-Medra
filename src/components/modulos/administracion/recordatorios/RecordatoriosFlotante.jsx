import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { BellRing, Check, GripHorizontal, Loader2, Minus, AlertTriangle } from 'lucide-react';
import { db } from '../../../../firebaseConfig';
import { useUser } from '../../../../context/UserContext';
import { useToast } from '../../../../context/ToastContext';
import { obtenerNombreMostrar } from '../../../../utils/nombreMostrar';
import { useRecordatoriosPendientes } from './useRecordatoriosPendientes';
import { marcarRealizado } from './recordatoriosServicio';
import {
  limitarPosicion, clavePosicion, claveMinimizado, nombreDia, idRealizado,
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

// Recuadro flotante (presentación). `pendientes`: [{ tarea, fecha, atrasada }].
// Se arrastra desde su barra (o el ícono, minimizado) sin salir de la
// ventana; posición y minimizado se recuerdan por usuario (localStorage).
// Sin pendientes no se muestra.
export const RecordatoriosFlotanteVista = ({ uid, pendientes, onRealizado, marcando = null }) => {
  const cajaRef = useRef(null);
  const arrastreRef = useRef(null);
  const [minimizado, setMinimizado] = useState(() => leerJSON(claveMinimizado(uid), false));
  const [posicion, setPosicion] = useState(() => leerJSON(clavePosicion(uid), null));

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

  const alternarMinimizado = (valor) => {
    setMinimizado(valor);
    guardarJSON(claveMinimizado(uid), valor);
  };

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

  if (minimizado) {
    return (
      <button
        ref={cajaRef}
        type="button"
        style={estilo}
        {...eventosArrastre}
        onPointerUp={(e) => { if (!terminarArrastre()) alternarMinimizado(false); e.currentTarget.releasePointerCapture?.(e.pointerId); }}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); alternarMinimizado(false); } }}
        aria-label={`Recordatorios: ${pendientes.length} pendiente(s). Abrir`}
        title="Recordatorios pendientes (arrastra para mover, clic para abrir)"
        className="fixed z-[90] w-11 h-11 rounded-full bg-[#2383C2]/85 backdrop-blur-sm text-white shadow-lg flex items-center justify-center touch-none cursor-grab active:cursor-grabbing select-none"
      >
        <BellRing size={18} />
        <span className={`absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center ${atrasadas ? 'bg-red-500' : 'bg-amber-500'}`}>
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
      className="fixed z-[90] max-h-[60vh] flex flex-col rounded-xl border border-slate-200/70 dark:border-gray-700/70 bg-white/80 dark:bg-gray-800/80 backdrop-blur-md shadow-xl text-[11px] text-slate-700 dark:text-gray-200"
    >
      <div
        {...eventosArrastre}
        onPointerUp={(e) => { terminarArrastre(); e.currentTarget.releasePointerCapture?.(e.pointerId); }}
        className="flex items-center gap-1.5 px-2.5 py-1.5 border-b border-slate-200/70 dark:border-gray-700/70 cursor-grab active:cursor-grabbing touch-none select-none"
        title="Arrastra para mover"
      >
        <GripHorizontal size={13} className="text-slate-400 shrink-0" />
        <BellRing size={13} className="text-[#2383C2] shrink-0" />
        <h2 className="font-bold text-[11px] uppercase tracking-wide">Recordatorios ({pendientes.length})</h2>
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => alternarMinimizado(true)}
          aria-label="Minimizar recordatorios"
          title="Minimizar"
          className="ml-auto p-0.5 rounded text-slate-500 hover:text-[#2383C2] hover:bg-slate-100/80 dark:hover:bg-gray-700/80"
        >
          <Minus size={14} />
        </button>
      </div>
      <ul className="overflow-y-auto p-1.5 space-y-1">
        {pendientes.map(({ tarea, fecha, atrasada }) => {
          const clave = idRealizado(tarea.id, fecha);
          return (
            <li key={clave} className="flex items-start gap-2 px-2 py-1.5 rounded-lg bg-white/60 dark:bg-gray-900/40">
              <div className="min-w-0 flex-grow">
                <p className="font-semibold leading-snug break-words">{tarea.titulo}</p>
                {tarea.descripcion && <p className="text-[10px] text-slate-500 dark:text-gray-400 break-words whitespace-pre-wrap">{tarea.descripcion}</p>}
                {atrasada && (
                  <p className="mt-0.5 inline-flex items-center gap-1 text-[9.5px] font-bold uppercase text-red-600 dark:text-red-400">
                    <AlertTriangle size={10} /> Atrasada · {nombreDia(fecha)} {fecha.split('-').reverse().join('-')}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => onRealizado({ tarea, fecha })}
                disabled={marcando === clave}
                aria-label={`Marcar "${tarea.titulo}" como realizado`}
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
