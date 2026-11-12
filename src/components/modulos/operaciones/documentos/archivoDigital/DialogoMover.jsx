import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Folder, FolderOpen, ChevronRight, ChevronDown, Home, Loader2 } from 'lucide-react';
import { hijosDe, estaDentroDe } from './arbolArchivo';

// Elegir la carpeta destino para mover un archivo o carpeta. No se ofrecen
// la carpeta actual del elemento ni (si es carpeta) ella misma o sus
// subcarpetas.
const DialogoMover = ({ indice, nodo, onMover, onCerrar }) => {
  const [destino, setDestino] = useState(undefined); // undefined = sin elegir; null = Inicio
  const [abiertas, setAbiertas] = useState(() => new Set());
  const [moviendo, setMoviendo] = useState(false);

  const deshabilitada = (id) => (id || null) === (nodo.padreId || null) || (nodo.tipo === 'carpeta' && estaDentroDe(indice, id, nodo.id));
  const alternar = (id) => setAbiertas((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const Rama = ({ padreId, nivel }) => hijosDe(indice, padreId).filter((n) => n.tipo === 'carpeta').map((c) => {
    const sub = hijosDe(indice, c.id).some((n) => n.tipo === 'carpeta');
    const abierta = abiertas.has(c.id);
    const bloqueada = deshabilitada(c.id);
    return (
      <div key={c.id}>
        <div className={`flex items-center gap-1 rounded-md pr-2 ${destino === c.id ? 'bg-[#2383C2]/10 ring-1 ring-inset ring-[#2383C2]/30' : 'hover:bg-gray-50 dark:hover:bg-gray-700/40'}`} style={{ paddingLeft: 6 + nivel * 16 }}>
          <button type="button" onClick={() => sub && alternar(c.id)} className={`w-5 h-7 flex items-center justify-center text-tinta-atenuada ${sub ? '' : 'invisible'}`} aria-label={abierta ? 'Contraer' : 'Expandir'}>
            {abierta ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </button>
          <button type="button" disabled={bloqueada} onClick={() => setDestino(c.id)} className="flex-1 min-w-0 h-7 flex items-center gap-1.5 text-left text-normal text-tinta-principal disabled:text-tinta-atenuada disabled:cursor-not-allowed">
            {abierta ? <FolderOpen size={14} className="text-amber-500 shrink-0" /> : <Folder size={14} className="text-amber-500 shrink-0" />}
            <span className="truncate">{c.nombre}</span>
          </button>
        </div>
        {abierta && <Rama padreId={c.id} nivel={nivel + 1} />}
      </div>
    );
  });

  const mover = async () => {
    setMoviendo(true);
    try { await onMover(destino); } finally { setMoviendo(false); }
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-[1px] p-4" role="dialog" aria-modal="true" aria-labelledby="titulo-dialogo-mover">
      <div className="w-full max-w-md max-h-[80vh] flex flex-col rounded-xl bg-white dark:bg-gray-800 shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center">
          <h3 id="titulo-dialogo-mover" className="text-subtitulo text-tinta-principal flex-1 truncate">Mover “{nodo.nombre}”</h3>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className="text-tinta-atenuada hover:text-tinta-secundaria"><X size={16} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          <button type="button" disabled={deshabilitada(null)} onClick={() => setDestino(null)}
            className={`w-full h-8 px-2 flex items-center gap-1.5 rounded-md text-etiqueta text-tinta-principal disabled:text-tinta-atenuada disabled:cursor-not-allowed ${destino === null ? 'bg-[#2383C2]/10 ring-1 ring-inset ring-[#2383C2]/30' : 'hover:bg-gray-50 dark:hover:bg-gray-700/40'}`}>
            <Home size={14} className="text-[#2383C2]" /> Inicio
          </button>
          <Rama padreId={null} nivel={0} />
        </div>
        <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-900/40 flex justify-end gap-2">
          <button type="button" onClick={onCerrar} className="h-8 px-3.5 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-etiqueta text-tinta-principal">Cancelar</button>
          <button type="button" onClick={mover} disabled={destino === undefined || moviendo} className="h-8 px-4 rounded-md bg-[#2383C2] hover:bg-[#1d6fa5] text-white text-etiqueta inline-flex items-center gap-1.5 disabled:opacity-50">
            {moviendo && <Loader2 size={14} className="animate-spin" />} Mover aquí
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default DialogoMover;
