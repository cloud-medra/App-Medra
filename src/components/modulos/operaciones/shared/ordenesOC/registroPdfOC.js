// Registro de qué OC ya tienen PDF: UN documento de Firestore
// (ordenesOC/registroPdf) con { pdfs: { [claveOC]: { subidoEn, subidoPor } } }.
// Leerlo cuesta 1 lectura. Cada subida actualiza solo su campo (merge sobre el
// mapa), así que dos personas subiendo a la vez no se pisan. ~80 bytes por
// OC: el límite de 1 MiB alcanza para ~12.000 OC.
import { doc, getDoc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../../../../../firebaseConfig';
import { claveOC } from './ordenesOCHelpers';

const refRegistro = () => doc(db, 'ordenesOC', 'registroPdf');

// Copia en memoria de la sesión. Solo la usa quien pide `usarCache`
// (Ingreso de Órdenes); las subidas de este navegador la mantienen al día.
let enMemoria = null;

// { [claveOC]: { subidoEn, subidoPor } } ({} si aún no existe).
// Con usarCache devuelve { pdfs, lecturas } y no relee si ya se leyó.
export const leerRegistroPdfOC = async ({ usarCache = false } = {}) => {
  if (usarCache && enMemoria) return { pdfs: enMemoria, lecturas: 0 };
  const snap = await getDoc(refRegistro());
  enMemoria = (snap.exists() && snap.data().pdfs) || {};
  return usarCache ? { pdfs: enMemoria, lecturas: 1 } : enMemoria;
};

// Escucha en vivo el registro (lo usa la tabla de Gestiones para sus
// colores): 1 lectura al abrir y 1 por cada cambio del documento (cada PDF
// que suba cualquier usuario). Mantiene al día la copia en memoria.
// onDatos(pdfs). Devuelve la función para cerrar el listener.
export const escucharRegistroPdfOC = (onDatos, onError) => onSnapshot(
  refRegistro(),
  (snap) => {
    enMemoria = (snap.exists() && snap.data().pdfs) || {};
    onDatos(enMemoria);
  },
  onError
);

// Devuelve la entrada escrita (para actualizar el registro en memoria).
export const registrarPdfOC = async (oc) => {
  const entrada = { subidoEn: serverTimestamp(), subidoPor: auth.currentUser?.email || '' };
  await setDoc(refRegistro(), { pdfs: { [claveOC(oc)]: entrada }, actualizadoEn: serverTimestamp() }, { merge: true });
  const local = { subidoEn: new Date(), subidoPor: entrada.subidoPor };
  if (enMemoria) enMemoria = { ...enMemoria, [claveOC(oc)]: local };
  return local;
};
