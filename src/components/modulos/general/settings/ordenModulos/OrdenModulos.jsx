import React, { useState, useEffect, useRef } from 'react';
import { auth, db } from '../../../../../firebaseConfig';
import { doc, updateDoc } from 'firebase/firestore';
import {
  GripVertical, ChevronDown, ChevronUp, ArrowUp, ArrowDown,
  RotateCcw, Save, Check, Sliders, LayoutList
} from 'lucide-react';
import { MODULES } from '../../../../../config/modulesConfig.jsx';
import CuadritoIcono from '../../../../ui/CuadritoIcono';
import { tieneItemAsignado } from '../../../../../config/accesoMenu';
import { expandirContenedores } from '../../../../../config/pestanasControlProcesos.js';

const OrdenModulos = ({ userData, onOrderSaved }) => {
  const [moduleOrder, setModuleOrder] = useState([]);
  const [subOrders, setSubOrders] = useState({});
  const [expandedModule, setExpandedModule] = useState(null);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);

  // Refs para drag & drop nativo (sin librerías externas)
  const dragModuleItem = useRef(null);
  const dragModuleOverItem = useRef(null);
  const dragSubItem = useRef({ moduleKey: null, index: null });
  const dragSubOverItem = useRef({ moduleKey: null, index: null });

  const permisos = userData?.permisos || {};

  const defaultModuleOrder = () =>
    Object.keys(MODULES).filter((k) => (permisos[k] || []).length > 0);

  const defaultSubOrder = (moduleKey) =>
    (MODULES[moduleKey]?.subItems || [])
      .filter((s) => tieneItemAsignado(userData, moduleKey, s))
      .map((s) => s.path);

  useEffect(() => {
    const permitidos = defaultModuleOrder();
    const guardado = userData?.ordenModulos;
    const inicial =
      guardado && guardado.length
        ? [
            ...guardado.filter((k) => permitidos.includes(k)),
            ...permitidos.filter((k) => !guardado.includes(k)),
          ]
        : permitidos;
    setModuleOrder(inicial);

    const subs = {};
    permitidos.forEach((mKey) => {
      const visibles = defaultSubOrder(mKey);
      // Un "Control Procesos" guardado pasa a sus ítems, en su lugar.
      const guardadoSub = expandirContenedores(userData?.ordenSubItems?.[mKey] || []);
      subs[mKey] =
        guardadoSub.length
          ? [
              ...guardadoSub.filter((p) => visibles.includes(p)),
              ...visibles.filter((p) => !guardadoSub.includes(p)),
            ]
          : visibles;
    });
    setSubOrders(subs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userData]);

  // --- MOVER CON BOTONES ---
  const moveModule = (index, direction) => {
    const newOrder = [...moduleOrder];
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= newOrder.length) return;
    [newOrder[index], newOrder[targetIndex]] = [newOrder[targetIndex], newOrder[index]];
    setModuleOrder(newOrder);
  };

  const moveSubItem = (moduleKey, index, direction) => {
    const current = [...(subOrders[moduleKey] || [])];
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= current.length) return;
    [current[index], current[targetIndex]] = [current[targetIndex], current[index]];
    setSubOrders({ ...subOrders, [moduleKey]: current });
  };

  // --- DRAG & DROP MÓDULOS ---
  const handleModuleDragStart = (index) => (dragModuleItem.current = index);
  const handleModuleDragEnter = (index) => (dragModuleOverItem.current = index);
  const handleModuleDragEnd = () => {
    if (dragModuleItem.current === null || dragModuleOverItem.current === null) return;
    const newOrder = [...moduleOrder];
    const dragged = newOrder.splice(dragModuleItem.current, 1)[0];
    newOrder.splice(dragModuleOverItem.current, 0, dragged);
    dragModuleItem.current = null;
    dragModuleOverItem.current = null;
    setModuleOrder(newOrder);
  };

  // --- DRAG & DROP SUBITEMS ---
  const handleSubDragStart = (moduleKey, index) => {
    dragSubItem.current = { moduleKey, index };
  };
  const handleSubDragEnter = (moduleKey, index) => {
    dragSubOverItem.current = { moduleKey, index };
  };
  const handleSubDragEnd = () => {
    const { moduleKey, index: fromIndex } = dragSubItem.current;
    const { moduleKey: toModuleKey, index: toIndex } = dragSubOverItem.current;
    if (moduleKey === null || moduleKey !== toModuleKey || fromIndex === null) return;
    const current = [...(subOrders[moduleKey] || [])];
    const dragged = current.splice(fromIndex, 1)[0];
    current.splice(toIndex, 0, dragged);
    dragSubItem.current = { moduleKey: null, index: null };
    dragSubOverItem.current = { moduleKey: null, index: null };
    setSubOrders({ ...subOrders, [moduleKey]: current });
  };

  const handleRestablecer = () => {
    setModuleOrder(defaultModuleOrder());
    const subs = {};
    defaultModuleOrder().forEach((mKey) => (subs[mKey] = defaultSubOrder(mKey)));
    setSubOrders(subs);
  };

  const handleGuardar = async () => {
    if (!auth.currentUser) return;
    setSaving(true);
    try {
      const userRef = doc(db, 'usuarios', auth.currentUser.uid);
      await updateDoc(userRef, {
        ordenModulos: moduleOrder,
        ordenSubItems: subOrders,
      });
      onOrderSaved?.({ ordenModulos: moduleOrder, ordenSubItems: subOrders });
      setSavedMsg(true);
      setTimeout(() => setSavedMsg(false), 2500);
    } catch (error) {
      console.error('Error al guardar el orden de módulos:', error);
    } finally {
      setSaving(false);
    }
  };

  const totalModulos = moduleOrder.length;

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">

        {/* HEADER DEL CONTENEDOR */}
        <div className="flex items-start gap-3 px-6 py-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-900/30">
          <div className="w-9 h-9 rounded-lg bg-[#2383C2]/10 dark:bg-[#2383C2]/20 flex items-center justify-center flex-shrink-0">
            <Sliders size={16} className="text-[#2383C2]" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-bold text-gray-800 dark:text-gray-100">
                Orden de Módulos
              </h3>
              {totalModulos > 0 && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                  {totalModulos} {totalModulos === 1 ? 'módulo' : 'módulos'}
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Arrastra con el ícono <GripVertical size={11} className="inline -mt-0.5" /> o usa las
              flechas para ordenar tus módulos. Haz clic en un módulo para reordenar también sus
              secciones internas.
            </p>
          </div>
        </div>

        {/* CUERPO: LISTA DE MÓDULOS */}
        <div className="p-4 sm:p-6">
          {totalModulos === 0 ? (
            <div className="flex flex-col items-center justify-center text-center py-10 text-gray-400 dark:text-gray-500">
              <LayoutList size={28} className="mb-2 opacity-60" />
              <p className="text-xs">No tienes módulos habilitados para reordenar.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {moduleOrder.map((mKey, index) => {
          const modulo = MODULES[mKey];
          if (!modulo) return null;
          const isExpanded = expandedModule === mKey;
          const subItemsOrdenados = (subOrders[mKey] || [])
            .map((path) => modulo.subItems?.find((s) => s.path === path))
            .filter(Boolean);

          return (
            <div
              key={mKey}
              className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden shadow-sm"
            >
              <div
                draggable
                onDragStart={() => handleModuleDragStart(index)}
                onDragEnter={() => handleModuleDragEnter(index)}
                onDragEnd={handleModuleDragEnd}
                onDragOver={(e) => e.preventDefault()}
                className="flex items-center gap-2 p-3 cursor-move"
              >
                <GripVertical size={16} className="text-gray-300 dark:text-gray-600 flex-shrink-0" />
                <CuadritoIcono icon={modulo.icon} color={modulo.color} />
                <span className="flex-grow text-sm font-medium text-gray-700 dark:text-gray-200 truncate">
                  {modulo.label}
                </span>

                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => moveModule(index, -1)}
                    disabled={index === 0}
                    className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed text-gray-500 dark:text-gray-400"
                    title="Mover arriba"
                  >
                    <ArrowUp size={14} />
                  </button>
                  <button
                    onClick={() => moveModule(index, 1)}
                    disabled={index === moduleOrder.length - 1}
                    className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed text-gray-500 dark:text-gray-400"
                    title="Mover abajo"
                  >
                    <ArrowDown size={14} />
                  </button>

                  {modulo.subItems?.length > 0 && (
                    <button
                      onClick={() => setExpandedModule(isExpanded ? null : mKey)}
                      className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 ml-1"
                      title="Ver secciones"
                    >
                      {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                  )}
                </div>
              </div>

              {isExpanded && (
                <div className="bg-gray-50 dark:bg-gray-900/40 border-t border-gray-100 dark:border-gray-700 px-3 py-2 space-y-1">
                  {subItemsOrdenados.map((sub, subIndex) => (
                    <div
                      key={sub.path}
                      draggable
                      onDragStart={() => handleSubDragStart(mKey, subIndex)}
                      onDragEnter={() => handleSubDragEnter(mKey, subIndex)}
                      onDragEnd={handleSubDragEnd}
                      onDragOver={(e) => e.preventDefault()}
                      className="flex items-center gap-2 py-1.5 pl-4 cursor-move"
                    >
                      <GripVertical size={13} className="text-gray-300 dark:text-gray-600 flex-shrink-0" />
                      <CuadritoIcono icon={sub.icon} color={sub.color} tamano="sm" />
                      <span className="flex-grow text-xs text-gray-600 dark:text-gray-300 truncate">
                        {sub.label}
                      </span>
                      <button
                        onClick={() => moveSubItem(mKey, subIndex, -1)}
                        disabled={subIndex === 0}
                        className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed text-gray-500 dark:text-gray-400"
                      >
                        <ArrowUp size={12} />
                      </button>
                      <button
                        onClick={() => moveSubItem(mKey, subIndex, 1)}
                        disabled={subIndex === subItemsOrdenados.length - 1}
                        className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed text-gray-500 dark:text-gray-400"
                      >
                        <ArrowDown size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
              );
              })}
            </div>
          )}
        </div>

        {/* FOOTER: ACCIONES */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-t border-gray-100 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-900/30">
          <button
            onClick={handleRestablecer}
            className="flex items-center gap-2 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
          >
            <RotateCcw size={13} /> Restablecer orden predeterminado
          </button>

          <button
            onClick={handleGuardar}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#2383C2] hover:bg-[#1a6aa0] text-white text-xs font-semibold shadow-sm transition-colors disabled:opacity-60"
          >
            {savedMsg ? (
              <>
                <Check size={14} /> Guardado
              </>
            ) : (
              <>
                <Save size={14} /> {saving ? 'Guardando...' : 'Guardar orden'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default OrdenModulos;