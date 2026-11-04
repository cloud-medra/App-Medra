// Acceso a Firestore de la Solicitud de precios a TI (ver solicitudesPrecio.js).
import { arrayUnion, collection, doc, getDocs, increment, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from '../../../../../firebaseConfig';
import { normalizarReferencia } from '../../../operaciones/implantes/gestionImplantes/components/Cargastab/cargasHelpers';
import { COL_SOLICITUDES_PRECIO, idSolicitudPrecio, cambioPrecio, versionSolicitud } from './solicitudesPrecio';

const nombreUsuario = (userData) => userData?.nombreCompleto || 'Usuario';

// Agrega (o vuelve a marcar) una referencia. En una transacción: si ya está,
// conserva la fecha en que se agregó y actualiza descripción, costo y venta
// con la última marca. Devuelve el precio anterior si cambió (para el aviso).
export const agregarSolicitudPrecio = async ({ solicitud, modulo, userData }) => {
  const ref = doc(db, COL_SOLICITUDES_PRECIO, idSolicitudPrecio(solicitud.referencia));
  const usuario = nombreUsuario(userData);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) {
      tx.set(ref, {
        ...solicitud,
        referenciaNormalizada: normalizarReferencia(solicitud.referencia),
        modulos: [modulo],
        ultimoModulo: modulo,
        vecesMarcada: 1,
        agregadoEl: serverTimestamp(),
        agregadoPor: usuario,
        actualizadoEl: serverTimestamp(),
        actualizadoPor: usuario
      });
      return { precioAnterior: null };
    }
    const anterior = snap.data();
    // Código, veces costo, costo y venta: los de la última marca (el módulo
    // que marcó último define cómo se calculó la venta: `ultimoModulo`).
    tx.update(ref, {
      descripcion: solicitud.descripcion || anterior.descripcion || '',
      codigo: solicitud.codigo || anterior.codigo || '',
      costo: solicitud.costo,
      vecesCosto: solicitud.vecesCosto ?? null,
      venta: solicitud.venta,
      modulos: arrayUnion(modulo),
      ultimoModulo: modulo,
      vecesMarcada: increment(1),
      actualizadoEl: serverTimestamp(),
      actualizadoPor: usuario
    });
    return { precioAnterior: cambioPrecio(anterior, solicitud) ? { costo: anterior.costo, venta: anterior.venta } : null };
  });
};

// La lista es corta (se vacía al descargar): una lectura al abrir la pestaña
// o al recargar, sin listener permanente.
export const leerSolicitudesPrecio = async () => {
  const snap = await getDocs(collection(db, COL_SOLICITUDES_PRECIO));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

const TAMANO_LOTE = 100;

// Quita de la lista las filas ya descargadas. Cada documento se borra solo
// si sigue en la versión descargada: si alguien lo volvió a marcar después
// (precio nuevo), se conserva para la próxima solicitud.
export const eliminarDescargadas = async (registros) => {
  let eliminadas = 0;
  let conservadas = 0;
  for (let i = 0; i < registros.length; i += TAMANO_LOTE) {
    const lote = registros.slice(i, i + TAMANO_LOTE);
    const resultado = await runTransaction(db, async (tx) => {
      const refs = lote.map((r) => doc(db, COL_SOLICITUDES_PRECIO, r.id));
      const snaps = await Promise.all(refs.map((ref) => tx.get(ref)));
      let borradas = 0;
      snaps.forEach((snap, idx) => {
        if (!snap.exists()) return;
        if (versionSolicitud(snap.data()) !== versionSolicitud(lote[idx])) return;
        tx.delete(refs[idx]);
        borradas += 1;
      });
      return borradas;
    });
    eliminadas += resultado;
    conservadas += lote.length - resultado;
  }
  return { eliminadas, conservadas };
};
