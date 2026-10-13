// Lógica de las Cloud Functions de solicitudes (ver index.js), separada de
// onCall para probarla contra los emuladores (tests/emulador).
//
//   solicitudes/{id} = { tipo, valorActual, valorSolicitado, motivo, estado,
//     solicitanteUid, solicitanteNombre, centroId, aprobadores: [uid],
//     criterioAprobadores, alertaId, creadoEl, resueltoPor, resueltoPorUid,
//     resueltoEl, motivoRechazo, aplicadoEl }
//   solicitudes/{id}/historial: cada paso (creada, aprobada, rechazada,
//     cancelada, aplicada), con quién y cuándo.
// Al aplicarse, además, una entrada en usuarios/{uid}/logs (auditoría del
// usuario, la misma de Editar usuario).

const { HttpsError } = require('firebase-functions/v2/https');
const { FieldValue } = require('firebase-admin/firestore');
const { validarSolicitud, validarMotivo, etiquetaTipo, ESTADOS_ABIERTOS, TIPOS_SOLICITUD } = require('./tipos.mjs');
const { resolverAprobadores } = require('./destinatarios.mjs');
const { refNombre, prepararNombreUsuario } = require('../usuarios/indiceNombres');
const { normalizarNombreUsuario, MENSAJE_NOMBRE_EN_USO } = require('../usuarios/nombreUsuario.mjs');
const { crearAlerta, resolverAlerta, refAlertas } = require('../alertas/servicio');
const { notificarAlerta } = require('../alertas/correo');

const MENSAJE_CORREO_EN_USO = 'Ese correo ya está registrado.';
const refSolicitudes = (db) => db.collection('solicitudes');
const refUsuario = (db, uid) => db.collection('usuarios').doc(uid);
const nombreDe = (u) => u?.nombreCompleto || u?.email || '';
const ahoraServidor = () => FieldValue.serverTimestamp();

const registrarHistorial = (t, ref, accion, por, detalle = {}) => t.set(ref.collection('historial').doc(), {
  accion, detalle, usuario: por.nombre, usuarioUid: por.uid, fecha: ahoraServidor(),
});
const registrarLogUsuario = (t, db, uid, accion, por, detalle) => t.set(refUsuario(db, uid).collection('logs').doc(), {
  accion, detalle, usuario: por.nombre, usuarioUid: por.uid, fecha: ahoraServidor(),
});

const perfilActivo = async (db, uid) => {
  if (!uid) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
  const perfil = (await refUsuario(db, uid).get()).data();
  if (!perfil || perfil.activo === false) throw new HttpsError('permission-denied', 'Tu usuario no está activo.');
  return perfil;
};

// Administradores y desarrolladores (los únicos que pueden aprobar).
const leerCandidatos = async (db) => (await db.collection('usuarios').where('rol', 'in', ['admin', 'dev']).get())
  .docs.map((d) => ({ uid: d.id, ...d.data() }));

// ¿Está libre el valor? (sin reservarlo: se vuelve a revisar al aprobar).
const exigirDisponible = async (db, auth, tipo, valor, uid) => {
  if (tipo === 'nombreUsuario') {
    const indice = (await refNombre(db, normalizarNombreUsuario(valor)).get()).data();
    if (indice && indice.uid !== uid) throw new HttpsError('already-exists', MENSAJE_NOMBRE_EN_USO);
  }
  if (tipo === 'email') {
    try {
      const cuenta = await auth.getUserByEmail(valor);
      if (cuenta.uid !== uid) throw new HttpsError('already-exists', MENSAJE_CORREO_EN_USO);
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      if (err.code !== 'auth/user-not-found') throw err;
    }
  }
};

// --- Crear (el propio usuario, Ajustes → Datos) ----------------------------

