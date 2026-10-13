const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp, getApps } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { validarCierreMes } = require('./validarCierreMes');

if (!getApps().length) initializeApp();

const MODULOS = ['laboratorio', 'implantes', 'consignacion', 'vacunatorio', 'hemodinamia'];
const ESTADOS_ABIERTOS = ['ABIERTO', 'REABIERTO'];
const ITEM_CONTROL_MENSUAL = '/administracion/controlMensual';

// Cierre manual de un período (Administración → Control Mensual). Las reglas
// de Firestore no dejan que el cliente escriba estado 'CERRADO' (salvo el
// cierre automático al abrir otro período), así que el cierre pasa por acá:
// se vuelve a validar el año/mes que escribió el usuario y se cierran todos
// los módulos pedidos o ninguno. Los mensajes de los HttpsError los muestra
// el modal de cierre tal cual.
exports.cerrarPeriodoImputacion = onCall(
  {
    region: 'us-central1',
    timeoutSeconds: 30,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Debes iniciar sesión para cerrar un período.');
    }

    const { anio, mes, modulos, anioIngresado, mesIngresado } = request.data || {};
    const anioTexto = String(anio ?? '').trim();

    if (!/^\d{4}$/.test(anioTexto)) {
      throw new HttpsError('invalid-argument', 'El año del período a cerrar no es válido.');
    }
    if (!Array.isArray(modulos) || modulos.length === 0 || !modulos.every(m => MODULOS.includes(m))) {
      throw new HttpsError('invalid-argument', 'Los módulos del período a cerrar no son válidos.');
    }

    // También rechaza un `mes` que no sea uno de MESES.
    const validacion = validarCierreMes({ anio: anioTexto, mesId: mes, anioIngresado, mesIngresado });
    if (!validacion.ok) {
      throw new HttpsError('invalid-argument', validacion.mensaje);
    }

    const db = getFirestore();
    const perfilSnap = await db.collection('usuarios').doc(request.auth.uid).get();
    const perfil = perfilSnap.exists ? perfilSnap.data() : null;
    if (!perfil) {
      throw new HttpsError('permission-denied', 'Tu usuario no tiene un perfil registrado.');
    }

    // El Desarrollador cierra siempre; el resto (también el Administrador)
    // necesita el ítem Control Mensual de Administración (misma clave que el
    // menú y tieneItem() en las reglas).
    const esAdminODev = perfil.rol === 'dev';
    const itemsAdministracion = perfil.permisos?.administracion;
    const tieneItemControlMensual = Array.isArray(itemsAdministracion)
      && itemsAdministracion.includes(ITEM_CONTROL_MENSUAL);
    if (!esAdminODev && !tieneItemControlMensual) {
      throw new HttpsError('permission-denied', 'No tienes permiso para cerrar períodos en Control Mensual');
    }

    const usuarioCierre = {
      uid: request.auth.uid,
      nombre: perfil.nombreCompleto || perfil.displayName || perfil.nombre || perfil.email?.split('@')[0] || 'Usuario Sistema',
      email: perfil.email || request.auth.token.email || ''
    };

    const modulosUnicos = [...new Set(modulos)];
    const refs = modulosUnicos.map(m => db.collection('cierres_periodos').doc(`${anioTexto}_${mes}_${m}`));

    await db.runTransaction(async (tx) => {
      const snaps = await tx.getAll(...refs);
      const noAbiertos = snaps
        .map((s, i) => ({ modulo: modulosUnicos[i], estado: s.exists ? s.data().estado : 'no abierto' }))
        .filter(({ estado }) => !ESTADOS_ABIERTOS.includes(estado))
        .map(({ modulo, estado }) => `${modulo} (${estado})`);
      if (noAbiertos.length > 0) {
        throw new HttpsError('failed-precondition', `El período no está abierto para: ${noAbiertos.join(', ')}. Actualiza la página e intenta nuevamente.`);
      }

      refs.forEach(ref => tx.set(ref, {
        estado: 'CERRADO',
        fechaCierre: FieldValue.serverTimestamp(),
        usuarioCierre,
        cierreAutomatico: false
      }, { merge: true }));
    });

    return { ok: true };
  }
);
