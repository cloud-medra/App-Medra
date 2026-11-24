// Datos del botón "Descargar Excel" de Ingresar Guía: todas las líneas de
// guía guardadas en consignacion_guias/{año}/mes/{Mes}/documento/{N°Doc}/
// detalles. El collectionGroup('detalles') también trae otros módulos, así
// que se acota por rango de documentId() a esta colección (mismo criterio
// que el Listado de guías, que lo hace por mes).
//
// Costo: primero un count() (1 lectura por cada 1.000 líneas) para avisar
// cuántas se van a leer; después, si el usuario confirma, 1 lectura por
// línea. No queda en memoria: cada descarga vuelve a leer, para incluir las
// guías recién guardadas.
import { collectionGroup, documentId, getCountFromServer, getDocs, orderBy, query, where } from 'firebase/firestore';
import { db } from '../../../../../firebaseConfig';

const COL_GUIAS = 'consignacion_guias';
// Rutas de los años (consignacion_guias/2026, …): '~' va después de dígitos y letras.
const RANGO = { desde: `${COL_GUIAS}/0`, hasta: `${COL_GUIAS}/~` };

const consulta = (...extra) => query(
  collectionGroup(db, 'detalles'),
  where(documentId(), '>=', RANGO.desde),
  where(documentId(), '<', RANGO.hasta),
  ...extra,
);

export const contarLineasGuias = async () => (await getCountFromServer(consulta())).data().count;

export const leerLineasGuias = async () => {
  const snap = await getDocs(consulta(orderBy(documentId())));
  return snap.docs.map((d) => d.data());
};
