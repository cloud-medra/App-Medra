// Persistencia del índice de OC:
//   - El índice completo es UN archivo JSON en Firebase Storage (mismo
//     criterio que el snapshot de hashes de Importar Detalles OC: no gasta
//     lecturas de Firestore y no choca con el límite de 1 MiB por documento).
//   - ocImport/meta es un documento chico en Firestore con la versión. Es lo
//     único que se lee en cada sincronización (1 lectura); el archivo se
//     descarga solo si la versión cambió respecto de la caché local.
import { doc, getDoc, setDoc, updateDoc, serverTimestamp, arrayUnion, deleteField } from 'firebase/firestore';
import { ref, uploadString, getBytes } from 'firebase/storage';
import { db, storage } from '../../../../../firebaseConfig';
import { rangoFechasIndiceOC, periodosIndiceOC, FORMATO_INDICE_OC } from './indiceOC';
import { leerCacheIndiceOC, guardarCacheIndiceOC } from './cacheIndiceOC';
import { moduloGestion, MODULOS_CON_OC } from '../modulosGestion';

const RUTA_INDICE = 'snapshots/indiceOC/indiceOC.json';
const refMeta = () => doc(db, 'ocImport', 'meta');

// Índice completo desde Storage ({} si todavía no existe).
export const descargarIndiceOC = async () => {
  try {
    const bytes = await getBytes(ref(storage, RUTA_INDICE));
    const data = JSON.parse(new TextDecoder().decode(bytes));
    // Índice de un formato anterior: se descarta (se rearma al importar).
    if (data?.formato !== FORMATO_INDICE_OC) return { indice: {}, version: null };
    return { indice: data?.indice || {}, version: data?.version || null };
  } catch (err) {
    if (err?.code === 'storage/object-not-found') return { indice: {}, version: null };
    throw err;
  }
};

// Sube el índice y publica la nueva versión en ocImport/meta (1 escritura).
// La versión nueva invalida la caché local de todos los clientes. La caché
// de este cliente queda al día sin volver a descargar.
// `extraMeta`: campos que se publican en el mismo setDoc del meta (por
// ejemplo la versión del snapshot de Detalles OC), para no gastar otra escritura.
export const publicarIndiceOC = async (indice, { extraMeta = {} } = {}) => {
  const version = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const totalEntradas = Object.keys(indice).length;
  await uploadString(
    ref(storage, RUTA_INDICE),
    JSON.stringify({ formato: FORMATO_INDICE_OC, version, actualizadoEn: new Date().toISOString(), totalEntradas, indice }),
    'raw',
    { contentType: 'application/json' }
  );
  await setDoc(refMeta(), {
    version,
    totalEntradas,
    ...rangoFechasIndiceOC(indice),
    periodos: periodosIndiceOC(indice),
    ...extraMeta,
    updatedAt: serverTimestamp()
  }, { merge: true });
  await guardarCacheIndiceOC({ version, indice });
  return version;
};

export const leerMetaOC = async () => {
  const snap = await getDoc(refMeta());
  return snap.exists() ? snap.data() : null;
};

// Meta (1 lectura) + índice: desde la caché local si la versión coincide,
// o descargado de Storage (0 lecturas de Firestore) si cambió. Con
// `metaConocida` (recién leída) no se vuelve a leer ocImport/meta.
export const obtenerIndiceOC = async ({ metaConocida } = {}) => {
  const meta = metaConocida || await leerMetaOC();
  if (!meta) return { meta: null, indice: {}, desdeCache: false };

  const cache = await leerCacheIndiceOC();
  if (cache?.version === meta.version) return { meta, indice: cache.indice, desdeCache: true };

  const { indice } = await descargarIndiceOC();
  await guardarCacheIndiceOC({ version: meta.version, indice });
  return { meta, indice, desdeCache: false };
};

// Meses con OC ('YYYY-MM', del más reciente al más antiguo) para los
// selectores de período: 1 lectura (ocImport/meta). Si el meta es de antes
// de que existiera `periodos`, se calculan desde el índice (caché local, o
// descarga de Storage si cambió la versión). Al importar un Excel nuevo
// cambia el meta, así que la lista siempre sigue a la última versión.
export const obtenerPeriodosOC = async () => {
  const meta = await leerMetaOC();
  if (!meta) return { meta: null, periodos: [] };
  if (Array.isArray(meta.periodos)) return { meta, periodos: meta.periodos };
  const { indice } = await obtenerIndiceOC({ metaConocida: meta });
  return { meta, periodos: periodosIndiceOC(indice), indice };
};

// Cada módulo registra su propia versión sincronizada (ver modulosGestion.js:
// oc.campoUltimaSync). Implantes conserva los nombres de campo de siempre.
export const registrarSincronizacionOC = (version, modulo = 'implantes') => {
  const campo = moduloGestion(modulo).oc.campoUltimaSync;
  return updateDoc(refMeta(), { [campo]: version, [`${campo.replace('Version', 'En')}`]: serverTimestamp() });
};

// OC cambiadas pendientes de aplicar en las gestiones (ver
// invalidarOCGestiones.js y ejecutarSincronizacionOC).
// Una lista por módulo (oc.campoInvalidacionesPendientes): cada "Sincronizar
// OC" aplica y limpia solo la suya. `modulos`: los que no se pudieron
// corregir al importar (por defecto, todos).
export const agregarInvalidacionesPendientes = (ocCambiadas, modulos = MODULOS_CON_OC) =>
  setDoc(refMeta(), Object.fromEntries(modulos.map((m) => [moduloGestion(m).oc.campoInvalidacionesPendientes, arrayUnion(...ocCambiadas)])), { merge: true });

export const limpiarInvalidacionesPendientes = (modulo = 'implantes') =>
  updateDoc(refMeta(), { [moduloGestion(modulo).oc.campoInvalidacionesPendientes]: deleteField() });
