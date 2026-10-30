import { useEffect } from 'react';
import { AlertTriangle, Loader2, Trash2 } from 'lucide-react';

// Confirmación de "Eliminar" en la pestaña Documentos. A diferencia de
// ui/ModalConfirm, queda abierta (y bloqueada) mientras la Cloud Function
// responde; DocumentosTab la cierra al terminar.
export const ConfirmarEliminarDocumento = ({ documento, eliminando, onConfirmar, onCancelar }) => {
  useEffect(() => {
    const alPresionar = (e) => {
      if (e.key === 'Escape' && !eliminando) onCancelar();
    };
    window.addEventListener('keydown', alPresionar);
    return () => window.removeEventListener('keydown', alPresionar);
  }, [eliminando, onCancelar]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-[1px] p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-eliminar-documento"
    >
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-sm max-h-full overflow-y-auto p-5 border border-gray-200 dark:border-gray-700">
        <div className="flex flex-col items-center text-center">
          <div className="w-10 h-10 rounded-full flex items-center justify-center mb-3 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400">
            <AlertTriangle size={20} />
          </div>
          <h3 id="titulo-eliminar-documento" className="text-sm font-bold text-gray-800 dark:text-gray-100">Eliminar documento</h3>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-2">
            ¿Seguro que deseas eliminar <strong className="break-all text-gray-700 dark:text-gray-200">{documento.nombre}</strong>?
          </p>
          <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1 mb-4">
            Dejará de aparecer en la admisión. Queda un respaldo en la papelera del sistema.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancelar}
            disabled={eliminando}
            className="flex-1 py-2.5 md:py-2 rounded-lg border border-gray-200 dark:border-gray-600 text-[11px] font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40 transition"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirmar}
            disabled={eliminando}
            className="flex-1 py-2.5 md:py-2 rounded-lg inline-flex items-center justify-center gap-1.5 text-[11px] font-medium bg-red-600 hover:bg-red-700 text-white disabled:opacity-60 transition"
          >
            {eliminando ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
            {eliminando ? 'Eliminando...' : 'Eliminar'}
          </button>
        </div>
      </div>
    </div>
  );
};
