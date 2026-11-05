// Filas de Detalles OC de un mes: el rango de documentId() acota el collectionGroup
// "detalles" al prefijo exacto del período (documentos_sistema/{anio}/meses/{mes}...).
// Traen paciente y médico: solo para usuarios internos (las reglas niegan a un externo).
// La usan Importar Detalles OC y la vista interna de Portal Proveedores.
import { collectionGroup, query, where, orderBy, limit, documentId } from 'firebase/firestore';
import { db } from '../../../../../../firebaseConfig';

export const COL_BASE = 'documentos_sistema';
// Tope defensivo por período: si se alcanza, la pantalla lo avisa en vez de truncar en silencio.
export const LIMITE_FILAS_PERIODO = 3000;

export const consultaDetallesPeriodo = (anio, mes) => {
  const min = `${COL_BASE}/${anio}/meses/${mes}`;
  return query(
    collectionGroup(db, 'detalles'),
    where(documentId(), '>=', min),
    where(documentId(), '<', `${min}\uf8ff`),
    orderBy(documentId(), 'desc'),
    limit(LIMITE_FILAS_PERIODO)
  );
};
