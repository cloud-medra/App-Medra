// Lógica de las funciones de permisos por centro de costo (ver index.js),
// separada de onCall para probarla contra el emulador de Firestore
// (tests/emulador). Cada función recibe la instancia de Firestore.
// Las plantillas son por centro + rol: plantillas_permisos/{centroId}__{rol}.
// Permiso efectivo = plantilla(centro, rol del usuario) + agregados − quitados;
// los roles de acceso total (admin/dev) no usan plantilla.

const { HttpsError } = require('firebase-functions/v2/https');
const { FieldValue } = require('firebase-admin/firestore');
const {
  aplanar, desaplanar, combinar, calcularExcepciones, normalizarExcepciones, esAdministrador, dejaSinAdministrador,
  SIN_EXCEPCIONES, ROLES, ROLES_CON_PLANTILLA, ROL_POR_DEFECTO, idPlantilla, idPlantillaDeUsuario, labelRol,
} = require('./nucleo.mjs');
const { prepararNombreUsuario } = require('../usuarios/indiceNombres');

const VALORES_ROL = ROLES.map((r) => r.value);
const ROLES_ACCESO_TOTAL = ROLES.filter((r) => r.accesoTotal).map((r) => r.value);
const MAX_CASILLAS_PLANTILLA = 20000;
const TAMANO_LOTE = 400;

const refUsuario = (db, uid) => db.collection('usuarios').doc(uid);
const refPlantilla = (db, id) => db.collection('plantillas_permisos').doc(id);
const refCentro = (db, id) => db.collection('maestros_centros').doc(id);

// Quién llama: { uid, nombre } si es admin/dev activo.
const exigirAdministrador = async (db, uid) => {
  if (!uid) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
  const perfil = (await refUsuario(db, uid).get()).data();
  if (!esAdministrador(perfil)) {
    throw new HttpsError('permission-denied', 'Solo un administrador puede cambiar permisos de usuarios.');
  }
  return { uid, nombre: perfil.nombreCompleto || perfil.email || '' };
};

// Plantilla en su forma canónica (sin campos ajenos ni valores raros).
const limpiarPlantilla = (plantilla) => {
  const plano = aplanar(plantilla);
  if (Object.keys(plano).length > MAX_CASILLAS_PLANTILLA) throw new HttpsError('invalid-argument', 'La plantilla es demasiado grande.');
  return desaplanar(plano);
};

// Plantilla del centro para el rol (null: sin centro, rol de acceso total o
// combinación sin configurar → no otorga permisos).
const leerPlantilla = async (db, centroId, rol, transaccion) => {
  const id = idPlantillaDeUsuario(centroId, rol);
  if (!id) return null;
  const snap = transaccion ? await transaccion.get(refPlantilla(db, id)) : await refPlantilla(db, id).get();
  return snap.exists ? { permisos: snap.data().permisos || {}, permisosGranulares: snap.data().permisosGranulares || {} } : null;
};

// Devuelve el nombre del centro (o null sin centro).
const validarCentro = async (db, centroId, transaccion) => {
  if (centroId === null) return null;
  if (typeof centroId !== 'string' || !centroId) throw new HttpsError('invalid-argument', 'Centro de costo inválido.');
  const snap = transaccion ? await transaccion.get(refCentro(db, centroId)) : await refCentro(db, centroId).get();
  if (!snap.exists) throw new HttpsError('invalid-argument', 'El centro de costo no existe.');
  return snap.data().nombre || centroId;
};

const rolDe = (u) => u?.rol || ROL_POR_DEFECTO;

