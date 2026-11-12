import React from 'react';
import { X, Calendar, CheckSquare, Square, ShieldCheck } from 'lucide-react';
import { MODULOS, etiquetaMes } from './constants';
import { useCierresAnio } from './cierresAnioStore';
import {
    estadoMesModulo, modulosDisponiblesParaMes, mesesDisponiblesApertura, periodosAbiertosDeModulos, mensajeBloqueoApertura
} from './disponibilidadApertura';

// Orden del panel: año → mes → módulos. Los estados se leen del año elegido
// en el panel (no del de la tabla). Un mes aparece mientras quede algún
// módulo sin estado en él; en la lista de módulos, los que ya tienen estado
// en ese mes se muestran deshabilitados con su estado.
const PanelAperturaPeriodo = ({ isOpen, ...props }) => {
    if (!isOpen) return null;
    return <ContenidoPanelApertura {...props} />;
};

const ContenidoPanelApertura = ({
    onClose,
    anioApertura,
    setAnioApertura,
    mesApertura,
    setMesApertura,
    modulosSeleccionados,
    setModulosSeleccionados,
    onConfirm
}) => {
    const { estadosModulos, cargando } = useCierresAnio(String(anioApertura));

    const anioActual = new Date().getFullYear();
    const listaAnios = [anioActual, anioActual + 1];

    const mesesDisponibles = cargando ? [] : mesesDisponiblesApertura(estadosModulos);

    // Si el mes guardado ya no está disponible (cambió el año o se abrió en
    // todos los módulos), se usa el primero de la lista, que es el que
    // muestra el select.
    const mesEfectivo = mesesDisponibles.some(m => m.id === mesApertura)
        ? mesApertura
        : mesesDisponibles[0]?.id;
    const modulosDisponibles = mesEfectivo ? modulosDisponiblesParaMes(estadosModulos, mesEfectivo) : [];
    const modulosAAbrir = modulosSeleccionados.filter(id => modulosDisponibles.includes(id));
    // Solo bloquean los módulos marcados que ya tienen un mes abierto en el año.
    const bloqueos = periodosAbiertosDeModulos(estadosModulos, modulosAAbrir);
    const todosSeleccionados = modulosDisponibles.length > 0 && modulosAAbrir.length === modulosDisponibles.length;

    const toggleModulo = (modId) => {
        if (!modulosDisponibles.includes(modId)) return;
        if (modulosSeleccionados.includes(modId)) {
            setModulosSeleccionados(modulosSeleccionados.filter(id => id !== modId));
        } else {
            setModulosSeleccionados([...modulosSeleccionados, modId]);
        }
    };

    const seleccionarTodosModulos = () => {
        setModulosSeleccionados(todosSeleccionados ? [] : modulosDisponibles);
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px] flex justify-end">
            <div className="w-full max-w-sm bg-white dark:bg-gray-800 h-full shadow-2xl border-l border-slate-200 dark:border-gray-700 flex flex-col animate-in slide-in-from-right duration-200">

                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-gray-700 bg-slate-50 dark:bg-gray-900">
                    <div className="flex items-center gap-2 text-[#2383C2]">
                        <Calendar size={18} />
                        <h3 className="text-[13px] font-bold uppercase tracking-wide">Apertura de Período</h3>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-slate-400 hover:text-slate-600 dark:hover:text-gray-200 cursor-pointer p-1"
                    >
                        <X size={16} />
                    </button>
                </div>

                <div className="p-4 flex-1 overflow-y-auto space-y-4 text-[11px]">

                    {bloqueos.length > 0 && (
                        <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded text-rose-800 dark:text-rose-300 text-[10px] space-y-1">
                            {bloqueos.map(b => (
                                <p key={`${b.modId}_${b.mesId}`}>⚠️ {mensajeBloqueoApertura(b, anioApertura)}</p>
                            ))}
                        </div>
                    )}

                    <div className="space-y-1.5">
                        <label className="font-bold text-slate-700 dark:text-gray-300 block">Año del Período</label>
                        <select
                            value={anioApertura}
                            onChange={(e) => setAnioApertura(e.target.value)}
                            className="w-full h-8 border border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-slate-800 dark:text-gray-100 rounded px-2 font-bold outline-none focus:border-[#2383C2]"
                        >
                            {listaAnios.map(a => (
                                <option key={a} value={a}>{a}</option>
                            ))}
                        </select>
                    </div>

                    <div className="space-y-1.5">
                        <label className="font-bold text-slate-700 dark:text-gray-300 block">Mes a Abrir</label>
                        {cargando ? (
                            <div className="p-3 text-slate-400 text-[10px]">Cargando períodos de {anioApertura}…</div>
                        ) : mesesDisponibles.length === 0 ? (
                            <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded text-amber-800 dark:text-amber-300 text-[10px]">
                                Todos los meses del año {anioApertura} ya se encuentran abiertos o inicializados en todos los módulos.
                            </div>
                        ) : (
                            <select
                                value={mesEfectivo}
                                onChange={(e) => setMesApertura(e.target.value)}
                                className="w-full h-8 border border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-slate-800 dark:text-gray-100 rounded px-2 font-bold outline-none focus:border-[#2383C2] uppercase"
                            >
                                {mesesDisponibles.map(m => (
                                    <option key={m.id} value={m.id}>{etiquetaMes(m)}</option>
                                ))}
                            </select>
                        )}
                        <p className="text-[9px] text-slate-400">Nota: Un mes se oculta cuando ya está abierto o cerrado en todos los módulos.</p>
                    </div>

                    <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-gray-700">
                        <div className="flex items-center justify-between">
                            <label className="font-bold text-slate-700 dark:text-gray-300">Módulos Afectados</label>
                            <button
                                onClick={seleccionarTodosModulos}
                                className="text-[#2383C2] hover:underline font-bold text-[10px] cursor-pointer"
                            >
                                {todosSeleccionados ? 'Deseleccionar todos' : 'Seleccionar todos'}
                            </button>
                        </div>

                        <div className="space-y-1.5">
                            {MODULOS.map(mod => {
                                const estadoEnMes = mesEfectivo ? estadoMesModulo(estadosModulos, mod.id, mesEfectivo) : null;
                                const disponible = modulosDisponibles.includes(mod.id);
                                const seleccionado = modulosAAbrir.includes(mod.id);
                                return (
                                    <div
                                        key={mod.id}
                                        onClick={() => toggleModulo(mod.id)}
                                        aria-disabled={!disponible}
                                        className={`flex items-center justify-between p-2 rounded border transition-colors ${!disponible
                                            ? 'border-slate-200 dark:border-gray-700 bg-slate-50 dark:bg-gray-900/60 text-slate-400 dark:text-gray-500 cursor-not-allowed'
                                            : seleccionado
                                                ? 'border-[#2383C2] bg-blue-50/50 dark:bg-blue-950/20 text-slate-800 dark:text-gray-100 font-bold cursor-pointer'
                                                : 'border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-slate-500 dark:text-gray-400 cursor-pointer'
                                        }`}
                                    >
                                        <span>{mod.nombre}</span>
                                        {!disponible ? (
                                            <span className="text-[9px] font-bold uppercase">{estadoEnMes}</span>
                                        ) : seleccionado ? (
                                            <CheckSquare size={15} className="text-[#2383C2]" />
                                        ) : (
                                            <Square size={15} className="text-slate-300 dark:text-gray-600" />
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                </div>

                <div className="p-3 border-t border-slate-200 dark:border-gray-700 bg-slate-50 dark:bg-gray-900 flex justify-end gap-2">
                    <button
                        onClick={onClose}
                        className="px-3 py-1.5 bg-slate-200 dark:bg-gray-700 text-slate-700 dark:text-gray-300 rounded text-[11px] font-bold hover:bg-slate-300 transition cursor-pointer"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={() => onConfirm({ mesId: mesEfectivo, modulos: modulosAAbrir })}
                        disabled={!mesEfectivo || modulosAAbrir.length === 0 || bloqueos.length > 0}
                        className="px-3 py-1.5 bg-[#2383C2] hover:bg-[#1d6fa5] text-white rounded text-[11px] font-bold shadow-xs transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <ShieldCheck size={14} />
                        Confirmar Apertura
                    </button>
                </div>

            </div>
        </div>
    );
};

export default PanelAperturaPeriodo;