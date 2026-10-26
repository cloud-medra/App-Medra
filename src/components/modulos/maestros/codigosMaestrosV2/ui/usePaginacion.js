import { useEffect, useMemo, useState } from 'react';

// Paginación en memoria sobre una lista ya filtrada. Vuelve a la primera
// página cuando cambia `reinicio` (búsqueda / filtros).
export const usePaginacion = (lista, reinicio, tamanoInicial = 50) => {
  const [pagina, setPagina] = useState(0);
  const [tamano, setTamano] = useState(tamanoInicial);
  const totalPaginas = Math.max(1, Math.ceil(lista.length / tamano));

  useEffect(() => { setPagina(0); }, [reinicio, tamano]);
  useEffect(() => {
    if (pagina > totalPaginas - 1) setPagina(totalPaginas - 1);
  }, [pagina, totalPaginas]);

  const filas = useMemo(() => lista.slice(pagina * tamano, (pagina + 1) * tamano), [lista, pagina, tamano]);

  return {
    filas,
    pagina,
    tamano,
    totalPaginas,
    setTamano,
    irAPagina: (p) => setPagina(Math.min(Math.max(0, p), totalPaginas - 1))
  };
};
