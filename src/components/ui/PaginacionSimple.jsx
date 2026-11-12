import { ChevronLeft, ChevronRight } from 'lucide-react';

// Paginación 100% client-side sobre un arreglo ya en memoria — pensada para
// tablas cuya consulta a Firestore ya viene acotada (por año/mes, por un
// límite, etc.), de modo que el volumen a paginar es chico y no vale la
// pena armar cursores de Firestore para cambiar de página.
//
// Si se pasan `tamanoPagina` + `setTamanoPagina` se muestra además un selector
// de filas por página (opcional: las pantallas existentes no cambian).
const PaginacionSimple = ({
  pagina, totalPaginas, totalFilas, setPagina,
  tamanoPagina, setTamanoPagina, opcionesTamano = [10, 25, 50, 100]
}) => {
  if (totalFilas === 0) return null;

  return (
    <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-t border-slate-200 dark:border-gray-700 bg-slate-50/60 dark:bg-gray-900/30 text-pequeno">
      <div className="flex items-center gap-3">
        <span className="text-tinta-secundaria">
          {totalFilas} registro{totalFilas === 1 ? '' : 's'} · página {pagina} de {totalPaginas}
        </span>
        {setTamanoPagina && (
          <label className="flex items-center gap-1 text-tinta-secundaria">
            Filas por página:
            <select
              value={tamanoPagina}
              onChange={e => { setTamanoPagina(Number(e.target.value)); setPagina(1); }}
              className="h-6 border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-tinta-principal rounded px-1 outline-none focus:border-[#2383C2]"
            >
              {opcionesTamano.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        )}
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => setPagina(p => Math.max(1, p - 1))}
          disabled={pagina <= 1}
          className="h-6 px-1.5 rounded border border-slate-200 dark:border-gray-700 text-slate-500 dark:text-gray-400 hover:bg-slate-100 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ChevronLeft size={13} />
        </button>
        <button
          type="button"
          onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))}
          disabled={pagina >= totalPaginas}
          className="h-6 px-1.5 rounded border border-slate-200 dark:border-gray-700 text-slate-500 dark:text-gray-400 hover:bg-slate-100 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ChevronRight size={13} />
        </button>
      </div>
    </div>
  );
};

export default PaginacionSimple;
