// Lecturas y escrituras de Recordatorios. `db` se recibe por parámetro para
// que las pruebas del emulador (tests/emulador/recordatorios.test.js)
// ejerciten exactamente lo que envía la app.
import {
  collection, doc, query, where, getDocs, setDoc, updateDoc, deleteDoc, addDoc, serverTimestamp,
} from 'firebase/firestore';
import {
  COLECCION_TAREAS, COLECCION_REALIZADOS, SUBCOLECCION_REALIZADOS, idRealizado,
} from './recordatoriosConfig';

export const refTareas = (db) => collection(db, COLECCION_TAREAS);
export const refRealizadosDe = (db, uid) => collection(db, COLECCION_REALIZADOS, uid, SUBCOLECCION_REALIZADOS);

// Tareas asignadas al usuario (lo único que las reglas le dejan leer).
export const consultaTareasDe = (db, uid) => query(refTareas(db), where('asignados', 'array-contains', uid));

// Realizados del usuario desde `fechaMinima` (para saber qué está marcado).
export const consultaRealizadosDe = (db, uid, fechaMinima) =>
  query(refRealizadosDe(db, uid), where('fecha', '>=', fechaMinima));

const datosTarea = ({ titulo, descripcion = '', dias, hora = '', asignados, activa = true }) => ({
  titulo: String(titulo).trim(),
  descripcion: String(descripcion || '').trim(),
  dias: [...new Set(dias)].sort((a, b) => a - b),
  hora: String(hora || '').trim(),
  asignados: [...new Set(asignados)],
  activa: Boolean(activa),
});

// `desde` (hoy en Santiago): una repetición anterior a la creación no cuenta
// como atrasada.
export const crearTarea = async (db, tarea, { desde, creadoPor }) => {
  const ref = await addDoc(refTareas(db), {
    ...datosTarea(tarea),
    desde,
    creadoPor: creadoPor || '',
    creadoEn: serverTimestamp(),
    actualizadoEn: serverTimestamp(),
  });
  return ref.id;
};

export const actualizarTarea = (db, id, tarea) =>
  updateDoc(doc(db, COLECCION_TAREAS, id), { ...datosTarea(tarea), actualizadoEn: serverTimestamp() });

export const cambiarActivaTarea = (db, id, activa) =>
  updateDoc(doc(db, COLECCION_TAREAS, id), { activa, actualizadoEn: serverTimestamp() });

// Borra la tarea; su historial de Realizados se conserva.
export const borrarTarea = (db, id) => deleteDoc(doc(db, COLECCION_TAREAS, id));

// "Realizado" de la repetición `fecha` (id fijo: marcar dos veces no duplica;
// las reglas no dejan reescribirlo).
export const marcarRealizado = (db, { uid, usuarioNombre, tarea, fecha }) =>
  setDoc(doc(refRealizadosDe(db, uid), idRealizado(tarea.id, fecha)), {
    tareaId: tarea.id,
    titulo: tarea.titulo,
    fecha,
    uid,
    usuarioNombre: usuarioNombre || '',
    realizadoEn: serverTimestamp(),
  });

// Historial de una tarea: Realizados de cada usuario asignado (una consulta
// por usuario, sin índices de grupo de colecciones). Más recientes primero.
export const leerHistorialTarea = async (db, tarea) => {
  const listas = await Promise.all((tarea.asignados || []).map(async (uid) => {
    const snap = await getDocs(query(refRealizadosDe(db, uid), where('tareaId', '==', tarea.id)));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }));
  return listas.flat().sort((a, b) => b.fecha.localeCompare(a.fecha)
    || (b.realizadoEn?.toMillis?.() || 0) - (a.realizadoEn?.toMillis?.() || 0));
};
