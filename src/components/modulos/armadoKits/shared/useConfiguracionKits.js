import { useCallback, useEffect, useState } from 'react';
import { leerConfiguracionKits } from './kitsApi';

// Receta y modelos de una familia (1 lectura). Se guarda en memoria para
// toda la sesión: la comparten el listado, el formulario y la configuración.
// `recargar` la vuelve a leer (después de guardarla, o para ver cambios de otros).
const cache = new Map();
const CARGANDO = Object.freeze({ config: null, cargando: true, error: '' });

export const useConfiguracionKits = (familia) => {
  const [estado, setEstado] = useState(() => cache.get(familia) || CARGANDO);

  useEffect(() => {
    if (cache.has(familia)) return undefined;
    let vigente = true;
    leerConfiguracionKits(familia)
      .then((config) => {
        const nuevo = { config, cargando: false, error: '' };
        cache.set(familia, nuevo);
        if (vigente) setEstado(nuevo);
      })
      .catch((e) => { if (vigente) setEstado({ config: null, cargando: false, error: e?.message || 'No se pudo leer la configuración.' }); });
    return () => { vigente = false; };
  }, [familia]);

  const recargar = useCallback(async () => {
    const nuevo = { config: await leerConfiguracionKits(familia), cargando: false, error: '' };
    cache.set(familia, nuevo);
    setEstado(nuevo);
  }, [familia]);

  return { ...estado, recargar };
};
