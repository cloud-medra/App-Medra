// Reporte Info → "Gestión implante": trigger que mantiene la marca de
// admisiones gestionadas (admisiones_gestionadas_implantes) al crear,
// editar o eliminar una gestión de Implantes: estado (gestionada / cargada
// / imputada), gestiones asociadas, cantidad e ítems pendientes. Si cambia
// el número de admisión, corrige la anterior y la nueva. Ver servicio.js.
// "Gestión consignación": el mismo trigger sobre los registros de
// Consignación (admisiones_gestionadas_consignacion).

const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const logger = require('firebase-functions/logger');
const { initializeApp, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { aplicarCambioGestion, leerActual } = require('./servicio');
const { admisionesARecalcular, COLECCION_ADMISIONES } = require('./nucleo.mjs');
const { recalcularAdmision } = require('../descripcionesReporte/servicio');

if (!getApps().length) initializeApp();
const db = getFirestore();

exports.admisionesGestionadasImplante = onDocumentWritten(
  {
    document: 'implantes_gestiones/{anio}/mes/{mes}/dia/{dia}/admision/{admision}/empresa/{empresa}/detalles/{gestionId}',
    region: 'us-central1',
    retry: false,
  },
  async (event) => {
    const antes = event.data?.before?.exists ? event.data.before.data() : null;
    const evento = event.data?.after?.exists ? event.data.after.data() : null;
    const refGestion = event.data?.after?.ref || event.data?.before?.ref;
    const ruta = refGestion.path;
    // Un evento atrasado no debe dejar un estado viejo: el resumen sale del
    // documento actual. `antes` sí es el del evento (de dónde sacarlo).
    const despues = await leerActual(refGestion);
    const resultado = await aplicarCambioGestion(db, ruta, antes, despues);
    if (Object.values(resultado).some((r) => r !== 'sin cambios')) logger.info('admisiones gestionadas', { ruta, resultado });
    // Reporte Info: una admisión que gana o pierde su gestión muestra u
    // oculta en Implantes sus filas con descripción oculta.
    for (const { admision, gestionada } of admisionesARecalcular(antes, evento, resultado)) {
      const conGestion = gestionada ?? (await db.collection(COLECCION_ADMISIONES).doc(admision).get()).exists;
      await recalcularAdmision(db, admision, conGestion);
    }
  }
);

// Reporte Info → "Gestión consignación": la misma marca para Consignación
// (admisiones_gestionadas_consignacion), al crear, editar o eliminar un
// registro. No toca las descripciones ocultas (dependen solo de Implantes).
exports.admisionesGestionadasConsignacion = onDocumentWritten(
  {
    document: 'consignacion_registros/{anio}/mes/{mes}/dia/{dia}/detalles/{registroId}',
    region: 'us-central1',
    retry: false,
  },
  async (event) => {
    const antes = event.data?.before?.exists ? event.data.before.data() : null;
    const refRegistro = event.data?.after?.ref || event.data?.before?.ref;
    const ruta = refRegistro.path;
    const despues = await leerActual(refRegistro);
    const resultado = await aplicarCambioGestion(db, ruta, antes, despues, 'consignacion');
    if (Object.values(resultado).some((r) => r !== 'sin cambios')) logger.info('admisiones gestionadas consignación', { ruta, resultado });
  }
);
