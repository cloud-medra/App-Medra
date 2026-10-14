/**
 * Import function triggers from their respective submodules:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

const {setGlobalOptions} = require("firebase-functions");
const {onRequest} = require("firebase-functions/https");
const logger = require("firebase-functions/logger");

// For cost control, you can set the maximum number of containers that can be
// running at the same time. This helps mitigate the impact of unexpected
// traffic spikes by instead downgrading performance. This limit is a
// per-function limit. You can override the limit for each function using the
// `maxInstances` option in the function's options, e.g.
// `onRequest({ maxInstances: 5 }, (req, res) => { ... })`.
// NOTE: setGlobalOptions does not apply to functions using the v1 API. V1
// functions should each use functions.runWith({ maxInstances: 10 }) instead.
// In the v1 API, each function can only serve one request per container, so
// this will be the maximum concurrent request count.
setGlobalOptions({ maxInstances: 10 });

// Create and deploy your first functions
// https://firebase.google.com/docs/functions/get-started

// exports.helloWorld = onRequest((request, response) => {
//   logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });

exports.extraerGuiaDespacho = require("./extraerGuiaDespacho").extraerGuiaDespacho;
exports.cerrarPeriodoImputacion = require("./cerrarPeriodoImputacion").cerrarPeriodoImputacion;

// Estadísticas (Administración → Estadísticas): triggers, recálculo nocturno
// y recálculo manual. Ver functions/estadisticas/index.js.
Object.assign(exports, require("./estadisticas"));

// Permisos por centro de costo (Administración → Usuarios): permiso
// efectivo, excepciones y plantillas. Ver functions/permisos/index.js.
Object.assign(exports, require("./permisos"));

// Bodymap: Maestro "Zonas por diagnóstico" (descripciones de las gestiones
// de Implantes y su contador). Ver functions/bodymap/index.js.
Object.assign(exports, require("./bodymap"));

// Reporte Info → "Gestión implante": marca de admisiones gestionadas en
// Implantes. Ver functions/admisiones/index.js.
Object.assign(exports, require("./admisiones"));
// Reporte Info → "Descripciones ocultas": Maestro de descripciones y campos
// ocultaImplantes / ocultaDocumentos de cada fila. Ver
// functions/descripcionesReporte/index.js.
Object.assign(exports, require("./descripcionesReporte"));

// Usuarios: login con correo o nombre de usuario (iniciarSesion) y Crear
// usuario con nombre de usuario único (crearUsuario). Ver
// functions/usuarios/index.js.
Object.assign(exports, require("./usuarios"));

// Solicitudes de cambio de datos del usuario (Ajustes → Datos) y su
// aprobación desde Administración → Alertas. Ver functions/solicitudes.
Object.assign(exports, require("./solicitudes"));

// Bodega: maestro de productos, códigos de barra y (por fases) stock por
// lote, tránsito por centro e inventario. Ver functions/bodega/index.js.
Object.assign(exports, require("./bodega"));
