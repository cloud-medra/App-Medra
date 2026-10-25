import { useMemo } from 'react';
import {
  CalendarCheck,
  DollarSign,
  Lock,
  AlertCircle,
  CheckCircle2,
  Clock,
  Layers,
  Building2,
  History,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Scale
} from 'lucide-react';
import { useUser } from '../../../../context/UserContext';
import { useToast } from '../../../../context/ToastContext';
import { useModal } from '../../../../context/ModalContext';
import { MODULOS, MESES, GRUPOS_IMPUTACION, MODULO_BODEGA } from '../controlMensual/constants';
import { useControlMensualData } from '../controlMensual/useControlMensualData';
import { useComparativoMesAnterior } from './useComparativoMesAnterior';
import BodegaPeriodoCard from './BodegaPeriodoCard';
import { resumenIngresosCostos } from './ingresosCostos';

const MODULO_COLORES = [
  { bg: 'bg-[#2383C2]', text: 'text-[#2383C2]', border: 'border-blue-200 dark:border-blue-800/60', lightBg: 'bg-blue-50/50 dark:bg-blue-950/30' },
  { bg: 'bg-emerald-600', text: 'text-emerald-600 dark:text-emerald-400', border: 'border-emerald-200 dark:border-emerald-800/60', lightBg: 'bg-emerald-50/50 dark:bg-emerald-950/30' },
  { bg: 'bg-amber-600', text: 'text-amber-600 dark:text-amber-400', border: 'border-amber-200 dark:border-amber-800/60', lightBg: 'bg-amber-50/50 dark:bg-amber-950/30' },
  { bg: 'bg-indigo-600', text: 'text-indigo-600 dark:text-indigo-400', border: 'border-indigo-200 dark:border-indigo-800/60', lightBg: 'bg-indigo-50/50 dark:bg-indigo-950/30' },
  { bg: 'bg-rose-600', text: 'text-rose-600 dark:text-rose-400', border: 'border-rose-200 dark:border-rose-800/60', lightBg: 'bg-rose-50/50 dark:bg-rose-950/30' },
  { bg: 'bg-teal-600', text: 'text-teal-600 dark:text-teal-400', border: 'border-teal-200 dark:border-teal-800/60', lightBg: 'bg-teal-50/50 dark:bg-teal-950/30' },
  { bg: 'bg-cyan-600', text: 'text-cyan-600 dark:text-cyan-400', border: 'border-cyan-200 dark:border-cyan-800/60', lightBg: 'bg-cyan-50/50 dark:bg-cyan-950/30' },
  { bg: 'bg-orange-600', text: 'text-orange-600 dark:text-orange-400', border: 'border-orange-200 dark:border-orange-800/60', lightBg: 'bg-orange-50/50 dark:bg-orange-950/30' },
  { bg: 'bg-purple-600', text: 'text-purple-600 dark:text-purple-400', border: 'border-purple-200 dark:border-purple-800/60', lightBg: 'bg-purple-50/50 dark:bg-purple-950/30' },
  { bg: 'bg-slate-600', text: 'text-slate-600 dark:text-slate-400', border: 'border-slate-200 dark:border-gray-700', lightBg: 'bg-slate-50/50 dark:bg-gray-800/30' }
];

