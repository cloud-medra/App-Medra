import { useState } from 'react';
import { Trash2, X, Loader2, AlertTriangle } from 'lucide-react';
import { montoTotalFilas } from '../utils/eliminarFilasDetallesOC';

const MAX_LISTA = 20;

const fechaCorta = (valor) => {
  const d = valor?.toDate ? valor.toDate() : valor instanceof Date ? valor : null;
  if (!d || isNaN(d.getTime())) return '-';
  return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
};

const pesos = (n) => `$ ${n.toLocaleString('es-CL', { maximumFractionDigits: 2 })}`;

// Confirmación de "Eliminar filas seleccionadas" (admin/dev), desde la tabla
// o desde "Registradas que ya no vienen en el archivo" (`aviso` explica el
// caso). Muestra cuántas filas son y cuánto suman.
export const ModalEliminarFilas = ({ filas, eliminando, progreso, onConfirmar, onCerrar, aviso }) => {
  const [liberarOC, setLiberarOC] = useState(true);
  const conOC = filas.filter(f => f.oc).length;
  const total = montoTotalFilas(filas);

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 backdrop-blur-[1px] p-4">
      <div className="bg-white dark:bg-gray-800 w-full max-w-lg max-h-[85vh] flex flex-col rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden text-[11px]">
        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2 bg-red-50/60 dark:bg-red-950/20">
          <Trash2 size={15} className="text-red-600 dark:text-red-400 shrink-0" />
          <h3 className="text-[12px] font-bold text-gray-800 dark:text-gray-100">Eliminar {filas.length} fila(s) de Detalles OC</h3>
          <button onClick={onCerrar} disabled={eliminando} className="ml-auto text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-40" aria-label="Cerrar">
            <X size={15} />
          </button>
        </div>

        <div className="px-4 py-3 flex flex-col gap-2.5 overflow-auto text-gray-700 dark:text-gray-200">
          {aviso && (
            <p className="flex items-start gap-1.5 px-2 py-1.5 rounded bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300">
              <AlertTriangle size={12} className="shrink-0 mt-0.5" /> {aviso}
            </p>
          )}
          <p className="font-semibold text-gray-800 dark:text-gray-100">
            {filas.length} fila(s) · Monto OC total: <span className="font-num text-red-700 dark:text-red-400">{pesos(total)}</span>
          </p>
          <p>
            Se borran de Firestore y salen del snapshot y del índice de OC. Antes se guarda una copia de cada una en
            <code className="mx-1">detallesOCEliminados</code> (solo admin/dev la pueden ver). Si la fila vuelve a venir en un Excel, se importa como nueva.
          </p>

          <ul className="max-h-48 overflow-auto font-num text-[10px] border border-slate-200 dark:border-gray-700 rounded px-2 py-1 space-y-0.5 select-text">
            {filas.slice(0, MAX_LISTA).map(f => (
              <li key={f.refPath} className="truncate" title={f.id}>
                Adm. {f.admision} · {fechaCorta(f.fecha_cx)} · {f.proveedor} · {f.codigo}{f.oc ? ` · OC ${f.oc}` : ''} · {pesos(Number(f.oc_monto) || 0)}
              </li>
            ))}
            {filas.length > MAX_LISTA && <li>… y {filas.length - MAX_LISTA} más</li>}
          </ul>

          <label className={`flex items-start gap-2 ${conOC ? '' : 'opacity-50'}`}>
            <input type="checkbox" className="mt-0.5" checked={liberarOC && conOC > 0} disabled={!conOC || eliminando} onChange={e => setLiberarOC(e.target.checked)} />
            <span>
              Liberar la OC en Gestión de Implantes ({conOC} fila(s) con OC): las gestiones que la tenían asignada por estas filas quedan con OC pendiente,
              salvo que otra fila que queda respalde la misma OC.
            </span>
          </label>

          {eliminando && progreso && (
            <div className="flex items-center gap-2 text-[#2383C2]">
              <Loader2 size={13} className="animate-spin" /> Eliminando… {progreso.actual}/{progreso.total}
            </div>
          )}
        </div>

        <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-700 flex justify-end gap-2">
          <button onClick={onCerrar} disabled={eliminando} className="px-3 py-1.5 rounded border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40">
            Cancelar
          </button>
          <button
            onClick={() => onConfirmar({ liberarOC: liberarOC && conOC > 0 })}
            disabled={eliminando}
            className="px-3 py-1.5 rounded bg-red-600 hover:bg-red-700 text-white font-semibold disabled:opacity-50 flex items-center gap-1.5"
          >
            {eliminando ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />} Eliminar {filas.length} fila(s)
          </button>
        </div>
      </div>
    </div>
  );
};

export default ModalEliminarFilas;
