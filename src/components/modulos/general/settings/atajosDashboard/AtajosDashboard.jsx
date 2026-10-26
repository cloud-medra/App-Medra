import { useState, useEffect, useRef } from 'react';
import {
  GripVertical, ArrowUp, ArrowDown, X, RotateCcw, Save, Check, Zap, Lock, Loader2
} from 'lucide-react';
import { MODULES } from '../../../../../config/modulesConfig.jsx';
import {
  ATAJOS_POR_DEFECTO, resolverAtajos, estaSeleccionado, alternarAtajo, moverAtajo, puedeConfigurarAtajos
} from '../../../../../config/atajosDashboard';
import { obtenerAtajosConfigurados, guardarAtajosConfigurados } from '../../../../../stores/atajosDashboardStore';
import { useToast } from '../../../../../context/ToastContext';
import CuadritoIcono from '../../../../ui/CuadritoIcono';

// Todos los módulos con ítems del sidebar (sin filtrar por los permisos de
// quien configura: la lista es global y a cada usuario se le filtra por los
// suyos en el Dashboard).
const MODULOS_CON_ITEMS = Object.entries(MODULES).filter(([, m]) => m.subItems?.length);
const PERMISOS_TODOS = Object.fromEntries(MODULOS_CON_ITEMS.map(([k, m]) => [k, m.subItems.map((s) => s.path)]));