const ResumenPeriodoAbierto = () => {
  const anioActualStr = new Date().getFullYear().toString();
  const { showToast } = useToast();
  const { confirmAction } = useModal();
  const { userData } = useUser();

  const {
    estadosModulos,
    resumenImputaciones,
    cargando,
    cargandoResumen
  } = useControlMensualData(anioActualStr, userData, showToast, confirmAction, { soloPeriodoAbierto: true });

  // Detectar automáticamente el primer mes que se encuentre ABIERTO o REABIERTO
  const periodoAbiertoInfo = useMemo(() => {
    for (const mes of MESES) {
      let modulosAbiertosCount = 0;
      let tieneActividad = false;

      MODULOS.forEach(mod => {
        const estado = estadosModulos[mod.id]?.[mes.id]?.estado;
        if (estado === 'ABIERTO' || estado === 'REABIERTO') {
          modulosAbiertosCount++;
          tieneActividad = true;
        }
      });

      if (tieneActividad) {
        return {
          mesId: mes.id,
          mesNombre: mes.nombre,
          anio: anioActualStr,
          totalModulosAbiertos: modulosAbiertosCount
        };
      }
    }
    return null;
  }, [estadosModulos, anioActualStr]);

  // Consolidar totales del período activo, separados por grupo (Consumos / Facturación).
  // Bodega (Inventario) va aparte: su saldo no es un monto imputado.
  const resumenPorGrupo = useMemo(() => {
    if (!periodoAbiertoInfo) return null;

    return GRUPOS_IMPUTACION.map(grupo => {
      let montoTotal = 0;
      const desgloseModulos = [];

      grupo.moduloIds.forEach((moduloId) => {
        const mod = MODULOS.find(m => m.id === moduloId);
        const idxGlobal = MODULOS.findIndex(m => m.id === moduloId);
        const cierreData = estadosModulos[moduloId]?.[periodoAbiertoInfo.mesId] || {};
        const estado = cierreData.estado || 'SIN_INICIAR';
        const imputacion = resumenImputaciones[moduloId]?.[periodoAbiertoInfo.mesId] || { cantidad: 0, montoTotal: 0 };
        const color = MODULO_COLORES[idxGlobal % MODULO_COLORES.length];

        montoTotal += imputacion.montoTotal;

        desgloseModulos.push({
          moduloId,
          moduloNombre: mod.nombre,
          estado,
          cantidadDocs: imputacion.cantidad,
          monto: imputacion.montoTotal,
          color
        });
      });

      return {
        grupoId: grupo.id,
        grupoNombre: grupo.nombre,
        montoTotal,
        desgloseModulos
      };
    });
  }, [periodoAbiertoInfo, estadosModulos, resumenImputaciones]);

  const ingresosCostos = useMemo(() => resumenIngresosCostos(resumenPorGrupo), [resumenPorGrupo]);

  // Mes actual (en vivo) vs. mes anterior (snapshot cacheado en `imputaciones_periodos`,
  // ver useComparativoMesAnterior). Se separa en los mismos dos grupos que arriba.
  const { datosMesAnterior, cargandoMesAnterior, mesAnteriorInfo } = useComparativoMesAnterior(periodoAbiertoInfo);

  const comparativoPorGrupo = useMemo(() => {
    if (!resumenPorGrupo) return null;

    return resumenPorGrupo.map(grupo => ({
      grupoId: grupo.grupoId,
      grupoNombre: grupo.grupoNombre,
      modulos: grupo.desgloseModulos.map(item => {
        const anteriorInfo = datosMesAnterior[item.moduloId];
        const huboLecturaAnterior = anteriorInfo !== undefined;
        const montoAnterior = huboLecturaAnterior ? anteriorInfo.montoTotal : null;
        const variacion = huboLecturaAnterior && montoAnterior > 0
          ? ((item.monto - montoAnterior) / montoAnterior) * 100
          : null;

        return {
          moduloId: item.moduloId,
          moduloNombre: item.moduloNombre,
          color: item.color,
          montoActual: item.monto,
          montoAnterior,
          variacion
        };
      })
    }));
  }, [resumenPorGrupo, datosMesAnterior]);

  if (cargando) {
    return (
      <div className="w-full h-64 flex flex-col items-center justify-center bg-white dark:bg-gray-800 rounded-lg border border-slate-200 dark:border-gray-700 p-6 shadow-xs">
        <div className="w-8 h-8 border-2 border-[#2383C2] border-t-transparent rounded-full animate-spin mb-2.5" />
        <p className="text-[11px] text-slate-500 font-medium">Cargando consolidado corporativo...</p>
      </div>
    );
  }

  if (!periodoAbiertoInfo || !resumenPorGrupo) {
    return (
      <div className="w-full bg-white dark:bg-gray-800 rounded-lg border border-slate-200 dark:border-gray-700 p-8 text-center flex flex-col items-center justify-center space-y-2.5 shadow-xs">
        <div className="w-11 h-11 rounded-full bg-slate-100 dark:bg-gray-700 flex items-center justify-center text-slate-400 dark:text-gray-400">
          <CalendarCheck size={22} />
        </div>
        <div>
          <h3 className="text-[13px] font-bold text-slate-800 dark:text-gray-100 uppercase tracking-wide">
            Sin Período Activo
          </h3>
          <p className="text-[11px] text-slate-500 dark:text-gray-400 max-w-sm mt-1">
            No se registra ningún período contable abierto para el año {anioActualStr}. Inicia un período desde la matriz de control para visualizar el resumen financiero.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col space-y-3.5 font-sans">
      
      {/* Cabecera Ejecutivo-Corporativa */}
      <div className="bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg p-3.5 shadow-xs flex flex-wrap items-center justify-between gap-3 border-l-4 border-l-[#2383C2]">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-50 dark:bg-blue-950/50 text-[#2383C2] dark:text-blue-400 rounded">
            <Building2 size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[9px] uppercase tracking-wider font-bold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/80 border border-blue-200 dark:border-blue-800 px-2 py-0.5 rounded">
                Estado de Período
              </span>
              <span className="text-[11px] text-slate-500 dark:text-gray-400 font-medium">
                Ejercicio {periodoAbiertoInfo.anio}
              </span>
            </div>
            <h2 className="text-[15px] font-bold text-slate-800 dark:text-gray-100 uppercase tracking-wide mt-0.5">
              Consolidado {periodoAbiertoInfo.mesNombre} {periodoAbiertoInfo.anio}
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-slate-50 dark:bg-gray-900 border border-slate-200 dark:border-gray-700 px-3 py-1.5 rounded text-[11px] font-semibold text-slate-700 dark:text-gray-300">
          <Layers size={14} className="text-[#2383C2]" />
          <span>{periodoAbiertoInfo.totalModulosAbiertos} de {MODULOS.length} Módulos Activos</span>
        </div>
      </div>

      {/* Ingresos (Consumos) − costos (Facturación): resta de los dos totales de abajo */}
      {ingresosCostos && (
        <div className="bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg p-3.5 shadow-xs flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="flex items-center gap-3 min-w-[220px]">
            <div className="p-2.5 bg-slate-50 dark:bg-gray-900 border border-slate-200 dark:border-gray-700 text-slate-700 dark:text-gray-200 rounded">
              <Scale size={20} />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-500 dark:text-gray-400 uppercase tracking-wider">
                Ingresos − costos del período
              </p>
              <p className={`text-xl font-extrabold mt-0.5 tracking-tight ${ingresosCostos.diferencia > 0
                ? 'text-emerald-700 dark:text-emerald-400'
                : ingresosCostos.diferencia < 0 ? 'text-rose-700 dark:text-rose-400' : 'text-slate-800 dark:text-white'}`}
              >
                {ingresosCostos.diferencia < 0 ? '−' : ''}${Math.abs(ingresosCostos.diferencia).toLocaleString('es-CL')}
              </p>
            </div>
          </div>

          <dl className="flex-1 min-w-[240px] grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px]">
            <div>
              <dt className="text-[9px] text-slate-500 dark:text-gray-400 uppercase font-bold">Ingresos · Consumos</dt>
              <dd className="font-extrabold text-slate-900 dark:text-white">${ingresosCostos.ingresos.toLocaleString('es-CL')}</dd>
              <dd className="text-[10px] text-slate-500 dark:text-gray-400">{ingresosCostos.modulosIngresos.join(' + ')}</dd>
            </div>
            <div>
              <dt className="text-[9px] text-slate-500 dark:text-gray-400 uppercase font-bold">Costos · Facturación</dt>
              <dd className="font-extrabold text-slate-900 dark:text-white">${ingresosCostos.costos.toLocaleString('es-CL')}</dd>
              <dd className="text-[10px] text-slate-500 dark:text-gray-400">{ingresosCostos.modulosCostos.join(' + ')}</dd>
            </div>
          </dl>

          <p className="w-full text-[10px] text-slate-500 dark:text-gray-400">
            Montos imputados del período abierto. No incluye Bodega (inventario).
          </p>
        </div>
      )}

      {/* Dos bloques consolidados independientes: Consumos y Facturación */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3.5">
        {resumenPorGrupo.map((grupo) => (
          <div
            key={grupo.grupoId}
            className="bg-white dark:bg-gray-800 rounded-lg border border-slate-200 dark:border-gray-700 shadow-xs overflow-hidden flex flex-col"
          >
            {/* Monto Total del grupo */}
            <div className="p-3.5 border-b border-slate-200 dark:border-gray-700 bg-slate-50 dark:bg-gray-900 flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold text-slate-500 dark:text-gray-400 uppercase tracking-wider">
                  {grupo.grupoNombre} · Monto Total
                </p>
                <p className="text-xl font-extrabold text-slate-800 dark:text-white mt-0.5 tracking-tight">
                  ${grupo.montoTotal.toLocaleString('es-CL')}
                </p>
                <p className="text-[10px] text-slate-500 dark:text-gray-400 font-medium mt-1">
                  {grupo.desgloseModulos.map(m => m.moduloNombre).join(' + ')}
                </p>
              </div>
              <div className="p-2.5 bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 text-slate-700 dark:text-gray-200 rounded">
                <DollarSign size={20} />
              </div>
            </div>

            {/* Desglose interno del grupo (% sobre el total del propio grupo) */}
            <div className="px-4 py-2 border-b border-slate-200 dark:border-gray-700 flex items-center gap-2 bg-slate-50/60 dark:bg-gray-900/40">
              <Layers size={12} className="text-[#2383C2]" />
              <h3 className="text-[10px] font-bold text-slate-700 dark:text-gray-200 uppercase tracking-wider">
                Desglose {grupo.grupoNombre}
              </h3>
            </div>

            <div className="divide-y divide-slate-200 dark:divide-gray-700">
              {grupo.desgloseModulos.map((item) => {
                const porcentaje = grupo.montoTotal > 0
                  ? ((item.monto / grupo.montoTotal) * 100).toFixed(1)
                  : 0;

                return (
                  <div
                    key={item.moduloId}
                    className="p-3 hover:bg-slate-50/80 dark:hover:bg-gray-800/60 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-[11px]"
                  >
                    {/* Nombre y Estado */}
                    <div className="flex items-center gap-3 min-w-[180px]">
                      <span className={`w-2.5 h-2.5 rounded-full ${item.color.bg} shrink-0`} />
                      <div>
                        <h4 className="font-bold text-slate-800 dark:text-gray-100 uppercase tracking-tight">
                          {item.moduloNombre}
                        </h4>
                        <div className="mt-0.5">
                          {item.estado === 'ABIERTO' && (
                            <span className="inline-flex items-center gap-1 text-[9px] font-bold text-emerald-800 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/40 px-1.5 py-0.5 rounded border border-emerald-300 dark:border-emerald-700">
                              <CheckCircle2 size={9} /> Abierto
                            </span>
                          )}
                          {item.estado === 'REABIERTO' && (
                            <span className="inline-flex items-center gap-1 text-[9px] font-bold text-amber-800 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/40 px-1.5 py-0.5 rounded border border-amber-300 dark:border-amber-700">
                              <AlertCircle size={9} /> Reabierto
                            </span>
                          )}
                          {item.estado === 'CERRADO' && (
                            <span className="inline-flex items-center gap-1 text-[9px] font-bold text-slate-700 dark:text-gray-300 bg-slate-100 dark:bg-gray-800 px-1.5 py-0.5 rounded border border-slate-300 dark:border-gray-600">
                              <Lock size={9} /> Cerrado
                            </span>
                          )}
                          {item.estado === 'SIN_INICIAR' && (
                            <span className="inline-flex items-center gap-1 text-[9px] font-medium text-slate-400 dark:text-gray-600 bg-slate-50 dark:bg-gray-900 px-1.5 py-0.5 rounded border border-slate-200 dark:border-gray-800">
                              <Clock size={9} /> Sin Iniciar
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Barra de Proporción dentro del grupo */}
                    <div className="flex-1 max-w-[140px] hidden md:block">
                      <div className="flex justify-between text-[10px] text-slate-500 dark:text-gray-400 mb-1">
                        <span>Particip.</span>
                        <span className="font-bold text-slate-700 dark:text-gray-200">{porcentaje}%</span>
                      </div>
                      <div className="w-full bg-slate-100 dark:bg-gray-700 h-1.5 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${item.color.bg} transition-all duration-300`}
                          style={{ width: `${porcentaje}%` }}
                        />
                      </div>
                    </div>

                    {/* Monto */}
                    <div className="flex items-center justify-end text-right">
                      <div className="w-28">
                        <p className="text-[9px] text-slate-400 dark:text-gray-500 uppercase font-bold">Monto Imputado</p>
                        <p className="font-extrabold text-slate-900 dark:text-white">
                          ${item.monto.toLocaleString('es-CL')}
                        </p>
                      </div>
                    </div>

                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Bodega: cuadratura del período (saldo inicial, ingresos, egresos, saldo) */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3.5">
        <BodegaPeriodoCard
          resumen={resumenImputaciones[MODULO_BODEGA]?.[periodoAbiertoInfo.mesId]?.bodega}
          estado={estadosModulos[MODULO_BODEGA]?.[periodoAbiertoInfo.mesId]?.estado || 'SIN_INICIAR'}
          mesNombre={periodoAbiertoInfo.mesNombre}
          anio={periodoAbiertoInfo.anio}
          cargando={cargandoResumen}
        />
      </div>

      {/* Comparación vs. Mes Anterior */}
      {comparativoPorGrupo && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3.5">
          {comparativoPorGrupo.map((grupo) => (
            <div
              key={grupo.grupoId}
              className="bg-white dark:bg-gray-800 rounded-lg border border-slate-200 dark:border-gray-700 shadow-xs overflow-hidden"
            >
              <div className="px-4 py-2.5 border-b border-slate-200 dark:border-gray-700 flex items-center gap-2 bg-slate-50 dark:bg-gray-900">
                <History size={14} className="text-[#2383C2]" />
                <h3 className="text-[11px] font-bold text-slate-700 dark:text-gray-200 uppercase tracking-wider">
                  {grupo.grupoNombre} · {periodoAbiertoInfo.mesNombre} vs. {mesAnteriorInfo ? `${mesAnteriorInfo.nombre} ${mesAnteriorInfo.anio}` : '—'}
                </h3>
              </div>

              <div className="divide-y divide-slate-200 dark:divide-gray-700">
                {grupo.modulos.map((item) => {
                  const enEspera = cargandoMesAnterior && item.montoAnterior === null;
                  const sinDatoAnterior = !enEspera && item.variacion === null;
                  const subiendo = item.variacion !== null && item.variacion > 0;
                  const bajando = item.variacion !== null && item.variacion < 0;

                  return (
                    <div
                      key={item.moduloId}
                      className="p-3 hover:bg-slate-50/80 dark:hover:bg-gray-800/60 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-[11px]"
                    >
                      <div className="flex items-center gap-3 min-w-[150px]">
                        <span className={`w-2.5 h-2.5 rounded-full ${item.color.bg} shrink-0`} />
                        <h4 className="font-bold text-slate-800 dark:text-gray-100 uppercase tracking-tight">
                          {item.moduloNombre}
                        </h4>
                      </div>

                      <div className="flex items-center justify-end gap-6 text-right">
                        <div className="w-24">
                          <p className="text-[9px] text-slate-400 dark:text-gray-500 uppercase font-bold">Mes Actual</p>
                          <p className="font-extrabold text-slate-900 dark:text-white">
                            ${item.montoActual.toLocaleString('es-CL')}
                          </p>
                        </div>

                        <div className="w-24">
                          <p className="text-[9px] text-slate-400 dark:text-gray-500 uppercase font-bold">Mes Anterior</p>
                          <p className="font-semibold text-slate-600 dark:text-gray-300">
                            {enEspera ? '...' : `$${(item.montoAnterior ?? 0).toLocaleString('es-CL')}`}
                          </p>
                        </div>

                        <div className="w-28">
                          <p className="text-[9px] text-slate-400 dark:text-gray-500 uppercase font-bold">Variación</p>
                          {enEspera ? (
                            <p className="text-[10px] text-slate-400 dark:text-gray-500 font-semibold">Cargando…</p>
                          ) : sinDatoAnterior ? (
                            <p className="text-[10px] text-slate-400 dark:text-gray-500 font-semibold">Sin datos del mes anterior</p>
                          ) : (
                            <p className={`inline-flex items-center gap-1 font-extrabold ${
                              subiendo ? 'text-emerald-600 dark:text-emerald-400' : bajando ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500 dark:text-gray-400'
                            }`}>
                              {subiendo && <ArrowUpRight size={13} />}
                              {bajando && <ArrowDownRight size={13} />}
                              {!subiendo && !bajando && <Minus size={13} />}
                              {subiendo ? '+' : ''}{item.variacion.toFixed(1)}%
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

    </div>
  );
};

export default ResumenPeriodoAbierto;