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
//   - bodegaGestionarTransito: entregar, devolver, dejar en centro o anotar (Fase 3).
//   - bodegaIniciarInventario / bodegaReanudarInventario / bodegaRegistrarConteo /
//     bodegaCerrarInventario / bodegaAnularInventario: inventario físico (Fase 5).
//   - bodegaPeriodo (trigger): periodo de Bodega abierto / cerrado en Control
//     Mensual (periodos.js).

const { onCall } = require('firebase-functions/v2/https');
const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const logger = require('firebase-functions/logger');
const { initializeApp, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const servicio = require('./servicio');
const periodos = require('./periodos');

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
// Cajas (kits): mantenedor, inventario de la caja y reposición desde la Bodega General.
exports.bodegaGuardarCaja = callable('guardarCaja');
exports.bodegaInventariarCaja = callable('inventariarCaja');
exports.bodegaReponerCaja = callable('reponerCaja');
// Stock consignado: lo que cada empresa consignante dejó (no mueve stock).
exports.bodegaGuardarConsignacion = callable('guardarConsignacion');

// Periodo de Bodega (Control Mensual): al abrirlo recibe los movimientos
// hechos sin periodo abierto; al cerrarlo (manual o automático) se guarda
// la foto fija del periodo en bodega_periodos. Los demás módulos no hacen nada.
exports.bodegaPeriodo = onDocumentWritten(
  // Memoria por defecto (menos CPU reservada: la cuota de Cloud Run está al límite).
  { document: 'cierres_periodos/{cierreId}', region: REGION, retry: false, timeoutSeconds: 300 },
  async (event) => {
    const antes = event.data?.before?.exists ? event.data.before.data() : null;
    const despues = event.data?.after?.exists ? event.data.after.data() : null;
    const resultado = await periodos.alCambiarPeriodo(db, antes, despues);
    if (resultado) logger.info('bodega.periodo', { cierre: event.params.cierreId, ...resultado });
  }
);
