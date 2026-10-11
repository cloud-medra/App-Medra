import React from 'react';
import { Zap } from 'lucide-react';
import { MODULES } from '../../../../config/modulesConfig.jsx';
import { resolverAtajos } from '../../../../config/atajosDashboard';
import { useAtajosConfigurados } from '../../../../stores/atajosDashboardStore';

// Widget "Accesos rápidos": botones a pantallas del sidebar. La lista la
// configura un admin/dev en Ajustes → Atajos (por defecto, la de
// config/atajosDashboard.js) y se muestran solo los que el usuario tiene
// permitidos. `onAbrir(modulo, path)` hace lo mismo que el menú (abre el
// módulo y deja activo el ítem).
const AtajosCard = ({ permisos, onAbrir }) => {
  const configurados = useAtajosConfigurados();
  const atajos = configurados ? resolverAtajos(configurados, MODULES, permisos) : [];

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 shadow-sm flex flex-col gap-2 flex-grow min-h-0 overflow-hidden">
      <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-700 pb-2 flex-shrink-0">
        <span className="text-[11px] font-bold text-gray-700 dark:text-gray-200 flex items-center gap-1.5 uppercase tracking-wide">
          <Zap size={13} className="text-[#2383C2]" /> Accesos rápidos
        </span>
      </div>

      {!configurados ? (
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
              className="group flex items-center gap-2 p-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/30 hover:border-[#2383C2] hover:bg-blue-50/60 dark:hover:bg-blue-950/20 transition-colors text-left min-w-0"
            >
              <span className="flex-shrink-0 w-7 h-7 rounded-md bg-blue-50 dark:bg-blue-900/30 text-[#2383C2] flex items-center justify-center">
                {React.isValidElement(a.icon) ? React.cloneElement(a.icon, { size: 15 }) : a.icon}
              </span>
              <span className="flex flex-col min-w-0">
                <span className="text-[11px] font-semibold text-gray-700 dark:text-gray-200 truncate group-hover:text-[#2383C2]">
                  {a.label}
                </span>
                <span className="text-[9px] text-gray-400 dark:text-gray-500 uppercase tracking-wide truncate">
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
