import { useState } from 'react';
import { ToggleRight, Lock, Loader2, Save, Check, RotateCcw } from 'lucide-react';
import { MODULES } from '../../../../config/modulesConfig.jsx';
import { esDesarrollador } from '../../../../config/accesoMenu';
import {
  moduloActivo, itemActivo, moduloProtegido, itemProtegido, alternarModulo, alternarItem, mismaConfig
} from '../../../../config/modulosActivos';
import { useModulosActivos, guardarModulosActivos } from '../../../../stores/modulosActivosStore';
import { useUser } from '../../../../context/UserContext';
import { useToast } from '../../../../context/ToastContext';
import CuadritoIcono from '../../../ui/CuadritoIcono';

// Módulos con ítems del sidebar (el Dashboard no es un módulo con ítems).
const MODULOS_CON_ITEMS = Object.entries(MODULES).filter(([, m]) => m.subItems?.length);

const Interruptor = ({ activo, deshabilitado, onChange, titulo }) => (
  <button
    type="button"
    role="switch"
    aria-checked={activo}
    aria-label={titulo}
    title={titulo}
    disabled={deshabilitado}
    onClick={onChange}
    className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${activo ? 'bg-[#2383C2]' : 'bg-gray-300 dark:bg-gray-600'}`}
  >
    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${activo ? 'translate-x-4' : 'translate-x-0.5'}`} />
  </button>
);

// Administración → Gestión de módulos: activa/inactiva módulos e ítems del
// sidebar para todo el sistema (config/modulosActivos.js). Solo Desarrollador
// (el ítem es soloDesarrollador y las reglas de configuracion_sistema exigen
// esDev() para escribir).
const GestionModulos = () => {
  const { userData } = useUser();
  const { showToast } = useToast();
  const guardada = useModulosActivos();
  const [borrador, setBorrador] = useState(null);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);

  if (!esDesarrollador(userData)) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm flex flex-col items-center justify-center text-center py-12 px-6 text-gray-400 dark:text-gray-500">
          <Lock size={26} className="mb-2 opacity-60" />
          <p className="text-xs">Solo el rol Desarrollador puede gestionar los módulos del sistema.</p>
        </div>
      </div>
    );
  }

  const config = borrador || guardada;
  const hayCambios = Boolean(borrador && guardada && !mismaConfig(borrador, guardada));
  const cambiar = (fn) => setBorrador((prev) => fn(prev || guardada));

  const handleGuardar = async () => {
    setSaving(true);
    try {
      await guardarModulosActivos(borrador, userData);
      setBorrador(null);
      showToast('Módulos actualizados para todo el sistema.', 'success');
      setSavedMsg(true);
      setTimeout(() => setSavedMsg(false), 2500);
    } catch (error) {
      console.error('Error al guardar los módulos activos:', error);
      showToast('No se pudieron guardar los cambios: ' + error.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">

        {/* HEADER DEL CONTENEDOR */}
        <div className="flex items-start gap-3 px-6 py-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-900/30">
          <div className="w-9 h-9 rounded-lg bg-[#2383C2]/10 dark:bg-[#2383C2]/20 flex items-center justify-center flex-shrink-0">
            <ToggleRight size={16} className="text-[#2383C2]" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-gray-800 dark:text-gray-100">Gestión de módulos</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Lo inactivo deja de aparecer en el sidebar y no se puede abrir, para todos los
              usuarios. Inactivar un módulo oculta todos sus ítems; al reactivarlo, cada ítem
              vuelve con el estado que tenía. Administración y este ítem no se pueden inactivar.
            </p>
          </div>
        </div>

        {!config ? (
          <div className="flex items-center justify-center gap-2 py-12 text-xs text-gray-400 dark:text-gray-500">
            <Loader2 size={14} className="animate-spin" /> Cargando módulos...
          </div>
        ) : (
          <div className="p-4 sm:p-6 space-y-2">
            {MODULOS_CON_ITEMS.map(([mKey, modulo]) => {
              const mActivo = moduloActivo(config, mKey);
              return (
                <div key={mKey} className="rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden">
                  <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-900/40">
                    <CuadritoIcono icon={modulo.icon} color={modulo.color} className={mActivo ? '' : 'grayscale opacity-60'} />
                    <span className={`flex-grow text-sm font-medium truncate ${mActivo ? 'text-gray-700 dark:text-gray-200' : 'text-gray-400 dark:text-gray-500 line-through'}`}>
                      {modulo.label}
                    </span>
                    {moduloProtegido(mKey) && <Lock size={12} className="text-gray-400 flex-shrink-0" />}
                    <Interruptor
                      activo={mActivo}
                      deshabilitado={moduloProtegido(mKey)}
                      onChange={() => cambiar((c) => alternarModulo(c, mKey))}
                      titulo={moduloProtegido(mKey) ? 'Este módulo no se puede inactivar' : `${mActivo ? 'Inactivar' : 'Activar'} ${modulo.label}`}
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 px-3 py-1.5">
                    {modulo.subItems.map((sub) => {
                      const iActivo = itemActivo(config, mKey, sub.path);
                      const protegido = itemProtegido(sub.path);
                      return (
                        <div key={sub.path} className={`flex items-center gap-2 py-1.5 min-w-0 ${mActivo ? '' : 'opacity-50'}`}>
                          <CuadritoIcono icon={sub.icon} color={sub.color} tamano="sm" className={iActivo ? '' : 'grayscale opacity-60'} />
                          <span className={`flex-grow text-xs truncate ${iActivo ? 'text-gray-700 dark:text-gray-200' : 'text-gray-400 dark:text-gray-500 line-through'}`}>
                            {sub.label}
                          </span>
                          {protegido && <Lock size={11} className="text-gray-400 flex-shrink-0" />}
                          <Interruptor
                            activo={iActivo}
                            deshabilitado={protegido || !mActivo}
                            onChange={() => cambiar((c) => alternarItem(c, sub.path))}
                            titulo={protegido
                              ? 'Este ítem no se puede inactivar'
                              : !mActivo ? 'Activa el módulo para cambiar sus ítems' : `${iActivo ? 'Inactivar' : 'Activar'} ${sub.label}`}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* FOOTER: ACCIONES */}
        <div className="flex items-center justify-between gap-2 px-4 sm:px-6 py-3 border-t border-gray-100 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-900/30">
          <button
            type="button"
            onClick={() => setBorrador(null)}
            disabled={!hayCambios || saving}
            className="flex items-center gap-2 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors disabled:opacity-40"
          >
            <RotateCcw size={13} /> Descartar cambios
          </button>

          <button
            type="button"
            onClick={handleGuardar}
            disabled={saving || !hayCambios}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#2383C2] hover:bg-[#1a6aa0] text-white text-xs font-semibold shadow-sm transition-colors disabled:opacity-60"
          >
            {savedMsg ? (
              <><Check size={14} /> Guardado</>
            ) : (
              <><Save size={14} /> {saving ? 'Guardando...' : 'Guardar cambios'}</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default GestionModulos;
