// Lógica de las Cloud Functions de usuarios (ver index.js), separada de
// onCall para probarla contra los emuladores (tests/emulador). Cada función
// recibe Firestore y Auth del Admin SDK.

const crypto = require('node:crypto');
const process = require('node:process');
const { HttpsError } = require('firebase-functions/v2/https');
const { FieldValue, Timestamp } = require('firebase-admin/firestore');
const {
  errorNombreUsuario, normalizarNombreUsuario, normalizarIdentificador, esCorreo,
  MENSAJE_LOGIN_INCORRECTO, MENSAJE_USUARIO_DESHABILITADO, MENSAJE_NOMBRE_EN_USO,
} = require('./nombreUsuario.mjs');
const { refNombre, prepararNombreUsuario } = require('./indiceNombres');
const { ROLES, ROL_POR_DEFECTO, puedeAccion } = require('../permisos/nucleo.mjs');

const VALORES_ROL = ROLES.map((r) => r.value);
const refUsuario = (db, uid) => db.collection('usuarios').doc(uid);

// --- Iniciar sesión -------------------------------------------------------

// Bloqueo por intentos fallidos: MAX_FALLOS seguidos dentro de VENTANA_MS
// bloquean BLOQUEO_MS. Se cuenta por cuenta (uid) cuando el identificador
// corresponde a una, así el bloqueo es el mismo entrando con el correo o
// con el nombre de usuario; si no corresponde a ninguna, por identificador.
// El bloqueo de una cuenta se refleja en usuarios/{uid}.bloqueoLoginHasta
// (Lista de usuarios lo muestra y permite desbloquear).
const MAX_FALLOS = 5;
const VENTANA_MS = 15 * 60 * 1000;
const BLOQUEO_MS = 15 * 60 * 1000;
const MENSAJE_BLOQUEO = 'Demasiados intentos fallidos. Espera unos minutos e inténtalo de nuevo.';

// intentos_login/{hash}: el id es un hash, no guarda correos ni nombres.
const claveCuenta = (uid) => `uid:${uid}`;
const refIntentos = (db, clave) => db.collection('intentos_login').doc(crypto.createHash('sha256').update(clave).digest('hex'));
const incorrecto = () => new HttpsError('unauthenticated', MENSAJE_LOGIN_INCORRECTO);

// Cuenta de Auth a la que apunta el identificador (null si ninguna).
const resolverCuenta = async (db, auth, identificador) => {
  try {
    if (esCorreo(identificador)) return await auth.getUserByEmail(identificador);
    const indice = (await refNombre(db, identificador).get()).data();
    return indice ? await auth.getUser(indice.uid) : null;
  } catch (err) {
    if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-email') return null;
    throw err;
  }
};

// uid: el de la cuenta, si el identificador corresponde a una.
const registrarFallo = (db, ref, ahora, uid) => db.runTransaction(async (t) => {
  const previo = (await t.get(ref)).data() || {};
  const perfil = uid ? await t.get(refUsuario(db, uid)) : null;
  const vigente = previo.ultimoFallo && ahora - previo.ultimoFallo.toMillis() < VENTANA_MS;
  const fallos = (vigente ? previo.fallos || 0 : 0) + 1;
  const hasta = fallos >= MAX_FALLOS ? Timestamp.fromMillis(ahora + BLOQUEO_MS) : null;
  t.set(ref, {
    fallos: hasta ? 0 : fallos,
    ultimoFallo: Timestamp.fromMillis(ahora),
    bloqueadoHasta: hasta,
    // Para una política de TTL opcional sobre este campo.
    expiraEl: Timestamp.fromMillis(ahora + 24 * 60 * 60 * 1000),
  });
  if (hasta && perfil?.exists) t.update(perfil.ref, { bloqueoLoginHasta: hasta });
});

