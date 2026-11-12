import { ChevronLeft, ChevronRight } from 'lucide-react';

// Paginación 100% client-side sobre un array ya en memoria — la tabla
// combinada mezcla 2 orígenes/colecciones ya acotados a un año (por el
// filtro de arriba), así que el volumen es chico y no vale la pena armar
// cursores de Firestore por separado para cada origen y entrelazarlos.
const PaginacionSimple = ({ pagina, totalPaginas, totalFilas, setPagina }) => {
  if (totalFilas === 0) return null;

  return (
    <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-t border-slate-200 dark:border-gray-700 bg-slate-50/60 dark:bg-gray-900/30 text-pequeno">
      <span className="text-tinta-secundaria">
        {totalFilas} registro{totalFilas === 1 ? '' : 's'} · página {pagina} de {totalPaginas}
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => setPagina(p => Math.max(1, p - 1))}
          disabled={pagina <= 1}
          className="h-6 px-1.5 rounded border border-slate-200 dark:border-gray-700 text-tinta-secundaria hover:bg-slate-100 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ChevronLeft size={13} />
        </button>
        <button
          type="button"
          onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))}
          disabled={pagina >= totalPaginas}
          className="h-6 px-1.5 rounded border border-slate-200 dark:border-gray-700 text-tinta-secundaria hover:bg-slate-100 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ChevronRight size={13} />
        </button>
      </div>
    </div>
  );
};

export default PaginacionSimple;
