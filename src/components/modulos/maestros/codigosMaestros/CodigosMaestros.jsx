import React, { useState, useEffect, useMemo } from 'react';
import { 
  FileText, 
  Clock, 
  CheckCircle2, 
  List, 
  ChevronRight, 
  ShieldAlert,
  Layers,
  Calendar
} from 'lucide-react'; 
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../../../firebaseConfig';
import { useGranularPermission } from '../../../../hooks/useGranularPermission';

// Importación de los componentes de las pestañas
import TabPendientes from './components/tabPendientes/TabPendientes';
import TabConCodigo from './components/tabConCodigo/TabConCodigo';
import TabVistaGeneral from './components/tabVistaGeneral/TabVistaGeneral';
import { RUTA_CODIGOS_MAESTROS } from './rutasCodigos';

// Cada pestaña es un `proceso` propio (path independiente) del
// componentMap de esta pantalla (ver
// src/config/componentMaps/maestros.js) — su visibilidad se decide por
// existencia con hasAccesoProceso(path), no por un checkbox maestro de
// sección compartido entre las 3 (ver nota de useGranularPermission.js).
//
// La misma pantalla (y la misma colección maestros_codigos) se monta en
// Maestros → Códigos, Implantes → Códigos y Hemodinamia → Códigos: `rutaBase` decide de qué
// ítem del menú salen los permisos, así cada módulo se asigna por separado.
const PESTANAS = [
  { id: 'pendientes', label: 'Sin Código / Pendientes', Icon: Clock, sub: 'pendientes' },
  { id: 'con_codigo', label: 'Con Código', Icon: CheckCircle2, sub: 'conCodigo' },
  { id: 'todos', label: 'Vista General', Icon: List, sub: 'vistaGeneral' },
];

