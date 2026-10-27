import { useMemo, useState } from 'react';
import { AlertTriangle, Info, TrendingDown, TrendingUp } from 'lucide-react';
import { MODULOS } from '../controlMensual/constants';
import { useGranularPermission } from '../../../../hooks/useGranularPermission';
import { useComparativoMesData } from './useComparativoMesData';
import { pesos } from './totalesFinanzas';
import {
  RUTA_COMPARATIVO_MES, FUENTES_COMPARATIVO, hoyEnChile, rangosComparativo, diasElegibles, normalizarRango,
  diferencia, porcentajeTexto, nombreMes,
} from './comparativoMes';

// Finanzas → Comparativo mensual: Consumos y Facturas de los días elegidos
// del mes actual contra los mismos días del mes pasado, por fecha del
// documento (ver comparativoMes.js). Solo lectura. La sección `desglose`
// (por módulo) se controla con permisos granulares.
const SELECT = 'px-2 py-1 text-xs rounded-md border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-slate-700 dark:text-gray-200';

const textoRango = (r) => (r.desde === r.hasta
  ? `${r.desde} de ${nombreMes(r.mes).toLowerCase()} ${r.anio}`
  : `${r.desde} al ${r.hasta} de ${nombreMes(r.mes).toLowerCase()} ${r.anio}`);

const Diferencia = ({ actual, anterior }) => {
  const { monto, porcentaje } = diferencia(actual, anterior);
  const color = monto > 0 ? 'text-emerald-700 dark:text-emerald-400' : monto < 0 ? 'text-rose-700 dark:text-rose-400' : 'text-slate-600 dark:text-gray-300';
  const Icono = monto < 0 ? TrendingDown : TrendingUp;
  return (
    <span className={`inline-flex items-center gap-1.5 font-num font-bold ${color}`}>
      {monto !== 0 && <Icono size={13} />}
      {monto > 0 ? '+' : monto < 0 ? '−' : ''}{pesos(Math.abs(monto))} · {porcentajeTexto(porcentaje)}
    </span>
  );
};

const TarjetaFuente = ({ fuente, datos, rangos, verDesglose }) => (
  <div className="bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg shadow-xs overflow-hidden">
    <div className="px-4 py-2.5 bg-slate-50 dark:bg-gray-900 border-b border-slate-200 dark:border-gray-700">
      <p className="text-xs font-bold text-slate-800 dark:text-gray-100">{fuente.titulo}</p>
      <p className="text-[10px] text-slate-500 dark:text-gray-400">Por {fuente.etiquetaFecha}</p>
    </div>
    {!datos ? (
      <p className="p-4 text-[11px] text-slate-400 dark:text-gray-500">Calculando…</p>
    ) : (
      <>
        <div className="divide-y divide-slate-100 dark:divide-gray-700/60 text-[11px]">
          <div className="flex items-center justify-between gap-3 px-4 py-2 text-slate-700 dark:text-gray-300">
            <span>Mes pasado <span className="text-slate-400 dark:text-gray-500">({textoRango(rangos.anterior)})</span></span>
            <span className="font-num font-semibold">{pesos(datos.anterior)}</span>
          </div>
          <div className="flex items-center justify-between gap-3 px-4 py-2 text-slate-700 dark:text-gray-300">
            <span>Mes actual <span className="text-slate-400 dark:text-gray-500">({textoRango(rangos.actual)})</span></span>
            <span className="font-num font-semibold">{pesos(datos.actual)}</span>
          </div>
          <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-slate-50/60 dark:bg-gray-900/40">
            <span className="font-bold uppercase tracking-wide text-slate-600 dark:text-gray-300">Diferencia</span>
            <Diferencia actual={datos.actual} anterior={datos.anterior} />
          </div>
        </div>
        {verDesglose && (
          <div className="border-t border-slate-200 dark:border-gray-700 divide-y divide-slate-100 dark:divide-gray-700/60">
            {datos.porModulo.map((m) => (
              <div key={m.moduloId} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 px-4 py-1.5 text-[10px] text-slate-600 dark:text-gray-400">
                <span className="font-semibold">{MODULOS.find((x) => x.id === m.moduloId)?.nombre || m.moduloId}</span>
                <span className="flex items-center gap-3 font-num">
                  <span>{pesos(m.anterior.montoTotal)}</span>
                  <span>→ {pesos(m.actual.montoTotal)}</span>
                  <span className="w-20 text-right">{porcentajeTexto(diferencia(m.actual.montoTotal, m.anterior.montoTotal).porcentaje)}</span>
                </span>
              </div>
            ))}
          </div>
        )}
        {datos.conError && (
          <p className="px-4 py-2 text-[10px] font-semibold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 flex items-center gap-1.5">
            <AlertTriangle size={12} className="shrink-0" />
            No se pudo leer parte de los datos: el comparativo puede estar incompleto. Actualiza la página.
          </p>
        )}
      </>
    )}
  </div>
);

const ComparativoMes = () => {
  const hoy = useMemo(() => hoyEnChile(), []);
  const [eleccion, setEleccion] = useState({ desde: 1, hasta: hoy.dia });
  const { desde, hasta } = normalizarRango(eleccion.desde, eleccion.hasta, hoy);
  const rangos = useMemo(() => rangosComparativo(hoy, desde, hasta), [hoy, desde, hasta]);
  const datos = useComparativoMesData(rangos);
  const { hasPermission } = useGranularPermission();
  const verDesglose = hasPermission(RUTA_COMPARATIVO_MES, 'desglose');
  const dias = diasElegibles(hoy);

  return (
    <div className="w-full max-w-3xl flex flex-col gap-3">
      <div className="bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg p-4 shadow-xs flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-sm font-bold text-slate-900 dark:text-gray-100">Comparativo mensual</h1>
          <p className="text-[11px] text-slate-500 dark:text-gray-400">
            Los mismos días de {nombreMes(rangos.anterior.mes).toLowerCase()} y {nombreMes(hoy.mes).toLowerCase()}, por fecha del documento (hasta hoy).
          </p>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-slate-600 dark:text-gray-300">
          <label className="flex items-center gap-1">
            Desde
            <select aria-label="Desde" value={desde} onChange={(e) => setEleccion({ desde: Number(e.target.value), hasta })} className={SELECT}>
              {dias.filter((d) => d <= hasta).map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-1">
            Hasta
            <select aria-label="Hasta" value={hasta} onChange={(e) => setEleccion({ desde, hasta: Number(e.target.value) })} className={SELECT}>
              {dias.filter((d) => d >= desde).map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </label>
        </div>
      </div>

      {rangos.anterior.ajustado && (
        <p className="text-[11px] text-slate-500 dark:text-gray-400 flex items-center gap-1.5 px-1">
          <Info size={12} className="shrink-0" />
          {nombreMes(rangos.anterior.mes)} tiene {rangos.anterior.hasta} días: los días que no existen se toman como su último día ({textoRango(rangos.anterior)}).
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {Object.entries(FUENTES_COMPARATIVO).map(([clave, fuente]) => (
          <TarjetaFuente key={clave} fuente={fuente} datos={datos?.[clave] || null} rangos={rangos} verDesglose={verDesglose} />
        ))}
      </div>
    </div>
  );
};

export default ComparativoMes;
