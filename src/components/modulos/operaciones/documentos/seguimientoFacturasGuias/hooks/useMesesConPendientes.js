// Meses del selector de Seguimiento de Facturas: de los meses "marcador"
// del año (useDocumentosSistemaPeriodo) deja solo los que tienen al menos
// una fila con el filtro de servidor de la tabla. Un conteo por mes con
// getCountFromServer (1 lectura cada 1000 filas contadas, sin traer
// documentos), con exactamente la misma consulta que la tabla
// (filtrosPeriodo) — así nunca aparece un mes que luego dé 0.
//
// Depende solo del año (Empresa se elige después del mes y filtra en el
// navegador). Los resultados se guardan en memoria mientras la pantalla
// esté abierta: volver a un año ya contado no vuelve a leer.
//
// Si un conteo falla ese mes se muestra igual, como antes, y ese resultado
// no se guarda (se reintenta la próxima vez que se elija el año).
import { useEffect, useState } from 'react';
import { collectionGroup, query, orderBy, documentId, getCountFromServer } from 'firebase/firestore';
import { db } from '../../../../../../firebaseConfig';
import { filtrosPeriodo } from '../../hooks/useDocumentosSistemaPeriodo';

export const useMesesConPendientes = ({ anio, meses, cargandoMeses, filtro }) => {
  const clave = anio && filtro && !cargandoMeses ? JSON.stringify([anio, meses, filtro]) : null;
  // `guardados`: conteos completos por clave. `ultimo`: el último resultado,
  // también si tuvo errores (ese no se guarda).
  const [guardados, setGuardados] = useState({});
  const [ultimo, setUltimo] = useState({ clave: null, meses: [] });

  useEffect(() => {
    if (!clave || guardados[clave]) return;
    let cancelado = false;
    let huboError = false;
    Promise.all(meses.map(async (mm) => {
      try {
        // orderBy igual al de la tabla: usa los mismos índices (…, __name__ DESC).
        const q = query(collectionGroup(db, 'detalles'), ...filtrosPeriodo(anio, mm, filtro), orderBy(documentId(), 'desc'));
        const snap = await getCountFromServer(q);
        return snap.data().count > 0 ? mm : null;
      } catch (err) {
        console.error(`Error al contar pendientes de ${anio}-${mm}:`, err);
        huboError = true;
        return mm;
      }
    })).then((lista) => {
      const disponibles = lista.filter(Boolean);
      if (!huboError) setGuardados((prev) => ({ ...prev, [clave]: disponibles }));
      if (!cancelado) setUltimo({ clave, meses: disponibles });
    });
    return () => { cancelado = true; };
    // `clave` ya resume anio, meses y filtro.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);

  // Sin filtro (Guías no lo usa) se devuelven los meses tal cual.
  if (!filtro) return { meses, cargando: false };
  if (!clave) return { meses: [], cargando: !!anio };
  const disponibles = guardados[clave] ?? (ultimo.clave === clave ? ultimo.meses : null);
  return disponibles ? { meses: disponibles, cargando: false } : { meses: [], cargando: true };
};
