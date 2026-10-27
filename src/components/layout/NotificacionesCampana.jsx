import { useEffect, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import { useNotificaciones } from './useNotificaciones';
import { marcarLeida } from '../modulos/administracion/alertas/solicitudesServicio';

// Campana de notificaciones del header (los recordatorios van aparte, en el
// reloj de RecordatoriosAlarma.jsx). Fuente: las alertas pendientes del
// usuario (useNotificaciones.js, buzón `alertas`). La vista recibe
// [{ id, titulo, detalle?, leida?, ruta? }]; el contador aparece solo con
// no leídas y, con `ruta`, el clic la marca leída y abre esa pantalla.
export const NotificacionesCampanaVista = ({ notificaciones = [], onElegir }) => {
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
              {notificaciones.map((n) => {
                const contenido = (
                  <>
                    <p className="leading-snug break-words flex items-start gap-1.5">
                      {!n.leida && <span aria-label="No leída" className="mt-1 w-1.5 h-1.5 rounded-full bg-[#2383C2] shrink-0" />}
                      <span>{n.titulo}</span>
                    </p>
                    {n.detalle && <p className="text-[10px] font-normal text-slate-600 dark:text-gray-300 break-words">{n.detalle}</p>}
                  </>
                );
                return (
                  <li key={n.id} className={`rounded-lg border border-slate-200 dark:border-gray-700 ${n.leida ? '' : 'font-semibold bg-[#2383C2]/5'}`}>
                    {n.ruta && onElegir ? (
                      <button type="button" onClick={() => { setAbierto(false); onElegir(n); }}
                        className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-gray-700/40">
                        {contenido}
                      </button>
                    ) : <div className="px-2 py-1.5">{contenido}</div>}
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

// Montada en el header (Dashboard.jsx). `puedeAbrirRuta(ruta)`: menú del
// usuario (para elegir el destino de un ticket); `onAbrir(ruta)`: navega.
const NotificacionesCampana = ({ uid, puedeAbrirRuta = () => true, onAbrir }) => {
  const notificaciones = useNotificaciones(uid, puedeAbrirRuta);
  const elegir = (n) => {
    if (!n.leida) marcarLeida(n.id, uid).catch((err) => console.warn('No se pudo marcar la notificación como leída:', err));
    onAbrir?.(n.ruta);
  };
  return <NotificacionesCampanaVista notificaciones={notificaciones} onElegir={elegir} />;
};

export default NotificacionesCampana;
