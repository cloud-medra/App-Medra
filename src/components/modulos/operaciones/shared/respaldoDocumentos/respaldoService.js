// Firestore + Storage del Respaldo de documentos de cada módulo
// (`modulo`, ver modulosGestion.js). En Implantes:
//   Firestore: implantes_respaldo_documentos/{id}  (datos, quién y cuándo)
//   Storage:   implantes_respaldo/{id}/{ID - Nombre - TIPO.pdf}
// Hemodinamia: hemodinamia_respaldo_documentos y hemodinamia_respaldo.
// Cada documento tiene su propia carpeta en Storage (por id), así que dos
// archivos con el mismo nombre nunca chocan. Eliminar lo envía a la
// papelera (eliminado: true); solo "eliminar definitivamente" borra el PDF.
import { collection, doc, setDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytesResumable, deleteObject } from 'firebase/storage';
import { db, storage, auth } from '../../../../../firebaseConfig';
import { onSnapshotVisible } from '../../../../../hooks/useVisibleSnapshot';
import { construirNombreRespaldo } from './respaldoHelpers';
import { moduloGestion } from '../modulosGestion';

const coleccion = (modulo) => moduloGestion(modulo).coleccionRespaldo;

export const escucharRespaldos = (modulo, onDatos, onError) =>
  onSnapshotVisible(
    collection(db, coleccion(modulo)),
    (snap) => onDatos(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    onError
  );

const subirArchivo = (ruta, file, onProgreso) => new Promise((resolve, reject) => {
  const tarea = uploadBytesResumable(ref(storage, ruta), file, {
    contentType: 'application/pdf',
    customMetadata: { nombreOriginal: file.name, subidoPor: auth.currentUser?.email || '' },
  });
  tarea.on('state_changed',
    (s) => onProgreso?.(s.totalBytes ? Math.round((s.bytesTransferred / s.totalBytes) * 100) : 0),
    reject,
    () => resolve());
});

// Sube el PDF y luego registra sus datos. Si el registro falla, intenta
// quitar el PDF recién subido para no dejarlo huérfano.
export const subirRespaldo = async ({ modulo, file, idAdmision, fecha, nombre, tipo, usuarioNombre, onProgreso }) => {
  const docRef = doc(collection(db, coleccion(modulo)));
  const nombreArchivo = construirNombreRespaldo({ idAdmision, nombre, tipo });
  const ruta = `${moduloGestion(modulo).carpetaRespaldo}/${docRef.id}/${nombreArchivo}`;
  await subirArchivo(ruta, file, onProgreso);
  try {
    await setDoc(docRef, {
      idAdmision: String(idAdmision).trim(),
      nombre: String(nombre).trim(),
      tipo: String(tipo).toUpperCase(),
      fecha,
      nombreArchivo,
      nombreOriginal: file.name,
      ruta,
      tamano: file.size,
      subidoPorUid: auth.currentUser?.uid || null,
      subidoPorNombre: usuarioNombre || auth.currentUser?.email || 'Usuario',
      subidoEl: serverTimestamp(),
      eliminado: false,
      eliminadoPor: null,
      eliminadoEl: null,
    });
  } catch (err) {
    await deleteObject(ref(storage, ruta)).catch(() => {});
    throw err;
  }
  return { id: docRef.id, nombreArchivo, ruta };
};

export const enviarRespaldoAPapelera = (modulo, id, usuarioNombre) =>
  updateDoc(doc(db, coleccion(modulo), id), { eliminado: true, eliminadoPor: usuarioNombre || 'Usuario', eliminadoEl: serverTimestamp() });

export const restaurarRespaldo = (modulo, id) =>
  updateDoc(doc(db, coleccion(modulo), id), { eliminado: false, eliminadoPor: null, eliminadoEl: null });

// Borra el PDF y su registro (solo desde la papelera). Si el PDF ya no existe
// en Storage, igual se quita el registro.
export const eliminarRespaldoDefinitivo = async (modulo, { id, ruta }) => {
  try {
    await deleteObject(ref(storage, ruta));
  } catch (err) {
    if (err?.code !== 'storage/object-not-found') throw err;
  }
  await deleteDoc(doc(db, coleccion(modulo), id));
};
