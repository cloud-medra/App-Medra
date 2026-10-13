// Reglas de usuarios/{uid} y plantillas_permisos (permisos por centro de
// costo). Rol, permisos, permisosGranulares, centroCostoId, excepciones y
// nombreUsuario (único) solo los escriben las Cloud Functions; desde el
// navegador cada usuario sigue pudiendo editar lo suyo (tema, contraseña,
// datos, orden del menú) y un admin los datos de los demás.
import process from 'node:process';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

const PROYECTO = 'demo-workcraft';
const FIRESTORE = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const AUTH = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
const apps = [];

// Escribe sin reglas (como el Admin SDK de las funciones): token "owner".
const valor = (v) => {
  if (v === null) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return { integerValue: String(v) };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(valor) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, valor(x)])) } };
};
const sembrar = async (ruta, datos) => {
  const r = await fetch(`http://${FIRESTORE}/v1/projects/${PROYECTO}/databases/(default)/documents/${ruta}`, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: valor(datos).mapValue.fields }),
  });
  if (!r.ok) throw new Error(`sembrar ${ruta}: ${r.status} ${await r.text()}`);
};

// Una sesión del navegador con su propio usuario de Auth.
const sesion = async (nombre, perfil) => {
  const app = initializeApp({ apiKey: 'demo', projectId: PROYECTO, authDomain: `${PROYECTO}.firebaseapp.com` }, `${nombre}-${Date.now()}`);
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${AUTH}`, { disableWarnings: true });
  const db = getFirestore(app);
  const [host, puerto] = FIRESTORE.split(':');
  connectFirestoreEmulator(db, host, Number(puerto));
  const { user } = await createUserWithEmailAndPassword(auth, `${nombre}-${Date.now()}@prueba.cl`, 'secreto123');
  await sembrar(`usuarios/${user.uid}`, perfil);
  return { db, uid: user.uid };
};

const PERMISOS = { laboratorio: ['/laboratorio/codigoLaboratorio'] };
let admin;
let operador;

beforeAll(async () => {
  admin = await sesion('admin', { rol: 'admin', nombreCompleto: 'Admin', permisos: {}, permisosGranulares: {} });
  operador = await sesion('operador', { rol: 'operador', nombreCompleto: 'Operador', permisos: PERMISOS, permisosGranulares: {} });
  await sembrar('plantillas_permisos/lab', { permisos: PERMISOS, permisosGranulares: {} });
});
afterAll(async () => { await Promise.all(apps.map((a) => deleteApp(a))); });

const usuario = (s, uid = s.uid) => doc(s.db, 'usuarios', uid);

describe('usuarios: lo que cada uno puede editar de sí mismo', () => {
  it('tema, cambio de contraseña, datos de perfil, privacidad y orden del menú siguen funcionando', async () => {
    await expect(updateDoc(usuario(operador), { modoPantalla: 'oscuro' })).resolves.toBeUndefined();
    await expect(updateDoc(usuario(operador), { nombreCompleto: 'Operador Uno', passwordChanged: true })).resolves.toBeUndefined();
    await expect(updateDoc(usuario(operador), { nombreMostrar: 'nombre', ordenModulos: ['laboratorio'] })).resolves.toBeUndefined();
    await expect(updateDoc(usuario(admin), { modoPantalla: 'oscuro', passwordChanged: true })).resolves.toBeUndefined();
  });

  it('nadie puede darse rol, permisos, centro de costo ni excepciones desde el navegador', async () => {
    const intentos = [
      { rol: 'admin' },
      { permisos: { administracion: ['/administracion/listadoUsuario'] } },
      { permisosGranulares: { '/administracion/listadoUsuario': {} } },
      { centroCostoId: 'lab' },
      { excepciones: { agregados: ['v|/x'], quitados: [] } },
      { nombreUsuario: 'otro' },
      { bloqueoLoginHasta: null },
      // El correo lo copia iniciarSesion desde Auth tras confirmar el cambio.
      { email: 'otro@prueba.cl' },
    ];
    for (const cambio of intentos) {
      await expect(updateDoc(usuario(operador), cambio), JSON.stringify(cambio)).rejects.toMatchObject({ code: 'permission-denied' });
    }
    // Tampoco un admin escribe el permiso efectivo o el rol directamente: va por las funciones.
    await expect(updateDoc(usuario(admin, operador.uid), { permisos: {} })).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(updateDoc(usuario(admin), { rol: 'operador' })).rejects.toMatchObject({ code: 'permission-denied' });
    // El nombre de usuario es único: solo por las funciones (índice nombres_usuario).
    await expect(updateDoc(usuario(admin, operador.uid), { nombreUsuario: 'otro' })).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('un admin edita los datos de otro; un operador no', async () => {
    await expect(updateDoc(usuario(admin, operador.uid), { nombreCompleto: 'Renombrado' })).resolves.toBeUndefined();
    await expect(updateDoc(usuario(operador, admin.uid), { nombreCompleto: 'X' })).rejects.toMatchObject({ code: 'permission-denied' });
  });
});

describe('usuarios inactivos: un token ya emitido no sirve', () => {
  it('con la sesión abierta, un inactivo solo lee su propio perfil; nada más', async () => {
    const inactivo = await sesion('inactivo', { rol: 'admin', nombreCompleto: 'Inactivo', activo: false, permisos: PERMISOS, permisosGranulares: {} });
    await expect(getDoc(usuario(inactivo))).resolves.toBeTruthy();
    await expect(getDoc(usuario(inactivo, operador.uid))).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(getDoc(doc(inactivo.db, 'plantillas_permisos', 'lab'))).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(updateDoc(usuario(inactivo), { modoPantalla: 'oscuro' })).rejects.toMatchObject({ code: 'permission-denied' });
    // Los activos, igual que antes (con y sin el campo `activo`).
    await expect(getDoc(usuario(operador, inactivo.uid))).resolves.toBeTruthy();
    const conCampo = await sesion('activo', { rol: 'operador', nombreCompleto: 'Activo', activo: true, permisos: {}, permisosGranulares: {} });
    await expect(getDoc(usuario(conCampo, operador.uid))).resolves.toBeTruthy();
  });
});

describe('usuarios: crear (Crear Usuario)', () => {
  it('el documento base lo crea la función crearUsuario: nadie lo crea desde el navegador (ni admin)', async () => {
    await expect(setDoc(doc(admin.db, 'usuarios', 'nuevo1'), { nombreCompleto: 'Nuevo', rol: 'operador', permisos: {}, permisosGranulares: {} })).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(setDoc(doc(operador.db, 'usuarios', 'nuevo4'), { rol: 'operador', permisos: {}, permisosGranulares: {} })).rejects.toMatchObject({ code: 'permission-denied' });
  });
});

describe('nombres_usuario e intentos_login: solo las funciones', () => {
  it('nadie los lee ni los escribe desde el navegador (no se revela qué usuarios existen)', async () => {
    await sembrar('nombres_usuario/operador', { uid: 'x', nombreUsuario: 'operador' });
    for (const s of [admin, operador]) {
      await expect(getDoc(doc(s.db, 'nombres_usuario', 'operador'))).rejects.toMatchObject({ code: 'permission-denied' });
      await expect(setDoc(doc(s.db, 'nombres_usuario', 'libre'), { uid: s.uid, nombreUsuario: 'libre' })).rejects.toMatchObject({ code: 'permission-denied' });
      await expect(getDoc(doc(s.db, 'intentos_login', 'x'))).rejects.toMatchObject({ code: 'permission-denied' });
      await expect(setDoc(doc(s.db, 'intentos_login', 'x'), { fallos: 0 })).rejects.toMatchObject({ code: 'permission-denied' });
    }
  });
});

describe('plantillas y auditoría', () => {
  it('las plantillas las lee solo un admin y nadie las escribe desde el navegador', async () => {
    expect((await getDoc(doc(admin.db, 'plantillas_permisos', 'lab'))).exists()).toBe(true);
    await expect(getDoc(doc(operador.db, 'plantillas_permisos', 'lab'))).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(setDoc(doc(admin.db, 'plantillas_permisos', 'lab'), { permisos: {} })).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('la auditoría de permisos no se escribe desde el navegador', async () => {
    await expect(setDoc(doc(admin.db, 'usuarios', operador.uid, 'logs', 'l1'), { accion: 'X' })).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(setDoc(doc(admin.db, 'plantillas_permisos', 'lab', 'logs', 'l1'), { accion: 'X' })).rejects.toMatchObject({ code: 'permission-denied' });
  });
});

describe('maestros_codigos: Maestros → Códigos o Implantes → Códigos', () => {
  it('escribe quien tiene Maestros (como antes) o el ítem Implantes → Códigos; otro ítem de Implantes no', async () => {
    const conImplantesCodigos = await sesion('implcod', { rol: 'operador', permisos: { implantes: ['/implantes/codigosImplantes'] }, permisosGranulares: {} });
    const conOtroDeImplantes = await sesion('implges', { rol: 'operador', permisos: { implantes: ['/implantes/gestionImplantes'] }, permisosGranulares: {} });
    const conMaestros = await sesion('maes', { rol: 'operador', permisos: { maestros: ['/maestros/codigosMaestros'] }, permisosGranulares: {} });
    const codigo = { referencia: 'REF-1', codigo: 'C-1', empresa: 'ACME' };
    await expect(setDoc(doc(conImplantesCodigos.db, 'maestros_codigos', 'c1'), codigo)).resolves.toBeUndefined();
    await expect(setDoc(doc(conMaestros.db, 'maestros_codigos', 'c2'), codigo)).resolves.toBeUndefined();
    await expect(setDoc(doc(conOtroDeImplantes.db, 'maestros_codigos', 'c3'), codigo)).rejects.toMatchObject({ code: 'permission-denied' });
    // Leer: cualquiera autenticado (lo usan Cargas y Consignación).
    expect((await getDoc(doc(conOtroDeImplantes.db, 'maestros_codigos', 'c1'))).exists()).toBe(true);
  });
});

describe('admisiones_gestionadas_implantes: solo la escribe el backend', () => {
  it('cualquiera autenticado la lee; nadie la escribe desde el navegador (ni admin)', async () => {
    await sembrar('admisiones_gestionadas_implantes/123', { admision: 123, estado: 'gestionada' });
    expect((await getDoc(doc(operador.db, 'admisiones_gestionadas_implantes', '123'))).data().estado).toBe('gestionada');
    await expect(setDoc(doc(admin.db, 'admisiones_gestionadas_implantes', '123'), { estado: 'cargada' })).rejects.toMatchObject({ code: 'permission-denied' });
  });
});

describe('maestros_descripciones_reporte: switches desde el Maestro y acción rápida de Reporte Info', () => {
  const ID = 'CESAREA';
  it('el Maestro cambia los dos switches; Reporte Info solo oculta en su módulo; sin permiso, nada', async () => {
    const editor = await sesion('editorDesc', { rol: 'operador', permisos: { maestros: ['/maestros/descripcionesOcultas'] }, permisosGranulares: { '/maestros/descripcionesOcultas': {} } });
    const reporte = await sesion('reporteImpl', { rol: 'operador', permisos: { implantes: ['/implantes/reportesInfo'] }, permisosGranulares: { '/implantes/reportesInfo': {} } });
    const sinAccion = await sesion('reporteSinAccion', { rol: 'operador', permisos: { implantes: ['/implantes/reportesInfo'] }, permisosGranulares: { '/implantes/reportesInfo': { filas_ocultas: { elements: { action_ocultarDescripcion: false } } } } });
    await sembrar(`maestros_descripciones_reporte/${ID}`, { descripcion: 'CESAREA', filas: 3, ocultaImplantes: false, ocultaDocumentos: false });
    const ref = (s) => doc(s.db, 'maestros_descripciones_reporte', ID);
    expect((await getDoc(ref(operador))).data().filas).toBe(3);
    await expect(updateDoc(ref(editor), { ocultaImplantes: true, ocultaDocumentos: true })).resolves.toBeUndefined();
    await expect(updateDoc(ref(editor), { ocultaImplantes: false, ocultaDocumentos: false })).resolves.toBeUndefined();
    await expect(updateDoc(ref(editor), { filas: 99 })).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(updateDoc(ref(reporte), { ocultaImplantes: true })).resolves.toBeUndefined();
    await expect(updateDoc(ref(reporte), { ocultaImplantes: false })).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(updateDoc(ref(reporte), { ocultaDocumentos: true })).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(updateDoc(ref(sinAccion), { ocultaImplantes: true })).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(updateDoc(ref(operador), { ocultaDocumentos: true })).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(setDoc(doc(editor.db, 'maestros_descripciones_reporte', 'NUEVA'), { descripcion: 'NUEVA' })).rejects.toMatchObject({ code: 'permission-denied' });
  });
});