const crearSolicitud = async (db, auth, uid, data, { notificar = notificarAlerta } = {}) => {
  const perfil = await perfilActivo(db, uid);
  const { tipo, valorSolicitado, motivo } = data || {};
  const valorActual = String(perfil[tipo] ?? '');
  const v = validarSolicitud(tipo, valorSolicitado, valorActual);
  if (v.error) throw new HttpsError('invalid-argument', v.error);
  const m = validarMotivo(motivo);
  if (m.error) throw new HttpsError('invalid-argument', m.error);
  await exigirDisponible(db, auth, tipo, v.valor, uid);

  const { aprobadores, motivo: criterio } = resolverAprobadores({ uid, ...perfil }, await leerCandidatos(db));
  if (!aprobadores.length) throw new HttpsError('failed-precondition', 'No hay nadie que pueda aprobar tu solicitud. Contacta a un desarrollador.');

  const por = { uid, nombre: nombreDe(perfil) };
  const etiqueta = etiquetaTipo(tipo).toLowerCase();
  const ref = refSolicitudes(db).doc();
  const alerta = { titulo: `Solicitud de cambio de ${etiqueta}`, resumen: `${por.nombre} pide cambiar su ${etiqueta} de "${valorActual}" a "${v.valor}".` };
  let alertaRef;
  await db.runTransaction(async (t) => {
    const abiertas = await t.get(refSolicitudes(db).where('solicitanteUid', '==', uid).where('tipo', '==', tipo).where('estado', 'in', ESTADOS_ABIERTOS));
    if (!abiertas.empty) throw new HttpsError('failed-precondition', `Ya tienes una solicitud de cambio de ${etiqueta} en curso. Cancélala para pedir otra.`);
    alertaRef = crearAlerta(t, db, {
      tipo: 'solicitud', ...alerta,
      datos: { solicitudId: ref.id, tipoSolicitud: tipo, solicitanteUid: uid },
      destinatarios: aprobadores,
    });
    t.set(ref, {
      tipo, valorActual, valorSolicitado: v.valor, motivo: m.motivo, estado: 'pendiente',
      solicitanteUid: uid, solicitanteNombre: por.nombre, centroId: perfil.centroCostoId ?? null,
      aprobadores, criterioAprobadores: criterio, alertaId: alertaRef.id,
      creadoEl: ahoraServidor(), resueltoPor: null, resueltoPorUid: null, resueltoEl: null, motivoRechazo: null, aplicadoEl: null,
    });
    registrarHistorial(t, ref, 'CREADA', por, { valorActual, valorSolicitado: v.valor, motivo: m.motivo });
  });
  // El correo es complementario: si falla, la solicitud y la alerta quedan igual.
  const correo = await notificar(db, { id: alertaRef.id, ...alerta, destinatarios: aprobadores }).catch((err) => ({ error: err.message }));
  return { id: ref.id, aprobadores: aprobadores.length, correo };
};

// --- Resolver (Administración → Alertas) ----------------------------------

// Qué hace cada tipo al aprobarse, dentro de la transacción. Devuelve el
// estado final: 'aplicada', o 'aprobada' si falta que el usuario confirme.
// Las lecturas (prepararNombreUsuario) van antes de cualquier escritura.
const APLICAR = {
  nombreUsuario: async (t, db, uid, solicitud, antes) => {
    const escribir = await prepararNombreUsuario(db, t, uid, solicitud.valorSolicitado, antes.nombreUsuario);
    return () => {
      t.update(refUsuario(db, uid), { nombreUsuario: solicitud.valorSolicitado });
      escribir(t);
      return 'aplicada';
    };
  },
  nombreCompleto: async (t, db, uid, solicitud) => () => {
    t.update(refUsuario(db, uid), { nombreCompleto: solicitud.valorSolicitado });
    return 'aplicada';
  },
  // Se aplica cuando el usuario confirma desde la nueva dirección
  // (sincronizarCorreo, al entrar o desde Ajustes → Datos).
  email: async () => () => 'aprobada',
};
Object.keys(TIPOS_SOLICITUD).forEach((tipo) => { if (!APLICAR[tipo]) throw new Error(`Falta APLICAR.${tipo}`); });

const puedeResolver = (perfil, uid, solicitud) => perfil.rol === 'dev'
  || (perfil.rol === 'admin' && (solicitud.aprobadores || []).includes(uid));

