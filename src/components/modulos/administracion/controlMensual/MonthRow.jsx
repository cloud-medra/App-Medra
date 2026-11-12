import React, { useState } from 'react';
import { Lock, Unlock, RefreshCw, Layers, ChevronRight, ChevronDown, History } from 'lucide-react';

export const BadgeEstado = ({ estado }) => {
  const estilos = {
    ABIERTO: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800',
    CERRADO: 'bg-slate-100 text-tinta-principal border-slate-300 dark:bg-slate-800 dark:border-slate-700',
    REABIERTO: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800',
    MIXTO: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-400 dark:border-sky-800',
    DEFAULT: 'bg-gray-50 text-tinta-secundaria border-gray-200 dark:bg-gray-800 dark:border-gray-700',
  };

  const iconos = {
    ABIERTO: <Unlock size={10} />,
    CERRADO: <Lock size={10} />,
    REABIERTO: <RefreshCw size={10} />,
    MIXTO: <Layers size={10} />,
  };

  const estiloActual = estilos[estado] || estilos.DEFAULT;
  const iconoActual = iconos[estado] || null;

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-pequeno tracking-wide border uppercase ${estiloActual}`}>
      {iconoActual}
      {estado || 'SIN INICIAR'}
    </span>
  );
};

const MonthRow = ({
  mes,
  anioSeleccionado,
  moduloFiltro,
  estadoConsolidado,
  metricasConsolidadas,
  modulosObjetivo,
  estadosModulos,
  resumenImputaciones,
  onAbrir,
  onCerrar,
  onSolicitarReapertura,
  onVerHistorial
}) => {
  const [desplegado, setDesplegado] = useState(false);

  return (
    <>
      <tr className="border-b border-slate-200 dark:border-gray-800 hover:bg-slate-50/80 dark:hover:bg-gray-800/50 transition-colors text-normal text-tinta-principal">
        <td className="py-3 px-4 text-etiqueta flex items-center gap-2">
          {moduloFiltro === 'TODOS' && (
            <button
              onClick={() => setDesplegado(!desplegado)}
              className="text-tinta-atenuada hover:text-tinta-secundaria p-0.5 rounded transition"
            >
              {desplegado ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          )}
          <span className="uppercase tracking-wider text-etiqueta text-tinta-principal">
            {mes.nombre}
          </span>
          <span className="text-numero-tabla text-tinta-atenuada">/{anioSeleccionado}</span>
        </td>

        <td className="py-3 px-4">
          <BadgeEstado estado={estadoConsolidado} />
        </td>

        <td className="py-3 px-4 text-numero-tabla text-right text-tinta-secundaria">
          {metricasConsolidadas.cantidad.toLocaleString('es-CL')} docs
        </td>

        <td className="py-3 px-4 text-numero-tabla text-right text-tinta-principal">
          ${Math.round(metricasConsolidadas.montoTotal).toLocaleString('es-CL')}
        </td>

        <td className="py-3 px-4 text-right">
          <div className="flex items-center justify-end gap-1.5">
            {estadoConsolidado === 'CERRADO' ? (
              <button
                onClick={() => onSolicitarReapertura(mes.id)}
                className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-300 dark:bg-amber-950/30 dark:hover:bg-amber-900/50 dark:text-amber-300 dark:border-amber-800 rounded text-pequeno transition inline-flex items-center gap-1"
              >
                <RefreshCw size={10} /> Reabrir
              </button>
            ) : (
              <>
                <button
                  onClick={() => onAbrir(mes.id)}
                  className="px-2.5 py-1 bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-300 dark:bg-sky-950/30 dark:hover:bg-sky-900/50 dark:text-sky-300 dark:border-sky-800 rounded text-pequeno transition inline-flex items-center gap-1"
                >
                  <Unlock size={10} /> Abrir
                </button>
                <button
                  onClick={() => onCerrar(mes.id)}
                  className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-tinta-principal border border-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 dark:border-slate-600 rounded text-pequeno transition inline-flex items-center gap-1"
                >
                  <Lock size={10} /> Cerrar
                </button>
              </>
            )}
          </div>
        </td>
      </tr>

      {desplegado && moduloFiltro === 'TODOS' && (
        <tr className="bg-slate-50/50 dark:bg-gray-900/60 border-b border-slate-200 dark:border-gray-800">
          <td colSpan={5} className="py-2 px-8">
            <div className="bg-white dark:bg-gray-800 rounded border border-slate-200 dark:border-gray-700 overflow-hidden my-1">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-100/70 dark:bg-gray-700/50 text-pequeno uppercase tracking-wider text-tinta-secundaria border-b border-slate-200 dark:border-gray-700">
                    <th className="py-1.5 px-3 text-etiqueta">Módulo</th>
                    <th className="py-1.5 px-3 text-etiqueta">Estado</th>
                    <th className="py-1.5 px-3 text-etiqueta text-right">Documentos</th>
                    <th className="py-1.5 px-3 text-etiqueta text-right">Monto Total</th>
                    <th className="py-1.5 px-3 text-etiqueta text-right">Acciones Modulares</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-gray-700/50 text-pequeno">
                  {modulosObjetivo.map((mod) => {
                    const estMod = estadosModulos[mod.id]?.[mes.id]?.estado || 'SIN_INICIAR';
                    const resMod = resumenImputaciones[mod.id]?.[mes.id] || { cantidad: 0, montoTotal: 0 };
                    const infoMod = estadosModulos[mod.id]?.[mes.id] || {};

                    return (
                      <tr key={mod.id} className="hover:bg-slate-50 dark:hover:bg-gray-700/30">
                        <td className="py-1.5 px-3 text-tinta-principal">
                          {mod.nombre}
                        </td>
                        <td className="py-1.5 px-3">
                          <BadgeEstado estado={estMod} />
                        </td>
                        <td className="py-1.5 px-3 text-numero-tabla text-right text-tinta-secundaria">
                          {resMod.cantidad} docs
                        </td>
                        <td className="py-1.5 px-3 text-numero-tabla text-right text-tinta-principal">
                          ${Math.round(resMod.montoTotal).toLocaleString('es-CL')}
                        </td>
                        <td className="py-1.5 px-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {estMod === 'CERRADO' ? (
                              <button
                                onClick={() => onSolicitarReapertura(mes.id, mod.id)}
                                className="p-1 hover:bg-amber-100 text-amber-700 dark:hover:bg-amber-900/40 dark:text-amber-400 rounded transition"
                                title="Reabrir módulo"
                              >
                                <RefreshCw size={11} />
                              </button>
                            ) : estMod === 'ABIERTO' || estMod === 'REABIERTO' ? (
                              <button
                                onClick={() => onCerrar(mes.id, mod.id)}
                                className="p-1 hover:bg-rose-100 text-rose-700 dark:hover:bg-rose-900/40 dark:text-rose-400 rounded transition"
                                title="Cerrar módulo"
                              >
                                <Lock size={11} />
                              </button>
                            ) : (
                              <button
                                onClick={() => onAbrir(mes.id, mod.id)}
                                className="p-1 hover:bg-sky-100 text-sky-700 dark:hover:bg-sky-900/40 dark:text-sky-400 rounded transition"
                                title="Abrir módulo"
                              >
                                <Unlock size={11} />
                              </button>
                            )}

                            {infoMod.historialReaperturas?.length > 0 && (
                              <button
                                onClick={() => onVerHistorial({ ...infoMod, moduloNombre: mod.nombre })}
                                className="p-1 text-tinta-atenuada hover:text-tinta-secundaria transition"
                                title="Historial de reaperturas"
                              >
                                <History size={11} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </td>
        </tr>
      )}
    </>
  );
};

export default MonthRow;