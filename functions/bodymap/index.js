// Bodymap (Implantes → Gestiones): trigger que mantiene el Maestro "Zonas
// por diagnóstico" (maestros_zonas_diagnostico) al crear, editar o eliminar
// una gestión de Implantes: una descripción nueva aparece como "Sugerida"
// (si hay palabras clave) o "Sin asignar", y el contador de gestiones resta
// a la descripción anterior y suma a la nueva. Ver servicio.js.
//
// El mismo trigger mantiene el historial de uso de las referencias
// (maestros_codigos_uso, ver functions/usoCodigos). Va aquí y no en una Function
// propia para no sumar instancias: la cuota de CPU de la región está al límite.

const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const logger = require('firebase-functions/logger');
const { initializeApp, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { aplicarCambioGestion } = require('./servicio');
const { aplicarCambioGestion: aplicarCambioUso } = require('../usoCodigos/servicio');

if (!getApps().length) initializeApp();
const db = getFirestore();

exports.zonasDiagnosticoGestionImplante = onDocumentWritten(
  {
    document: 'implantes_gestiones/{anio}/mes/{mes}/dia/{dia}/admision/{admision}/empresa/{empresa}/detalles/{gestionId}',
    region: 'us-central1',
    retry: false,
  },
  async (event) => {
    const antes = event.data?.before?.exists ? event.data.before.data() : null;
    const despues = event.data?.after?.exists ? event.data.after.data() : null;
    const refGestion = event.data?.after?.ref || event.data?.before?.ref;
    // Independientes: si falla una, la otra se aplica igual.
    const [zonas, uso] = await Promise.allSettled([
      aplicarCambioGestion(db, antes, despues),
      aplicarCambioUso(db, refGestion, antes, despues),
    ]);
    if (zonas.status === 'fulfilled' && zonas.value.cambio) logger.info('zonas diagnóstico', { gestion: event.params.gestionId, ...zonas.value });
    if (uso.status === 'fulfilled' && uso.value.cambio) logger.info('uso de códigos', { gestion: event.params.gestionId, ...uso.value });
    if (zonas.status === 'rejected') logger.error('zonas diagnóstico', { gestion: event.params.gestionId, error: String(zonas.reason) });
    if (uso.status === 'rejected') logger.error('uso de códigos', { gestion: event.params.gestionId, error: String(uso.reason) });
  }
);
