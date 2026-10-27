import { useState, useEffect } from 'react';
import { ShieldAlert, ChevronRight, Calendar } from 'lucide-react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../../../firebaseConfig';
import { useGranularPermission } from '../../../../hooks/useGranularPermission';

// Marco de cada ítem de "Control Procesos" de Laboratorio y Vacunatorio
// (antes, una pestaña del orquestador; ver config/pestanasControlProcesos.js):
// encabezado con el período activo y el contenido de la fase. La fase se
// muestra si su ruta está en permisosGranulares (hasAccesoProceso), el mismo
// criterio con que antes aparecía la pestaña; el contenido sigue
// controlándose con hasPermission(ruta) desde cada fase.
const FaseControlProcesos = ({ etiquetaModulo, label, path, children }) => {
  const { hasAccesoProceso } = useGranularPermission();
  const [periodoAbierto, setPeriodoAbierto] = useState(null);

  useEffect(() => {
    const refPeriodo = doc(db, "configuracion_periodos", "periodo_activo");
    const unsubscribe = onSnapshot(refPeriodo, (docSnap) => {
      setPeriodoAbierto(docSnap.exists() ? docSnap.data() : null);
    }, (error) => {
      console.error("Error al escuchar período activo:", error);
    });
    return () => unsubscribe();
  }, []);

  if (!hasAccesoProceso(path)) {
    return (
      <div className="w-full h-80 flex flex-col items-center justify-center bg-white dark:bg-gray-800 rounded-xl border border-slate-200/80 dark:border-gray-700/80 p-6 text-center">
        <div className="w-12 h-12 rounded-xl bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 flex items-center justify-center mb-3 border border-amber-200/60 dark:border-amber-800/40">
          <ShieldAlert size={24} />
        </div>
        <h3 className="text-sm font-bold text-slate-800 dark:text-gray-100 mb-1">
          Acceso Insuficiente
        </h3>
        <p className="text-xs text-slate-500 dark:text-gray-400 max-w-sm mb-3">
          Su perfil de usuario no cuenta con privilegios habilitados para "{label}".
        </p>
        <span className="text-[10px] font-num text-slate-400 dark:text-gray-500 uppercase tracking-widest bg-slate-100 dark:bg-gray-900 px-2.5 py-0.5 rounded border border-slate-200/50 dark:border-gray-800">
          ERR_PERM_DENIED_PATH
        </span>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col bg-slate-50/60 dark:bg-gray-900 rounded-xl border border-slate-200/80 dark:border-gray-700/80 shadow-xs overflow-hidden">

      {/* Encabezado */}
      <div className="shrink-0 bg-white dark:bg-gray-800 border-b border-slate-200/80 dark:border-gray-700 px-5 py-2.5">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-sm font-bold text-slate-900 dark:text-gray-100 tracking-tight">
              {label}
            </h1>

            <div className="hidden sm:flex items-center gap-1 text-[11px] font-medium text-slate-400 dark:text-gray-500">
              <span>•</span>
              <span>{etiquetaModulo}</span>
              <ChevronRight size={10} className="opacity-60" />
              <span className="text-[#2383C2] dark:text-[#369BCE] font-semibold">{label}</span>
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
            Conciliación de operaciones, asignación de folios e integración de registros.
          </p>
        </div>
      </div>

      <div className="flex-grow min-h-0 p-4 overflow-auto">
        {children}
      </div>
    </div>
  );
};

export default FaseControlProcesos;
