// Bodega (módulo Bodega): toda escritura de stock, productos y códigos de
// barra pasa por estas funciones (el navegador solo lee). La lógica está en
// servicio.js; las reglas puras en nucleo.mjs y el parseo GS1 en gs1.mjs.
//   - bodegaGuardarCatalogo: categorías y unidades de medida.
//   - bodegaGuardarProducto: crear/editar producto (y vincular códigos al crearlo).
//   - bodegaVincularCodigo / bodegaDesvincularCodigo: códigos de barra.
//   - bodegaGuardarBorrador / bodegaEliminarBorrador / bodegaConfirmarDocumento:
//     ingreso por documento y carga inicial (Fase 2).
//   - bodegaConfigurarCargaInicial: cerrar/reabrir la carga inicial.
//   - bodegaEgresar: salida a tránsito hacia uno o varios centros (Fase 3).
//   - bodegaGestionarTransito: entregar, devolver o anotar (Fase 3).
//   - bodegaIniciarInventario / bodegaReanudarInventario / bodegaRegistrarConteo /
//     bodegaCerrarInventario / bodegaAnularInventario: inventario físico (Fase 5).

const { onCall } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const { initializeApp, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const servicio = require('./servicio');

if (!getApps().length) initializeApp();
const db = getFirestore();

const REGION = 'us-central1';

const callable = (nombre, opciones = {}) => onCall({ region: REGION, ...opciones }, async (request) => {
  const resultado = await servicio[nombre](db, request.auth?.uid, request.data);
  logger.info(`bodega.${nombre}`, { por: request.auth?.uid, id: resultado?.id || resultado?.productoId || null });
  return resultado;
});

exports.bodegaGuardarCatalogo = callable('guardarCatalogo');
exports.bodegaGuardarProducto = callable('guardarProducto');
exports.bodegaVincularCodigo = callable('vincularCodigo');
exports.bodegaDesvincularCodigo = callable('desvincularCodigo');
exports.bodegaGuardarBorrador = callable('guardarBorrador');
exports.bodegaEliminarBorrador = callable('eliminarBorrador');
exports.bodegaConfirmarDocumento = callable('confirmarDocumento');
exports.bodegaConfigurarCargaInicial = callable('configurarCargaInicial');
exports.bodegaEgresar = callable('egresar');
exports.bodegaGestionarTransito = callable('gestionarTransito');
// Iniciar (foto del stock) y cerrar (ajustes por tandas) pueden tardar más.
exports.bodegaIniciarInventario = callable('iniciarInventario', { timeoutSeconds: 300 });
exports.bodegaReanudarInventario = callable('reanudarInventario', { timeoutSeconds: 540 });
exports.bodegaRegistrarConteo = callable('registrarConteo');
exports.bodegaCerrarInventario = callable('cerrarInventario', { timeoutSeconds: 540 });
exports.bodegaAnularInventario = callable('anularInventario');
