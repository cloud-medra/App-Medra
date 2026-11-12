import { formatoNumero, formatoMonto } from './formato';

// Top 10 del período elegido, por admisiones / cantidad o por monto
// (`metrica`). La barra clara de fondo es el período anterior, para comparar
// de un vistazo. Con `comparar` en false (modo "Solo un mes") hay una sola
// serie y no hay leyenda del período anterior.
const METRICAS = {
  actual: { anterior: 'anterior', formato: formatoNumero },
  monto: { anterior: 'montoAnterior', formato: formatoMonto },
};

const BarrasTop = ({ filas, titulo, etiquetaActual, etiquetaAnterior, onSeleccionar, metrica = 'actual', opciones, onMetrica, nombreDe = (f) => f.nombre, comparar = true }) => {
  const m = METRICAS[metrica];
  const anteriorDe = (f) => (comparar ? f[m.anterior] || 0 : 0);
  const top = [...filas]
    .sort((a, b) => b[metrica] - a[metrica] || nombreDe(a).localeCompare(nombreDe(b), 'es'))
    .filter((f) => f[metrica] > 0)
    .slice(0, 10);
  const maximo = Math.max(1, ...top.map((f) => Math.max(f[metrica], anteriorDe(f))));
  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2.5 min-w-0">
      <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
        <h3 className="text-titulo-seccion text-tinta-principal">{titulo}</h3>
        {opciones && opciones.length > 1 && (
          <div className="inline-flex rounded-md border border-gray-300 dark:border-gray-600 overflow-hidden text-pequeno" role="group" aria-label="Ordenar Top 10 por">
            {opciones.map((o) => (
              <button key={o.id} type="button" onClick={() => onMetrica(o.id)} aria-pressed={metrica === o.id}
                className={`h-6 px-2 ${metrica === o.id ? 'bg-[#2383C2] text-white' : 'bg-white dark:bg-gray-900 text-tinta-secundaria hover:text-[#2383C2]'}`}>
                {o.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="flex items-center gap-3 mb-2 text-pequeno text-tinta-secundaria">
        <span className="inline-flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-sm bg-[#2383C2] inline-block" />{etiquetaActual}</span>
        {comparar && <span className="inline-flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-sm bg-[#2383C2]/20 inline-block" />{etiquetaAnterior}</span>}
      </div>
      {top.length === 0 ? (
        <p className="text-normal text-tinta-atenuada py-6 text-center">Sin datos en este período.</p>
      ) : (
        <ol className="space-y-1.5">
          {top.map((f, i) => (
            <li key={f.clave}>
              <button type="button" onClick={() => onSeleccionar?.(f)} className="w-full text-left group" title={`${nombreDe(f)}: ${m.formato(f[metrica])}${comparar ? ` (${etiquetaAnterior}: ${m.formato(anteriorDe(f))})` : ''}`}>
                <div className="flex items-baseline justify-between gap-2 text-secundario">
                  <span className="truncate text-tinta-principal group-hover:text-[#2383C2]"><span className="text-tinta-atenuada tabular-nums mr-1.5">{i + 1}.</span>{nombreDe(f)}</span>
                  <span className="text-etiqueta tabular-nums text-tinta-principal whitespace-nowrap">{m.formato(f[metrica])}</span>
                </div>
                <div className="relative h-1.5 mt-0.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                  {comparar && <div className="absolute inset-y-0 left-0 rounded-full bg-[#2383C2]/20" style={{ width: `${(anteriorDe(f) / maximo) * 100}%` }} />}
                  <div className="absolute inset-y-0 left-0 rounded-full bg-[#2383C2] transition-all" style={{ width: `${(f[metrica] / maximo) * 100}%`, height: '100%' }} />
                </div>
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
};

export default BarrasTop;
