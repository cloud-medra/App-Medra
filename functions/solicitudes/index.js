// Solicitudes de cambio de datos (Ajustes → Datos) y su resolución desde
// Administración → Alertas. La lógica está en servicio.js.
//   - crearSolicitud: el propio usuario pide cambiar su nombre de usuario,
//     nombre completo o correo (tipos en tipos.mjs). Crea la solicitud y la
//     alerta para sus aprobadores (destinatarios.mjs).
//   - resolverSolicitud: aprobar o rechazar (con motivo). Solo los
//     administradores destinatarios de esa solicitud o un desarrollador.
//   - cancelarSolicitud: el propio usuario, mientras esté abierta.
//   - sincronizarMiCorreo: tras confirmar un cambio de correo aprobado, lo
//     aplica al perfil (también lo hace iniciarSesion al entrar).

const { onCall } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const { initializeApp, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const servicio = require('./servicio');

if (!getApps().length) initializeApp();
const db = getFirestore();

const REGION = 'us-central1';

exports.crearSolicitud = onCall({ region: REGION }, async (request) => {
  const resultado = await servicio.crearSolicitud(db, getAuth(), request.auth?.uid, request.data);
  logger.info('crearSolicitud', { por: request.auth?.uid, id: resultado.id, tipo: request.data?.tipo, correo: resultado.correo });
  return { id: resultado.id, aprobadores: resultado.aprobadores };
});

exports.resolverSolicitud = onCall({ region: REGION }, async (request) => {
  const resultado = await servicio.resolverSolicitud(db, getAuth(), request.auth?.uid, request.data);
  logger.info('resolverSolicitud', { por: request.auth?.uid, id: request.data?.id, ...resultado });
  return resultado;
});

exports.cancelarSolicitud = onCall({ region: REGION }, (request) => servicio.cancelarSolicitud(db, request.auth?.uid, request.data));

exports.sincronizarMiCorreo = onCall({ region: REGION }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) return { resultado: null };
  const cuenta = await getAuth().getUser(uid);
  const perfil = (await db.collection('usuarios').doc(uid).get()).data();
  return { resultado: await servicio.sincronizarCorreo(db, getAuth(), cuenta, perfil) };
});
