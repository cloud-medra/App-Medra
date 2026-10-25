import { useEffect, useSyncExternalStore, useCallback } from 'react';
import {
  cargarCatalogo,
  suscribirCatalogo,
  obtenerEstadoCatalogo,
  refrescarCatalogo
} from '../stores/catalogosStore';

const SIN_DATOS = [];

/**
 * Lee un catálogo maestro del catalogosStore (ver src/stores/catalogosStore.js).
 * Lo carga la primera vez que alguien lo pide en la sesión; las demás
 * pantallas lo reutilizan sin nuevas lecturas.
 *
 * @param {'codigos'|'empresas'|'recargos'|'centros'|'instituciones'|'prestadores'|'notas'|'bodegaProductos'|'bodegaCatalogos'} nombre
 * @param {{ habilitado?: boolean, consulta?: { clave: string, restricciones: any[] } }} [opciones]
 *   habilitado=false no dispara la carga. `consulta` filtra la lectura (ver
 *   cargarCatalogo); solo se vuelve a leer cuando cambia su `clave`.
 */
export function useCatalogo(nombre, { habilitado = true, consulta } = {}) {
  const estado = useSyncExternalStore(
    useCallback((cb) => suscribirCatalogo(nombre, cb), [nombre]),
    () => obtenerEstadoCatalogo(nombre)
  );

  const claveConsulta = consulta?.clave;
  useEffect(() => {
    if (habilitado) cargarCatalogo(nombre, consulta).catch(() => {});
    // `consulta` se identifica por su clave (las restricciones se recrean en cada render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nombre, habilitado, claveConsulta]);

  const refrescar = useCallback(() => refrescarCatalogo(nombre).catch(() => {}), [nombre]);

  return {
    datos: estado.datos ?? SIN_DATOS,
    cargado: estado.datos !== null,
    cargando: estado.cargando || (habilitado && estado.datos === null && !estado.error),
    error: estado.error,
    refrescar
  };
}
