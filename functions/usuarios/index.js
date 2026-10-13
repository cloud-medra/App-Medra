// Usuarios (login y Administración → Crear usuario).
//   - iniciarSesion: login con correo o nombre de usuario + contraseña.
//     Sin sesión previa. Devuelve un custom token del usuario; cualquier
//     fallo de credenciales (usuario inexistente, contraseña incorrecta) da
//     el mismo mensaje; con la contraseña correcta, un usuario inactivo
//     recibe "Tu usuario está deshabilitado". Bloquea tras varios intentos.
//   - crearUsuario: cuenta de Auth + usuarios/{uid} + nombres_usuario, con
//     el nombre de usuario único. Desarrollador, o Administrador con el
//     ítem Crear usuario (el rol Desarrollador solo lo asigna otro).
//   - desbloquearUsuario: quita el bloqueo por intentos fallidos (Lista de
//     usuarios, acción granular btn_desbloquear; Desarrollador siempre).
// La lógica está en servicio.js.
//
// iniciarSesion necesita:
//   - WEB_API_KEY: la API key web del proyecto (la misma de VITE_API_KEY),
//     en functions/.env.<proyecto> o la pide el deploy.
//   - Que la cuenta de servicio de las funciones pueda firmar tokens
//     (rol "Service Account Token Creator" sobre sí misma).

const { onCall } = require('firebase-functions/v2/https');
const { defineString } = require('firebase-functions/params');
const logger = require('firebase-functions/logger');
const { initializeApp, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const servicio = require('./servicio');
const { exigirAdministrador, exigirPuedeModificar, RUTAS } = require('../permisos/servicio');

if (!getApps().length) initializeApp();
const db = getFirestore();

const REGION = 'us-central1';
const WEB_API_KEY = defineString('WEB_API_KEY');

exports.iniciarSesion = onCall({ region: REGION, maxInstances: 10 }, (request) => servicio.iniciarSesion(
  db, getAuth(), request.data, { verificarPassword: servicio.verificarPasswordRest(WEB_API_KEY.value()) },
));

exports.crearUsuario = onCall({ region: REGION }, async (request) => {
  const por = await exigirAdministrador(db, request.auth?.uid, [RUTAS.crear]);
  exigirPuedeModificar(por, null, null, { rolNuevo: request.data?.rol });
  const resultado = await servicio.crearUsuario(db, getAuth(), por, request.data);
  logger.info('crearUsuario', { por: por.uid, uid: resultado.uid });
  return resultado;
});

exports.desbloquearUsuario = onCall({ region: REGION }, async (request) => {
  const por = await servicio.exigirAccion(db, request.auth?.uid, servicio.ACCION_DESBLOQUEAR);
  const resultado = await servicio.desbloquearUsuario(db, por, request.data);
  logger.info('desbloquearUsuario', { por: por.uid, uid: request.data?.uid });
  return resultado;
});
