import React from 'react';
import { ChevronRight, LayoutGrid } from 'lucide-react';
import CuadritoIcono from '../../../ui/CuadritoIcono';
import CodigoDiscreto from '../../../ui/CodigoDiscreto';
import { codigoItem } from '../../../../config/codigosModulos';

// Vista de acceso rápido de un módulo: todas sus pantallas como tarjetas, en
// el mismo orden que el sidebar. Recibe los ítems ya filtrados con la misma
// función que el sidebar (config/menuSidebar.js: permisos, módulos/ítems
// activos y orden guardado del usuario), así que no lee nada de Firestore.
// Mismo estilo de tarjeta que Accesos rápidos del panel (AtajosCard). Cada
// tarjeta lleva el código del ítem, discreto como en el sidebar.
//
// `items`: [{ label, path, icon, color, descripcion? }]
const AccesoRapidoModulo = ({ etiqueta, icono, color, items, onAbrir, cargando = false }) => (
  <div className="h-full flex flex-col bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm overflow-hidden">
    <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex-shrink-0">
      <CuadritoIcono icon={icono} color={color} tamano="lg" />
      <div className="min-w-0">
        <h1 className="text-sm font-bold text-gray-800 dark:text-gray-100 truncate">{etiqueta}</h1>
        <p className="text-[11px] text-gray-500 dark:text-gray-400 flex items-center gap-1">
          <LayoutGrid size={11} /> {items.length} {items.length === 1 ? 'pantalla disponible' : 'pantallas disponibles'}
        </p>
      </div>
    </div>

    <div className="flex-1 min-h-0 overflow-y-auto p-4">
      {cargando ? (
        <div className="text-center text-[11px] text-gray-400 dark:text-gray-500 py-10">Cargando...</div>
      ) : items.length === 0 ? (
        <div className="text-center text-[11px] text-gray-400 dark:text-gray-500 py-10">
          No tienes pantallas disponibles en este módulo con tus permisos actuales.
        </div>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-3" aria-label={`Pantallas de ${etiqueta}`}>
          {items.map((item) => (
            <li key={item.path} className="min-w-0">
              <button
                type="button"
                onClick={() => onAbrir(item.path)}
                title={item.label}
                className="group w-full h-full flex items-center gap-3 p-3 rounded-lg border border-[#2383C2]/30 dark:border-[#2383C2]/40 bg-[#2383C2]/[0.06] dark:bg-[#2383C2]/10 shadow-sm hover:border-[#2383C2] hover:bg-[#2383C2]/[0.12] dark:hover:bg-[#2383C2]/20 hover:shadow-md transition text-left min-w-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2383C2] focus-visible:ring-offset-1 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-800"
              >
                <CuadritoIcono icon={item.icon} color={item.color} tamano="lg" />
                <span className="flex-1 flex flex-col min-w-0">
                  <span className="flex items-baseline gap-1.5 min-w-0">
                    <span className="text-[12px] font-bold text-gray-800 dark:text-gray-100 truncate group-hover:text-[#1b6a9e] dark:group-hover:text-sky-300">
                      {item.label}
                    </span>
                    {codigoItem(item.path) && <CodigoDiscreto codigo={codigoItem(item.path)} />}
                  </span>
                  {item.descripcion && (
                    <span className="text-[10px] text-gray-500 dark:text-gray-400 line-clamp-2">{item.descripcion}</span>
                  )}
                </span>
                <ChevronRight size={14} className="flex-shrink-0 text-gray-300 dark:text-gray-600 group-hover:text-[#2383C2] transition-colors" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  </div>
);

export default AccesoRapidoModulo;
