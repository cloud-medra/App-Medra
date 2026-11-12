import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2 } from 'lucide-react';
import { validarNombre } from './arbolArchivo';

// Diálogo para escribir un nombre (crear carpeta, renombrar).
// onAceptar(nombre) devuelve una promesa; si falla, el diálogo sigue abierto.
const DialogoNombre = ({ titulo, etiqueta = 'Nombre', inicial = '', textoAceptar = 'Guardar', onAceptar, onCerrar }) => {
  const [nombre, setNombre] = useState(inicial);
  const [error, setError] = useState(null);
  const [guardando, setGuardando] = useState(false);

  const aceptar = async (e) => {
    e.preventDefault();
    const err = validarNombre(nombre);
    if (err) { setError(err); return; }
    setGuardando(true);
    try {
      await onAceptar(nombre.trim());
    } finally {
      setGuardando(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-[1px] p-4" role="dialog" aria-modal="true" aria-labelledby="titulo-dialogo-nombre">
      <form onSubmit={aceptar} className="w-full max-w-md rounded-xl bg-white dark:bg-gray-800 shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center">
          <h3 id="titulo-dialogo-nombre" className="text-subtitulo text-tinta-principal flex-1">{titulo}</h3>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className="text-tinta-atenuada hover:text-tinta-secundaria"><X size={16} /></button>
        </div>
        <div className="p-4">
          <label className="block">
            <span className="block text-etiqueta text-tinta-principal mb-1.5">{etiqueta}</span>
            <input
              autoFocus
              value={nombre}
              onChange={(e) => { setNombre(e.target.value); setError(null); }}
              onFocus={(e) => { const punto = e.target.value.lastIndexOf('.'); e.target.setSelectionRange(0, punto > 0 ? punto : e.target.value.length); }}
              className={`w-full h-9 px-3 rounded-md border bg-white dark:bg-gray-900 text-normal text-tinta-principal focus:outline-none focus:border-[#2383C2] focus:ring-2 focus:ring-[#2383C2]/15 ${error ? 'border-red-400' : 'border-gray-300 dark:border-gray-600'}`}
            />
          </label>
          {error && <p className="text-secundario text-red-600 mt-1">{error}</p>}
        </div>
        <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-900/40 flex justify-end gap-2">
          <button type="button" onClick={onCerrar} className="h-8 px-3.5 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-etiqueta text-tinta-principal">Cancelar</button>
          <button type="submit" disabled={guardando} className="h-8 px-4 rounded-md bg-[#2383C2] hover:bg-[#1d6fa5] text-white text-etiqueta inline-flex items-center gap-1.5 disabled:opacity-50">
            {guardando && <Loader2 size={14} className="animate-spin" />} {textoAceptar}
          </button>
        </div>
      </form>
    </div>,
    document.body
  );
};

export default DialogoNombre;