const resolverSolicitud = async (db, auth, uid, data) => {
  const perfil = await perfilActivo(db, uid);
  const { id, decision } = data || {};
  if (typeof id !== 'string' || !id) throw new HttpsError('invalid-argument', 'Solicitud inválida.');
  if (!['aprobar', 'rechazar'].includes(decision)) throw new HttpsError('invalid-argument', 'Decisión inválida.');
  let motivoRechazo = null;
  if (decision === 'rechazar') {
    const m = validarMotivo(data.motivo);
    if (m.error) throw new HttpsError('invalid-argument', m.error === 'Indica el motivo del cambio.' ? 'Indica el motivo del rechazo.' : m.error);
    motivoRechazo = m.motivo;
  }
  const por = { uid, nombre: nombreDe(perfil) };
  const ref = refSolicitudes(db).doc(id);
  const previa = (await ref.get()).data();
  if (!previa) throw new HttpsError('not-found', 'La solicitud no existe.');
  // El correo no es transaccional: se revisa antes (y otra vez al confirmar).
  if (decision === 'aprobar') await exigirDisponible(db, auth, previa.tipo, previa.valorSolicitado, previa.solicitanteUid);

  return db.runTransaction(async (t) => {
    const snap = await t.get(ref);
    const s = snap.data();
    if (s.estado !== 'pendiente') throw new HttpsError('failed-precondition', 'Esta solicitud ya fue resuelta.');
    if (s.solicitanteUid === uid) throw new HttpsError('permission-denied', 'No puedes resolver tu propia solicitud.');
    if (!puedeResolver(perfil, uid, s)) {
      throw new HttpsError('permission-denied', 'Solo los administradores a quienes llegó esta solicitud (o un desarrollador) pueden resolverla.');
    }
    const alertaRef = refAlertas(db).doc(s.alertaId);
    const comun = { resueltoPor: por.nombre, resueltoPorUid: uid, resueltoEl: ahoraServidor() };
    if (decision === 'rechazar') {
      t.update(ref, { ...comun, estado: 'rechazada', motivoRechazo });
      registrarHistorial(t, ref, 'RECHAZADA', por, { motivoRechazo });
      resolverAlerta(t, alertaRef, { decision: 'rechazada', por: por.nombre, porUid: uid });
      return { estado: 'rechazada' };
    }
    const usuarioSnap = await t.get(refUsuario(db, s.solicitanteUid));
    if (!usuarioSnap.exists) throw new HttpsError('not-found', 'El usuario de la solicitud ya no existe.');
    const aplicar = await APLICAR[s.tipo](t, db, s.solicitanteUid, s, usuarioSnap.data());
    const estado = aplicar();
    t.update(ref, { ...comun, estado, ...(estado === 'aplicada' ? { aplicadoEl: ahoraServidor() } : {}) });
    registrarHistorial(t, ref, estado === 'aplicada' ? 'APROBADA_Y_APLICADA' : 'APROBADA', por);
    registrarLogUsuario(t, db, s.solicitanteUid, estado === 'aplicada' ? 'SOLICITUD_APLICADA' : 'SOLICITUD_APROBADA', por, {
      solicitudId: id, campo: s.tipo, antes: usuarioSnap.data()[s.tipo] ?? null, despues: s.valorSolicitado,
      ...(estado === 'aprobada' ? { pendiente: 'El usuario debe confirmar desde la nueva dirección.' } : {}),
    });
    resolverAlerta(t, alertaRef, { decision: 'aprobada', por: por.nombre, porUid: uid });
    return { estado };
  });
};

// --- Cancelar (el propio usuario) -----------------------------------------

const cancelarSolicitud = async (db, uid, data) => {
  const perfil = await perfilActivo(db, uid);
  const ref = refSolicitudes(db).doc(String(data?.id || '-'));
  const por = { uid, nombre: nombreDe(perfil) };
  return db.runTransaction(async (t) => {
    const s = (await t.get(ref)).data();
    if (!s || s.solicitanteUid !== uid) throw new HttpsError('not-found', 'La solicitud no existe.');
    if (!ESTADOS_ABIERTOS.includes(s.estado)) throw new HttpsError('failed-precondition', 'Esta solicitud ya no se puede cancelar.');
    cerrarSolicitud(t, db, ref, s, por, 'Cancelada por el usuario.');
    return { estado: 'cancelada' };
  });
};

