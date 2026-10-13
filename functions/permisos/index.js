// Permisos por centro de costo (Administración → Usuarios).
//
// El permiso efectivo de cada usuario (plantilla de su centro de costo +
// agregados − quitados, ver nucleo.mjs) se calcula SOLO aquí y se escribe
// en usuarios/{uid}.permisos / .permisosGranulares, los campos que ya leen
// las reglas de Firestore, el menú, los guards y useGranularPermission. Las
// reglas impiden que el navegador escriba esos campos, el rol, el centro de
// costo o las excepciones: todo cambio pasa por estas funciones.
//   - guardarPermisosUsuario: datos, rol, centro de costo y excepciones de
//     un usuario (también activar/inactivar: deshabilita o habilita su
//     cuenta de Auth y, al inactivar, revoca sus sesiones).
//   - asignarCentroCostoMasivo: el mismo centro de costo a varios usuarios
//     (conserva las excepciones de cada uno).
//   - guardarPlantillaCentroCosto: guarda la plantilla y recalcula a todos
//     los usuarios de ese centro de costo, con sus excepciones.
// Solo admin/dev activos. Nunca se deja el sistema sin administrador.
// Cada cambio queda en usuarios/{uid}/logs o plantillas_permisos/{id}/logs.
// La lógica está en servicio.js.

const { onCall } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const { initializeApp, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const servicio = require('./servicio');

if (!getApps().length) initializeApp();
const db = getFirestore();

const REGION = 'us-central1';

const callable = (nombre, opciones = {}) => onCall({ region: REGION, ...opciones }, async (request) => {
  const por = await servicio.exigirAdministrador(db, request.auth?.uid);
  const resultado = await servicio[nombre](db, por, request.data, { auth: getAuth() });
  logger.info(nombre, { por: por.uid, resultado });
  return resultado;
});

exports.guardarPermisosUsuario = callable('guardarPermisosUsuario');
exports.asignarCentroCostoMasivo = callable('asignarCentroCostoMasivo');
exports.guardarPlantillaCentroCosto = callable('guardarPlantillaCentroCosto', { timeoutSeconds: 300 });
