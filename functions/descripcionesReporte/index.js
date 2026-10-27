// Reporte Info → "Descripciones ocultas": triggers que mantienen el Maestro
// maestros_descripciones_reporte (contador de filas; las descripciones
// nuevas aparecen visibles y pendientes de revisión) y los campos calculados de cada fila
// (ocultaImplantes / ocultaDocumentos…). Ver servicio.js y nucleo.mjs.

const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const logger = require('firebase-functions/logger');
const { initializeApp, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { aplicarCambioFila, aplicarCambioDescripcion } = require('./servicio');

if (!getApps().length) initializeApp();
const db = getFirestore();

// Fila de Reporte Info creada / editada / eliminada: contador y, si faltan
// o cambió la descripción o la admisión, sus campos calculados.
exports.descripcionesReporteFila = onDocumentWritten(
  { document: 'documentos_reportesInfo/{anio}/meses/{mes}/registros/{registroId}', region: 'us-central1', retry: false },
  async (event) => {
    const antes = event.data?.before?.exists ? event.data.before.data() : null;
    const despues = event.data?.after?.exists ? event.data.after.data() : null;
    const ref = (event.data?.after || event.data?.before).ref;
    const resultado = await aplicarCambioFila(db, ref, antes, despues);
    if (resultado.campos || resultado.contador) logger.info('descripciones reporte: fila', { ruta: ref.path, ...resultado });
  }
);

// Cambió "Ocultar en Implantes / Documentos" en el Maestro: recalcula las
// filas de esa descripción (todos los meses).
exports.descripcionesReporteMaestro = onDocumentWritten(
  { document: 'maestros_descripciones_reporte/{descripcionId}', region: 'us-central1', retry: false },
  async (event) => {
    const antes = event.data?.before?.exists ? event.data.before.data() : null;
    const despues = event.data?.after?.exists ? event.data.after.data() : null;
    const resultado = await aplicarCambioDescripcion(db, antes, despues);
    if (resultado.actualizadas) logger.info('descripciones reporte: maestro', { descripcion: despues?.descripcion, ...resultado });
  }
);
