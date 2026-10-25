import { useEffect, useRef, useState } from 'react';
import { AlarmClock, Check, Clock, Loader2, AlertTriangle } from 'lucide-react';
import { db } from '../../../../firebaseConfig';
import { useUser } from '../../../../context/UserContext';
import { useToast } from '../../../../context/ToastContext';
import { obtenerNombreMostrar } from '../../../../utils/nombreMostrar';
import { useRecordatoriosPendientes } from './useRecordatoriosPendientes';
import { marcarRealizado } from './recordatoriosServicio';
import { textoAtrasada, idRealizado } from './recordatoriosConfig';

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

// Ícono de recordatorios del header: reloj despertador (la campana es de
// notificaciones, layout/NotificacionesCampana.jsx). Presentación.
// `pendientes`: [{ tarea, fecha, hora, atrasada }], atrasadas primero. Badge con la cantidad (sin pendientes, sin
// badge); rojo si hay alguna atrasada. Al presionarla se despliega la lista;
// se cierra con clic fuera o Esc. Nunca se abre sola.
export const RecordatoriosAlarmaVista = ({ pendientes, onRealizado, marcando = null }) => {
  const [abierto, setAbierto] = useState(false);
  const contenedorRef = useRef(null);

  useEffect(() => {
    if (!abierto) return undefined;
    const alClicFuera = (e) => { if (!contenedorRef.current?.contains(e.target)) setAbierto(false); };
    const alTeclear = (e) => { if (e.key === 'Escape') setAbierto(false); };
    document.addEventListener('mousedown', alClicFuera);
    document.addEventListener('keydown', alTeclear);
    return () => {
      document.removeEventListener('mousedown', alClicFuera);
      document.removeEventListener('keydown', alTeclear);
    };
  }, [abierto]);

  const total = pendientes.length;
  const atrasadas = pendientes.filter((p) => p.atrasada).length;
  const textoPendientes = total ? plural(total, 'tarea pendiente', 'tareas pendientes') : 'Sin tareas pendientes';

  return (
    <div className="relative" ref={contenedorRef}>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-label={`Recordatorios: ${total} pendiente(s)${atrasadas ? `, ${atrasadas} atrasada(s)` : ''}`}
        aria-expanded={abierto}
        aria-haspopup="true"
        title="Recordatorios"
        data-atrasadas={atrasadas > 0 || undefined}
        className={`relative w-9 h-9 rounded-md flex items-center justify-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2383C2]/50 ${atrasadas
          ? 'text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300'
          : 'text-[#2383C2] hover:text-[#1b6a9e] dark:text-sky-400 dark:hover:text-sky-300'}`}
      >
        <AlarmClock size={20} />
        {total > 0 && (
          <span
            data-testid="badge-recordatorios"
            className={`absolute top-0 right-0 min-w-[18px] h-[18px] px-1 rounded-full border-2 border-white dark:border-gray-800 text-white text-[10px] font-bold flex items-center justify-center ${atrasadas ? 'bg-red-700' : 'bg-amber-500'}`}
          >
            {total}
          </span>
        )}
      </button>

      {abierto && (
        <section
          aria-label="Recordatorios pendientes"
          className="fixed inset-x-2 top-16 mt-1 sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 z-50 sm:w-80 max-h-[60vh] flex flex-col rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-xl text-[11px] text-slate-800 dark:text-gray-100"
        >
          <div className={`px-3 py-2 text-white ${atrasadas ? 'bg-red-600' : 'bg-[#2383C2]'}`}>
            <h2 className="font-bold text-[11.5px] uppercase tracking-wide leading-tight">{textoPendientes}</h2>
            {atrasadas > 0 && (
              <p className="text-[10px] font-semibold leading-tight">{plural(atrasadas, 'atrasada', 'atrasadas')}: márcalas como realizadas</p>
            )}
          </div>
          {total === 0 ? (
            <p className="px-3 py-4 text-center text-slate-400 dark:text-gray-500">Sin tareas pendientes</p>
          ) : (
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
          )}
        </section>
      )}
    </div>
  );
};

// Montada en el header (Dashboard.jsx): visible en todas las vistas para
// quien recibe recordatorios. Usa el mismo hook (2 listeners) y el mismo
// marcarRealizado de siempre: al marcar, el listener de Realizados
// actualiza badge y lista sin recargar.
const RecordatoriosAlarma = () => {
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

  return <RecordatoriosAlarmaVista pendientes={pendientes} onRealizado={handleRealizado} marcando={marcando} />;
};

export default RecordatoriosAlarma;
