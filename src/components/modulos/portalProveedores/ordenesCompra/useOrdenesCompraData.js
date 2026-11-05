import { useEffect, useState } from 'react';
import { collection, getDocs, limit, query } from 'firebase/firestore';
import { db } from '../../../../firebaseConfig';
import { COL_PORTAL_OC } from '../../../../../functions/portalProveedores/nucleo.mjs';
import { LIMITE_FILAS, ordenarOrdenes, restriccionesConsulta } from './logicaOrdenesCompra';

// Filas de un período. No consulta hasta tener año Y mes. Una sola lectura por cambio de
// filtro, sin listener. `error`: lectura rechazada (ej. empresa recién desactivada).
export const useOrdenesCompraData = (userData, { anio, mes, empresaId }) => {
  const [estado, setEstado] = useState({ clave: '', filas: [], error: false, huboTope: false });
  const clave = anio && mes ? `${anio}/${mes}/${empresaId || ''}` : '';

  useEffect(() => {
    if (!clave) return undefined;
    let cancelado = false;
    getDocs(query(collection(db, COL_PORTAL_OC), ...restriccionesConsulta(userData, { anio, mes, empresaId }), limit(LIMITE_FILAS)))
      .then((snap) => {
        if (cancelado) return;
        setEstado({ clave, filas: ordenarOrdenes(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), error: false, huboTope: snap.size === LIMITE_FILAS });
      })
      .catch((err) => {
        console.error('Error al cargar las órdenes de compra:', err);
        if (!cancelado) setEstado({ clave, filas: [], error: true, huboTope: false });
      });
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `clave` resume año, mes y empresa
  }, [clave, userData?.uid, userData?.empresaId]);

  const listo = estado.clave === clave;
  return {
    filas: listo ? estado.filas : [],
    error: listo && estado.error,
    huboTope: listo && estado.huboTope,
    cargando: Boolean(clave) && !listo,
  };
};
