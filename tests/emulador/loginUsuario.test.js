// Login con correo o nombre de usuario y nombre de usuario único
// (functions/usuarios/servicio.js) contra los emuladores de Firestore y
// Auth: la contraseña se verifica con la API REST del emulador de Auth y el
// custom token se usa desde el SDK del navegador, como LoginForm.
import process from 'node:process';
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { createRequire } from 'node:module';
import { initializeApp as initializeClientApp, deleteApp } from 'firebase/app';
import { getAuth as getClientAuth, connectAuthEmulator, signInWithCustomToken, signOut } from 'firebase/auth';
import { getFirestore as getClientFirestore, connectFirestoreEmulator, doc, getDoc } from 'firebase/firestore';

const require = createRequire(new URL('../../functions/package.json', import.meta.url));
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const servicio = require('./usuarios/servicio.js');
const permisos = require('./permisos/servicio.js');

const PROYECTO = 'demo-workcraft';
const FIRESTORE = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const AUTH = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
process.env.FIREBASE_AUTH_EMULATOR_HOST = AUTH;

const INCORRECTO = 'Usuario/correo o contraseña incorrectos.';
const DESHABILITADO = 'Tu usuario está deshabilitado. Contacta al administrador.';
const LAB = '/laboratorio/codigoLaboratorio';
const PERMISOS = { permisos: { laboratorio: [LAB] }, permisosGranulares: { [LAB]: { tabla: { visible: true, elements: { btn_editar: true, btn_eliminar: false } } } } };
const YO = { uid: 'yo', nombre: 'Admin' };

let db;
let auth;
let cliente;
const verificarPassword = servicio.verificarPasswordRest('demo');
const login = (data, ahora) => servicio.iniciarSesion(db, auth, data, { verificarPassword, ...(ahora ? { ahora } : {}) });

// Usuario de Auth + perfil + índice (como lo deja crearUsuario).
const crearCuenta = async ({ email, nombreUsuario, password = 'secreto123', ...perfil }) => {
  const { uid } = await auth.createUser({ email, password });
  await db.collection('usuarios').doc(uid).set({ nombreCompleto: nombreUsuario, nombreUsuario, email, rol: 'operador', ...PERMISOS, ...perfil });
  await db.collection('nombres_usuario').doc(nombreUsuario.toLowerCase()).set({ uid, nombreUsuario });
  return uid;
};

// Entra con el token en el SDK del navegador y lee el perfil, como UserContext.
const entrarYLeerPerfil = async (token) => {
  const { user } = await signInWithCustomToken(cliente.auth, token);
  const perfil = (await getDoc(doc(cliente.db, 'usuarios', user.uid))).data();
  await signOut(cliente.auth);
  return { uid: user.uid, permisos: perfil.permisos, permisosGranulares: perfil.permisosGranulares };
};

const rechazo = (code, message) => expect.objectContaining({ code, ...(message ? { message } : {}) });

beforeAll(() => {
  const app = initializeApp({ projectId: PROYECTO }, 'pruebas-login');
  db = getFirestore(app);
  auth = getAuth(app);
  const appCliente = initializeClientApp({ apiKey: 'demo', projectId: PROYECTO, authDomain: `${PROYECTO}.firebaseapp.com` }, 'cliente-login');
  cliente = { app: appCliente, auth: getClientAuth(appCliente), db: getClientFirestore(appCliente) };
  connectAuthEmulator(cliente.auth, `http://${AUTH}`, { disableWarnings: true });
  const [host, puerto] = FIRESTORE.split(':');
  connectFirestoreEmulator(cliente.db, host, Number(puerto));
});
afterAll(() => deleteApp(cliente.app));

beforeEach(async () => {
  await fetch(`http://${FIRESTORE}/emulator/v1/projects/${PROYECTO}/databases/(default)/documents`, { method: 'DELETE' });
  await fetch(`http://${AUTH}/emulator/v1/projects/${PROYECTO}/accounts`, { method: 'DELETE' });
  await db.collection('usuarios').doc('yo').set({ nombreCompleto: 'Admin', rol: 'admin', permisos: {}, permisosGranulares: {} });
});

