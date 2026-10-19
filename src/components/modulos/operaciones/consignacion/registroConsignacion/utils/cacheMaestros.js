import { cargarCatalogo, refrescarCatalogo } from '../../../../../../stores/catalogosStore';
import { buscarReporteInfoPorAdmision as buscarReporteInfoPorAdmisionBase } from './buscarReporteInfoPorAdmision';

// Prestadores y códigos salen del catalogosStore (una lectura por sesión,
// compartida con el resto de la app). `db` se mantiene en la firma por
// compatibilidad con los llamadores.
export async function obtenerMedicosCacheados(_db, forzar = false) {
  const datos = forzar ? await refrescarCatalogo('prestadores') : await cargarCatalogo('prestadores');
  return datos.filter((p) => (p.estado || 'ACTIVO').toUpperCase() !== 'INACTIVO');
}

// maestros_codigos está en vivo en el store, así que `forzar` no hace falta.
export async function obtenerCodigosCacheados(_db, tipo) {
  const datos = await cargarCatalogo('codigos');
  return datos.filter((c) => c.tipo === tipo);
}

const cacheReportes = new Map(); 

export function buscarReporteInfoPorAdmisionCacheado(db, admisionId, forzar = false) {
  const clave = String(admisionId || '').trim();
  if (!clave) return Promise.resolve(null);

  if (!forzar && cacheReportes.has(clave)) return cacheReportes.get(clave);

  const promesa = buscarReporteInfoPorAdmisionBase(db, clave).catch((err) => {
    cacheReportes.delete(clave); 
    throw err;
  });

  cacheReportes.set(clave, promesa);
  return promesa;
}

// Como buscarReporteInfoPorAdmisionCacheado, pero una Admisión que antes
// no se encontró (null) se vuelve a consultar: Carga Masiva la usa al
// revalidar, por si mientras tanto se completó en Reportes Info. Las ya
// encontradas salen de la caché (0 lecturas).
export async function buscarReporteInfoReintentandoNoEncontradas(db, admisionId) {
  const clave = String(admisionId || '').trim();
  let noEncontrada = false;
  if (cacheReportes.has(clave)) {
    try { noEncontrada = (await cacheReportes.get(clave)) === null; } catch { noEncontrada = true; }
  }
  return buscarReporteInfoPorAdmisionCacheado(db, clave, noEncontrada);
}

export function invalidarReporteAdmision(admisionId) {
  const clave = String(admisionId || '').trim();
  if (clave) cacheReportes.delete(clave);
}