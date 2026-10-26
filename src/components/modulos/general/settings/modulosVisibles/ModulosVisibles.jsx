import React from 'react';
import { MODULES } from '../../../../../config/modulesConfig.jsx';
import { LayoutGrid, CheckCircle2 } from 'lucide-react';
import CuadritoIcono from '../../../../ui/CuadritoIcono';

// Vista de solo lectura: muestra, para el usuario logueado, qué módulos y
// qué ítems dentro de cada uno tiene habilitados (según userData.permisos).
// No es para editar permisos — eso se hace desde CrearUsuario.jsx (admin).
// Esta pantalla es para que el propio usuario vea de un vistazo a qué tiene
// acceso.
const ModulosVisibles = ({ userData }) => {
  const permisos = userData?.permisos || {};

  const modulosConAcceso = Object.entries(MODULES).filter(
    ([moduloKey, modulo]) => modulo.subItems?.length && (permisos[moduloKey]?.length || 0) > 0
  );

  return (
    <div className="w-full max-w-2xl">
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 shadow-sm flex flex-col gap-4">
        <div className="border-b border-gray-100 dark:border-gray-700 pb-2">
          <h3 className="text-sm font-bold text-gray-700 dark:text-gray-100 uppercase tracking-wide flex items-center gap-2">
            <LayoutGrid size={16} className="text-[#2383C2]" />
            Módulos Visibles
          </h3>
          <p className="text-[11px] text-gray-500 dark:text-gray-400">
            Estos son los módulos y funciones habilitadas para tu usuario.
            {userData?.rol && (
              <>
                {' '}Rol: <span className="font-semibold text-gray-600 dark:text-gray-300">{userData.rol}</span>.
              </>
            )}
          </p>
        </div>

        {modulosConAcceso.length === 0 ? (
          <p className="text-xs text-gray-400 dark:text-gray-500 italic text-center py-6">
            No tienes módulos habilitados todavía. Contacta a un administrador.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {modulosConAcceso.map(([moduloKey, modulo]) => {
              const itemsHabilitados = modulo.subItems.filter((sub) =>
                permisos[moduloKey]?.includes(sub.path)
              );

              return (
                <div
                  key={moduloKey}
                  className="border border-gray-100 dark:border-gray-700/60 bg-gray-50 dark:bg-gray-900/40 rounded-lg overflow-hidden"
                >
                  <div className="flex items-center gap-2 p-2.5 border-b border-gray-100 dark:border-gray-700/60">
                    <CuadritoIcono icon={modulo.icon} color={modulo.color} tamano="sm" />
                    <span className="text-xs font-bold text-gray-700 dark:text-gray-200">{modulo.label}</span>
                    <span className="text-[10px] font-normal text-gray-400 ml-auto">
                      {itemsHabilitados.length}/{modulo.subItems.length}
                    </span>
                  </div>

                  <div className="p-2.5 pt-1.5 space-y-1">
                    {itemsHabilitados.map((sub) => (
                      <div
                        key={sub.path}
                        className="flex items-center gap-2 text-[11px] text-gray-600 dark:text-gray-300"
                      >
                        <CheckCircle2 size={12} className="text-emerald-500 shrink-0" />
                        <CuadritoIcono icon={sub.icon} color={sub.color} tamano="sm" />
                        {sub.label}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default ModulosVisibles;