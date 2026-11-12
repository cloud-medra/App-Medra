import Variacion from './Variacion';
import { formatoNumero } from './formato';
import { variacion } from '../agregados';

// Indicador principal con la comparación contra el período anterior (sin
// ella con `comparar` en false: modo "Solo un mes").
const TarjetaIndicador = ({ titulo, icono: Icono, actual, anterior, etiquetaAnterior, pie, formato = formatoNumero, comparar = true }) => (
  <div className="bg-gray-50/70 dark:bg-gray-900/40 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 flex flex-col gap-1 min-w-0">
    <div className="flex items-center gap-1.5 text-pequeno text-tinta-secundaria uppercase tracking-wide">
      <span className="w-5 h-5 rounded bg-[#2383C2]/10 text-[#2383C2] flex items-center justify-center shrink-0"><Icono size={12} /></span>
      <span className="truncate">{titulo}</span>
    </div>
    <div className="flex items-end justify-between gap-2 flex-wrap">
      <span className="text-numero-indicador text-tinta-principal">{formato(actual)}</span>
      {comparar && <Variacion diferencia={actual - anterior} variacion={variacion(actual, anterior)} compacto />}
    </div>
    {(comparar || pie) && (
      <div className="text-pequeno text-tinta-secundaria flex justify-between gap-2 flex-wrap">
        {comparar && <span>{etiquetaAnterior}: <b className="text-tinta-principal tabular-nums">{formato(anterior)}</b></span>}
        {pie}
      </div>
    )}
  </div>
);

export default TarjetaIndicador;
