import { useEffect, useRef, useState } from 'react';
import { Building2, Check, ChevronDown } from 'lucide-react';
import { useInstitucion } from '../../context/InstitucionContext';

// Selector de institución/sucursal del header (Dashboard.jsx): muestra la
// vigente (context/InstitucionContext.jsx) y despliega las activas para
// cambiarla. Solo la expone en el contexto; no filtra datos. Bajo md se ve
// solo el ícono. `onAbrirMaestro`: abre Maestros → Instituciones (solo
// llega si el usuario tiene el ítem); se ofrece cuando no hay ninguna.
const SelectorInstitucion = ({ onAbrirMaestro }) => {
  const { instituciones, institucion, seleccionar, cargando } = useInstitucion();
  const [abierto, setAbierto] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!abierto) return undefined;
    const alClicFuera = (e) => { if (!ref.current?.contains(e.target)) setAbierto(false); };
    const alTeclear = (e) => { if (e.key === 'Escape') setAbierto(false); };
    document.addEventListener('mousedown', alClicFuera);
    document.addEventListener('keydown', alTeclear);
    return () => {
      document.removeEventListener('mousedown', alClicFuera);
      document.removeEventListener('keydown', alTeclear);
    };
  }, [abierto]);

  const nombre = cargando ? 'Cargando…' : institucion?.nombre || 'Sin institución';

  const elegir = (id) => {
    seleccionar(id);
    setAbierto(false);
  };

  return (
    <div ref={ref} className="relative min-w-0 flex-shrink-0">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={abierto}
        aria-label={`Institución: ${nombre}. Cambiar institución`}
        title="Cambiar institución"
        className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors min-w-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2383C2]/60"
      >
        <Building2 size={18} className="shrink-0 text-[#2383C2] dark:text-sky-400" aria-hidden="true" />
        <span className="hidden md:block min-w-0 leading-tight">
          <span className={`block max-w-48 truncate text-[13px] font-bold ${institucion ? '' : 'text-gray-500 dark:text-gray-400'}`}>{nombre}</span>
          {institucion?.ciudad && (
            <span className="block max-w-48 truncate text-[11px] text-gray-500 dark:text-gray-400">{institucion.ciudad}</span>
          )}
        </span>
        <ChevronDown size={16} className={`hidden md:block shrink-0 text-gray-400 dark:text-gray-500 transition-transform ${abierto ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>

      {abierto && (
        <div className="fixed inset-x-2 top-16 mt-1 max-h-[70vh] overflow-y-auto rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 py-2 shadow-xl text-gray-700 dark:text-gray-200 sm:absolute sm:inset-x-auto sm:top-full sm:left-0 sm:w-72 z-50">
          <p className="px-4 pt-1 pb-2 text-[10px] font-bold tracking-wide uppercase text-gray-500 dark:text-gray-400">
            Institución
          </p>

          {instituciones.length > 0 ? (
            <ul role="listbox" aria-label="Instituciones activas">
              {instituciones.map((i) => {
                const activa = i.id === institucion?.id;
                return (
                  <li key={i.id} role="option" aria-selected={activa}>
                    <button
                      type="button"
                      onClick={() => elegir(i.id)}
                      className={`w-full flex items-center gap-2 px-4 py-1.5 text-left text-[13px] hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus-visible:bg-gray-50 dark:focus-visible:bg-gray-700 ${activa ? 'font-semibold text-[#1b6a9e] dark:text-sky-300' : ''}`}
                    >
                      <span className="min-w-0 flex-1 leading-tight">
                        <span className="block truncate">{i.nombre}</span>
                        {i.ciudad && <span className="block truncate text-[11px] font-normal text-gray-500 dark:text-gray-400">{i.ciudad}</span>}
                      </span>
                      {activa && <Check size={15} className="shrink-0" aria-hidden="true" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="px-4 pb-1 text-[12px] text-gray-500 dark:text-gray-400">
              <p>{cargando ? 'Cargando instituciones…' : 'No hay instituciones activas.'}</p>
              {!cargando && onAbrirMaestro && (
                <button
                  type="button"
                  onClick={() => { setAbierto(false); onAbrirMaestro(); }}
                  className="mt-2 font-semibold text-[#2383C2] hover:text-[#1b6a9e] dark:text-sky-400 dark:hover:text-sky-300"
                >
                  Registrar instituciones
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SelectorInstitucion;
