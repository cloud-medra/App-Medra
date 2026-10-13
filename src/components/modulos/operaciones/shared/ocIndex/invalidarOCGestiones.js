// Cuando una reimportación de Detalles OC cambia la OC de una fila ya
// registrada, las gestiones (Implantes y Hemodinamia) que tenían la OC antigua asignada
// deben volver a sincronizarse: se quita la OC antigua de ocPorItem en los
// ítems de ese código (misma admisión, fecha y empresa) y se marca
// ocPendiente: true. "Sincronizar OC" les asigna después la nueva.
//
// Lecturas: 1 por gestión encontrada (consultas por gestionId, de a 15
// admisiones: cada una va como texto y como número). Escrituras: 2 por
// gestión corregida (update + log de auditoría).
import { collectionGroup, query, where, getDocs, doc, collection, writeBatch, FieldPath, deleteField, serverTimestamp } from 'firebase/firestore';
import { db } from '../../../../../firebaseConfig';
import { itemsDeGestion } from './indiceOC';
import { normalizarCodigo, normalizarFecha, empresasCoinciden } from './normalizacionOC.js';
import { moduloGestion, MODULOS_CON_OC } from '../modulosGestion';

const prefijoDe = (modulo) => `${moduloGestion(modulo).coleccionGestiones}/`;
const ADMISIONES_POR_CONSULTA = 15; // 'in' admite 30 valores: texto + número
const MAX_OPS_BATCH = 450;

const valoresAdmision = (a) => (/^\d+$/.test(a) ? [a, Number(a)] : [a]);

// Pura: gestiones (data cruda) x OC cambiadas -> [{ refPath, itemIds, cambios }].
export const planificarInvalidacion = (gestiones, ocCambiadas) => {
  const resultado = [];
  gestiones.forEach((g) => {
    const admision = String(g.gestionId || g.agendaId || g.admision || '').trim();
    const ocPorItem = g.ocPorItem || {};
    const itemIds = new Set();
    const aplicados = [];
    ocCambiadas.forEach((c) => {
      if (c.admision !== admision) return;
      if (normalizarFecha(g.fecha) !== c.fecha) return;
      if (!empresasCoinciden(g.empresa, c.proveedor)) return;
      const codigo = normalizarCodigo(c.codigo);
      const ids = itemsDeGestion(g)
        .filter(it => normalizarCodigo(it.codigo) === codigo && ocPorItem[it.id] === c.ocAntes)
        .map(it => it.id);
      if (ids.length) { ids.forEach(id => itemIds.add(id)); aplicados.push(c); }
    });
    if (itemIds.size) resultado.push({ refPath: g.refPath, itemIds: [...itemIds], cambios: aplicados });
  });
  return resultado;
};

// `modulos`: de qué módulos corregir gestiones (por defecto, todos los que
// reciben OC). Cada módulo se escribe aparte: si uno falla (p. ej. sin
// permiso), los demás igual se corrigen y `modulosConError` dice cuáles
// quedan pendientes.
export const invalidarOCGestiones = async (ocCambiadas, { usuario, modulos = MODULOS_CON_OC } = {}) => {
  const res = { lecturas: 0, escrituras: 0, gestionesActualizadas: 0, itemsLiberados: 0, error: null, modulosConError: [] };
  if (ocCambiadas.length === 0) return res;

  const admisiones = [...new Set(ocCambiadas.map(c => c.admision))];
  const gestiones = [];
  try {
    for (let i = 0; i < admisiones.length; i += ADMISIONES_POR_CONSULTA) {
      const valores = admisiones.slice(i, i + ADMISIONES_POR_CONSULTA).flatMap(valoresAdmision);
      const snap = await getDocs(query(collectionGroup(db, 'detalles'), where('gestionId', 'in', valores)));
      res.lecturas += Math.max(1, snap.size);
      snap.docs
        .filter(d => modulos.some(m => d.ref.path.startsWith(prefijoDe(m))))
        .forEach(d => gestiones.push({ refPath: d.ref.path, ...d.data() }));
    }
  } catch (err) {
    console.error('No se pudieron leer las gestiones con OC cambiada:', err);
    res.error = 'No se pudieron leer las gestiones: ' + (err?.message || err);
    res.modulosConError = [...modulos];
    return res;
  }

  for (const modulo of modulos) {
    try {
      await corregirModulo(planificarInvalidacion(gestiones.filter(g => g.refPath.startsWith(prefijoDe(modulo))), ocCambiadas), usuario, res);
    } catch (err) {
      const etiqueta = moduloGestion(modulo).etiqueta;
      console.error(`No se pudieron marcar las gestiones de ${etiqueta} con OC cambiada:`, err);
      res.modulosConError.push(modulo);
      res.error = err?.code === 'permission-denied'
        ? `Sin permiso de ${etiqueta} para corregir las gestiones ahora: quedan pendientes y se aplican en el próximo "Sincronizar OC".`
        : `No se pudieron corregir las gestiones de ${etiqueta}: ` + (err?.message || err);
    }
  }
  return res;
};

// Escribe las correcciones de un módulo (update + log por gestión).
const corregirModulo = async (correcciones, usuario, res) => {
  for (let i = 0; i < correcciones.length; i += MAX_OPS_BATCH / 2) {
    const batch = writeBatch(db);
    const lote = correcciones.slice(i, i + MAX_OPS_BATCH / 2);
    lote.forEach(({ refPath, itemIds, cambios }) => {
      const ref = doc(db, refPath);
      const pares = itemIds.flatMap(id => [new FieldPath('ocPorItem', id), deleteField()]);
      batch.update(ref, 'ocPendiente', true, 'ocActualizadoEn', serverTimestamp(), ...pares);
      batch.set(doc(collection(ref, 'logs')), {
        accion: 'OC_INVALIDADA',
        detalles: {
          items: itemIds,
          cambios: cambios.map(c => ({ codigo: c.codigo, ocAntes: c.ocAntes, ocDespues: c.ocDespues })),
          origen: 'IMPORTAR_DETALLES_OC'
        },
        active: true,
        usuario: usuario?.nombreCompleto || 'Usuario Desconocido',
        usuarioEmail: usuario?.email || '',
        timestamp: serverTimestamp()
      });
    });
    await batch.commit();
    res.escrituras += lote.length * 2;
    res.gestionesActualizadas += lote.length;
    res.itemsLiberados += lote.reduce((n, c) => n + c.itemIds.length, 0);
  }
};
