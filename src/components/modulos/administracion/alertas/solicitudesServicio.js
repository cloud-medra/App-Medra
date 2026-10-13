// Solicitudes de cambio de datos y buzón de Alertas en el navegador: las
// llamadas a las Cloud Functions (functions/solicitudes, lo único que crea
// o resuelve solicitudes) y las lecturas en vivo que permiten las reglas.
import { useEffect, useState } from 'react';
import { arrayRemove, collection, doc, limit, onSnapshot, orderBy, query, updateDoc, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../../../firebaseConfig';
export {
  TIPOS_SOLICITUD, ESTADOS_SOLICITUD, ESTADOS_ABIERTOS, etiquetaTipo, validarSolicitud, validarMotivo,
} from '../../../../../functions/solicitudes/tipos.mjs';

const llamar = (nombre) => async (datos) => (await httpsCallable(functions, nombre)(datos)).data;
export const crearSolicitud = llamar('crearSolicitud');
export const resolverSolicitud = llamar('resolverSolicitud');
export const cancelarSolicitud = llamar('cancelarSolicitud');
export const sincronizarMiCorreo = llamar('sincronizarMiCorreo');

export const RUTA_ALERTAS = '/administracion/alertas';
export const MAX_ALERTAS = 200;

const conId = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));

// Lista en vivo de una consulta (null = sin consulta). { datos, cargando, error }
const useConsulta = (crearConsulta, deps) => {
  const [estado, setEstado] = useState({ datos: [], cargando: true, error: null });
  useEffect(() => {
    const q = crearConsulta();
    if (!q) return undefined;
    return onSnapshot(
      q,
      (snap) => setEstado({ datos: conId(snap), cargando: false, error: null }),
      (error) => {
        console.error('Error al leer alertas/solicitudes:', error);
        setEstado({ datos: [], cargando: false, error });
      }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return estado;
};

// Ajustes → Datos: las solicitudes del propio usuario (las más recientes).
export const useMisSolicitudes = (uid) => useConsulta(
  () => (uid ? query(collection(db, 'solicitudes'), where('solicitanteUid', '==', uid), orderBy('creadoEl', 'desc'), limit(20)) : null),
  [uid]
);

// Administración → Alertas: las del usuario; el Desarrollador ve todas.
export const useAlertas = (userData) => useConsulta(() => {
  if (!userData?.uid) return null;
  const base = collection(db, 'alertas');
  return userData.rol === 'dev'
    ? query(base, orderBy('creadoEl', 'desc'), limit(MAX_ALERTAS))
    : query(base, where('destinatarios', 'array-contains', userData.uid), orderBy('creadoEl', 'desc'), limit(MAX_ALERTAS));
}, [userData?.uid, userData?.rol]);

// Contador del menú: alertas sin leer (hasta 99).
export const useAlertasNoLeidas = (uid, habilitado) => {
  const { datos } = useConsulta(
    () => (uid && habilitado ? query(collection(db, 'alertas'), where('noLeidas', 'array-contains', uid), limit(99)) : null),
    [uid, habilitado]
  );
  return habilitado ? datos.length : 0;
};

export const useSolicitud = (id) => {
  const [solicitud, setSolicitud] = useState(null);
  useEffect(() => (id ? onSnapshot(doc(db, 'solicitudes', id), (s) => setSolicitud(s.exists() ? { id: s.id, ...s.data() } : null), () => setSolicitud(null)) : undefined), [id]);
  return id ? solicitud : null;
};

export const useHistorialSolicitud = (id) => useConsulta(
  () => (id ? query(collection(db, 'solicitudes', id, 'historial'), orderBy('fecha', 'asc')) : null),
  [id]
);

// Marca la alerta como leída por este usuario (las reglas solo permiten eso).
export const marcarLeida = (alertaId, uid) => updateDoc(doc(db, 'alertas', alertaId), { noLeidas: arrayRemove(uid) });

export const formatoFecha = (ts) => (ts?.toDate ? ts.toDate().toLocaleString('es-CL', {
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
}) : '');

export const mensajeErrorSolicitud = (error, porDefecto) => (
  ['functions/failed-precondition', 'functions/invalid-argument', 'functions/permission-denied', 'functions/already-exists', 'functions/not-found'].includes(error?.code)
    ? error.message
    : porDefecto
);
