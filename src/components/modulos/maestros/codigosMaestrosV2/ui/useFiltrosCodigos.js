import { useDeferredValue, useMemo, useState } from 'react';

const FILTROS_VACIOS = { empresa: '', tipo: '', segmento: '', clase: '' };

const normalizar = (v) => String(v ?? '').toLowerCase();

// Búsqueda y filtros en memoria sobre los registros ya cargados (sin
// consultas a Firestore). `camposBusqueda`: [{ value, label }]; con
// campo '' se busca en todos ellos.
export const useFiltrosCodigos = (registros, camposBusqueda) => {
  const [busqueda, setBusqueda] = useState('');
  const [campo, setCampo] = useState('');
  const [filtros, setFiltros] = useState(FILTROS_VACIOS);
  // La tabla se filtra con el valor diferido: escribir no se traba con miles de filas.
  const termino = useDeferredValue(busqueda.trim().toLowerCase());

  const empresas = useMemo(
    () => [...new Set(registros.map((r) => r.empresa).filter(Boolean))].sort(),
    [registros]
  );

  const filtrados = useMemo(() => {
    const campos = campo ? [campo] : camposBusqueda.map((c) => c.value);
    return registros.filter((item) => {
      if (filtros.empresa && item.empresa !== filtros.empresa) return false;
      if (filtros.tipo && item.tipo !== filtros.tipo) return false;
      if (filtros.segmento && item.segmento !== filtros.segmento) return false;
      if (filtros.clase && item.clase !== filtros.clase) return false;
      if (termino && !campos.some((c) => normalizar(item[c]).includes(termino))) return false;
      return true;
    });
  }, [registros, filtros, termino, campo, camposBusqueda]);

  const hayFiltros = Boolean(busqueda || Object.values(filtros).some(Boolean));

  return {
    busqueda,
    setBusqueda,
    campo,
    setCampo,
    filtros,
    setFiltro: (clave, valor) => setFiltros((prev) => ({ ...prev, [clave]: valor })),
    limpiar: () => { setBusqueda(''); setFiltros(FILTROS_VACIOS); },
    hayFiltros,
    empresas,
    filtrados,
    // Cambia cuando cambia el criterio (para volver a la página 1).
    clave: `${termino}|${campo}|${Object.values(filtros).join('|')}`
  };
};
