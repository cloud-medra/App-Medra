import React, { useEffect, useMemo, useState } from 'react';
import { Calendar, CheckCircle2, Clock, List, ShieldAlert } from 'lucide-react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../../../firebaseConfig';
import { useGranularPermission } from '../../../../hooks/useGranularPermission';
import { useCatalogo } from '../../../../hooks/useCatalogo';
import { RUTA_CODIGOS_MAESTROS, RUTA_CODIGOS_IMPLANTES, RUTA_CODIGOS_HEMODINAMIA } from '../codigosMaestros/rutasCodigos';
import TabPendientesV2 from './tabs/TabPendientesV2';
import TabConCodigoV2 from './tabs/TabConCodigoV2';
import TabVistaGeneralV2 from './tabs/TabVistaGeneralV2';
import { tieneCodigo } from './camposCodigo';

// Vista nueva de Códigos: mismas pestañas, rutas y permisos que
// CodigosMaestros.jsx (cada pestaña es un `proceso` de rutaBase).
const PESTANAS = [
  { id: 'pendientes', label: 'Sin código', Icon: Clock, sub: 'pendientes' },
  { id: 'con_codigo', label: 'Con código', Icon: CheckCircle2, sub: 'conCodigo' },
  { id: 'todos', label: 'Vista general', Icon: List, sub: 'vistaGeneral' }
];

const MODULO_POR_RUTA = {
  [RUTA_CODIGOS_MAESTROS]: 'Maestros',
  [RUTA_CODIGOS_IMPLANTES]: 'Implantes',
  [RUTA_CODIGOS_HEMODINAMIA]: 'Hemodinamia'
};

const CodigosMaestrosV2 = ({ rutaBase = RUTA_CODIGOS_MAESTROS, selectorVista = null } = {}) => {
  const { hasAccesoProceso } = useGranularPermission();
  const tabs = useMemo(
    () => PESTANAS.map((t) => ({ ...t, path: `${rutaBase}/${t.sub}` })).filter((t) => hasAccesoProceso(t.path)),
    [rutaBase, hasAccesoProceso]
  );
  const [activeTab, setActiveTab] = useState(() => tabs[0]?.id || '');
  const actual = tabs.find((t) => t.id === activeTab) || tabs[0] || null;

  // Contadores de las pestañas: del mismo catálogo en memoria que ya usan
  // las pestañas (no agrega lecturas).
  const { datos: codigos, cargado } = useCatalogo('codigos', { habilitado: tabs.length > 0 });
  const conteo = useMemo(() => {
    const con = codigos.filter((c) => c.tieneCodigo === true || tieneCodigo(c)).length;
    return { pendientes: codigos.filter((c) => !tieneCodigo(c)).length, con_codigo: con, todos: codigos.length };
  }, [codigos]);

  // Período activo: el mismo listener de un documento que tiene la vista clásica.
  const [periodo, setPeriodo] = useState(null);
  useEffect(() => {
    const unsubscribe = onSnapshot(
      doc(db, 'configuracion_periodos', 'periodo_activo'),
      (snap) => setPeriodo(snap.exists() ? snap.data() : null),
      (error) => console.error('Error al escuchar período activo:', error)
    );
    return () => unsubscribe();
  }, []);

  if (!actual) {
    return (
      <div className="w-full h-80 flex flex-col items-center justify-center gap-2 bg-white dark:bg-gray-900 rounded-lg border border-slate-200 dark:border-gray-700 p-6 text-center">
        <ShieldAlert size={28} className="text-slate-400" />
        <h3 className="text-[14px] font-semibold text-slate-800 dark:text-gray-100">Acceso insuficiente</h3>
        <p className="text-[13px] text-slate-500 dark:text-gray-400 max-w-sm">Tu perfil no tiene habilitada ninguna pestaña de Códigos.</p>
        {selectorVista && <div className="mt-2">{selectorVista}</div>}
      </div>
    );
  }

  const modulo = MODULO_POR_RUTA[rutaBase] || 'Maestros';

  return (
    <div className="w-full h-full flex flex-col bg-white dark:bg-gray-900 rounded-lg border border-slate-200 dark:border-gray-700 overflow-hidden">
      <header className="shrink-0 px-5 pt-4 border-b border-slate-200 dark:border-gray-700">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400 dark:text-gray-500">{modulo}</p>
            <div className="mt-0.5 flex flex-wrap items-center gap-2.5">
              <h1 className="text-[18px] font-semibold tracking-tight text-slate-900 dark:text-gray-50">Códigos maestros</h1>
              {periodo?.mes && (
                <span className="inline-flex items-center gap-1 text-[12px] text-slate-500 dark:text-gray-400">
                  <Calendar size={13} /> Período {periodo.mes.toUpperCase()} {periodo.anio}
                </span>
              )}
            </div>
            <p className="mt-0.5 text-[12px] text-slate-500 dark:text-gray-400">Registro de productos, asignación de códigos definitivos y precios.</p>
          </div>
          {selectorVista}
        </div>

        <nav className="mt-3 -mb-px flex items-center gap-5 overflow-x-auto" role="tablist">
          {tabs.map((tab) => {
            const activa = tab.id === actual.id;
            const Icono = tab.Icon;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activa}
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex items-center gap-1.5 pb-2.5 pt-1 border-b-2 text-[13px] whitespace-nowrap transition-colors outline-none focus-visible:text-[#2383C2] ${activa
                  ? 'border-[#2383C2] text-slate-900 dark:text-gray-50 font-semibold'
                  : 'border-transparent text-slate-500 dark:text-gray-400 hover:text-slate-800 dark:hover:text-gray-200 hover:border-slate-300 dark:hover:border-gray-600'}`}
              >
                <Icono size={14} className={activa ? 'text-[#2383C2]' : ''} />
                {tab.label}
                {cargado && (
                  <span className={`ml-0.5 px-1.5 rounded-full text-[11px] tabular-nums ${activa ? 'bg-[#2383C2]/10 text-[#2383C2] dark:text-[#369BCE]' : 'bg-slate-100 dark:bg-gray-800 text-slate-500 dark:text-gray-400'}`}>
                    {conteo[tab.id].toLocaleString('es-ES')}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </header>

      <div className="flex-1 min-h-0 bg-white dark:bg-gray-900">
        {actual.id === 'pendientes' && <TabPendientesV2 rutaVista={actual.path} />}
        {actual.id === 'con_codigo' && <TabConCodigoV2 rutaVista={actual.path} />}
        {actual.id === 'todos' && <TabVistaGeneralV2 rutaVista={actual.path} />}
      </div>
    </div>
  );
};

export default CodigosMaestrosV2;
