import React, { useState } from 'react';
import { Calendar, History, AlertTriangle, Plus, CheckCircle, Lock, AlertCircle, PlayCircle, ShieldAlert, RefreshCw } from 'lucide-react';
import { useToast } from '../../../../context/ToastContext';
import { useModal } from '../../../../context/ModalContext';
import { useUser } from '../../../../context/UserContext';

import { MODULOS, MESES, GRUPOS, MODULO_BODEGA } from './constants';
import PanelAperturaPeriodo from './PanelAperturaPeriodo';
import { useControlMensualData } from './useControlMensualData';
import { ModalReapertura, ModalHistorial } from './ModalesControlMensual';
import ModalCierreMes from './ModalCierreMes';

const ControlMensual = () => {
  const anioActualNum = new Date().getFullYear();
  const [anioSeleccionado, setAnioSeleccionado] = useState(anioActualNum.toString());
  const [moduloFiltro, setModuloFiltro] = useState('TODOS');

  const [panelAperturaAbierto, setPanelAperturaAbierto] = useState(false);
  const [anioApertura, setAnioApertura] = useState(anioActualNum.toString());
  const [mesApertura, setMesApertura] = useState(MESES[new Date().getMonth()]?.id || '01');
  const [modulosApertura, setModulosApertura] = useState(MODULOS.map(m => m.id));

  const [modalReapertura, setModalReapertura] = useState(null);
  const [motivoReapertura, setMotivoReapertura] = useState('');
  const [modalHistorial, setModalHistorial] = useState(null);

  const { showToast } = useToast();
  const { confirmAction } = useModal();
  const { userData } = useUser();

  const {
    estadosModulos,
    resumenImputaciones,
    cargando,
    cargandoResumen,
    actualizarResumen,
    procesandoAccion,
    handleAbrirMes,
    handleCerrarMes,
    handleCerrarTodos,
    solicitudCierre,
    cancelarCierre,
    ejecutarCierre,
    ejecutarReapertura
  } = useControlMensualData(anioSeleccionado, userData, showToast, confirmAction);

  const MODULO_COLORES = [
    { bg: 'bg-blue-500', text: 'text-blue-600 dark:text-blue-400', hoverBg: 'hover:bg-blue-50 dark:hover:bg-blue-950/50' },
    { bg: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400', hoverBg: 'hover:bg-emerald-50 dark:hover:bg-emerald-950/50' },
    { bg: 'bg-amber-500', text: 'text-amber-600 dark:text-amber-400', hoverBg: 'hover:bg-amber-50 dark:hover:bg-amber-950/50' },
    { bg: 'bg-purple-500', text: 'text-purple-600 dark:text-purple-400', hoverBg: 'hover:bg-purple-50 dark:hover:bg-purple-950/50' },
    { bg: 'bg-rose-500', text: 'text-rose-600 dark:text-rose-400', hoverBg: 'hover:bg-rose-50 dark:hover:bg-rose-950/50' },
    { bg: 'bg-indigo-500', text: 'text-indigo-600 dark:text-indigo-400', hoverBg: 'hover:bg-indigo-50 dark:hover:bg-indigo-950/50' },
    { bg: 'bg-teal-500', text: 'text-teal-600 dark:text-teal-400', hoverBg: 'hover:bg-teal-50 dark:hover:bg-teal-950/50' },
    { bg: 'bg-cyan-500', text: 'text-cyan-600 dark:text-cyan-400', hoverBg: 'hover:bg-cyan-50 dark:hover:bg-cyan-950/50' },
    { bg: 'bg-orange-500', text: 'text-orange-600 dark:text-orange-400', hoverBg: 'hover:bg-orange-50 dark:hover:bg-orange-950/50' },
    { bg: 'bg-pink-500', text: 'text-pink-600 dark:text-pink-400', hoverBg: 'hover:bg-pink-50 dark:hover:bg-pink-950/50' }
  ];

  const hayMesAbierto = Object.values(estadosModulos).some(moduloData => {
    if (!moduloData || typeof moduloData !== 'object') return false;
    return Object.values(moduloData).some(mesData => {
      const estado = mesData?.estado;
      return estado && estado !== 'SIN_INICIAR';
    });
  });

  // Los módulos se ordenan por grupo (Consumos primero, luego Facturación) en vez
  // de mezclados, para que la matriz se lea agrupada en los dos bloques del consolidado.
  const modulosOrdenadosPorGrupo = GRUPOS.flatMap(grupo => MODULOS.filter(m => grupo.moduloIds.includes(m.id)));

  const modulosVisibles = moduloFiltro === 'TODOS'
    ? modulosOrdenadosPorGrupo
    : modulosOrdenadosPorGrupo.filter(m => m.id === moduloFiltro);

  const mesesIniciados = MESES.filter((mes, index) => {
    const numeroMesStr = String(index + 1).padStart(2, '0');
    const numeroMesAlt = String(index + 1);

    return modulosVisibles.some(mod => {
      const datosModulo = estadosModulos[mod.id] || {};
      const estado = datosModulo[mes.id]?.estado ||
        datosModulo[numeroMesStr]?.estado ||
        datosModulo[numeroMesAlt]?.estado;

      return estado && estado !== 'SIN_INICIAR';
    });
  });

  const renderBadgeEstado = (estado) => {
    switch (estado) {
      case 'ABIERTO':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700">
            <CheckCircle size={9} /> Abierto
          </span>
        );
      case 'REABIERTO':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-300 dark:border-amber-700">
            <AlertCircle size={9} /> Reabierto
          </span>
        );
      case 'CERRADO':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-100 text-slate-700 dark:bg-gray-800 dark:text-gray-300 border border-slate-300 dark:border-gray-600">
            <Lock size={9} /> Cerrado
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium bg-slate-50 text-slate-400 dark:bg-gray-900 dark:text-gray-600 border border-slate-200 dark:border-gray-800">
            Sin Iniciar
          </span>
        );
    }
  };

  return (
    <div className="w-full h-full flex flex-col bg-slate-50 dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-lg shadow-xs overflow-hidden font-sans relative">

      <header className="bg-white dark:bg-gray-800 border-b border-slate-200 dark:border-gray-700 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Calendar size={18} className="text-[#2383C2]" />
          <div>
            <h2 className="text-[13px] font-bold text-slate-800 dark:text-gray-100 uppercase tracking-wide">
              Control y Cierre de Períodos
            </h2>
            <p className="text-[10px] text-slate-500 dark:text-gray-400">
              Matriz detallada de estado, documentos y montos imputados por módulo
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => actualizarResumen()}
            disabled={cargandoResumen}
            className="h-7 px-2 bg-slate-100 dark:bg-gray-700 hover:bg-slate-200 dark:hover:bg-gray-600 text-slate-600 dark:text-gray-300 rounded text-[11px] font-medium flex items-center gap-1 transition disabled:opacity-50"
            title="Volver a calcular documentos y montos (los meses abiertos se recalculan solos cada 5 minutos)"
          >
            <RefreshCw size={12} className={cargandoResumen ? 'animate-spin' : ''} /> Actualizar
          </button>
          <div className="flex items-center gap-1.5">
            <label htmlFor="select-modulo" className="text-[11px] font-medium text-slate-600 dark:text-gray-300">Módulo:</label>
            <select
              id="select-modulo"
              value={moduloFiltro}
              onChange={(e) => setModuloFiltro(e.target.value)}
              className="h-7 border border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-slate-800 dark:text-gray-100 rounded text-[11px] px-2 font-bold outline-none focus:border-[#2383C2]"
            >
              <option value="TODOS">Todos los Módulos</option>
              {MODULOS.map(m => (
                <option key={m.id} value={m.id}>{m.nombre}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <label htmlFor="select-anio" className="text-[11px] font-medium text-slate-600 dark:text-gray-300">Año:</label>
            <select
              id="select-anio"
              value={anioSeleccionado}
              onChange={(e) => setAnioSeleccionado(e.target.value)}
              disabled={hayMesAbierto}
              title={hayMesAbierto ? "No se puede cambiar el año mientras existan períodos en curso o con actividad." : ""}
              className={`h-7 border border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-slate-800 dark:text-gray-100 rounded text-[11px] px-2 font-bold outline-none focus:border-[#2383C2] ${hayMesAbierto ? 'opacity-50 cursor-not-allowed bg-slate-100 dark:bg-gray-800' : ''
                }`}
            >
              {[anioActualNum, anioActualNum + 1].map(a => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>

          <button
            onClick={() => setPanelAperturaAbierto(true)}
            disabled={procesandoAccion}
            className="flex items-center gap-1.5 px-3 py-1 bg-[#2383C2] hover:bg-[#1d6fa5] text-white rounded text-[11px] font-bold shadow-xs transition h-7 cursor-pointer disabled:opacity-50"
          >
            <Plus size={14} />
            Abrir Período
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-4">
        {cargando ? (
          <div className="flex flex-col items-center justify-center h-64 text-slate-500">
            <div className="w-8 h-8 border-2 border-[#2383C2] border-t-transparent rounded-full animate-spin mb-2" />
            <p className="text-[11px]">Cargando consolidado de cierres...</p>
          </div>
        ) : mesesIniciados.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 bg-white dark:bg-gray-800 rounded-lg border border-slate-200 dark:border-gray-700 text-center space-y-3">
            <Calendar size={36} className="text-slate-300 dark:text-gray-600" />
            <div>
              <p className="text-[13px] font-bold text-slate-700 dark:text-gray-200">
                No hay meses abiertos para el año {anioSeleccionado}
              </p>
              <p className="text-[11px] text-slate-400 dark:text-gray-500">
                Usa el botón "Abrir Período" para iniciar el flujo de un nuevo mes.
              </p>
            </div>
            <button
              onClick={() => setPanelAperturaAbierto(true)}
              className="px-3 py-1.5 bg-[#2383C2] hover:bg-[#1d6fa5] text-white text-[11px] font-bold rounded shadow-xs transition flex items-center gap-1.5 cursor-pointer"
            >
              <Plus size={14} />
              Abrir Período
            </button>
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-slate-200 dark:border-gray-700 overflow-hidden shadow-xs min-w-max">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-gray-900/60 border-b border-slate-200 dark:border-gray-700 text-[9px] font-bold uppercase tracking-widest text-slate-500 dark:text-gray-400">
                  <th rowSpan={3} className="py-2.5 px-3 border-r border-slate-200 dark:border-gray-700 bg-slate-100 dark:bg-gray-900 sticky left-0 z-10 w-36">
                    Período
                  </th>
                  {GRUPOS.map((grupo) => {
                    const modulosGrupoVisibles = modulosVisibles.filter(m => grupo.moduloIds.includes(m.id));
                    if (modulosGrupoVisibles.length === 0) return null;

                    return (
                      <th
                        key={grupo.id}
                        colSpan={modulosGrupoVisibles.length * 3}
                        className="py-1.5 px-2 text-center border-r border-slate-200 dark:border-gray-700"
                      >
                        {grupo.nombre}
                      </th>
                    );
                  })}
                </tr>

                <tr className="bg-slate-100 dark:bg-gray-900 border-b border-slate-200 dark:border-gray-700 text-[10px] font-bold uppercase tracking-wider text-slate-700 dark:text-gray-200">
                  {modulosVisibles.map((mod) => {
                    const modIndex = MODULOS.findIndex(m => m.id === mod.id);
                    const colorConfig = MODULO_COLORES[modIndex % MODULO_COLORES.length];

                    return (
                      <th
                        key={mod.id}
                        colSpan={3}
                        className="py-2 px-2 text-center border-r border-slate-200 dark:border-gray-700 bg-slate-50 dark:bg-gray-800/80"
                      >
                        <div className="flex items-center justify-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full ${colorConfig.bg}`}></span>
                          <span>{mod.nombre}</span>
                        </div>
                      </th>
                    );
                  })}
                </tr>

                <tr className="bg-slate-50 dark:bg-gray-900/60 border-b border-slate-200 dark:border-gray-700 text-[8px] font-bold uppercase tracking-wider text-slate-500 dark:text-gray-400">
                  {modulosVisibles.map((mod) => (
                    <React.Fragment key={`sub_${mod.id}`}>
                      <th className="py-1.5 px-1.5 text-center border-r border-slate-100 dark:border-gray-800 w-24">Estado / Acción</th>
                      {mod.id === MODULO_BODEGA ? (
                        <>
                          <th className="py-1.5 px-1.5 text-right border-r border-slate-100 dark:border-gray-800 w-12" title="Movimientos del período">Movs</th>
                          <th className="py-1.5 px-1.5 text-right border-r border-slate-200 dark:border-gray-700 w-20" title="Saldo valorizado de la bodega: final si el mes está cerrado, actual si está abierto">Saldo</th>
                        </>
                      ) : (
                        <>
                          <th className="py-1.5 px-1.5 text-right border-r border-slate-100 dark:border-gray-800 w-12">Docs</th>
                          <th className="py-1.5 px-1.5 text-right border-r border-slate-200 dark:border-gray-700 w-20">Monto Total</th>
                        </>
                      )}
                    </React.Fragment>
                  ))}
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-200 dark:divide-gray-700 text-[10px]">
                {mesesIniciados.map((mes) => {
                  const indexMesReal = MESES.findIndex(m => m.id === mes.id || m.nombre === mes.nombre);
                  let numeroMesReal = indexMesReal !== -1 ? indexMesReal + 1 : parseInt(mes.id, 10);
                  if (isNaN(numeroMesReal)) {
                    numeroMesReal = mes.id || 'N/A';
                  }

                  const hayModuloAbiertoEnMes = MODULOS.some(mod => {
                    const estadoMod = estadosModulos[mod.id]?.[mes.id]?.estado;
                    return estadoMod === 'ABIERTO' || estadoMod === 'REABIERTO';
                  });

                  return (
                    <tr key={mes.id} className="hover:bg-slate-50/80 dark:hover:bg-gray-800/50 transition-colors">
                      <td className="py-2 px-3 font-bold text-slate-800 dark:text-gray-100 border-r border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 sticky left-0 z-10">
                        <div className="flex items-center justify-between gap-1.5">
                          <span className="uppercase">
                            {numeroMesReal} {anioSeleccionado}
                          </span>
                          {hayModuloAbiertoEnMes && (
                            <button
                              onClick={() => handleCerrarTodos(mes.id)}
                              disabled={procesandoAccion}
                              title={`Cerrar todos los módulos para el período ${numeroMesReal} ${anioSeleccionado}`}
                              className="px-1 py-0.5 bg-slate-100 hover:bg-slate-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-slate-600 dark:text-gray-300 rounded text-[8px] font-bold flex items-center gap-0.5 transition cursor-pointer disabled:opacity-50 shrink-0"
                            >
                              <ShieldAlert size={9} className="text-amber-500" />
                              Cerrar Todos
                            </button>
                          )}
                        </div>
                      </td>

                      {modulosVisibles.map((mod) => {
                        const modIndex = MODULOS.findIndex(m => m.id === mod.id);
                        const colorConfig = MODULO_COLORES[modIndex % MODULO_COLORES.length];

                        const cierreData = estadosModulos[mod.id]?.[mes.id] || {};
                        const estado = cierreData.estado || 'SIN_INICIAR';
                        const infoImputacion = resumenImputaciones[mod.id]?.[mes.id] || { cantidad: 0, montoTotal: 0 };
                        const tieneHistorial = cierreData.historialReaperturas?.length > 0;
                        // Bodega: no se reabre si el mes siguiente ya cerró (encadenamiento de saldos).
                        const siguienteMes = MESES[indexMesReal + 1];
                        const reaperturaBloqueada = mod.id === MODULO_BODEGA && siguienteMes
                          && estadosModulos[mod.id]?.[siguienteMes.id]?.estado === 'CERRADO';

                        return (
                          <React.Fragment key={`${mes.id}_${mod.id}`}>
                            <td className="py-2 px-1.5 border-r border-slate-100 dark:border-gray-800 align-middle">
                              <div className="flex items-center justify-between gap-1">
                                {renderBadgeEstado(estado)}

                                <div className="flex items-center gap-0.5">
                                  {estado === 'SIN_INICIAR' && (
                                    <button
                                      onClick={() => handleAbrirMes(mes.id, mod.id, anioSeleccionado, setAnioSeleccionado)}
                                      disabled={procesandoAccion}
                                      title={`Abrir ${numeroMesReal}/${anioSeleccionado} para ${mod.nombre}`}
                                      className={`p-1 ${colorConfig.text} ${colorConfig.hoverBg} rounded transition cursor-pointer disabled:opacity-50`}
                                    >
                                      <PlayCircle size={12} />
                                    </button>
                                  )}

                                  {(estado === 'ABIERTO' || estado === 'REABIERTO') && (
                                    <button
                                      onClick={() => handleCerrarMes(mes.id, mod.id)}
                                      disabled={procesandoAccion}
                                      title={`Cerrar ${numeroMesReal}/${anioSeleccionado} para ${mod.nombre}`}
                                      className={`p-1 ${colorConfig.text} ${colorConfig.hoverBg} rounded transition cursor-pointer disabled:opacity-50`}
                                    >
                                      <Lock size={12} />
                                    </button>
                                  )}

                                  {estado === 'CERRADO' && (
                                    <button
                                      onClick={() => setModalReapertura({ mesId: mes.id, modId: mod.id })}
                                      disabled={procesandoAccion || reaperturaBloqueada}
                                      title={reaperturaBloqueada
                                        ? 'No se puede reabrir: el mes siguiente de Bodega ya está cerrado'
                                        : `Reabrir ${numeroMesReal}/${anioSeleccionado} para ${mod.nombre}`}
                                      className={`p-1 ${colorConfig.text} ${colorConfig.hoverBg} rounded transition cursor-pointer disabled:opacity-50`}
                                    >
                                      <AlertTriangle size={12} />
                                    </button>
                                  )}

                                  {tieneHistorial && (
                                    <button
                                      onClick={() => setModalHistorial({
                                        mes: numeroMesReal,
                                        anio: anioSeleccionado,
                                        moduloNombre: mod.nombre,
                                        historialReaperturas: cierreData.historialReaperturas
                                      })}
                                      title="Ver historial de reaperturas"
                                      className={`p-1 ${colorConfig.text} ${colorConfig.hoverBg} rounded transition cursor-pointer`}
                                    >
                                      <History size={12} />
                                    </button>
                                  )}
                                </div>
                              </div>
                            </td>

                            <td className={`py-2 px-1.5 border-r border-slate-100 dark:border-gray-800 text-right font-medium ${colorConfig.text} align-middle`}>
                              {infoImputacion.cantidad.toLocaleString('es-CL')}
                            </td>

                            <td className={`py-2 px-1.5 border-r border-slate-200 dark:border-gray-700 text-right font-bold ${colorConfig.text} align-middle`}>
                              ${infoImputacion.montoTotal.toLocaleString('es-CL')}
                            </td>
                          </React.Fragment>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <PanelAperturaPeriodo
        isOpen={panelAperturaAbierto}
        onClose={() => setPanelAperturaAbierto(false)}
        anioApertura={anioApertura}
        setAnioApertura={setAnioApertura}
        mesApertura={mesApertura}
        setMesApertura={setMesApertura}
        modulosSeleccionados={modulosApertura}
        setModulosSeleccionados={setModulosApertura}
        onConfirm={({ mesId, modulos }) => {
          setAnioSeleccionado(anioApertura);
          handleAbrirMes(mesId, modulos, anioApertura, setAnioSeleccionado);
          setPanelAperturaAbierto(false);
        }}
      />

      <ModalReapertura
        modalReapertura={modalReapertura}
        setModalReapertura={setModalReapertura}
        anioSeleccionado={anioSeleccionado}
        motivoReapertura={motivoReapertura}
        setMotivoReapertura={setMotivoReapertura}
        ejecutarReapertura={() => ejecutarReapertura(modalReapertura, motivoReapertura, () => {
          setModalReapertura(null);
          setMotivoReapertura('');
        })}
        procesandoAccion={procesandoAccion}
      />

      <ModalHistorial
        modalHistorial={modalHistorial}
        setModalHistorial={setModalHistorial}
      />

      {solicitudCierre && (
        <ModalCierreMes
          key={`${anioSeleccionado}_${solicitudCierre.mesId}_${solicitudCierre.modulos.join('-')}`}
          solicitud={solicitudCierre}
          anio={anioSeleccionado}
          onCancelar={cancelarCierre}
          onConfirmar={ejecutarCierre}
        />
      )}

    </div>
  );
};

export default ControlMensual;