const leerAdministradores = async (db, transaccion) => {
  const q = db.collection('usuarios').where('rol', 'in', ROLES_ACCESO_TOTAL);
  const snap = transaccion ? await transaccion.get(q) : await q.get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

const excepcionesDe = (u) => normalizarExcepciones(u?.excepciones || SIN_EXCEPCIONES);

// Solo lo que cambió, para la auditoría.
const diferenciaListas = (antes = [], despues = []) => {
  const a = new Set(antes);
  const d = new Set(despues);
  return { nuevos: despues.filter((c) => !a.has(c)), eliminados: antes.filter((c) => !d.has(c)) };
};
const cambiosParaLog = (antes, despues) => {
  const cambios = {};
  ['nombreCompleto', 'nombreUsuario', 'activo', 'rol', 'centroCostoId'].forEach((campo) => {
    if (despues[campo] !== undefined && despues[campo] !== antes[campo]) {
      cambios[campo] = { antes: antes[campo] ?? null, despues: despues[campo] };
    }
  });
  if (despues.excepciones) {
    const ea = excepcionesDe(antes);
    const agregados = diferenciaListas(ea.agregados, despues.excepciones.agregados);
    const quitados = diferenciaListas(ea.quitados, despues.excepciones.quitados);
    if (agregados.nuevos.length || agregados.eliminados.length) cambios.agregados = agregados;
    if (quitados.nuevos.length || quitados.eliminados.length) cambios.quitados = quitados;
  }
  return cambios;
};

const registrarLog = (escritor, ref, accion, por, detalle) => escritor.set(ref.collection('logs').doc(), {
  accion, detalle, usuario: por.nombre, usuarioUid: por.uid, fecha: FieldValue.serverTimestamp(),
});

// Activo/inactivo también en Auth: inactivo = cuenta deshabilitada (no puede
// entrar por ninguna vía, ni refrescar su sesión) y sesiones revocadas. Se
// aplica cada vez que llega `activo` (idempotente), así un fallo anterior se
// corrige al volver a guardar. Una cuenta sin usuario de Auth se ignora.
const sincronizarActivoEnAuth = async (auth, uid, activo) => {
  try {
    await auth.updateUser(uid, { disabled: !activo });
    if (!activo) await auth.revokeRefreshTokens(uid);
  } catch (err) {
    if (err.code === 'auth/user-not-found') return;
    throw new HttpsError('failed-precondition', `Se guardaron los cambios, pero no se pudo ${activo ? 'habilitar' : 'deshabilitar'} la cuenta de acceso. Vuelve a guardar.`);
  }
};

// opciones.auth: Admin SDK de Auth (para activar/inactivar la cuenta).
const guardarPermisosUsuario = async (db, por, data, { auth } = {}) => {
  const { uid, datos = {}, rol, centroCostoId, excepciones } = data || {};
  if (typeof uid !== 'string' || !uid) throw new HttpsError('invalid-argument', 'Usuario inválido.');
  if (rol !== undefined && !VALORES_ROL.includes(rol)) throw new HttpsError('invalid-argument', 'Rol inválido.');
  const actualizacion = {};
  if (datos.nombreCompleto !== undefined) {
    const v = String(datos.nombreCompleto).trim();
    if (!v) throw new HttpsError('invalid-argument', 'El campo nombreCompleto es obligatorio.');
    actualizacion.nombreCompleto = v;
  }
  // Se valida (formato y unicidad) en la transacción, solo si cambia.
  if (datos.nombreUsuario !== undefined) actualizacion.nombreUsuario = String(datos.nombreUsuario).trim();
  if (datos.activo !== undefined) actualizacion.activo = datos.activo !== false;
  if (rol !== undefined) actualizacion.rol = rol;

  let nuevasExcepciones;
  try {
    nuevasExcepciones = excepciones === undefined ? undefined : normalizarExcepciones(excepciones);
  } catch (err) {
    throw new HttpsError('invalid-argument', err.message);
  }

  const resultado = await db.runTransaction(async (t) => {
    const snap = await t.get(refUsuario(db, uid));
    if (!snap.exists) throw new HttpsError('not-found', 'El usuario no existe.');
    const antes = snap.data();
    // Nombre de usuario nuevo: único (índice nombres_usuario, misma transacción).
    let escribirNombre = null;
    if (actualizacion.nombreUsuario === antes.nombreUsuario) delete actualizacion.nombreUsuario;
    else if (actualizacion.nombreUsuario !== undefined) escribirNombre = await prepararNombreUsuario(db, t, uid, actualizacion.nombreUsuario, antes.nombreUsuario);
    if (centroCostoId !== undefined) await validarCentro(db, centroCostoId, t);
    const administradores = await leerAdministradores(db, t);
    if (dejaSinAdministrador(administradores, uid, { rol: actualizacion.rol, activo: actualizacion.activo })) {
      throw new HttpsError('failed-precondition', 'No se puede: es el último administrador activo del sistema.');
    }

    // El permiso efectivo se recalcula si cambia el centro o las
    // excepciones, o si el usuario ya está en el modelo de plantillas (así
    // un cambio de rol toma la plantilla del nuevo rol, conservando sus
    // excepciones). Un usuario antiguo sin centro ni excepciones conserva
    // sus permisos tal cual hasta que se guarden sus permisos por primera vez.
    const centroFinal = centroCostoId !== undefined ? centroCostoId : (antes.centroCostoId ?? null);
    const rolFinal = actualizacion.rol ?? rolDe(antes);
    const enModeloPlantillas = antes.excepciones !== undefined || antes.centroCostoId != null;
    if (centroCostoId !== undefined || nuevasExcepciones !== undefined || enModeloPlantillas) {
      const exc = nuevasExcepciones ?? excepcionesDe(antes);
      const efectivo = combinar(await leerPlantilla(db, centroFinal, rolFinal, t), exc);
      Object.assign(actualizacion, { centroCostoId: centroFinal, excepciones: exc, ...efectivo });
    }

    const cambios = cambiosParaLog(antes, actualizacion);
    if (Object.keys(actualizacion).length === 0) return { cambios };
    t.update(refUsuario(db, uid), { ...actualizacion, permisosActualizadosEl: FieldValue.serverTimestamp() });
    escribirNombre?.(t);
    if (Object.keys(cambios).length) registrarLog(t, refUsuario(db, uid), 'PERMISOS', por, cambios);
    return { cambios };
  });
  if (auth && actualizacion.activo !== undefined) await sincronizarActivoEnAuth(auth, uid, actualizacion.activo);
  return { ok: true, campos: Object.keys(resultado.cambios) };
};

const asignarCentroCostoMasivo = async (db, por, data) => {
  const { uids, centroCostoId } = data || {};
  if (!Array.isArray(uids) || uids.length === 0 || uids.length > TAMANO_LOTE || uids.some((u) => typeof u !== 'string' || !u)) {
    throw new HttpsError('invalid-argument', `Indica entre 1 y ${TAMANO_LOTE} usuarios.`);
  }
  await validarCentro(db, centroCostoId ?? null);
  // Cada usuario recibe la plantilla del centro para SU rol.
  const plantillas = new Map();
  const plantillaPara = async (rol) => {
    if (!plantillas.has(rol)) plantillas.set(rol, await leerPlantilla(db, centroCostoId ?? null, rol));
    return plantillas.get(rol);
  };
  const lote = db.batch();
  let actualizados = 0;
  for (const uid of [...new Set(uids)]) {
    const snap = await refUsuario(db, uid).get();
    if (!snap.exists) continue;
    const antes = snap.data();
    const exc = excepcionesDe(antes);
    const actualizacion = { centroCostoId: centroCostoId ?? null, excepciones: exc, ...combinar(await plantillaPara(rolDe(antes)), exc) };
    lote.update(refUsuario(db, uid), { ...actualizacion, permisosActualizadosEl: FieldValue.serverTimestamp() });
    const cambios = cambiosParaLog(antes, { centroCostoId: actualizacion.centroCostoId });
    if (Object.keys(cambios).length) registrarLog(lote, refUsuario(db, uid), 'CENTRO_COSTO_MASIVO', por, cambios);
    actualizados += 1;
  }
  await lote.commit();
  return { actualizados };
};

const guardarPlantillaCentroCosto = async (db, por, data) => {
  const { centroId, rol, plantilla } = data || {};
  if (typeof centroId !== 'string' || !centroId) throw new HttpsError('invalid-argument', 'Centro de costo inválido.');
  if (!ROLES_CON_PLANTILLA.includes(rol)) throw new HttpsError('invalid-argument', 'Rol inválido: las plantillas son para roles sin acceso total.');
  const centroNombre = await validarCentro(db, centroId);
  const nueva = limpiarPlantilla(plantilla);
  const anterior = (await leerPlantilla(db, centroId, rol)) || { permisos: {}, permisosGranulares: {} };
  const ref = refPlantilla(db, idPlantilla(centroId, rol));

  // Qué cambió, en casillas (para la auditoría), con centro y rol.
  const diferencia = calcularExcepciones(anterior, nueva);
  const lotePlantilla = db.batch();
  lotePlantilla.set(ref, {
    ...nueva, centroId, rol, actualizadoEl: FieldValue.serverTimestamp(), actualizadoPor: por.nombre, actualizadoPorUid: por.uid,
  });
  registrarLog(lotePlantilla, ref, 'PLANTILLA', por, {
    centroId, centroNombre, rol, rolNombre: labelRol(rol), habilitados: diferencia.agregados, deshabilitados: diferencia.quitados,
  });
  await lotePlantilla.commit();

  // Solo los usuarios de esa combinación centro + rol, cada uno con sus excepciones.
  const delCentro = await db.collection('usuarios').where('centroCostoId', '==', centroId).get();
  const usuarios = delCentro.docs.filter((d) => rolDe(d.data()) === rol);
  for (let i = 0; i < usuarios.length; i += TAMANO_LOTE) {
    const lote = db.batch();
    usuarios.slice(i, i + TAMANO_LOTE).forEach((d) => {
      const exc = excepcionesDe(d.data());
      lote.update(d.ref, { ...combinar(nueva, exc), excepciones: exc, permisosActualizadosEl: FieldValue.serverTimestamp() });
    });
    await lote.commit();
  }
  return { usuarios: usuarios.length };
};

module.exports = { exigirAdministrador, guardarPermisosUsuario, asignarCentroCostoMasivo, guardarPlantillaCentroCosto };