describe('iniciarSesion: correo o nombre de usuario', () => {
  it('con correo y con nombre de usuario entra el mismo usuario, con los mismos módulos, items y permisos', async () => {
    const uid = await crearCuenta({ email: 'ana@medra.cl', nombreUsuario: 'APerez' });
    const porCorreo = await entrarYLeerPerfil((await login({ identificador: 'ana@medra.cl', password: 'secreto123' })).token);
    const porNombre = await entrarYLeerPerfil((await login({ identificador: 'APerez', password: 'secreto123' })).token);
    expect(porCorreo.uid).toBe(uid);
    expect(porNombre).toEqual(porCorreo);
    expect(porNombre.permisos).toEqual(PERMISOS.permisos);
    expect(porNombre.permisosGranulares).toEqual(PERMISOS.permisosGranulares);
  });

  it('sin distinguir mayúsculas y con espacios alrededor, en los dos casos', async () => {
    const uid = await crearCuenta({ email: 'ana@medra.cl', nombreUsuario: 'APerez' });
    for (const identificador of ['  ANA@Medra.CL ', ' aperez  ', 'APEREZ']) {
      const { token } = await login({ identificador, password: 'secreto123' });
      expect((await entrarYLeerPerfil(token)).uid, identificador).toBe(uid);
    }
  });

  it('acepta `email` como antes (compatibilidad)', async () => {
    const uid = await crearCuenta({ email: 'ana@medra.cl', nombreUsuario: 'aperez' });
    const { token } = await login({ email: 'ana@medra.cl', password: 'secreto123' });
    expect((await entrarYLeerPerfil(token)).uid).toBe(uid);
  });

  it('contraseña incorrecta, usuario inexistente o deshabilitado en Auth: el mismo mensaje', async () => {
    await crearCuenta({ email: 'ana@medra.cl', nombreUsuario: 'aperez' });
    await crearCuenta({ email: 'luis@medra.cl', nombreUsuario: 'lsoto', activo: false });
    const deshabilitado = await crearCuenta({ email: 'eva@medra.cl', nombreUsuario: 'eva' });
    await auth.updateUser(deshabilitado, { disabled: true });
    const intentos = [
      { identificador: 'ana@medra.cl', password: 'otra-clave' },
      { identificador: 'aperez', password: 'otra-clave' },
      { identificador: 'nadie@medra.cl', password: 'secreto123' },
      { identificador: 'nadie', password: 'secreto123' },
      { identificador: 'luis@medra.cl', password: 'otra-clave' }, // inactivo, contraseña incorrecta
      { identificador: 'eva', password: 'secreto123' },
      { identificador: '', password: 'secreto123' },
      { identificador: 'aperez', password: '' },
    ];
    for (const intento of intentos) {
      await expect(login(intento), JSON.stringify(intento)).rejects.toEqual(rechazo('unauthenticated', INCORRECTO));
    }
  });
});

describe('iniciarSesion: cambio de correo confirmado', () => {
  it('el perfil toma el correo de Auth al entrar (no antes); con el anterior ya no entra', async () => {
    const uid = await crearCuenta({ email: 'ana@medra.cl', nombreUsuario: 'aperez' });
    // Lo que hace Firebase cuando el usuario confirma verifyBeforeUpdateEmail.
    await auth.updateUser(uid, { email: 'ana.perez@medra.cl' });
    expect((await db.collection('usuarios').doc(uid).get()).data().email).toBe('ana@medra.cl');
    await expect(login({ identificador: 'ana@medra.cl', password: 'secreto123' })).rejects.toEqual(rechazo('unauthenticated'));
    const { token } = await login({ identificador: 'aperez', password: 'secreto123' });
    expect((await entrarYLeerPerfil(token)).uid).toBe(uid);
    expect((await db.collection('usuarios').doc(uid).get()).data().email).toBe('ana.perez@medra.cl');
    expect((await login({ identificador: 'Ana.Perez@medra.cl', password: 'secreto123' })).token).toBeTruthy();
  });
});

