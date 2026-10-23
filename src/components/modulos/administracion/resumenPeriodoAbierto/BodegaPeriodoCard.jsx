import { PackageOpen } from 'lucide-react';
import { LINEAS_PERIODO } from '../../../../../functions/bodega/nucleo.mjs';

// Cuadratura del período de Bodega (Período Actual): saldo inicial, cada
// línea con su signo y saldo actual (en vivo) o final (foto del cierre).
//   saldo inicial + carga inicial + ingresos + retornos − consumo
//   − salida a centros − salida a cajas ± ajustes = saldo
const pesos = (n) => `$${Math.round(Number(n) || 0).toLocaleString('es-CL')}`;

const Fila = ({ etiqueta, signo, valor, unidades, fuerte = false }) => (
  <div className={`flex items-center justify-between gap-3 px-4 py-1.5 text-[11px] ${fuerte ? 'bg-slate-50 dark:bg-gray-900 font-extrabold text-slate-900 dark:text-white' : 'text-slate-700 dark:text-gray-300'}`}>
    <span className="flex items-center gap-2">
      <span className="w-3 text-center font-bold text-slate-400 dark:text-gray-500">{signo}</span>
      <span className={fuerte ? 'uppercase tracking-wide' : ''}>{etiqueta}</span>
    </span>
    <span className="flex items-center gap-3 text-right">
      {unidades !== undefined && <span className="text-[10px] text-slate-400 dark:text-gray-500 font-num">{Number(unidades).toLocaleString('es-CL')} u.</span>}
      <span className={`w-28 font-num ${fuerte ? '' : 'font-semibold'}`}>{pesos(valor)}</span>
    </span>
  </div>
);

const BodegaPeriodoCard = ({ resumen, estado, mesNombre, anio, cargando }) => {
  const abierto = estado === 'ABIERTO' || estado === 'REABIERTO';
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-slate-200 dark:border-gray-700 shadow-xs overflow-hidden flex flex-col">
      <div className="p-3.5 border-b border-slate-200 dark:border-gray-700 bg-slate-50 dark:bg-gray-900 flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold text-slate-500 dark:text-gray-400 uppercase tracking-wider">
            Inventario · Bodega · {abierto ? 'Saldo actual' : 'Saldo final'}
          </p>
          <p className="text-xl font-extrabold text-slate-800 dark:text-white mt-0.5 tracking-tight">
            {cargando || !resumen ? '…' : pesos(resumen.saldoFinal)}
          </p>
          <p className="text-[10px] text-slate-500 dark:text-gray-400 font-medium mt-1">
            Bodega General + tránsito, a costo promedio ponderado · {mesNombre} {anio}
          </p>
        </div>
        <div className="p-2.5 bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 text-slate-700 dark:text-gray-200 rounded">
          <PackageOpen size={20} />
        </div>
      </div>

      {estado === 'SIN_INICIAR' ? (
        <p className="p-4 text-[11px] text-slate-500 dark:text-gray-400">
          El período de Bodega no está abierto. Ábrelo en Control Mensual para registrar sus movimientos.
        </p>
      ) : cargando ? (
        <p className="p-4 text-[11px] text-slate-400 dark:text-gray-500">Calculando…</p>
      ) : !resumen ? (
        <p className="p-4 text-[11px] text-slate-500 dark:text-gray-400">
          {abierto ? 'No se pudo calcular el saldo de Bodega. Actualiza la página.' : 'El período de Bodega de este mes no está abierto. Revisa su saldo en Control Mensual.'}
        </p>
      ) : (
        <div className="divide-y divide-slate-100 dark:divide-gray-700/60">
          <Fila etiqueta="Saldo inicial" signo="" valor={resumen.saldoInicial} fuerte />
          {Object.entries(LINEAS_PERIODO).map(([linea, def]) => (
            <Fila key={linea} etiqueta={def.etiqueta} signo={def.signo > 0 ? '+' : '−'} valor={resumen.lineas[linea]?.valor} unidades={resumen.lineas[linea]?.unidades} />
          ))}
          <Fila etiqueta={abierto ? 'Saldo actual' : 'Saldo final'} signo="=" valor={resumen.saldoFinal} fuerte />
          {!abierto && resumen.cuadre && Math.abs(resumen.cuadre.diferencia) >= 1 && (
            <p className="px-4 py-2 text-[10px] font-semibold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30">
              Diferencia de cuadre al cierre: {pesos(resumen.cuadre.diferencia)} (saldo calculado vs. stock valorizado).
            </p>
          )}
          {!abierto && resumen.unidadesSinCosto > 0 && (
            <p className="px-4 py-2 text-[10px] font-semibold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30">
              {resumen.unidadesSinCosto.toLocaleString('es-CL')} unidad(es) sin costo (valorizadas en $0).
            </p>
          )}
          {abierto && resumen.sinPeriodo > 0 && (
            <p className="px-4 py-2 text-[10px] text-slate-500 dark:text-gray-400">
              Incluye {resumen.sinPeriodo.toLocaleString('es-CL')} movimiento(s) hechos sin período abierto.
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default BodegaPeriodoCard;
