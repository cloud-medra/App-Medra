// "Eliminar filas seleccionadas" de Importar Detalles OC (solo admin/dev en
// pantalla). Para filas importadas por error: la importación nunca borra.
//   1. ocImport/meta (1 lectura) → snapshot desde la caché si está al día.
//   2. Por cada fila, en el MISMO lote: copia de respaldo en
//      detallesOCEliminados/{id}_{fecha} + borrado del documento. Nunca queda
//      una fila borrada sin respaldo.
//   3. Marcadores (año/mes/admisión/empresa) que quedan sin filas: se borran,
//      sabiéndolo por el snapshot (sin leer Firestore).
//   4. Snapshot e índice de OC sin esos IDs (+ versión en ocImport/meta).
//   5. Opcional: liberar la OC en las gestiones de Implantes que la tenían
//      por esas filas (ocPendiente: true), salvo que otra fila que queda
//      respalde la misma OC para esa admisión, fecha y código.
import { doc, writeBatch, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../../../../../firebaseConfig';
import { normalizarProveedorId } from './normalizarProveedor';
import { normalizarCodigo } from '../../../shared/ocIndex/normalizacionOC.js';
import { obtenerSnapshotDetallesOC, guardarSnapshotDetallesOC, camposMetaSnapshot } from './snapshotStorageDetallesOC';
import { mezclarIndiceOC } from '../../../shared/ocIndex/indiceOC';
import { leerMetaOC, obtenerIndiceOC, publicarIndiceOC, agregarInvalidacionesPendientes } from '../../../shared/ocIndex/indiceOCRemoto';
import { invalidarOCGestiones } from '../../../shared/ocIndex/invalidarOCGestiones';

export const COLECCION_RESPALDO = 'detallesOCEliminados';
const MAX_OPS_BATCH = 450;
const COL_BASE = 'documentos_sistema';

const clavesRuta = (e) => {
  const anio = e.f.slice(0, 4); const mes = e.f.slice(5, 7); const adm = String(e.a); const slug = normalizarProveedorId(e.p);
  return [
    { clave: anio, ruta: [COL_BASE, anio] },
    { clave: `${anio}/${mes}`, ruta: [COL_BASE, anio, 'meses', mes] },
    { clave: `${anio}/${mes}/${adm}`, ruta: [COL_BASE, anio, 'meses', mes, 'admisiones', adm] },
    { clave: `${anio}/${mes}/${adm}/${slug}`, ruta: [COL_BASE, anio, 'meses', mes, 'admisiones', adm, 'empresas', slug] }
  ];
};

// Pura. `ids`: filas a eliminar; `snapshot`: { id: entrada } antes de borrar.
//   marcadores: rutas de marcador que quedan sin ninguna fila
//   ocALiberar: OC de las filas eliminadas que ya no respalda ninguna otra
export const planificarEliminacion = (ids, snapshot) => {
  const aEliminar = new Set(ids);
  const restantes = Object.entries(snapshot).filter(([id]) => !aEliminar.has(id)).map(([, e]) => e);

  const ocupadas = new Set();
  restantes.forEach(e => clavesRuta(e).forEach(k => ocupadas.add(k.clave)));
  const marcadores = new Map();
  ids.forEach((id) => {
    const e = snapshot[id];
    if (!e) return;
    clavesRuta(e).forEach((k) => { if (!ocupadas.has(k.clave)) marcadores.set(k.clave, k.ruta); });
  });

  const claveOC = (a, f, c, oc) => `${a}|${f}|${normalizarCodigo(c)}|${oc}`;
  const respaldadas = new Set(restantes.filter(e => e.v?.oc).map(e => claveOC(e.a, e.f, e.v.codigo, e.v.oc)));
  const ocALiberar = [];
  const vistas = new Set();
  ids.forEach((id) => {
    const e = snapshot[id];
    if (!e?.v?.oc) return;
    const k = claveOC(e.a, e.f, e.v.codigo, e.v.oc);
    if (respaldadas.has(k) || vistas.has(k)) return;
    vistas.add(k);
    ocALiberar.push({ admision: String(e.a), fecha: e.f, proveedor: e.p, codigo: String(e.v.codigo ?? ''), ocAntes: String(e.v.oc), ocDespues: '' });
  });

  return { marcadores: [...marcadores.values()], ocALiberar };
};

/**
 * @param filas [{ id, refPath, ...data }] tal como las muestra la tabla
 * @param opciones { liberarOC, usuario, onProgreso }
 */
export const eliminarFilasDetallesOC = async (filas, { liberarOC = true, usuario, onProgreso } = {}) => {
  let lecturas = 0;
  let escrituras = 0;

  const meta = await leerMetaOC();
  lecturas += 1;
  const snapshot = await obtenerSnapshotDetallesOC(meta);

  // Respaldo + borrado, de a pares en el mismo lote.
  const confirmados = [];
  const errores = [];
  const sello = Date.now();
  for (let i = 0; i < filas.length; i += MAX_OPS_BATCH / 2) {
    const lote = filas.slice(i, i + MAX_OPS_BATCH / 2);
    const batch = writeBatch(db);
    lote.forEach(({ id, refPath, ...datos }) => {
      // Los valores vienen de Firestore (fechas como Timestamp): se copian tal cual.
      batch.set(doc(db, COLECCION_RESPALDO, `${id}_${sello}`), {
        ...datos,
        idFila: id,
        rutaOriginal: refPath,
        eliminadoPor: usuario?.nombreCompleto || 'Usuario Desconocido',
        eliminadoPorEmail: usuario?.email || '',
        eliminadoEn: serverTimestamp()
      });
      batch.delete(doc(db, refPath));
    });
    try {
      await batch.commit();
      escrituras += lote.length * 2;
      confirmados.push(...lote.map(f => f.id));
    } catch (err) {
      console.error('[Eliminar Detalles OC] Falló un lote:', err);
      lote.forEach(f => errores.push({ id: f.id, error: err.code || err.message }));
    }
    onProgreso?.({ actual: Math.min(i + lote.length, filas.length), total: filas.length });
  }

  const resultado = { eliminadas: confirmados.length, errores, marcadoresBorrados: 0, gestionesOC: null, indiceOC: null };
  if (confirmados.length === 0) return { ...resultado, lecturasFirestore: lecturas, escriturasFirestore: escrituras };

  const { marcadores, ocALiberar } = planificarEliminacion(confirmados, snapshot.filas);

  // Marcadores vacíos (un solo lote: son pocos).
  if (marcadores.length > 0) {
    try {
      const batch = writeBatch(db);
      marcadores.slice(0, MAX_OPS_BATCH).forEach(r => batch.delete(doc(db, ...r)));
      await batch.commit();
      escrituras += Math.min(marcadores.length, MAX_OPS_BATCH);
      resultado.marcadoresBorrados = Math.min(marcadores.length, MAX_OPS_BATCH);
    } catch (err) {
      console.warn('No se pudieron borrar los marcadores vacíos (no afecta los datos):', err);
    }
  }

  // Snapshot e índice sin las filas eliminadas.
  const nuevoSnapshot = { ...snapshot.filas };
  confirmados.forEach((id) => { delete nuevoSnapshot[id]; });
  let metaSnapshot = camposMetaSnapshot(await guardarSnapshotDetallesOC(nuevoSnapshot));
  try {
    const { indice: anterior } = await obtenerIndiceOC({ metaConocida: meta });
    const { indice, stats } = mezclarIndiceOC(anterior, [], confirmados);
    if (stats.cambios > 0) {
      await publicarIndiceOC(indice, { extraMeta: metaSnapshot });
      escrituras += 1;
      metaSnapshot = {};
    }
    resultado.indiceOC = { ok: true, eliminadas: stats.eliminadas };
  } catch (err) {
    console.error('No se pudo actualizar el índice de OC:', err);
    resultado.indiceOC = { ok: false, error: err.message };
  }
  if (Object.keys(metaSnapshot).length > 0) {
    await setDoc(doc(db, 'ocImport', 'meta'), metaSnapshot, { merge: true });
    escrituras += 1;
  }

  // Liberar OC en las gestiones.
  if (liberarOC && ocALiberar.length > 0) {
    const g = await invalidarOCGestiones(ocALiberar, { usuario });
    lecturas += g.lecturas;
    escrituras += g.escrituras;
    if (g.error) {
      try {
        await agregarInvalidacionesPendientes(ocALiberar, g.modulosConError?.length ? g.modulosConError : undefined);
        escrituras += 1;
        g.pendientesEnSincronizar = true;
      } catch (err) {
        console.error('No se pudieron guardar las OC a liberar como pendientes:', err);
      }
    }
    resultado.gestionesOC = { ...g, ocLiberadas: ocALiberar.length };
  }

  return { ...resultado, lecturasFirestore: lecturas, escriturasFirestore: escrituras };
};
