// Acceso a Firestore de las fibras reutilizables: consultas y transacciones.
// La lógica de negocio está en fibrasNucleo.js y operacionesFibra.js.
//
// Escriben desde el navegador (no por Cloud Functions como Bodega): el uso de
// una fibra se registra en la MISMA transacción que guarda la gestión, así no
// puede quedar una gestión guardada sin su uso ni un uso sin su gestión. Las
// reglas de Firestore validan el contador (implantes_fibras).

import {
  collection, doc, getDocs, query, where, orderBy, runTransaction, writeBatch, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../../../../firebaseConfig';
import {
  COL_FIBRAS, COL_CONTROL_FIBRAS, DOC_CONTADOR_FIBRAS, ESTADO_FIBRA, MOTIVO_ANULACION, ErrorFibra,
  codigoInterno, normalizarLote, normalizarReferencia, validarNuevaFibra, validarEdicionFibra, estadoGuardado,
} from './fibrasNucleo';
import { aplicarOperacionesFibra } from './operacionesFibra';

export const refFibra = (id) => doc(db, COL_FIBRAS, id);
export const refUso = (fibraId, usoId) => doc(db, COL_FIBRAS, fibraId, 'usos', usoId);
const refLog = (fibraId) => doc(collection(db, COL_FIBRAS, fibraId, 'logs'));
const refContador = () => doc(db, COL_CONTROL_FIBRAS, DOC_CONTADOR_FIBRAS);

export const nuevoUsoId = (fibraId) => doc(collection(db, COL_FIBRAS, fibraId, 'usos')).id;

export const usuarioDe = (userData) => ({ uid: userData?.uid || '', nombre: userData?.nombreCompleto || userData?.email || 'Usuario' });

const contexto = (userData) => ({
  refs: { fibra: refFibra, uso: refUso, log: refLog },
  ahora: serverTimestamp(),
  usuario: usuarioDe(userData),
});

// Cola con la interfaz de un WriteBatch (set/update/delete): el guardado de la
// gestión arma sus escrituras sin saber todavía si van en un batch o, si hay
// fibras, en una transacción junto con los usos.
export const colaEscrituras = () => {
  const ops = [];
  return {
    set: (ref, datos, opciones) => { ops.push({ tipo: 'set', ref, datos, opciones }); },
    update: (ref, datos) => { ops.push({ tipo: 'update', ref, datos }); },
    delete: (ref) => { ops.push({ tipo: 'delete', ref }); },
    aplicarEn: (destino) => ops.forEach(({ tipo, ref, datos, opciones }) => {
      if (tipo === 'set') { if (opciones) destino.set(ref, datos, opciones); else destino.set(ref, datos); }
      else if (tipo === 'update') destino.update(ref, datos);
      else destino.delete(ref);
    }),
  };
};

/**
 * Confirma la cola: con operaciones de fibra, en una transacción (lecturas de
 * las fibras, usos y luego todas las escrituras); sin ellas, en un batch.
 * Devuelve los usos registrados (para los avisos).
 */
export const confirmarConFibras = async (cola, operaciones, userData) => {
  if (operaciones.length === 0) {
    const batch = writeBatch(db);
    cola.aplicarEn(batch);
    await batch.commit();
    return [];
  }
  return runTransaction(db, async (t) => {
    const resultados = await aplicarOperacionesFibra(t, operaciones, contexto(userData));
    cola.aplicarEn(t);
    return resultados;
  });
};

// --- Consultas ----------------------------------------------------------------

// Selector de Cargas: fibras ACTIVAS de una referencia (índice compuesto
// referencia + estado + vencimiento en firestore.indexes.json).
export const leerFibrasActivas = async (referencia) => {
  const snap = await getDocs(query(
    collection(db, COL_FIBRAS),
    where('referencia', '==', normalizarReferencia(referencia)),
    where('estado', '==', ESTADO_FIBRA.ACTIVA),
    orderBy('vencimiento')
  ));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

// Pantalla Fibras: la colección es chica (decenas de fibras al año).
export const leerTodasLasFibras = async () => {
  const snap = await getDocs(collection(db, COL_FIBRAS));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

export const leerUsosDeFibra = async (fibraId) => {
  const snap = await getDocs(collection(db, COL_FIBRAS, fibraId, 'usos'));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

// --- Pantalla Fibras ------------------------------------------------------------

/**
 * Registra `cantidad` fibras iguales con códigos correlativos (FIB-0001…).
 * datos: { referencia, codigo, descriptor, lote, vencimiento, usosTotales,
 * usosPrevios, cantidad }. Devuelve los códigos creados.
 */
export const registrarFibras = async (datos, userData) => {
  const errores = validarNuevaFibra(datos);
  if (Object.keys(errores).length > 0) throw new ErrorFibra(Object.values(errores)[0]);
  const { refs, ahora, usuario } = contexto(userData);
  return runTransaction(db, async (t) => {
    const snapContador = await t.get(refContador());
    const ultimo = snapContador.exists() ? Number(snapContador.data().ultimo) || 0 : 0;
    const usosTotales = Number(datos.usosTotales);
    const usosPrevios = Number(datos.usosPrevios) || 0;
    const codigos = [];
    for (let i = 1; i <= Number(datos.cantidad); i++) {
      const id = codigoInterno(ultimo + i);
      codigos.push(id);
      t.set(refs.fibra(id), {
        codigoInterno: id,
        referencia: normalizarReferencia(datos.referencia),
        codigo: String(datos.codigo || ''),
        descriptor: String(datos.descriptor || ''),
        lote: normalizarLote(datos.lote),
        vencimiento: datos.vencimiento,
        usosTotales,
        usosPrevios,
        usosConsumidos: usosPrevios,
        numerosOcupados: [],
        fechasUso: {},
        estado: estadoGuardado(usosPrevios, usosTotales),
        ultimoCambio: null,
        creadoEl: ahora,
        creadoPor: usuario,
        actualizadoEl: ahora,
      });
      t.set(refs.log(id), {
        accion: 'CREACION',
        detalles: { referencia: normalizarReferencia(datos.referencia), lote: normalizarLote(datos.lote), vencimiento: datos.vencimiento, usosTotales, usosPrevios },
        usuario: usuario.nombre,
        uid: usuario.uid,
        timestamp: ahora,
      });
    }
    t.set(refContador(), { ultimo: ultimo + Number(datos.cantidad), actualizadoEl: ahora });
    return codigos;
  });
};

// Corrige lote, vencimiento o usos totales (validarEdicionFibra) y lo audita:
// el motivo queda en la fibra (ultimaCorreccion, con el id del log) y en el
// log, escritos juntos; las reglas exigen ambos.
export const editarFibra = async (fibraId, valores, userData) => {
  const motivo = String(valores.motivo || '').trim();
  if (!motivo) throw new ErrorFibra('Ingresa el motivo de la corrección.');
  const { refs, ahora, usuario } = contexto(userData);
  return runTransaction(db, async (t) => {
    const snap = await t.get(refs.fibra(fibraId));
    if (!snap.exists()) throw new ErrorFibra('La fibra ya no existe.');
    const fibra = { id: fibraId, ...snap.data() };
    const { errores, cambios } = validarEdicionFibra(fibra, valores);
    if (Object.keys(errores).length > 0) throw new ErrorFibra(Object.values(errores)[0]);
    if (Object.keys(cambios).length === 0) return false;
    const refLogCorreccion = refs.log(fibraId);
    t.update(refs.fibra(fibraId), {
      ...cambios,
      ultimaCorreccion: { motivo, logId: refLogCorreccion.id },
      actualizadoEl: ahora,
      actualizadoPor: usuario,
    });
    const antes = Object.fromEntries(Object.keys(cambios).map((k) => [k, fibra[k] ?? null]));
    t.set(refLogCorreccion, {
      accion: 'EDICION',
      detalles: { antes, despues: cambios, motivo },
      usuario: usuario.nombre,
      uid: usuario.uid,
      timestamp: ahora,
    });
    return true;
  });
};

export const registrarPerdida = async (fibraId, { motivo, fecha }, userData) => {
  if (!String(motivo || '').trim()) throw new ErrorFibra('Ingresa el motivo de la pérdida.');
  return runTransaction(db, async (t) => {
    const [resultado] = await aplicarOperacionesFibra(t, [{
      tipo: 'registrar', fibraId, usoId: nuevoUsoId(fibraId), perdida: { motivo: String(motivo).trim(), fecha },
    }], contexto(userData));
    return resultado;
  });
};

export const anularPerdida = async (fibraId, usoId, motivo, userData) => {
  if (!String(motivo || '').trim()) throw new ErrorFibra('Ingresa el motivo de la anulación.');
  return runTransaction(db, (t) => aplicarOperacionesFibra(t, [{
    tipo: 'anular', fibraId, usoId, motivo: MOTIVO_ANULACION.PERDIDA_ANULADA, detalle: String(motivo).trim(), soloPerdida: true,
  }], contexto(userData)));
};
