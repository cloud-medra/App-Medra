import { useEffect, useRef, useState } from 'react';
import { Bell } from 'lucide-react';

// Campana de notificaciones del header (los recordatorios van aparte, en el
// reloj de RecordatoriosAlarma.jsx). Aún no hay fuente de notificaciones:
// NotificacionesCampana muestra el panel vacío. Para conectarla, pasar a
// NotificacionesCampanaVista la lista ([{ id, titulo, detalle?, leida? }])
// desde un hook/servicio; el contador aparece solo con no leídas.
export const NotificacionesCampanaVista = ({ notificaciones = [] }) => {
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

  const noLeidas = notificaciones.filter((n) => !n.leida).length;

  return (
    <div className="relative" ref={contenedorRef}>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-label="Notificaciones"
        aria-expanded={abierto}
        aria-haspopup="true"
        title="Notificaciones"
        className="relative w-9 h-9 rounded-md flex items-center justify-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2383C2]/50 text-[#2383C2] hover:text-[#1b6a9e] dark:text-sky-400 dark:hover:text-sky-300"
      >
        <Bell size={20} />
        {noLeidas > 0 && (
          <span
            data-testid="badge-notificaciones"
            className="absolute top-0 right-0 min-w-[18px] h-[18px] px-1 rounded-full border-2 border-white dark:border-gray-800 text-white text-[10px] font-bold flex items-center justify-center bg-red-600"
          >
            {noLeidas}
          </span>
        )}
      </button>

      {abierto && (
        <section
          aria-label="Notificaciones"
          className="fixed inset-x-2 top-16 mt-1 sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 z-50 sm:w-80 max-h-[60vh] flex flex-col rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-xl text-[11px] text-slate-800 dark:text-gray-100"
        >
          <div className="px-3 py-2 text-white bg-[#2383C2]">
            <h2 className="font-bold text-[11.5px] uppercase tracking-wide leading-tight">Notificaciones</h2>
          </div>
          {notificaciones.length === 0 ? (
            <p className="px-3 py-6 text-center text-slate-500 dark:text-gray-400">No tienes notificaciones</p>
          ) : (
            <ul className="overflow-y-auto p-1.5 space-y-1">
              {notificaciones.map((n) => (
                <li key={n.id} className={`px-2 py-1.5 rounded-lg border border-slate-200 dark:border-gray-700 ${n.leida ? '' : 'font-semibold'}`}>
                  <p className="leading-snug break-words">{n.titulo}</p>
                  {n.detalle && <p className="text-[10px] font-normal text-slate-600 dark:text-gray-300 break-words">{n.detalle}</p>}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
};

// Montada en el header (Dashboard.jsx). Sin fuente todavía: lista vacía.
const NotificacionesCampana = () => <NotificacionesCampanaVista notificaciones={[]} />;

export default NotificacionesCampana;
