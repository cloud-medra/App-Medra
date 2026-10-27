import { useEffect, useState } from 'react';
import { collection, limit, orderBy, query, where } from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import { onSnapshotVisible } from '../../hooks/useVisibleSnapshot';
import { rutaDeAlerta } from '../../../functions/notificaciones/nucleo.mjs';

// Fuente de la campana del header: las alertas PENDIENTES del usuario en el
// buzón `alertas` (functions/notificaciones y functions/solicitudes). Un
// solo listener, con el índice que ya usa Administración → Alertas
// (destinatarios + creadoEl), pausado con la pestaña oculta. Las resueltas
// (sin pendientes, ticket atendido, solicitud resuelta) salen solas.
export const MAX_NOTIFICACIONES = 50;

// Alerta -> lo que muestra la campana. `puedeAbrirRuta`: menú del usuario.
export const aNotificacion = (alerta, uid, puedeAbrirRuta) => ({
  id: alerta.id,
  titulo: alerta.titulo,
  detalle: alerta.resumen || '',
  leida: !(alerta.noLeidas || []).includes(uid),
  ruta: rutaDeAlerta(alerta, puedeAbrirRuta),
  fecha: alerta.creadoEl?.toDate ? alerta.creadoEl.toDate() : null,
});

export const useNotificaciones = (uid, puedeAbrirRuta) => {
  const [alertas, setAlertas] = useState([]);
  useEffect(() => {
    if (!uid) return undefined;
    const q = query(collection(db, 'alertas'), where('destinatarios', 'array-contains', uid), orderBy('creadoEl', 'desc'), limit(MAX_NOTIFICACIONES));
    return onSnapshotVisible(
      q,
      (snap) => setAlertas(snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((a) => a.estado === 'pendiente')),
      (error) => { console.error('Error al leer las notificaciones:', error); setAlertas([]); }
    );
  }, [uid]);
  return uid ? alertas.map((a) => aNotificacion(a, uid, puedeAbrirRuta)) : [];
};
