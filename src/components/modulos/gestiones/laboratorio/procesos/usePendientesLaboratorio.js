// Contadores del menú de Laboratorio (ver pendientesLaboratorio.js): un
// getCountFromServer por ítem visible, sin listeners ni traer documentos.
// Cada conteo cuesta 1 lectura por cada 1000 documentos contados (mínimo 1).
//
// Cuándo cuenta (solo si el menú lateral muestra algún ítem con contador,
// es decir, con el módulo Laboratorio abierto y acceso a esos ítems):
//   - al abrir el menú del módulo, salvo que el último conteo sea reciente;
//   - cada INTERVALO_PENDIENTES_MS, solo con la pestaña visible (al volver a
//     la pestaña, si ya pasó el intervalo);
//   - al salir de una de esas pantallas, donde se pudieron procesar filas.
import { useEffect, useRef, useState } from 'react';
import { collectionGroup, query, where, documentId, getCountFromServer } from 'firebase/firestore';
import { db } from '../../../../../firebaseConfig';
import { PENDIENTES_LABORATORIO, RANGO_DOCUMENTOS_LABORATORIO, rutasConContador } from './pendientesLaboratorio';

export const INTERVALO_PENDIENTES_MS = 5 * 60 * 1000;

// Usa el índice de collection group de `estado` (firestore.indexes.json,
// fieldOverrides de `documentos`): igualdad + rango de __name__ no pide
// índice compuesto.
const contar = async (estados) => {
  const q = query(
    collectionGroup(db, 'documentos'),
    where('estado', 'in', estados),
    where(documentId(), '>=', RANGO_DOCUMENTOS_LABORATORIO.min),
    where(documentId(), '<=', RANGO_DOCUMENTOS_LABORATORIO.max),
  );
  const snap = await getCountFromServer(q);
  return snap.data().count;
};

// `rutasVisibles`: rutas de los ítems que muestra el menú lateral.
// Devuelve { ruta: cantidad }.
export const usePendientesLaboratorio = (rutasVisibles, activeView) => {
  const clave = rutasConContador(rutasVisibles).join('|');
  const [conteos, setConteos] = useState({});
  const [pedido, setPedido] = useState(0);
  // Último conteo hecho: { clave, pedido, ts }.
  const ultimo = useRef({ clave: null, pedido: -1, ts: 0 });
  const vistaPrevia = useRef(activeView);

  useEffect(() => {
    const previa = vistaPrevia.current;
    vistaPrevia.current = activeView;
    if (previa !== activeView && PENDIENTES_LABORATORIO[previa]) setPedido((p) => p + 1);
  }, [activeView]);

  useEffect(() => {
    if (!clave) return undefined;
    const vencido = () => Date.now() - ultimo.current.ts >= INTERVALO_PENDIENTES_MS;
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') setPedido((p) => p + 1);
    }, INTERVALO_PENDIENTES_MS);
    const alCambiarVisibilidad = () => {
      if (document.visibilityState === 'visible' && vencido()) setPedido((p) => p + 1);
    };
    document.addEventListener('visibilitychange', alCambiarVisibilidad);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', alCambiarVisibilidad);
    };
  }, [clave]);

  useEffect(() => {
    if (!clave) return undefined;
    const u = ultimo.current;
    // Mismo menú y sin pedido nuevo (ej. se volvió al módulo): vale el último.
    if (u.clave === clave && u.pedido === pedido && Date.now() - u.ts < INTERVALO_PENDIENTES_MS) return undefined;
    ultimo.current = { clave, pedido, ts: Date.now() };

    let cancelado = false;
    let terminado = false;
    const rutas = clave.split('|');
    Promise.all(rutas.map(async (ruta) => {
      try {
        return [ruta, await contar(PENDIENTES_LABORATORIO[ruta])];
      } catch (err) {
        // Sin el conteo se deja el valor anterior (o ninguno).
        console.error(`Error al contar pendientes de ${ruta}:`, err);
        return null;
      }
    })).then((pares) => {
      terminado = true;
      if (cancelado) return;
      setConteos((prev) => ({ ...prev, ...Object.fromEntries(pares.filter(Boolean)) }));
    });
    return () => {
      cancelado = true;
      // Cancelado a medias: no cuenta como hecho, la próxima vez se vuelve a contar.
      if (!terminado) ultimo.current = { clave: null, pedido: -1, ts: 0 };
    };
  }, [clave, pedido]);

  return conteos;
};