describe('iniciarSesion: usuario inactivo', () => {
  it('con la contraseña correcta informa que está deshabilitado (por correo o por nombre), sin contar como fallo', async () => {
    await crearCuenta({ email: 'luis@medra.cl', nombreUsuario: 'lsoto', activo: false });
    for (let i = 0; i < servicio.MAX_FALLOS + 1; i += 1) {
      await expect(login({ identificador: i % 2 ? 'lsoto' : 'LUIS@medra.cl', password: 'secreto123' })).rejects.toEqual(rechazo('permission-denied', DESHABILITADO));
    }
  });
});

describe('inactivar / reactivar (guardarPermisosUsuario) también en Auth', () => {
  it('inactivar deshabilita la cuenta y revoca sus sesiones; reactivar la habilita', async () => {
    const uid = await crearCuenta({ email: 'ana@medra.cl', nombreUsuario: 'aperez' });
    const antes = Date.now();
    await permisos.guardarPermisosUsuario(db, YO, { uid, datos: { activo: false } }, { auth });
    const cuenta = await auth.getUser(uid);
    expect(cuenta.disabled).toBe(true);
    expect(new Date(cuenta.tokensValidAfterTime).getTime()).toBeGreaterThanOrEqual(Math.floor(antes / 1000) * 1000);
    // Deshabilitada en Auth no se puede verificar la contraseña: mensaje genérico (seguridad primero).
    await expect(login({ identificador: 'aperez', password: 'secreto123' })).rejects.toEqual(rechazo('unauthenticated', INCORRECTO));

    await permisos.guardarPermisosUsuario(db, YO, { uid, datos: { activo: true } }, { auth });
    expect((await auth.getUser(uid)).disabled).toBe(false);
    expect((await entrarYLeerPerfil((await login({ identificador: 'aperez', password: 'secreto123' })).token)).uid).toBe(uid);
  });

  it('un usuario sin cuenta de Auth se inactiva igual', async () => {
    await db.collection('usuarios').doc('legado').set({ nombreCompleto: 'Legado', rol: 'operador', permisos: {}, permisosGranulares: {} });
    await expect(permisos.guardarPermisosUsuario(db, YO, { uid: 'legado', datos: { activo: false } }, { auth })).resolves.toMatchObject({ ok: true });
  });

  it('script: revisa y deshabilita a los inactivos de antes; informa los activos deshabilitados', async () => {
    const viejo = await crearCuenta({ email: 'viejo@medra.cl', nombreUsuario: 'viejo', activo: false });
    const raro = await crearCuenta({ email: 'raro@medra.cl', nombreUsuario: 'raro' });
    await auth.updateUser(raro, { disabled: true });
    await crearCuenta({ email: 'ok@medra.cl', nombreUsuario: 'ok' });
    const r = await servicio.revisarInactivosEnAuth(db, auth);
    expect(r.pendientes.map((u) => u.uid)).toEqual([viejo]);
    expect(r.activosDeshabilitados.map((u) => u.uid)).toEqual([raro]);
    expect((await auth.getUser(viejo)).disabled).toBe(false); // la revisión no escribe
    expect(await servicio.deshabilitarEnAuth(auth, [viejo])).toEqual({ deshabilitados: 1, errores: [] });
    expect((await auth.getUser(viejo)).disabled).toBe(true);
    expect((await servicio.revisarInactivosEnAuth(db, auth)).pendientes).toEqual([]);
  });
});