// Ajustes → Atajos: qué ítems del sidebar aparecen como "Accesos rápidos" en
// el Dashboard y en qué orden. Configuración global (solo admin/dev).
const AtajosDashboard = ({ userData }) => {
  const { showToast } = useToast();
  const [seleccion, setSeleccion] = useState(null);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);

  const dragDesde = useRef(null);
  const dragHasta = useRef(null);

  const autorizado = puedeConfigurarAtajos(userData);

  useEffect(() => {
    if (!autorizado) return undefined;
    let activo = true;
    obtenerAtajosConfigurados(true).then((lista) => { if (activo) setSeleccion(lista); });
    return () => { activo = false; };
  }, [autorizado]);

  if (!autorizado) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm flex flex-col items-center justify-center text-center py-12 px-6 text-gray-400 dark:text-gray-500">
          <Lock size={26} className="mb-2 opacity-60" />
          <p className="text-xs">Solo los administradores pueden configurar los atajos del Dashboard.</p>
        </div>
      </div>
    );
  }

  // Datos de cada atajo seleccionado (los que ya no existen en el sidebar no se listan).
  const seleccionados = seleccion ? resolverAtajos(seleccion, MODULES, PERMISOS_TODOS) : [];

  const mover = (desde, hasta) => setSeleccion((prev) => moverAtajo(prev, desde, hasta));

  const handleDragEnd = () => {
    if (dragDesde.current !== null && dragHasta.current !== null) mover(dragDesde.current, dragHasta.current);
    dragDesde.current = null;
    dragHasta.current = null;
  };

  const handleGuardar = async () => {
    setSaving(true);
    try {
      // Se guarda solo lo que sigue existiendo en el sidebar.
      const guardados = await guardarAtajosConfigurados(
        seleccionados.map(({ modulo, path }) => ({ modulo, path })),
        userData
      );
      setSeleccion(guardados);
      showToast('Atajos del Dashboard guardados.', 'success');
      setSavedMsg(true);
      setTimeout(() => setSavedMsg(false), 2500);
    } catch (error) {
      console.error('Error al guardar los atajos del Dashboard:', error);
      showToast('No se pudieron guardar los atajos: ' + error.message, 'error');
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
            <Zap size={16} className="text-[#2383C2]" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-bold text-gray-800 dark:text-gray-100">Atajos del Dashboard</h3>
              {seleccion && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                  {seleccionados.length} {seleccionados.length === 1 ? 'atajo' : 'atajos'}
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Marca los ítems que aparecen en "Accesos rápidos" y ordénalos arrastrando con el
              ícono <GripVertical size={11} className="inline -mt-0.5" /> o con las flechas. La
              configuración es para todo el sistema: cada usuario ve solo los atajos a los que
              tiene acceso.
            </p>
          </div>
        </div>

        {!seleccion ? (
          <div className="flex items-center justify-center gap-2 py-12 text-xs text-gray-400 dark:text-gray-500">
            <Loader2 size={14} className="animate-spin" /> Cargando atajos...
          </div>
        ) : (
          <div className="p-4 sm:p-6 space-y-5">

            {/* ATAJOS SELECCIONADOS (ORDEN) */}
            <section>
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2">
                Orden en el Dashboard
              </h4>
              {seleccionados.length === 0 ? (
                <p className="text-xs text-gray-400 dark:text-gray-500 border border-dashed border-gray-200 dark:border-gray-700 rounded-xl py-4 text-center">
                  No hay atajos seleccionados: el Dashboard no mostrará accesos rápidos.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {seleccionados.map((a, index) => (
                    <div
                      key={`${a.modulo}:${a.path}`}
                      draggable
                      onDragStart={() => { dragDesde.current = index; }}
                      onDragEnter={() => { dragHasta.current = index; }}
                      onDragEnd={handleDragEnd}
                      onDragOver={(e) => e.preventDefault()}
                      className="flex items-center gap-2 p-2.5 rounded-xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm cursor-move"
                    >
                      <GripVertical size={15} className="text-gray-300 dark:text-gray-600 flex-shrink-0" />
                      <span className="text-[10px] font-bold text-gray-400 w-4 text-right flex-shrink-0">{index + 1}</span>
                      <CuadritoIcono icon={a.icon} color={a.color} />
                      <div className="flex-grow min-w-0">
                        <span className="block text-sm font-medium text-gray-700 dark:text-gray-200 truncate">{a.label}</span>
                        <span className="block text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500 truncate">{a.moduloLabel}</span>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => mover(index, index - 1)}
                          disabled={index === 0}
                          className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed text-gray-500 dark:text-gray-400"
                          title="Mover arriba"
                        >
                          <ArrowUp size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => mover(index, index + 1)}
                          disabled={index === seleccionados.length - 1}
                          className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed text-gray-500 dark:text-gray-400"
                          title="Mover abajo"
                        >
                          <ArrowDown size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setSeleccion((prev) => alternarAtajo(prev, a))}
                          className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-950/30 text-gray-400 hover:text-red-600 ml-1"
                          title="Quitar atajo"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* CATÁLOGO: MÓDULOS E ÍTEMS DEL SIDEBAR */}
            <section>
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2">
                Ítems disponibles
              </h4>
              <div className="space-y-2">
                {MODULOS_CON_ITEMS.map(([mKey, modulo]) => (
                  <div key={mKey} className="rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden">
                    <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-900/40">
                      <CuadritoIcono icon={modulo.icon} color={modulo.color} />
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-200 truncate">{modulo.label}</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 px-3 py-1.5">
                      {modulo.subItems.map((sub) => {
                        const atajo = { modulo: mKey, path: sub.path };
                        const marcado = estaSeleccionado(seleccion, atajo);
                        return (
                          <label key={sub.path} className="flex items-center gap-2 py-1.5 cursor-pointer min-w-0">
                            <input
                              type="checkbox"
                              checked={marcado}
                              onChange={() => setSeleccion((prev) => alternarAtajo(prev, atajo))}
                              className="cursor-pointer accent-[#2383C2] flex-shrink-0"
                            />
                            <CuadritoIcono icon={sub.icon} color={sub.color} tamano="sm" />
                            <span className={`text-xs truncate ${marcado ? 'font-semibold text-gray-800 dark:text-gray-100' : 'text-gray-600 dark:text-gray-300'}`}>
                              {sub.label}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {/* FOOTER: ACCIONES */}
        <div className="flex items-center justify-between gap-2 px-4 sm:px-6 py-3 border-t border-gray-100 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-900/30">
          <button
            type="button"
            onClick={() => setSeleccion(ATAJOS_POR_DEFECTO)}
            disabled={!seleccion}
            className="flex items-center gap-2 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors disabled:opacity-40"
          >
            <RotateCcw size={13} /> Restablecer atajos predeterminados
          </button>

          <button
            type="button"
            onClick={handleGuardar}
            disabled={saving || !seleccion}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#2383C2] hover:bg-[#1a6aa0] text-white text-xs font-semibold shadow-sm transition-colors disabled:opacity-60"
          >
            {savedMsg ? (
              <><Check size={14} /> Guardado</>
            ) : (
              <><Save size={14} /> {saving ? 'Guardando...' : 'Guardar atajos'}</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AtajosDashboard;
