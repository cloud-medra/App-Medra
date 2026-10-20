// Pestaña Documentos de Gestión (Implantes y Hemodinamia): eliminar un PDF
// de la admisión. Lo mueve a la papelera de Storage y deja auditoría en
// {modulo}_documentos_eliminados (ver servicio.js). Permiso: acción
// "btn_eliminar_documento" de la pestaña, denegada por defecto. storage.rules
// no permite borrar en esa ruta: solo se elimina por aquí (Admin SDK).

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const { initializeApp, getApps } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');
const { puedeEliminarDocumento } = require('./nucleo.mjs');
const { eliminarDocumento, ErrorDocumento } = require('./servicio');

if (!getApps().length) initializeApp();
const db = getFirestore();

exports.eliminarDocumentoAdmision = onCall(
  { region: 'us-central1' },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
    const perfil = (await db.collection('usuarios').doc(request.auth.uid).get()).data() || {};
    const datos = request.data || {};
    if (!puedeEliminarDocumento(perfil, datos.modulo)) {
      throw new HttpsError('permission-denied', 'No tienes permiso para eliminar documentos.');
    }
    try {
      const resultado = await eliminarDocumento({
        bucket: getStorage().bucket(),
        db,
        datos,
        usuario: {
          uid: request.auth.uid,
          email: perfil.email || request.auth.token?.email || '',
          nombre: perfil.nombreCompleto || '',
        },
        marcaTiempo: FieldValue.serverTimestamp(),
        logger,
      });
      logger.info('documento de admisión eliminado', { modulo: datos.modulo, ruta: datos.ruta, uid: request.auth.uid, ...resultado });
      return resultado;
    } catch (err) {
      if (err instanceof ErrorDocumento) throw new HttpsError(err.codigo, err.message);
      logger.error('eliminarDocumentoAdmision', { ruta: datos.ruta, error: err?.message });
      throw new HttpsError('internal', 'No se pudo eliminar el documento.');
    }
  }
);
