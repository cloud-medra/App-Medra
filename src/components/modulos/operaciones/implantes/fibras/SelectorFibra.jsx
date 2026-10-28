import { useEffect, useMemo } from 'react';
import { AlertTriangle, Cable, Loader2 } from 'lucide-react';
import { fibrasElegibles, siguienteNumeroUso, usosRestantes } from './fibrasNucleo';

/**
 * Selector "Fibra usada" de Cargas: fibras activas de la referencia, no
 * vencidas para la fecha de la cirugía y no usadas ya en esta admisión. Si hay
 * una sola, se elige sola. Muestra el número de uso que se registrará.
 *   fibras: resultado de useFibrasDeReferencia; excluir: Set de ids ya usados.
 *   onElegir(fibra | null)
 */
export const SelectorFibra = ({ referencia, fechaCirugia, fibras, cargando, error, excluir, seleccionadaId, onElegir, deshabilitado }) => {
  const elegibles = useMemo(() => fibrasElegibles(fibras, fechaCirugia, excluir), [fibras, fechaCirugia, excluir]);
  const seleccionada = elegibles.find((f) => f.id === seleccionadaId) || null;

  // Una sola elegible: viene seleccionada. Si la elegida deja de serlo, se quita.
  useEffect(() => {
    if (cargando) return;
    if (seleccionadaId && !seleccionada) onElegir(null);
    else if (!seleccionadaId && elegibles.length === 1) onElegir(elegibles[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cargando, elegibles, seleccionadaId]);

  const numero = seleccionada ? siguienteNumeroUso(seleccionada) : null;
  const esUltimo = seleccionada && usosRestantes(seleccionada) === 1;

  return (
    <div className="border border-teal-200 dark:border-teal-900 bg-teal-50/40 dark:bg-teal-950/10 rounded-lg p-2.5 space-y-2">
      <span className="text-[10px] font-bold text-teal-700 dark:text-teal-400 uppercase flex items-center gap-1">
        <Cable size={12} /> Fibra usada <span className="text-red-500">*</span>
        <span className="text-[9px] font-normal normal-case text-teal-600 dark:text-teal-500">(fibra reutilizable: se registra un uso al guardar)</span>
      </span>

      {cargando ? (
        <div className="text-[10px] text-slate-500 flex items-center gap-1.5"><Loader2 size={11} className="animate-spin" /> Buscando fibras de {referencia}…</div>
      ) : error ? (
        <div className="text-[10px] text-red-600 dark:text-red-400 flex items-center gap-1"><AlertTriangle size={11} /> {error}</div>
      ) : elegibles.length === 0 ? (
        <div className="text-[10px] text-red-600 dark:text-red-400 flex items-center gap-1">
          <AlertTriangle size={11} className="shrink-0" />
          No hay fibras de {referencia} activas y vigentes para la fecha de la cirugía{fechaCirugia ? ` (${fechaCirugia})` : ''}. Regístrala en Implantes → Fibras.
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Fibra usada"
            value={seleccionadaId || ''}
            disabled={deshabilitado}
            onChange={(e) => onElegir(elegibles.find((f) => f.id === e.target.value) || null)}
            className="h-7 px-2 text-[10px] border border-teal-300 dark:border-teal-800 rounded bg-white dark:bg-gray-900 text-slate-800 dark:text-gray-100 outline-none focus:ring-1 focus:ring-teal-500 min-w-[260px]"
          >
            {elegibles.length > 1 && <option value="">Elige la fibra…</option>}
            {elegibles.map((f) => (
              <option key={f.id} value={f.id}>
                {f.codigoInterno} · lote {f.lote} · vence {f.vencimiento} · quedan {usosRestantes(f)} de {f.usosTotales}
              </option>
            ))}
          </select>
          {seleccionada && (
            <span className={`text-[10px] font-semibold flex items-center gap-1 ${esUltimo ? 'text-amber-700 dark:text-amber-400' : 'text-teal-700 dark:text-teal-400'}`}>
              {esUltimo && <AlertTriangle size={11} />}
              Será el uso {numero}/{seleccionada.usosTotales}{esUltimo ? ': ÚLTIMO USO, la fibra quedará agotada' : `, quedarán ${usosRestantes(seleccionada) - 1}`}
            </span>
          )}
        </div>
      )}
    </div>
  );
};

export default SelectorFibra;
