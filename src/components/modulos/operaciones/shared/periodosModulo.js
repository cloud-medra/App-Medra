// Consultas de cierres_periodos por módulo (Implantes, Hemodinamia…), para
// las pantallas compartidas (shared/modulosGestion.js).
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../../../firebaseConfig';

// ¿Está abierto (ABIERTO o REABIERTO) el período puntual del módulo? Mismo
// criterio que periodoEstaAbierto de verificacionPeriodoBloque.js.
export const periodoEstaAbierto = async (modulo, anio, mes) => {
  const snap = await getDocs(query(
    collection(db, 'cierres_periodos'),
    where('modulo', '==', modulo),
    where('anio', '==', anio),
    where('mes', '==', mes),
    where('estado', 'in', ['ABIERTO', 'REABIERTO'])
  ));
  return !snap.empty;
};

// Período abierto del módulo ({ anio, mes } o null).
export const obtenerPeriodoAbiertoModulo = async (modulo) => {
  const snap = await getDocs(query(
    collection(db, 'cierres_periodos'),
    where('modulo', '==', modulo),
    where('estado', 'in', ['ABIERTO', 'REABIERTO'])
  ));
  if (snap.empty) return null;
  const d = snap.docs[0].data();
  return { anio: d.anio, mes: d.mes };
};