const CodigosMaestros = ({ rutaBase = RUTA_CODIGOS_MAESTROS } = {}) => {
  const PATH_VISTA = rutaBase;
  const ALL_TABS = useMemo(() => PESTANAS.map((t) => ({ ...t, path: `${rutaBase}/${t.sub}` })), [rutaBase]);
  const { hasAccesoProceso } = useGranularPermission();
  const [periodoAbierto, setPeriodoAbierto] = useState(null);

  // Escuchar período activo (opcional, mantiene la consistencia con tus otros módulos)
  useEffect(() => {
    const refPeriodo = doc(db, "configuracion_periodos", "periodo_activo");
    const unsubscribe = onSnapshot(refPeriodo, (docSnap) => {
      if (docSnap.exists()) {
        setPeriodoAbierto(docSnap.data());
      } else {
        setPeriodoAbierto(null);
      }
    }, (error) => {
      console.error("Error al escuchar período activo:", error);
    });

    return () => unsubscribe();
  }, []);

  const tabs = useMemo(() =>
    ALL_TABS.filter(t => hasAccesoProceso(t.path)),
    [ALL_TABS, hasAccesoProceso]
  );

  const [activeTab, setActiveTab] = useState(() => tabs[0]?.id || '');

  const currentTabObj = useMemo(() => {
    return tabs.find(t => t.id === activeTab) || tabs[0] || null;
  }, [tabs, activeTab]);

  if (tabs.length === 0 || !currentTabObj) {
    return (
      <div className="w-full h-80 flex flex-col items-center justify-center bg-white dark:bg-gray-800 rounded-xl border border-slate-200/80 dark:border-gray-700/80 p-6 text-center">
        <div className="w-12 h-12 rounded-xl bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 flex items-center justify-center mb-3 border border-amber-200/60 dark:border-amber-800/40">
          <ShieldAlert size={24} />
        </div>
        <h3 className="text-sm font-bold text-slate-800 dark:text-gray-100 mb-1">
          Acceso Insuficiente
        </h3>
        <p className="text-xs text-slate-500 dark:text-gray-400 max-w-sm mb-3">
          Su perfil de usuario no cuenta con privilegios habilitados para navegar en las funciones de Códigos Maestros.
        </p>
        <span className="text-[10px] font-num text-slate-400 dark:text-gray-500 uppercase tracking-widest bg-slate-100 dark:bg-gray-900 px-2.5 py-0.5 rounded border border-slate-200/50 dark:border-gray-800">
          ERR_PERM_DENIED_PATH
        </span>
      </div>
    );
  }

  const ActiveIcon = currentTabObj.Icon;

  return (
    <div className="w-full h-full flex flex-col bg-slate-50/60 dark:bg-gray-900 rounded-xl border border-slate-200/80 dark:border-gray-700/80 shadow-xs overflow-hidden">
      
      {/* Header Superior */}
      <div className="shrink-0 bg-white dark:bg-gray-800 border-b border-slate-200/80 dark:border-gray-700 px-5 py-2.5">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-sm font-bold text-slate-900 dark:text-gray-100 tracking-tight">
              Gestión de Códigos Maestros
            </h1>
            
            <div className="hidden sm:flex items-center gap-1 text-[11px] font-medium text-slate-400 dark:text-gray-500">
              <span>•</span>
              <span>Maestros</span>
              <ChevronRight size={10} className="opacity-60" />
              <span>Códigos</span>
              {currentTabObj && (
                <>
                  <ChevronRight size={10} className="opacity-60" />
                  <span className="text-[#2383C2] dark:text-[#369BCE] font-semibold">
                    {currentTabObj.label}
                  </span>
                </>
              )}
            </div>

            {periodoAbierto && periodoAbierto.mes && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/40 text-[#2383C2] dark:text-[#369BCE] text-[10px] font-bold border border-blue-200/60 dark:border-blue-800/40 shadow-2xs">
                <Calendar size={11} />
                Período: {periodoAbierto.mes.toUpperCase()} {periodoAbierto.anio}
              </span>
            )}

            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 text-[10px] font-semibold border border-emerald-200/60 dark:border-emerald-800/40">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              En línea
            </span>
          </div>

          <p className="text-[11px] text-slate-500 dark:text-gray-400">
            Control de registros nuevos, concatenación de descriptores y asignación oficial de códigos.
          </p>
        </div>
      </div>

      {/* Barra de Pestañas (Tabs) con Permisos */}
      <div className="shrink-0 bg-slate-100/60 dark:bg-gray-800/60 px-5 py-1.5 border-b border-slate-200/80 dark:border-gray-700 overflow-x-auto scrollbar-none">
        <div className="flex items-center gap-1 min-w-max">
          {tabs.map((tab) => {
            const isActive = currentTabObj.id === tab.id;
            const TabIcon = tab.Icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                type="button"
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md select-none outline-none focus:outline-none focus:ring-0 focus-visible:ring-1 focus-visible:ring-blue-400/50 transition-colors duration-75
                  ${isActive
                    ? 'bg-white dark:bg-gray-900 text-[#2383C2] dark:text-[#369BCE] font-semibold shadow-xs border border-slate-200/80 dark:border-gray-700'
                    : 'text-slate-600 dark:text-gray-400 hover:text-slate-900 dark:hover:text-gray-200 hover:bg-white/60 dark:hover:bg-gray-700/40 border border-transparent'
                  }`}
              >
                <TabIcon 
                  size={14} 
                  className={isActive ? 'text-[#2383C2] dark:text-[#369BCE]' : 'text-slate-400 dark:text-gray-500'} 
                />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Renderizado de Componentes por Pestaña */}
      <div className="flex-grow min-h-0 p-4 overflow-auto">
        {currentTabObj.id === 'pendientes' && <TabPendientes rutaVista={currentTabObj.path} />}
        {currentTabObj.id === 'con_codigo' && <TabConCodigo rutaVista={currentTabObj.path} />}
        {currentTabObj.id === 'todos' && <TabVistaGeneral rutaVista={currentTabObj.path} />}

        {!['pendientes', 'con_codigo', 'todos'].includes(currentTabObj.id) && (
          <div className="w-full h-full min-h-[300px] bg-white dark:bg-gray-800 border border-slate-200/80 dark:border-gray-700 rounded-lg p-6 flex flex-col items-center justify-center text-center shadow-xs">
            <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-950/50 text-[#2383C2] dark:text-[#369BCE] flex items-center justify-center mb-3 border border-blue-100 dark:border-blue-900/40">
              <ActiveIcon size={20} />
            </div>

            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 dark:bg-gray-700 text-slate-600 dark:text-gray-300 mb-2 border border-slate-200/60 dark:border-gray-600">
              <Layers size={11} className="text-slate-400" />
              <span>Módulo Operativo en Espera</span>
            </div>

            <h2 className="text-sm font-bold text-slate-800 dark:text-gray-100 mb-1">
              {currentTabObj.label}
            </h2>

            <p className="text-xs text-slate-500 dark:text-gray-400 max-w-sm leading-relaxed mb-4">
              La vista <span className="font-semibold text-slate-700 dark:text-gray-300">"{currentTabObj.label}"</span> está lista para integrar su subcomponente correspondiente.
            </p>

            <div className="w-full max-w-xs grid grid-cols-2 gap-2 text-left bg-slate-50 dark:bg-gray-900/60 p-2.5 rounded-md border border-slate-200/60 dark:border-gray-700/60 text-[10px]">
              <div>
                <span className="block text-slate-400 dark:text-gray-500">RUTA ASIGNADA</span>
                <span className="font-num text-slate-700 dark:text-gray-300 font-medium truncate block">{PATH_VISTA}</span>
              </div>
              <div>
                <span className="block text-slate-400 dark:text-gray-500">PATH DE LA PESTAÑA</span>
                <span className="font-num text-slate-700 dark:text-gray-300 font-medium truncate block">{currentTabObj.path}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CodigosMaestros;