// Escrituras de las notas del panel (administracion_notas). Separadas del
// componente para que las pruebas del emulador (tests/emulador/notasPanel)
// ejerciten exactamente lo que envía la app. `db` se recibe por parámetro.
import { collection, doc, serverTimestamp, updateDoc, writeBatch } from 'firebase/firestore';

export const COLECCION_NOTAS = 'administracion_notas';

const contenidoDe = ({ tipo, contenido, items }, { limpiarOtro }) => (tipo === 'texto'
  ? { contenido: contenido.trim(), ...(limpiarOtro ? { items: [] } : {}) }
  : {
      ...(limpiarOtro ? { contenido: '' } : {}),
      items: items
        .filter((i) => i.trim())
        .map((texto) => ({ texto: texto.trim(), completado: false })),
    });

/**
 * Publica una nota arriba de todo: la nueva queda con orden 0 y las que el
 * usuario ve bajan un lugar (un solo batch).
 * @param {Array<{id: string, orden?: number}>} notasActuales las del listado, en orden
 * @returns {Promise<string>} id de la nota creada
 */
export const crearNota = async (db, notasActuales, { titulo, tipo, contenido, items, rolesVisibles, estilo, autor }) => {
  const batch = writeBatch(db);
  notasActuales.forEach((n, idx) => {
    const ordenValido = typeof n.orden === 'number' ? n.orden : idx;
    batch.update(doc(db, COLECCION_NOTAS, n.id), { orden: ordenValido + 1 });
  });
  const ref = doc(collection(db, COLECCION_NOTAS));
  batch.set(ref, {
    titulo: titulo.trim(),
    tipo,
    rolesVisibles,
    estilo,
    autor,
    fecha: serverTimestamp(),
    orden: 0,
    ...contenidoDe({ tipo, contenido, items }, { limpiarOtro: false }),
  });
  await batch.commit();
  return ref.id;
};

export const actualizarNota = (db, id, { titulo, tipo, contenido, items, rolesVisibles, estilo }) => updateDoc(
  doc(db, COLECCION_NOTAS, id),
  { titulo: titulo.trim(), tipo, rolesVisibles, estilo, ...contenidoDe({ tipo, contenido, items }, { limpiarOtro: true }) },
);

// Intercambia el orden de dos notas (flechas del listado).
export const intercambiarOrden = async (db, a, ordenA, b, ordenB) => {
  const batch = writeBatch(db);
  batch.update(doc(db, COLECCION_NOTAS, a.id), { orden: ordenB });
  batch.update(doc(db, COLECCION_NOTAS, b.id), { orden: ordenA });
  await batch.commit();
};
