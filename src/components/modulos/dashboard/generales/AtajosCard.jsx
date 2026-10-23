import React from 'react';
import { Zap } from 'lucide-react';
import { MODULES } from '../../../../config/modulesConfig.jsx';
import { resolverAtajos } from '../../../../config/atajosDashboard';
import { useAtajosConfigurados } from '../../../../stores/atajosDashboardStore';
import { useModulosActivos } from '../../../../stores/modulosActivosStore';
import { itemActivo } from '../../../../config/modulosActivos';

// Widget "Accesos rápidos": botones a pantallas del sidebar. La lista la
// configura un admin/dev en Ajustes → Atajos (por defecto, la de
// config/atajosDashboard.js) y se muestran solo los que el usuario tiene
// permitidos. `onAbrir(modulo, path)` hace lo mismo que el menú (abre el
// módulo y deja activo el ítem).
const AtajosCard = ({ permisos, onAbrir }) => {
  const configurados = useAtajosConfigurados();
  const modulosActivos = useModulosActivos();
  // Los atajos a módulos/ítems inactivos (Gestión de módulos) no se muestran.
  const atajos = configurados && modulosActivos
    ? resolverAtajos(configurados, MODULES, permisos).filter((a) => itemActivo(modulosActivos, a.modulo, a.path))
    : [];

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 shadow-sm flex flex-col gap-2 flex-grow min-h-0 overflow-hidden">
      <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-700 pb-2 flex-shrink-0">
        <span className="text-[11px] font-bold text-gray-700 dark:text-gray-200 flex items-center gap-1.5 uppercase tracking-wide">
          <Zap size={13} className="text-[#2383C2]" /> Accesos rápidos
        </span>
      </div>

      {!configurados || !modulosActivos ? (
        <div className="flex-1 flex items-center justify-center text-[10px] text-gray-400 dark:text-gray-500">
          Cargando accesos rápidos...
        </div>
      ) : atajos.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-center text-[10px] text-gray-400 dark:text-gray-500 px-2">
          No tienes accesos rápidos disponibles con tus permisos actuales.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 overflow-y-auto min-h-0 pr-0.5">
          {atajos.map((a) => (
            <button
              key={`${a.modulo}:${a.path}`}
              type="button"
              onClick={() => onAbrir?.(a.modulo, a.path)}
              title={`${a.moduloLabel} → ${a.label}`}
              className="group flex items-center gap-2 p-2 rounded-lg border border-[#2383C2]/30 dark:border-[#2383C2]/40 bg-[#2383C2]/[0.06] dark:bg-[#2383C2]/10 shadow-sm hover:border-[#2383C2] hover:bg-[#2383C2]/[0.12] dark:hover:bg-[#2383C2]/20 hover:shadow-md transition text-left min-w-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2383C2] focus-visible:ring-offset-1 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-800"
            >
              <span className="flex-shrink-0 w-7 h-7 rounded-md bg-[#2383C2]/15 dark:bg-[#2383C2]/25 text-[#1b6a9e] dark:text-sky-300 group-hover:bg-[#2383C2] group-hover:text-white dark:group-hover:text-white transition-colors flex items-center justify-center">
                {React.isValidElement(a.icon) ? React.cloneElement(a.icon, { size: 15 }) : a.icon}
              </span>
              <span className="flex flex-col min-w-0">
                <span className="text-[11px] font-bold text-gray-800 dark:text-gray-100 truncate group-hover:text-[#1b6a9e] dark:group-hover:text-sky-300">
                  {a.label}
                </span>
                <span className="text-[9px] text-gray-600 dark:text-gray-400 uppercase tracking-wide truncate">
                  {a.moduloLabel}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default AtajosCard;
