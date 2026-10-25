// Lógica de las funciones de permisos por centro de costo (ver index.js),
// separada de onCall para probarla contra el emulador de Firestore
// (tests/emulador). Cada función recibe la instancia de Firestore.
// Las plantillas son por centro + rol: plantillas_permisos/{centroId}__{rol}.
// Permiso efectivo = plantilla(centro, rol del usuario) + agregados − quitados;
// Administrador y Desarrollador no usan plantilla (solo sus permisos propios).

const { HttpsError } = require('firebase-functions/v2/https');
const { FieldValue } = require('firebase-admin/firestore');
const {
  aplanar, desaplanar, combinar, calcularExcepciones, normalizarExcepciones, puedeAdministrar, dejaSinDesarrollador,
  SIN_EXCEPCIONES, ROLES, ROLES_CON_PLANTILLA, esRolSinPlantilla, ROL_POR_DEFECTO, idPlantilla, idPlantillaDeUsuario, labelRol,
} = require('./nucleo.mjs');
const { prepararNombreUsuario } = require('../usuarios/indiceNombres');
const { TIPOS_SOLICITUD } = require('../solicitudes/tipos.mjs');
const { esAdministradorDelCentro } = require('../solicitudes/destinatarios.mjs');
const { prepararCancelarAbiertas, exigirDisponible } = require('../solicitudes/servicio');

const VALORES_ROL = ROLES.map((r) => r.value);
const ROLES_ACCESO_TOTAL = ROLES.filter((r) => r.accesoTotal).map((r) => r.value);
const ROL_DESARROLLADOR = 'dev';
// Ítems de Administración que habilitan cada función (además del rol).
const RUTAS = Object.freeze({
  crear: '/administracion/crearUsuario',
  listado: '/administracion/listadoUsuario',
  permisosCentro: '/administracion/permisosCentro',
});
const MAX_CASILLAS_PLANTILLA = 20000;
const TAMANO_LOTE = 400;

const refUsuario = (db, uid) => db.collection('usuarios').doc(uid);
const refPlantilla = (db, id) => db.collection('plantillas_permisos').doc(id);
const refCentro = (db, id) => db.collection('maestros_centros').doc(id);

// Quién llama: { uid, nombre, rol } si es Desarrollador activo, o
// Administrador activo con alguno de esos ítems de Administración.
const exigirAdministrador = async (db, uid, rutas) => {
  if (!uid) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
  const perfil = (await refUsuario(db, uid).get()).data();
  if (!puedeAdministrar(perfil, rutas)) {
    throw new HttpsError('permission-denied', 'Solo un administrador con acceso a esta vista puede hacerlo.');
  }
  return { uid, nombre: perfil.nombreCompleto || perfil.email || '', rol: perfil.rol };
};

// Anti-escalada: un Administrador no se cambia a sí mismo rol, estado,
// centro ni permisos, no modifica a un Desarrollador ni asigna ese rol.
// El Desarrollador puede todo (salvo dejar el sistema sin desarrollador).
const exigirPuedeModificar = (por, uid, antes, { cambiaAcceso = false, rolNuevo } = {}) => {
  if (por.rol === ROL_DESARROLLADOR) return;
  if (antes?.rol === ROL_DESARROLLADOR) throw new HttpsError('permission-denied', 'Solo otro Desarrollador puede modificar a un Desarrollador.');
  if (rolNuevo === ROL_DESARROLLADOR) throw new HttpsError('permission-denied', 'Solo un Desarrollador puede asignar el rol Desarrollador.');
  if (cambiaAcceso && uid === por.uid) throw new HttpsError('permission-denied', 'No puedes cambiar tu propio rol, estado, centro ni permisos.');
};

// Plantilla en su forma canónica (sin campos ajenos ni valores raros).
const limpiarPlantilla = (plantilla) => {
  const plano = aplanar(plantilla);
  if (Object.keys(plano).length > MAX_CASILLAS_PLANTILLA) throw new HttpsError('invalid-argument', 'La plantilla es demasiado grande.');
  return desaplanar(plano);
};

// Plantilla del centro para el rol (null: sin centro, rol sin plantilla o
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