describe('iniciarSesion: bloqueo por intentos fallidos', () => {
  it('5 fallos bloquean la cuenta 15 minutos, entrando con el nombre o con el correo', async () => {
    const uid = await crearCuenta({ email: 'ana@medra.cl', nombreUsuario: 'aperez' });
    const t0 = Date.now();
    for (let i = 0; i < servicio.MAX_FALLOS; i += 1) {
      await expect(login({ identificador: i % 2 ? 'aperez' : 'ANA@medra.cl', password: 'mala' }, t0)).rejects.toEqual(rechazo('unauthenticated'));
    }
    // Se ve en el perfil (Lista de usuarios).
    expect((await db.collection('usuarios').doc(uid).get()).data().bloqueoLoginHasta.toMillis()).toBe(t0 + 15 * 60 * 1000);
    // Bloqueada: ni con la contraseña correcta, por ninguno de los dos.
    await expect(login({ identificador: 'ana@medra.cl', password: 'secreto123' }, t0 + 1000)).rejects.toEqual(rechazo('resource-exhausted'));
    await expect(login({ identificador: 'aperez', password: 'secreto123' }, t0 + 1000)).rejects.toEqual(rechazo('resource-exhausted'));
    // Pasado el bloqueo entra, y el contador vuelve a cero.
    const { token } = await login({ identificador: 'aperez', password: 'secreto123' }, t0 + 16 * 60 * 1000);
    expect((await entrarYLeerPerfil(token)).uid).toBe(uid);
    expect((await db.collection('usuarios').doc(uid).get()).data().bloqueoLoginHasta).toBeUndefined();
    await expect(login({ identificador: 'aperez', password: 'mala' }, t0 + 17 * 60 * 1000)).rejects.toEqual(rechazo('unauthenticated'));
  });

  it('un identificador inexistente se bloquea igual (no revela que no existe)', async () => {
    const t0 = Date.now();
    for (let i = 0; i < servicio.MAX_FALLOS; i += 1) {
      await expect(login({ identificador: 'nadie', password: 'mala' }, t0)).rejects.toEqual(rechazo('unauthenticated'));
    }
    await expect(login({ identificador: 'nadie', password: 'mala' }, t0)).rejects.toEqual(rechazo('resource-exhausted'));
  });
});

describe('desbloquearUsuario (Lista de usuarios, btn_desbloquear)', () => {
  const LISTADO = '/administracion/listadoUsuario';
  const bloquear = async () => {
    const t0 = Date.now();
    for (let i = 0; i < servicio.MAX_FALLOS; i += 1) await login({ identificador: 'aperez', password: 'mala' }, t0).catch(() => {});
    await expect(login({ identificador: 'aperez', password: 'secreto123' })).rejects.toEqual(rechazo('resource-exhausted'));
  };
  const operador = (uid, elements) => db.collection('usuarios').doc(uid).set({
    nombreCompleto: uid, rol: 'operador', permisos: { administracion: [LISTADO] },
    permisosGranulares: { [LISTADO]: { tabla_usuarios: { visible: true, elements } } },
  });

  it('quita el bloqueo, deja auditoría y el usuario entra de inmediato', async () => {
    const uid = await crearCuenta({ email: 'ana@medra.cl', nombreUsuario: 'aperez' });
    await bloquear();
    const por = await servicio.exigirAccion(db, 'yo', servicio.ACCION_DESBLOQUEAR);
    await servicio.desbloquearUsuario(db, por, { uid });
    expect((await db.collection('usuarios').doc(uid).get()).data().bloqueoLoginHasta).toBeUndefined();
    const logs = (await db.collection(`usuarios/${uid}/logs`).get()).docs.map((d) => d.data());
    expect(logs).toEqual([expect.objectContaining({ accion: 'DESBLOQUEO_LOGIN', usuarioUid: 'yo' })]);
    const { token } = await login({ identificador: 'ana@medra.cl', password: 'secreto123' });
    expect((await entrarYLeerPerfil(token)).uid).toBe(uid);
  });

  it('puede quien tiene la acción granular; sin ella, o sin el ítem, no', async () => {
    await operador('con', { btn_desbloquear: true });
    await operador('sin', { btn_desbloquear: false });
    await db.collection('usuarios').doc('otro').set({ nombreCompleto: 'otro', rol: 'operador', permisos: {}, permisosGranulares: {} });
    await expect(servicio.exigirAccion(db, 'con', servicio.ACCION_DESBLOQUEAR)).resolves.toMatchObject({ uid: 'con' });
    await expect(servicio.exigirAccion(db, 'sin', servicio.ACCION_DESBLOQUEAR)).rejects.toEqual(rechazo('permission-denied'));
    await expect(servicio.exigirAccion(db, 'otro', servicio.ACCION_DESBLOQUEAR)).rejects.toEqual(rechazo('permission-denied'));
    await expect(servicio.exigirAccion(db, undefined, servicio.ACCION_DESBLOQUEAR)).rejects.toEqual(rechazo('unauthenticated'));
  });
});

