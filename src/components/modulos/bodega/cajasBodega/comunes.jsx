import { useState } from 'react';
import { FileSpreadsheet, FileDown } from 'lucide-react';

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

// Botones Excel / PDF (mismo estilo que el resto de Bodega). `exportar`
// recibe 'excel' | 'pdf' y devuelve una promesa.
export const BotonesExportar = ({ exportar, deshabilitado = false, alto = 'h-7' }) => {
  const [ocupado, setOcupado] = useState(false);
  const correr = async (formato) => {
    setOcupado(true);
    try { await exportar(formato); } finally { setOcupado(false); }
  };
  return (
    <>
      <button type="button" disabled={deshabilitado || ocupado} onClick={() => correr('excel')} className={`${alto} px-2 rounded border border-emerald-600 text-emerald-700 dark:text-emerald-300 font-semibold flex items-center gap-1 disabled:opacity-40`}><FileSpreadsheet size={12} /> Excel</button>
      <button type="button" disabled={deshabilitado || ocupado} onClick={() => correr('pdf')} className={`${alto} px-2 rounded border border-red-600 text-red-700 dark:text-red-300 font-semibold flex items-center gap-1 disabled:opacity-40`}><FileDown size={12} /> PDF</button>
    </>
  );
};
