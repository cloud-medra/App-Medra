// Armado de Kits: toda escritura pasa por estas funciones (el navegador solo
// lee). Lógica en servicio.js y reglas puras en nucleo.mjs.
//   - kitsGuardar: crear o editar un kit, y completar el vencimiento de una línea.
//   - kitsEliminar: eliminar un kit y devolver sus unidades al stock.
//   - kitsTransito: despachar un kit (Egreso), recibirlo, rechazarlo o anular
//     el despacho (Tránsito). No mueve stock: ver transito.js.
//   - kitsConfiguracion: guardar la receta y los modelos de una familia.

const { onCall } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const { initializeApp, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const servicio = require('./servicio');
const transito = require('./transito');
const configuracion = require('./configuracion');

if (!getApps().length) initializeApp();
const db = getFirestore();

const callable = (nombre) => onCall({ region: 'us-central1' }, async (request) => {
  const resultado = await servicio[nombre](db, request.auth?.uid, request.data);
  logger.info(`armadoKits.${nombre}`, { por: request.auth?.uid, id: resultado?.id || null });
  return resultado;
});

exports.kitsGuardar = callable('guardarKit');
exports.kitsEliminar = callable('eliminarKit');
exports.kitsConfiguracion = onCall({ region: 'us-central1' }, async (request) => {
  const resultado = await configuracion.guardarConfiguracion(db, request.auth?.uid, request.data);
  logger.info('armadoKits.configuracion', { por: request.auth?.uid, familia: request.data?.familia, version: resultado?.version ?? null });
  return resultado;
});
exports.kitsTransito = onCall({ region: 'us-central1' }, async (request) => {
  const resultado = await transito.gestionarTransitoKit(db, request.auth?.uid, request.data);
  logger.info('armadoKits.transito', { por: request.auth?.uid, accion: request.data?.accion, id: resultado?.id || null });
  return resultado;
});