describe('crearUsuario: nombre de usuario obligatorio y único', () => {
  const datos = { nombreCompleto: 'Ana Pérez', nombreUsuario: 'APerez', email: 'Ana@Medra.cl', password: 'secreto1', rol: 'operador' };

  it('crea la cuenta, el perfil base y el índice; luego entra con el nombre', async () => {
    const { uid } = await servicio.crearUsuario(db, auth, YO, datos);
    const perfil = (await db.collection('usuarios').doc(uid).get()).data();
    expect(perfil).toMatchObject({ nombreCompleto: 'Ana Pérez', nombreUsuario: 'APerez', email: 'ana@medra.cl', rol: 'operador', permisos: {}, permisosGranulares: {}, passwordChanged: false, creadoPor: 'yo' });
    expect((await db.collection('nombres_usuario').doc('aperez').get()).data()).toEqual({ uid, nombreUsuario: 'APerez' });
    const { token } = await login({ identificador: 'aperez', password: 'secreto1' });
    expect((await entrarYLeerPerfil(token)).uid).toBe(uid);
  });

  it('un nombre repetido (sin distinguir mayúsculas) falla sin crear la cuenta de Auth', async () => {
    await servicio.crearUsuario(db, auth, YO, datos);
    await expect(servicio.crearUsuario(db, auth, YO, { ...datos, nombreUsuario: ' aperez ', email: 'otra@medra.cl' }))
      .rejects.toEqual(rechazo('already-exists', 'Ese nombre de usuario ya está en uso.'));
    await expect(auth.getUserByEmail('otra@medra.cl')).rejects.toMatchObject({ code: 'auth/user-not-found' });
  });

  it('con "@", con espacios o vacío falla', async () => {
    for (const nombreUsuario of ['ana@medra.cl', 'ana perez', '', '   ']) {
      await expect(servicio.crearUsuario(db, auth, YO, { ...datos, nombreUsuario }), nombreUsuario).rejects.toEqual(rechazo('invalid-argument'));
    }
    expect((await auth.listUsers()).users).toHaveLength(0);
  });

  it('un correo ya registrado falla con su mensaje', async () => {
    await servicio.crearUsuario(db, auth, YO, datos);
    await expect(servicio.crearUsuario(db, auth, YO, { ...datos, nombreUsuario: 'otro' })).rejects.toEqual(rechazo('already-exists', 'Ese correo ya está registrado.'));
  });
});