// Cancela una solicitud abierta (escrituras de la transacción `t`).
const cerrarSolicitud = (t, db, ref, s, por, motivo) => {
  t.update(ref, { estado: 'cancelada', resueltoPor: por.nombre, resueltoPorUid: por.uid, resueltoEl: ahoraServidor(), motivoRechazo: motivo });
  registrarHistorial(t, ref, 'CANCELADA', por, { motivo });
  if (s.estado === 'pendiente' && s.alertaId) resolverAlerta(t, refAlertas(db).doc(s.alertaId), { decision: 'cancelada', por: por.nombre, porUid: por.uid });
};

// Un administrador cambió el dato directamente (Editar usuario): sus
// solicitudes abiertas de ese tipo ya no aplican. Lecturas antes de escribir:
// devuelve la función que escribe.
const prepararCancelarAbiertas = async (t, db, uid, tipos, por) => {
  if (!tipos.length) return () => {};
  const q = refSolicitudes(db).where('solicitanteUid', '==', uid).where('estado', 'in', ESTADOS_ABIERTOS);
  const abiertas = (await t.get(q)).docs.filter((d) => tipos.includes(d.data().tipo));
  return () => abiertas.forEach((d) => cerrarSolicitud(t, db, d.ref, d.data(), por, 'El dato fue cambiado directamente por un administrador.'));
};

// --- Correo: aplicar el cambio confirmado ----------------------------------

// Compara el correo de Auth con el del perfil (al entrar, o desde Ajustes →
// Datos tras confirmar):
//   - iguales: nada.
//   - perfil sin correo (antiguo): toma el de Auth.
//   - el de Auth es el de una solicitud APROBADA: se aplica (perfil, solicitud
//     'aplicada' y auditoría).
//   - cualquier otro cambio no fue aprobado: se revierte el de Auth al del
//     perfil y queda en la auditoría.
// cuenta: UserRecord de Auth. Devuelve null | 'inicial' | 'aplicada' | 'revertida'.
const sincronizarCorreo = async (db, auth, cuenta, perfil) => {
  if (!perfil || !cuenta.email) return null;
  const enAuth = cuenta.email.toLowerCase();
  if (enAuth === String(perfil.email || '').toLowerCase()) return null;
  const uid = cuenta.uid;
  const sistema = { uid: 'sistema', nombre: 'Sistema' };
  if (!perfil.email) {
    await refUsuario(db, uid).update({ email: cuenta.email });
    return 'inicial';
  }
  const aprobadas = await refSolicitudes(db).where('solicitanteUid', '==', uid).where('tipo', '==', 'email').where('estado', '==', 'aprobada').get();
  const confirmada = aprobadas.docs.find((d) => d.data().valorSolicitado === enAuth);
  if (confirmada) {
    await db.runTransaction(async (t) => {
      t.update(refUsuario(db, uid), { email: cuenta.email });
      t.update(confirmada.ref, { estado: 'aplicada', aplicadoEl: ahoraServidor() });
      registrarHistorial(t, confirmada.ref, 'APLICADA', { uid, nombre: nombreDe(perfil) }, { email: cuenta.email });
      registrarLogUsuario(t, db, uid, 'CAMBIO_CORREO_CONFIRMADO', { uid, nombre: nombreDe(perfil) }, {
        solicitudId: confirmada.id, campo: 'email', antes: perfil.email, despues: cuenta.email,
      });
    });
    return 'aplicada';
  }
  await auth.updateUser(uid, { email: perfil.email });
  await refUsuario(db, uid).collection('logs').add({
    accion: 'CAMBIO_CORREO_NO_AUTORIZADO', detalle: { intentado: cuenta.email, restaurado: perfil.email },
    usuario: sistema.nombre, usuarioUid: sistema.uid, fecha: ahoraServidor(),
  });
  return 'revertida';
};

module.exports = {
  crearSolicitud, resolverSolicitud, cancelarSolicitud, sincronizarCorreo, prepararCancelarAbiertas, exigirDisponible,
  MENSAJE_CORREO_EN_USO,
};
