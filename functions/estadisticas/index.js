// Cloud Functions de Estadísticas (Administración → Estadísticas).
//   - estadisticasImputada{Modulo}: trigger por cada documento imputado;
//     suma y resta la diferencia (A).
//   - estadisticasCierre: al cerrar un período lo recalcula y lo congela; al
//     reabrirlo vuelve a quedar en curso.
//   - estadisticasNocturno: 03:00 (Chile), recalcula los períodos abiertos
//     para corregir cualquier diferencia de los triggers (B).
//   - recalcularEstadisticasPeriodo: recálculo manual (Desarrollador, o
//     Administrador con la acción "Recalcular").

const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const { initializeApp, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { FUENTES, MESES } = require('./nucleo');
const { aplicarCambio, aplicarCierre, recalcularAbiertos, recalcularPeriodo } = require('./servicio');
const { puedeAccion } = require('../permisos/nucleo.mjs');

if (!getApps().length) initializeApp();
const db = getFirestore();

const REGION = 'us-central1';

const triggerImputada = (modulo) => onDocumentWritten(
  { document: `${FUENTES[modulo].coleccion}/{anio}/meses/{mes}/documentos/{itemId}`, region: REGION, retry: false },
  async (event) => {
    const { anio, mes } = event.params;
    const antes = event.data?.before?.exists ? event.data.before.data() : null;
    const despues = event.data?.after?.exists ? event.data.after.data() : null;
    const resultado = await aplicarCambio(db, modulo, anio, mes, antes, despues);
    if (resultado !== 'sin-cambio') logger.info('estadisticas', { modulo, anio, mes, item: event.params.itemId, resultado });
  }
);

exports.estadisticasImputadaImplantes = triggerImputada('implantes');
exports.estadisticasImputadaConsignacion = triggerImputada('consignacion');
exports.estadisticasImputadaHemodinamia = triggerImputada('hemodinamia');

exports.estadisticasCierre = onDocumentWritten(
  { document: 'cierres_periodos/{cierreId}', region: REGION, retry: false },
  async (event) => {
    const antes = event.data?.before?.exists ? event.data.before.data() : null;
    const despues = event.data?.after?.exists ? event.data.after.data() : null;
    const resultado = await aplicarCierre(db, antes, despues);
    if (resultado !== 'sin-cambio' && resultado !== 'otro-modulo') {
      logger.info('estadisticas cierre', { cierre: event.params.cierreId, resultado });
    }
  }
);

exports.estadisticasNocturno = onSchedule(
  { schedule: '0 3 * * *', timeZone: 'America/Santiago', region: REGION, timeoutSeconds: 540, memory: '512MiB' },
  async () => {
    const resultados = await recalcularAbiertos(db);
    logger.info('estadisticas nocturno', { resultados });
  }
);

exports.recalcularEstadisticasPeriodo = onCall(
  { region: REGION, timeoutSeconds: 300, memory: '512MiB' },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
    const perfil = (await db.collection('usuarios').doc(request.auth.uid).get()).data() || {};
    // Desarrollador, o Administrador con el ítem y la acción "Recalcular"
    // (denegada por defecto).
    if (!(perfil.rol === 'dev' || (perfil.rol === 'admin'
      && puedeAccion(perfil, 'administracion', '/administracion/estadisticas', 'acciones', 'btn_recalcular')))) {
      throw new HttpsError('permission-denied', 'Solo un administrador con la acción "Recalcular" puede recalcular un período.');
    }
    const { modulo, anio, mes } = request.data || {};
    if (!FUENTES[modulo] || !/^\d{4}$/.test(String(anio)) || !MESES.includes(mes)) {
      throw new HttpsError('invalid-argument', 'Período inválido.');
    }
    const usuario = { uid: request.auth.uid, nombre: perfil.nombreCompleto || perfil.email || '' };
    const resultado = await recalcularPeriodo(db, modulo, String(anio), mes, {
      origen: 'manual', usuario, reiniciarCambios: true,
    });
    logger.info('estadisticas recálculo manual', { modulo, anio, mes, uid: request.auth.uid, resultado });
    return resultado;
  }
);