const leerDesarrolladores = async (db, transaccion) => {
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
  ['nombreCompleto', 'nombreUsuario', 'email', 'activo', 'rol', 'centroCostoId',
    'centrosAdministrados', 'administradoresAsignados', 'todosLosAdministradoresDelCentro', 'instituciones'].forEach((campo) => {
    if (despues[campo] !== undefined && JSON.stringify(despues[campo]) !== JSON.stringify(antes[campo] ?? null)) {
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

// Lista de ids (texto) sin repetir, o undefined si no vino.
const listaIds = (v, campo) => {
  if (v === undefined) return undefined;
  if (!Array.isArray(v) || v.length > 100 || v.some((x) => typeof x !== 'string' || !x)) throw new HttpsError('invalid-argument', `${campo} inválido.`);
  return [...new Set(v)];
};

const mismoConjunto = (a, b) => a.length === b.length && a.every((x) => b.includes(x));

// Instituciones del usuario (Maestros → Instituciones): tienen que existir.
// Por ahora solo definen qué ofrece el selector del header; no filtran datos.
const validarInstituciones = async (db, t, ids) => {
  if (!ids.length) return;
  const snaps = await t.getAll(...ids.map((id) => db.collection('maestros_instituciones').doc(id)));
  if (snaps.some((s) => !s.exists)) throw new HttpsError('invalid-argument', 'Alguna institución no existe.');
};

// Administradores asignados: solo administradores activos del centro.
const validarAsignados = async (db, t, centroId, asignados) => {
  if (!asignados.length) return;
  if (!centroId) throw new HttpsError('invalid-argument', 'Para asignar administradores, el usuario necesita un centro de costo.');
  const snaps = await Promise.all(asignados.map((a) => t.get(refUsuario(db, a))));
  if (snaps.some((sn) => !esAdministradorDelCentro(sn.data(), centroId))) {
    throw new HttpsError('invalid-argument', 'Solo se pueden asignar administradores activos de su centro de costo.');
  }
};

// Correo cambiado directamente por un administrador: después de guardar el
// perfil se cambia en Auth; si Auth falla, se deja el perfil como estaba.
const cambiarCorreoEnAuth = async (db, auth, uid, nuevo, anterior) => {
  try {
    await auth.updateUser(uid, { email: nuevo });
  } catch (err) {
    await refUsuario(db, uid).update({ email: anterior ?? FieldValue.delete() });
    if (err.code === 'auth/email-already-exists') throw new HttpsError('already-exists', 'Ese correo ya está registrado.');
    if (err.code === 'auth/user-not-found') return;
    throw new HttpsError('failed-precondition', 'No se pudo cambiar el correo de acceso. Vuelve a intentarlo.');
  }
};

// opciones.auth: Admin SDK de Auth (activar/inactivar la cuenta, correo).
// Datos generales (nombre completo, nombre de usuario, correo) los cambia el
// administrador directamente; las solicitudes abiertas de esos datos se
// cancelan y queda en la auditoría.
const guardarPermisosUsuario = async (db, por, data, { auth } = {}) => {
  const {
    uid, datos = {}, rol, centroCostoId, excepciones, centrosAdministrados, administradoresAsignados, todosLosAdministradoresDelCentro,
    instituciones,
  } = data || {};
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
  if (datos.email !== undefined) {
    const email = TIPOS_SOLICITUD.email.normalizar(datos.email);
    const error = TIPOS_SOLICITUD.email.validar(email);
    if (error) throw new HttpsError('invalid-argument', error);
    actualizacion.email = email;
  }
  const centros = listaIds(centrosAdministrados, 'Centros administrados');
  const asignados = listaIds(administradoresAsignados, 'Administradores asignados');
  const listaInstituciones = listaIds(instituciones, 'Instituciones');
  if (todosLosAdministradoresDelCentro !== undefined) actualizacion.todosLosAdministradoresDelCentro = todosLosAdministradoresDelCentro === true;

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
    if (actualizacion.email !== undefined && actualizacion.email === String(antes.email || '').toLowerCase()) delete actualizacion.email;
    if (actualizacion.email !== undefined) {
      if (!auth) throw new HttpsError('failed-precondition', 'No se puede cambiar el correo aquí.');
      await exigirDisponible(db, auth, 'email', actualizacion.email, uid);
    }
    // Nombre de usuario nuevo: único (índice nombres_usuario, misma transacción).
    let escribirNombre = null;
    if (actualizacion.nombreUsuario === antes.nombreUsuario) delete actualizacion.nombreUsuario;
    else if (actualizacion.nombreUsuario !== undefined) escribirNombre = await prepararNombreUsuario(db, t, uid, actualizacion.nombreUsuario, antes.nombreUsuario);
    if (centroCostoId !== undefined) await validarCentro(db, centroCostoId, t);
    // Solo cuenta (y se valida) si la lista cambia: la misma lista enviada de
    // nuevo no es un cambio de acceso.
    const institucionesAntes = Array.isArray(antes.instituciones) ? antes.instituciones : [];
    if (listaInstituciones !== undefined && !mismoConjunto(listaInstituciones, institucionesAntes)) {
      await validarInstituciones(db, t, listaInstituciones);
      actualizacion.instituciones = listaInstituciones;
    }
    exigirPuedeModificar(por, uid, antes, {
      rolNuevo: actualizacion.rol,
      cambiaAcceso: [rol, datos.activo, centroCostoId, excepciones, centrosAdministrados, actualizacion.instituciones].some((v) => v !== undefined),
    });
    const desarrolladores = await leerDesarrolladores(db, t);
    if (dejaSinDesarrollador(desarrolladores, uid, { rol: actualizacion.rol, activo: actualizacion.activo })) {
      throw new HttpsError('failed-precondition', 'No se puede: es el último desarrollador activo del sistema.');
    }

    // El permiso efectivo se recalcula si cambia el centro o las
    // excepciones, o si el usuario ya está en el modelo de plantillas (así
    // un cambio de rol toma la plantilla del nuevo rol, conservando sus
    // excepciones). Un usuario antiguo sin centro ni excepciones conserva
    // sus permisos tal cual hasta que se guarden sus permisos por primera vez.
    const centroFinal = centroCostoId !== undefined ? centroCostoId : (antes.centroCostoId ?? null);
    const rolFinal = actualizacion.rol ?? rolDe(antes);
    // El Operador necesita centro de costo (sus solicitudes van a los
    // administradores de su centro). Se exige al asignar rol o centro: uno
    // anterior sin centro sigue funcionando hasta que se le asigne.
    if (rolFinal === 'operador' && !centroFinal && (centroCostoId !== undefined || rol !== undefined)) {
      throw new HttpsError('invalid-argument', 'El centro de costo es obligatorio para un Operador.');
    }
    // Centros que administra: solo el rol Administrador.
    if (centros !== undefined || (rolFinal !== 'admin' && antes.centrosAdministrados?.length)) {
      const lista = rolFinal === 'admin' ? (centros ?? antes.centrosAdministrados ?? []) : [];
      for (const c of lista) await validarCentro(db, c, t);
      actualizacion.centrosAdministrados = lista;
    }
    // Administradores asignados: del centro del usuario; al cambiar de
    // centro (o de rol a uno sin administradores) se vacían.
    const conAdministradores = ['operador', 'encargado'].includes(rolFinal);
    const cambiaCentro = (centroFinal ?? null) !== (antes.centroCostoId ?? null);
    if (asignados !== undefined || ((cambiaCentro || !conAdministradores) && antes.administradoresAsignados?.length)) {
      const lista = conAdministradores ? (asignados ?? (cambiaCentro ? [] : antes.administradoresAsignados)) : [];
      await validarAsignados(db, t, centroFinal, lista);
      actualizacion.administradoresAsignados = lista;
    }
    const tiposCambiados = ['nombreCompleto', 'nombreUsuario', 'email']
      .filter((c) => actualizacion[c] !== undefined && actualizacion[c] !== antes[c]);
    const cancelarAbiertas = await prepararCancelarAbiertas(t, db, uid, tiposCambiados, por);
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
    cancelarAbiertas();
    if (Object.keys(cambios).length) registrarLog(t, refUsuario(db, uid), 'PERMISOS', por, cambios);
    return { cambios, emailAnterior: antes.email };
  });
  if (resultado.cambios.email) await cambiarCorreoEnAuth(db, auth, uid, actualizacion.email, resultado.emailAnterior);
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
    exigirPuedeModificar(por, uid, antes, { cambiaAcceso: true });
    if (!centroCostoId && rolDe(antes) === 'operador') {
      throw new HttpsError('invalid-argument', `El centro de costo es obligatorio para un Operador (${antes.nombreCompleto || uid}).`);
    }
    const exc = excepcionesDe(antes);
    // Administrador/Desarrollador no usan plantilla: el centro no cambia sus
    // permisos (y uno antiguo sin excepciones no los pierde).
    const actualizacion = esRolSinPlantilla(rolDe(antes))
      ? { centroCostoId: centroCostoId ?? null }
      : { centroCostoId: centroCostoId ?? null, excepciones: exc, ...combinar(await plantillaPara(rolDe(antes)), exc) };
    // Otro centro: sus administradores asignados ya no corresponden.
    if ((antes.centroCostoId ?? null) !== (centroCostoId ?? null) && antes.administradoresAsignados?.length) actualizacion.administradoresAsignados = [];
    lote.update(refUsuario(db, uid), { ...actualizacion, permisosActualizadosEl: FieldValue.serverTimestamp() });
    const cambios = cambiosParaLog(antes, { centroCostoId: actualizacion.centroCostoId });
    if (Object.keys(cambios).length) registrarLog(lote, refUsuario(db, uid), 'CENTRO_COSTO_MASIVO', por, cambios);
    actualizados += 1;
  }
  await lote.commit();
  return { actualizados };
};

// Lista de usuarios → "Asignar administradores" a varios usuarios del mismo
// centro (Operador / Encargado): una lista fija, o "todos los
// administradores del centro" (se resuelve al crear cada solicitud).
const asignarAdministradoresMasivo = async (db, por, data) => {
  const { uids, todosLosAdministradoresDelCentro = false } = data || {};
  if (!Array.isArray(uids) || uids.length === 0 || uids.length > TAMANO_LOTE || uids.some((u) => typeof u !== 'string' || !u)) {
    throw new HttpsError('invalid-argument', `Indica entre 1 y ${TAMANO_LOTE} usuarios.`);
  }
  const todos = todosLosAdministradoresDelCentro === true;
  const asignados = todos ? [] : (listaIds(data.administradoresAsignados, 'Administradores asignados') || []);
  if (!todos && !asignados.length) throw new HttpsError('invalid-argument', 'Elige al menos un administrador, o "Todos los administradores del centro".');
  return db.runTransaction(async (t) => {
    const snaps = await Promise.all([...new Set(uids)].map((u) => t.get(refUsuario(db, u))));
    const usuarios = snaps.filter((sn) => sn.exists);
    const centros = new Set(usuarios.map((sn) => sn.data().centroCostoId || null));
    if (centros.size !== 1 || centros.has(null)) throw new HttpsError('invalid-argument', 'Todos los usuarios deben tener el mismo centro de costo.');
    if (usuarios.some((sn) => !['operador', 'encargado'].includes(rolDe(sn.data())))) {
      throw new HttpsError('invalid-argument', 'Solo Operadores y Encargados de centro tienen administradores asignados.');
    }
    const [centro] = centros;
    await validarAsignados(db, t, centro, asignados);
    usuarios.forEach((sn) => {
      const cambio = { administradoresAsignados: asignados, todosLosAdministradoresDelCentro: todos };
      const cambios = cambiosParaLog(sn.data(), cambio);
      t.update(sn.ref, cambio);
      if (Object.keys(cambios).length) registrarLog(t, sn.ref, 'ADMINISTRADORES_MASIVO', por, cambios);
    });
    return { actualizados: usuarios.length };
  });
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

module.exports = {
  exigirAdministrador, exigirPuedeModificar, guardarPermisosUsuario, asignarCentroCostoMasivo, asignarAdministradoresMasivo,
  guardarPlantillaCentroCosto, RUTAS,
};