describe('editar nombre de usuario (guardarPermisosUsuario)', () => {
  it('cambia el nombre y su índice; el nombre anterior queda libre y se entra con el nuevo', async () => {
    const uid = await crearCuenta({ email: 'ana@medra.cl', nombreUsuario: 'aperez' });
    await permisos.guardarPermisosUsuario(db, YO, { uid, datos: { nombreUsuario: 'ana.perez' } });
    expect((await db.collection('usuarios').doc(uid).get()).data().nombreUsuario).toBe('ana.perez');
    expect((await db.collection('nombres_usuario').doc('aperez').get()).exists).toBe(false);
    expect((await db.collection('nombres_usuario').doc('ana.perez').get()).data()).toEqual({ uid, nombreUsuario: 'ana.perez' });
    await expect(login({ identificador: 'aperez', password: 'secreto123' })).rejects.toEqual(rechazo('unauthenticated'));
    expect((await entrarYLeerPerfil((await login({ identificador: 'Ana.Perez', password: 'secreto123' })).token)).uid).toBe(uid);
  });

  it('un nombre en uso por otro, o con "@" o espacios, no se guarda', async () => {
    await crearCuenta({ email: 'ana@medra.cl', nombreUsuario: 'aperez' });
    const luis = await crearCuenta({ email: 'luis@medra.cl', nombreUsuario: 'lsoto' });
    await expect(permisos.guardarPermisosUsuario(db, YO, { uid: luis, datos: { nombreUsuario: 'APEREZ' } })).rejects.toEqual(rechazo('already-exists', 'Ese nombre de usuario ya está en uso.'));
    await expect(permisos.guardarPermisosUsuario(db, YO, { uid: luis, datos: { nombreUsuario: 'l@soto' } })).rejects.toEqual(rechazo('invalid-argument'));
    await expect(permisos.guardarPermisosUsuario(db, YO, { uid: luis, datos: { nombreUsuario: 'l soto' } })).rejects.toEqual(rechazo('invalid-argument'));
    expect((await db.collection('usuarios').doc(luis).get()).data().nombreUsuario).toBe('lsoto');
  });

  it('cambiar solo mayúsculas mantiene el índice; un nombre antiguo fuera de formato no impide editar lo demás', async () => {
    const uid = await crearCuenta({ email: 'ana@medra.cl', nombreUsuario: 'aperez' });
    await permisos.guardarPermisosUsuario(db, YO, { uid, datos: { nombreUsuario: 'APerez' } });
    expect((await db.collection('nombres_usuario').doc('aperez').get()).data()).toEqual({ uid, nombreUsuario: 'APerez' });
    await db.collection('usuarios').doc('viejo').set({ nombreCompleto: 'Viejo', nombreUsuario: 'viejo@medra.cl', rol: 'operador', permisos: {}, permisosGranulares: {} });
    await expect(permisos.guardarPermisosUsuario(db, YO, { uid: 'viejo', datos: { nombreCompleto: 'Viejo Uno', nombreUsuario: 'viejo@medra.cl' } })).resolves.toMatchObject({ ok: true });
  });
});

describe('revisión e índice de los usuarios existentes', () => {
  it('informa vacíos, con "@", con espacios y repetidos; indexa solo los válidos', async () => {
    const set = (uid, nombreUsuario) => db.collection('usuarios').doc(uid).set({ nombreCompleto: uid, ...(nombreUsuario === undefined ? {} : { nombreUsuario }) });
    await Promise.all([set('a', 'ana'), set('b', 'Luis'), set('c', 'luis '), set('d', ''), set('e'), set('f', 'x@y.cl'), set('g', 'mar ta')]);
    const { total, entradas, problemas } = await servicio.revisarNombresUsuario(db);
    expect(total).toBe(8); // + el admin del beforeEach, sin nombre
    expect(entradas).toEqual([{ normalizado: 'ana', uid: 'a', nombreUsuario: 'ana' }]);
    expect(problemas.map((p) => p.uid).sort()).toEqual(['b', 'c', 'd', 'e', 'f', 'g', 'yo']);
    expect(problemas.find((p) => p.uid === 'b').motivo).toMatch(/repetido/);
    const r = await servicio.indexarNombresUsuario(db, entradas);
    expect(r).toEqual({ escritas: 1, omitidas: [] });
    expect((await db.collection('usuarios').doc('b').get()).data().nombreUsuario).toBe('Luis'); // no toca usuarios
  });
});
