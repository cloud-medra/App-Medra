import { httpsCallable } from 'firebase/functions';
import { collection, getDocs, limit, query } from 'firebase/firestore';
import { db, functions } from '../../../../firebaseConfig';
import { upsertLocal } from '../../../../stores/catalogosStore';
import { COL } from '../../../../../functions/bodega/nucleo.mjs';

// Todos los vínculos (1 lectura por código). El tope es solo una protección:
// hoy son unos 70 y la búsqueda se hace en pantalla.
const MAX_VINCULOS = 3000;
export const leerVinculos = async () => {
  const snap = await getDocs(query(collection(db, COL.codigosBarra), limit(MAX_VINCULOS)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

// { accion: AGREGAR|EDITAR|MOVER|ELIMINAR, ... }; refleja en la copia local las
// listas de códigos de los productos involucrados.
const llamada = httpsCallable(functions, 'bodegaGestionarCodigoBarra');
export const gestionarCodigoBarra = async (datos) => {
  const r = (await llamada(datos)).data;
  (r.productos || []).forEach(({ id, codigosBarra }) => upsertLocal('bodegaProductos', id, { codigosBarra }));
  return r;
};
