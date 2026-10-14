// % de completitud de una caja (stock actual vs. objetivo) con una barra.
export const BarraCompletitud = ({ valor }) => {
  const n = Math.max(0, Math.min(100, Number(valor) || 0));
  const color = n >= 100 ? 'bg-emerald-500' : n >= 70 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <span className="inline-flex items-center gap-1.5" title={`${n.toLocaleString('es-CL')} % completa`}>
      <span className="w-16 h-1.5 rounded bg-gray-200 dark:bg-gray-700 overflow-hidden"><span className={`block h-full ${color}`} style={{ width: `${n}%` }} /></span>
      <span className="font-num font-bold">{n.toLocaleString('es-CL')} %</span>
    </span>
  );
};