// Verifica correo + contraseña con la API REST de Firebase Auth (el Admin
// SDK no verifica contraseñas). 'ok' | 'incorrecta' | 'limitada'.
const verificarPasswordRest = (apiKey) => async (email, password) => {
  const emulador = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  const base = emulador ? `http://${emulador}/identitytoolkit.googleapis.com` : 'https://identitytoolkit.googleapis.com';
  const respuesta = await fetch(`${base}/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: false }),
  });
  if (respuesta.ok) return 'ok';
  const mensaje = (await respuesta.json().catch(() => ({})))?.error?.message || '';
  if (mensaje.startsWith('TOO_MANY_ATTEMPTS_TRY_LATER')) return 'limitada';
  if (/^(INVALID_PASSWORD|INVALID_LOGIN_CREDENTIALS|EMAIL_NOT_FOUND|USER_DISABLED|INVALID_EMAIL|MISSING_PASSWORD)/.test(mensaje)) return 'incorrecta';
  throw new Error(`signInWithPassword ${respuesta.status}: ${mensaje}`);
};

// identificador: correo (si tiene "@") o nombre de usuario, sin distinguir
// mayúsculas ni espacios alrededor. `email` se acepta por compatibilidad.
// Devuelve un custom token del mismo uid: la sesión, el perfil y los
// permisos se cargan igual que antes (UserContext → usuarios/{uid}).
// Con la contraseña correcta, un usuario inactivo recibe su propio mensaje
// (permission-denied); cualquier otro fallo, el genérico.
const iniciarSesion = async (db, auth, data, { verificarPassword, ahora = Date.now() }) => {
  const identificador = normalizarIdentificador(data?.identificador ?? data?.email);
  const password = typeof data?.password === 'string' ? data.password : '';
  if (!identificador || !password) throw incorrecto();

  const cuenta = await resolverCuenta(db, auth, identificador);
  const intentos = refIntentos(db, cuenta ? claveCuenta(cuenta.uid) : `id:${identificador}`);
  const previo = (await intentos.get()).data();
  if (previo?.bloqueadoHasta && previo.bloqueadoHasta.toMillis() > ahora) {
    throw new HttpsError('resource-exhausted', MENSAJE_BLOQUEO);
  }

  // Una cuenta deshabilitada en Auth no se puede verificar: genérico.
  const resultado = cuenta && !cuenta.disabled && cuenta.email ? await verificarPassword(cuenta.email, password) : 'incorrecta';
  if (resultado === 'limitada') throw new HttpsError('resource-exhausted', MENSAJE_BLOQUEO);
  if (resultado !== 'ok') {
    await registrarFallo(db, intentos, ahora, cuenta?.uid);
    throw incorrecto();
  }
  const perfil = refUsuario(db, cuenta.uid);
  const datosPerfil = (await perfil.get()).data();
  // Usuario inactivo (Administración → Usuarios): no es un intento fallido.
  if (datosPerfil?.activo === false) throw new HttpsError('permission-denied', MENSAJE_USUARIO_DESHABILITADO);
  if (previo) await intentos.delete();
  // Correo cambiado y confirmado por el usuario (verifyBeforeUpdateEmail):
  // el perfil toma el de Auth recién ahora.
  const ajustes = {
    ...(datosPerfil?.bloqueoLoginHasta ? { bloqueoLoginHasta: FieldValue.delete() } : {}),
    ...(datosPerfil && datosPerfil.email !== cuenta.email ? { email: cuenta.email } : {}),
  };
  if (Object.keys(ajustes).length) await perfil.update(ajustes);
  return { token: await auth.createCustomToken(cuenta.uid) };
};

// Lista de usuarios → Desbloquear (acción btn_desbloquear): quita el
// bloqueo por intentos fallidos de una cuenta y lo deja en su auditoría.
const desbloquearUsuario = async (db, por, data) => {
  const uid = data?.uid;
  if (typeof uid !== 'string' || !uid) throw new HttpsError('invalid-argument', 'Usuario inválido.');
  const ref = refUsuario(db, uid);
  await db.runTransaction(async (t) => {
    const snap = await t.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'El usuario no existe.');
    t.delete(refIntentos(db, claveCuenta(uid)));
    t.update(ref, { bloqueoLoginHasta: FieldValue.delete() });
    t.set(ref.collection('logs').doc(), {
      accion: 'DESBLOQUEO_LOGIN',
      detalle: { bloqueadoHasta: snap.data().bloqueoLoginHasta ?? null },
      usuario: por.nombre,
      usuarioUid: por.uid,
      fecha: FieldValue.serverTimestamp(),
    });
  });
  return { ok: true };
};

// Quién llama: { uid, nombre } si puede esa acción granular (o es Desarrollador).
const exigirAccion = async (db, uid, [modulo, ruta, seccion, accion]) => {
  if (!uid) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
  const perfil = (await refUsuario(db, uid).get()).data();
  if (!puedeAccion(perfil, modulo, ruta, seccion, accion)) {
    throw new HttpsError('permission-denied', 'No tienes permiso para esta acción.');
  }
  return { uid, nombre: perfil.nombreCompleto || perfil.email || '' };
};
const ACCION_DESBLOQUEAR = ['administracion', '/administracion/listadoUsuario', 'tabla_usuarios', 'btn_desbloquear'];

// --- Crear usuario --------------------------------------------------------

const ERRORES_AUTH = {
  'auth/email-already-exists': ['already-exists', 'Ese correo ya está registrado.'],
  'auth/invalid-email': ['invalid-argument', 'El correo ingresado no es válido.'],
  'auth/invalid-password': ['invalid-argument', 'La contraseña es demasiado débil.'],
};

// Crea la cuenta de Auth, usuarios/{uid} (el documento base de Crear
// Usuario: rol y sin permisos) y su entrada en nombres_usuario. Si el
// nombre se tomó entre medio, se borra la cuenta recién creada.
const crearUsuario = async (db, auth, por, data) => {
  const { nombreCompleto, nombreUsuario, email, password, rol = ROL_POR_DEFECTO } = data || {};
  const nombre = String(nombreCompleto ?? '').trim();
  if (!nombre) throw new HttpsError('invalid-argument', 'El nombre completo es obligatorio.');
  const errorNombre = errorNombreUsuario(nombreUsuario);
  if (errorNombre) throw new HttpsError('invalid-argument', errorNombre);
  const correo = String(email ?? '').trim();
  if (!correo) throw new HttpsError('invalid-argument', 'El correo es obligatorio.');
  if (typeof password !== 'string' || password.length < 6) throw new HttpsError('invalid-argument', 'La contraseña debe tener al menos 6 caracteres.');
  if (!VALORES_ROL.includes(rol)) throw new HttpsError('invalid-argument', 'Rol inválido.');
  // Aviso temprano, para no crear la cuenta de Auth en vano.
  if ((await refNombre(db, normalizarNombreUsuario(nombreUsuario)).get()).exists) {
    throw new HttpsError('already-exists', MENSAJE_NOMBRE_EN_USO);
  }

  let cuenta;
  try {
    cuenta = await auth.createUser({ email: correo, password });
  } catch (err) {
    const conocido = ERRORES_AUTH[err.code];
    if (conocido) throw new HttpsError(...conocido);
    throw err;
  }
  try {
    await db.runTransaction(async (t) => {
      const escribirNombre = await prepararNombreUsuario(db, t, cuenta.uid, nombreUsuario);
      t.create(refUsuario(db, cuenta.uid), {
        nombreCompleto: nombre,
        nombreUsuario: String(nombreUsuario).trim(),
        email: cuenta.email,
        rol,
        permisos: {},
        permisosGranulares: {},
        estadoCreacion: { paso1: true, paso2: false, itemsFinalizados: {}, completo: false },
        passwordChanged: false,
        modoPantalla: 'claro',
        creadoPor: por.uid,
        creadoEl: FieldValue.serverTimestamp(),
      });
      escribirNombre(t);
    });
  } catch (err) {
    await auth.deleteUser(cuenta.uid).catch(() => {});
    throw err;
  }
  return { uid: cuenta.uid };
};

// --- Índice de nombres de los usuarios existentes -------------------------

// Revisa usuarios/*: los nombres vacíos, con "@", espacios u otros
// caracteres no permitidos, o repetidos (sin distinguir mayúsculas) quedan
// en `problemas` y no se indexan. No modifica nada.
const revisarNombresUsuario = async (db) => {
  const usuarios = (await db.collection('usuarios').get()).docs.map((d) => ({ uid: d.id, ...d.data() }));
  const problemas = [];
  const porNombre = new Map();
  usuarios.forEach((u) => {
    const motivo = errorNombreUsuario(u.nombreUsuario);
    if (motivo) {
      problemas.push({ ...resumen(u), motivo });
      return;
    }
    const n = normalizarNombreUsuario(u.nombreUsuario);
    porNombre.set(n, [...(porNombre.get(n) || []), u]);
  });
  const entradas = [];
  porNombre.forEach((lista, normalizado) => {
    if (lista.length === 1) {
      entradas.push({ normalizado, uid: lista[0].uid, nombreUsuario: String(lista[0].nombreUsuario).trim() });
      return;
    }
    lista.forEach((u) => problemas.push({ ...resumen(u), motivo: `Nombre repetido (sin distinguir mayúsculas): "${normalizado}", ${lista.length} usuarios.` }));
  });
  return { total: usuarios.length, entradas, problemas };
};
const resumen = (u) => ({ uid: u.uid, nombreUsuario: u.nombreUsuario ?? null, nombreCompleto: u.nombreCompleto || '', email: u.email || '', activo: u.activo !== false });

// Escribe en nombres_usuario las entradas válidas (idempotente). Un nombre
// ya indexado por otro usuario no se pisa.
const indexarNombresUsuario = async (db, entradas) => {
  let escritas = 0;
  const omitidas = [];
  for (const e of entradas) {
    const actual = (await refNombre(db, e.normalizado).get()).data();
    if (actual && actual.uid !== e.uid) {
      omitidas.push(e);
      continue;
    }
    await refNombre(db, e.normalizado).set({ uid: e.uid, nombreUsuario: e.nombreUsuario });
    escritas += 1;
  }
  return { escritas, omitidas };
};

// --- Usuarios inactivos deshabilitados en Auth -----------------------------

// Compara usuarios/* (activo) con Auth (disabled). No modifica nada.
//   pendientes: inactivos con la cuenta de Auth aún habilitada.
//   activosDeshabilitados: activos con la cuenta deshabilitada (solo se
//   informa; se corrige reactivándolos desde Lista de usuarios).
const revisarInactivosEnAuth = async (db, auth) => {
  const usuarios = (await db.collection('usuarios').get()).docs.map((d) => ({ uid: d.id, ...d.data() }));
  const cuentas = new Map();
  for (let i = 0; i < usuarios.length; i += 100) {
    const { users } = await auth.getUsers(usuarios.slice(i, i + 100).map((u) => ({ uid: u.uid })));
    users.forEach((c) => cuentas.set(c.uid, c));
  }
  const resultado = { total: usuarios.length, pendientes: [], yaDeshabilitados: [], activosDeshabilitados: [], sinCuenta: [] };
  usuarios.forEach((u) => {
    const cuenta = cuentas.get(u.uid);
    const fila = resumen(u);
    if (!cuenta) {
      if (u.activo === false) resultado.sinCuenta.push(fila);
    } else if (u.activo === false) {
      resultado[cuenta.disabled ? 'yaDeshabilitados' : 'pendientes'].push(fila);
    } else if (cuenta.disabled) {
      resultado.activosDeshabilitados.push(fila);
    }
  });
  return resultado;
};

// Deshabilita en Auth y revoca las sesiones de esos usuarios.
const deshabilitarEnAuth = async (auth, uids) => {
  const errores = [];
  for (const uid of uids) {
    try {
      await auth.updateUser(uid, { disabled: true });
      await auth.revokeRefreshTokens(uid);
    } catch (err) {
      errores.push({ uid, error: err.message });
    }
  }
  return { deshabilitados: uids.length - errores.length, errores };
};

module.exports = {
  iniciarSesion, verificarPasswordRest, crearUsuario, desbloquearUsuario, exigirAccion, ACCION_DESBLOQUEAR,
  revisarNombresUsuario, indexarNombresUsuario, revisarInactivosEnAuth, deshabilitarEnAuth, MAX_FALLOS,
};
