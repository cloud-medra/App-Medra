// Notificaciones de la campana del header (ver nucleo.mjs y servicio.js),
// sobre el buzón genérico `alertas`:
//   - notificacionesPendientes: cada 10 minutos cuenta lo pendiente (zonas
//     por diagnóstico, solicitudes por descargar de Implantes, Consignación
//     y Hemodinamia, descripciones de Reporte Info por revisar) y mantiene
//     UNA alerta por fuente con la cantidad; se resuelve al llegar a 0.
//   - notificacionesTicket: una alerta por ticket nuevo, resuelta cuando el
//     ticket deja de estar NUEVO.
// Las solicitudes de cambio de datos ya crean su alerta (functions/solicitudes).

const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const logger = require('firebase-functions/logger');
const { initializeApp, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { sincronizarPendientes, aplicarCambioTicket } = require('./servicio');

if (!getApps().length) initializeApp();
const db = getFirestore();

exports.notificacionesPendientes = onSchedule(
  { schedule: 'every 10 minutes', timeZone: 'America/Santiago', region: 'us-central1', timeoutSeconds: 120, memory: '256MiB', retryCount: 0 },
  async () => {
    const resultado = await sincronizarPendientes(db);
    const cambios = Object.entries(resultado).filter(([, r]) => r.accion);
    if (cambios.length) logger.info('notificaciones pendientes', Object.fromEntries(cambios));
  }
);

exports.notificacionesTicket = onDocumentWritten(
  { document: 'tickets/{ticketId}', region: 'us-central1', retry: false },
  async (event) => {
    const antes = event.data?.before?.exists ? event.data.before.data() : null;
    const despues = event.data?.after?.exists ? event.data.after.data() : null;
    const resultado = await aplicarCambioTicket(db, event.params.ticketId, antes, despues);
    if (resultado.accion) logger.info('notificaciones ticket', { ticketId: event.params.ticketId, ...resultado });
  }
);
