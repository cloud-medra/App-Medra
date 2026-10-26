import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';

// Panel lateral derecho con animación de entrada/salida. Se mantiene
// montado durante la salida (duración de la transición) para animarla.
// `onSolicitarCierre` decide si cerrar (p. ej. confirmar cambios sin guardar).
const DURACION_MS = 220;

const PanelLateral = ({
  abierto,
  onSolicitarCierre,
  ancho = 'max-w-[520px]',
  encabezado,
  pie,
  children
}) => {
  const [montado, setMontado] = useState(abierto);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (abierto) {
      setMontado(true);
      const id = requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
      return () => cancelAnimationFrame(id);
    }
    setVisible(false);
    const t = setTimeout(() => setMontado(false), DURACION_MS);
    return () => clearTimeout(t);
  }, [abierto]);

  if (!montado) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
      <div
        onClick={onSolicitarCierre}
        className={`absolute inset-0 bg-slate-900/30 dark:bg-black/50 transition-opacity duration-200 ${visible ? 'opacity-100' : 'opacity-0'}`}
      />
      <aside
        className={`relative h-full w-full ${ancho} bg-white dark:bg-gray-900 border-l border-slate-200 dark:border-gray-700 shadow-2xl flex flex-col transition-transform duration-200 ease-out ${visible ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <header className="shrink-0 px-5 pt-4 pb-3 border-b border-slate-200 dark:border-gray-700">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">{encabezado}</div>
            <button
              type="button"
              onClick={onSolicitarCierre}
              title="Cerrar (Esc)"
              className="shrink-0 -mr-1 p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:text-gray-200 dark:hover:bg-gray-800 transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </header>
        <div className="flex-1 min-h-0 overflow-y-auto">{children}</div>
        {pie && (
          <footer className="shrink-0 px-5 py-3 border-t border-slate-200 dark:border-gray-700 bg-slate-50 dark:bg-gray-900/80">
            {pie}
          </footer>
        )}
      </aside>
    </div>
  );
};

export default PanelLateral;
