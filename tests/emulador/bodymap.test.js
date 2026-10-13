// Bodymap contra el emulador: el Maestro "Zonas por diagnóstico" que
// mantienen el trigger (functions/bodymap/servicio.js → aplicarCambioGestion)
// y el script inicial (recontar), y las reglas de maestros_zonas_diagnostico.
import process from 'node:process';
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { createRequire } from 'node:module';
import { initializeApp as initCliente, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { getFirestore as getCliente, connectFirestoreEmulator, doc, getDoc, setDoc, updateDoc, collection, addDoc } from 'firebase/firestore';

const require = createRequire(new URL('../../functions/package.json', import.meta.url));
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { aplicarCambioGestion, recontar, COLECCION } = require('./bodymap/servicio.js');
const { idDescripcion } = require('./bodymap/nucleo.mjs');

const PROYECTO = 'demo-workcraft';
const FIRESTORE = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const AUTH = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
let db;
const apps = [];

const entrada = async (texto) => (await db.collection(COLECCION).doc(idDescripcion(texto)).get()).data();
const gestion = (descripcion) => ({ descripcion, nombre: 'PACIENTE' });
const vaciar = () => fetch(`http://${FIRESTORE}/emulator/v1/projects/${PROYECTO}/databases/(default)/documents`, { method: 'DELETE' });

beforeAll(() => { db = getFirestore(initializeApp({ projectId: PROYECTO }, 'pruebas-bodymap')); });
afterAll(async () => { await Promise.all(apps.map((a) => deleteApp(a))); });

describe('trigger: contador y descripciones nuevas', () => {
  beforeEach(vaciar);

  it('una descripción nueva aparece Sugerida (o Sin asignar) con su contador', async () => {
    await aplicarCambioGestion(db, null, gestion('Ruptura  manguito rotadores'));
    await aplicarCambioGestion(db, null, gestion('RUPTURA MANGUITO ROTADORES'));
    expect(await entrada('ruptura manguito rotadores')).toMatchObject({
      descripcion: 'RUPTURA MANGUITO ROTADORES', zonas: ['hombro'], estado: 'sugerida', gestiones: 2, lado: 'no_especificado',
    });
    await aplicarCambioGestion(db, null, gestion('ARTROSCOPIA DIAGNOSTICA'));
    expect(await entrada('ARTROSCOPIA DIAGNOSTICA')).toMatchObject({ zonas: [], estado: 'sin_asignar', gestiones: 1 });
  });

  it('editar la descripción resta a la anterior y suma a la nueva; eliminar resta; con 0 se mantiene con su zona', async () => {
    await aplicarCambioGestion(db, null, gestion('LUXOFRACTURA TOBILLO'));
    await db.collection(COLECCION).doc(idDescripcion('LUXOFRACTURA TOBILLO')).update({ zonas: ['tobillo'], lado: 'derecho', estado: 'confirmada' });
    await aplicarCambioGestion(db, gestion('LUXOFRACTURA TOBILLO'), gestion('ENDOPROTESIS TOTAL DE CADERA'));
    expect((await entrada('LUXOFRACTURA TOBILLO'))).toMatchObject({ gestiones: 0, zonas: ['tobillo'], lado: 'derecho', estado: 'confirmada' });
    expect((await entrada('ENDOPROTESIS TOTAL DE CADERA')).gestiones).toBe(1);
    await aplicarCambioGestion(db, gestion('ENDOPROTESIS TOTAL DE CADERA'), null);
    expect((await entrada('ENDOPROTESIS TOTAL DE CADERA')).gestiones).toBe(0);
    await aplicarCambioGestion(db, null, gestion('LUXOFRACTURA TOBILLO')); // vuelve a usarse
    expect((await entrada('LUXOFRACTURA TOBILLO'))).toMatchObject({ gestiones: 1, estado: 'confirmada' });
  });

  it('cambios que no tocan la descripción (o solo su formato) no cuentan; "P" y vacías se excluyen', async () => {
    await aplicarCambioGestion(db, null, gestion('Rodilla'));
    expect((await aplicarCambioGestion(db, gestion('Rodilla'), { ...gestion(' RODILLA '), nombre: 'OTRO' })).cambio).toBe(false);
    expect((await entrada('RODILLA')).gestiones).toBe(1);
    await aplicarCambioGestion(db, null, gestion('P'));
    await aplicarCambioGestion(db, null, gestion(''));
    expect((await db.collection(COLECCION).get()).size).toBe(1);
  });
});

describe('script inicial (recontar)', () => {
  beforeEach(vaciar);
  const crearGestion = (ruta, descripcion) => db.doc(`implantes_gestiones/${ruta}`).set(gestion(descripcion));

  it('simula sin escribir; al aplicar crea las que faltan con sugerencia y fija los contadores sin tocar zonas confirmadas', async () => {
    await crearGestion('2026/mes/10/dia/01/admision/1/empresa/A/detalles/g1', 'RUPTURA MANGUITO ROTADORES');
    await crearGestion('2026/mes/10/dia/02/admision/2/empresa/A/detalles/g2', 'Ruptura manguito rotadores');
    await crearGestion('2026/mes/10/dia/02/admision/2/empresa/B/detalles/g3', 'RETIRO MATERIAL OSTEOSINTESIS');
    await crearGestion('2026/mes/10/dia/03/admision/3/empresa/A/detalles/g4', 'P');
    // Ya existía, confirmada a mano, con un contador desfasado; y otra sin gestiones.
    await db.collection(COLECCION).doc(idDescripcion('RETIRO MATERIAL OSTEOSINTESIS')).set({ descripcion: 'RETIRO MATERIAL OSTEOSINTESIS', zonas: ['muslo'], lado: 'no_especificado', estado: 'confirmada', gestiones: 7 });
    await db.collection(COLECCION).doc(idDescripcion('OTRA')).set({ descripcion: 'OTRA', zonas: ['pie'], lado: 'no_especificado', estado: 'confirmada', gestiones: 3 });

    const sim = await recontar(db);
    expect(sim).toMatchObject({ totalGestiones: 4, excluidas: 1 });
    expect(sim.filas.find((f) => f.descripcion === 'RUPTURA MANGUITO ROTADORES')).toMatchObject({ gestiones: 2, nueva: true, zonas: ['hombro'] });
    expect(await entrada('RUPTURA MANGUITO ROTADORES')).toBeUndefined(); // no escribió

    await recontar(db, { aplicar: true });
    expect(await entrada('RUPTURA MANGUITO ROTADORES')).toMatchObject({ gestiones: 2, estado: 'sugerida', zonas: ['hombro'] });
    expect(await entrada('RETIRO MATERIAL OSTEOSINTESIS')).toMatchObject({ gestiones: 1, estado: 'confirmada', zonas: ['muslo'] });
    expect(await entrada('OTRA')).toMatchObject({ gestiones: 0, zonas: ['pie'] });
    // Idempotente.
    await recontar(db, { aplicar: true });
    expect((await entrada('RUPTURA MANGUITO ROTADORES')).gestiones).toBe(2);
  });
});

describe('reglas de maestros_zonas_diagnostico', () => {
  const sembrar = (ruta, datos) => db.doc(ruta).set(datos);
  const sesion = async (nombre, perfil) => {
    const app = initCliente({ apiKey: 'demo', projectId: PROYECTO }, `${nombre}-${Date.now()}`);
    apps.push(app);
    const auth = getAuth(app);
    connectAuthEmulator(auth, `http://${AUTH}`, { disableWarnings: true });
    const cdb = getCliente(app);
    const [host, puerto] = FIRESTORE.split(':');
    connectFirestoreEmulator(cdb, host, Number(puerto));
    const { user } = await createUserWithEmailAndPassword(auth, `${nombre}-${Date.now()}@prueba.cl`, 'secreto123');
    await sembrar(`usuarios/${user.uid}`, perfil);
    return cdb;
  };
  const ID = idDescripcion('RUPTURA MANGUITO ROTADORES');
  const RUTA = '/maestros/zonasDiagnostico';
  let admin; let adminSinItem; let editor; let lector;

  beforeAll(async () => {
    await vaciar();
    await sembrar(`${COLECCION}/${ID}`, { descripcion: 'RUPTURA MANGUITO ROTADORES', zonas: ['hombro'], lado: 'no_especificado', estado: 'sugerida', gestiones: 33 });
    // `admin` = Desarrollador (acceso total); el Administrador se rige por sus permisos.
    admin = await sesion('admin', { rol: 'dev', permisos: {}, permisosGranulares: {} });
    adminSinItem = await sesion('adminsinitem', { rol: 'admin', permisos: {}, permisosGranulares: {} });
    editor = await sesion('editor', { rol: 'operador', permisos: { maestros: [RUTA] }, permisosGranulares: { [RUTA]: { tabla_datos: { visible: true, elements: { action_editar: true } } } } });
    lector = await sesion('lector', { rol: 'operador', permisos: { implantes: ['/implantes/gestionImplantes'] }, permisosGranulares: {} });
  });

  it('lo lee cualquiera que ve gestiones', async () => {
    expect((await getDoc(doc(lector, COLECCION, ID))).data().zonas).toEqual(['hombro']);
  });

  it('solo quien tiene "Editar" del Maestro cambia zonas, lado y estado', async () => {
    const cambio = { zonas: ['hombro'], lado: 'derecho', estado: 'confirmada', actualizadoPor: 'X' };
    await expect(updateDoc(doc(lector, COLECCION, ID), cambio)).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(updateDoc(doc(editor, COLECCION, ID), cambio)).resolves.toBeUndefined();
    await expect(updateDoc(doc(admin, COLECCION, ID), { ...cambio, lado: 'bilateral' })).resolves.toBeUndefined();
    await expect(updateDoc(doc(adminSinItem, COLECCION, ID), cambio)).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(addDoc(collection(editor, COLECCION, ID, 'logs'), { accion: 'EDICION' })).resolves.toBeDefined();
    await expect(addDoc(collection(lector, COLECCION, ID, 'logs'), { accion: 'EDICION' })).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('nadie toca el contador ni crea o borra entradas desde el navegador; valores fuera de lista se rechazan', async () => {
    await expect(updateDoc(doc(admin, COLECCION, ID), { gestiones: 0 })).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(setDoc(doc(admin, COLECCION, 'NUEVA'), { descripcion: 'NUEVA', zonas: [], lado: 'no_especificado', estado: 'sin_asignar' })).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(updateDoc(doc(admin, COLECCION, ID), { estado: 'otra' })).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(updateDoc(doc(admin, COLECCION, ID), { lado: 'arriba' })).rejects.toMatchObject({ code: 'permission-denied' });
  });
});
