// Notas del panel (administracion_notas) contra el emulador: cada rol solo
// lee las notas dirigidas a él (rolesVisibles), el Desarrollador lee todas,
// la consulta sin filtro se rechaza, las escrituras exigen al menos un rol
// válido, y la migración deja visibles para todos las notas existentes.
import process from 'node:process';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'node:module';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import {
  getFirestore, connectFirestoreEmulator, collection, query, where, getDocs,
  doc, getDoc, setDoc, updateDoc,
} from 'firebase/firestore';
import { consultaNotas } from '../../src/components/modulos/administracion/notasAdmin/notasConfig.js';

const require = createRequire(new URL('../../functions/package.json', import.meta.url));
const adminApp = require('firebase-admin/app');
const { getFirestore: getFirestoreAdmin } = require('firebase-admin/firestore');
const { migrarRolesNotas } = require('./scripts/migrarRolesNotas.js');

const PROYECTO = 'demo-workcraft';
const FIRESTORE = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const AUTH = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
const COL = 'administracion_notas';
const apps = [];
let adminDb;
const DENEGADO = { code: 'permission-denied' };

const sesion = async (nombre, perfil) => {
  const app = initializeApp({ apiKey: 'demo', projectId: PROYECTO, authDomain: `${PROYECTO}.firebaseapp.com` }, `${nombre}-${Date.now()}`);
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${AUTH}`, { disableWarnings: true });
  const db = getFirestore(app);
  const [host, puerto] = FIRESTORE.split(':');
  connectFirestoreEmulator(db, host, Number(puerto));
  const { user } = await createUserWithEmailAndPassword(auth, `${nombre}-${Date.now()}@prueba.cl`, 'secreto123');
  await adminDb.doc(`usuarios/${user.uid}`).set(perfil);
  return { db, perfil };
};

// Lo mismo que hace useNotasPanel: la consulta según el rol.
const leerNotas = async ({ db, perfil }) => {
  const { restricciones } = consultaNotas(perfil);
  const snap = await getDocs(query(collection(db, COL), ...restricciones));
  return snap.docs.map((d) => d.id).sort();
};

const NOTAS = {
  todos: ['admin', 'operador', 'encargado'],
  soloAdmin: ['admin'],
  soloOperador: ['operador'],
  soloEncargado: ['encargado'],
  adminYEncargado: ['admin', 'encargado'],
};
const s = {};

beforeAll(async () => {
  adminDb = getFirestoreAdmin(adminApp.initializeApp({ projectId: PROYECTO }, 'pruebas-notas'));
  await fetch(`http://${FIRESTORE}/emulator/v1/projects/${PROYECTO}/databases/(default)/documents`, { method: 'DELETE' });
  await Promise.all(Object.entries(NOTAS).map(([id, rolesVisibles], orden) => adminDb.doc(`${COL}/${id}`).set({
    titulo: id, tipo: 'texto', contenido: id, orden, rolesVisibles,
  })));
  s.admin = await sesion('admin', { rol: 'admin', permisos: {} });
  s.operador = await sesion('operador', { rol: 'operador', permisos: {} });
  s.encargado = await sesion('encargado', { rol: 'encargado', permisos: { administracion: ['/administracion/notasAdmin'] } });
  s.dev = await sesion('dev', { rol: 'dev', permisos: {} });
  s.sinRol = await sesion('sinrol', { permisos: {} });
});
afterAll(async () => { await Promise.all(apps.map((a) => deleteApp(a))); });

describe('visibilidad por rol', () => {
  it('Administrador ve solo las dirigidas a Administrador', async () => {
    expect(await leerNotas(s.admin)).toEqual(['adminYEncargado', 'soloAdmin', 'todos']);
  });
  it('Operador ve solo las dirigidas a Operador', async () => {
    expect(await leerNotas(s.operador)).toEqual(['soloOperador', 'todos']);
  });
  it('Encargado Centro ve solo las dirigidas a Encargado', async () => {
    expect(await leerNotas(s.encargado)).toEqual(['adminYEncargado', 'soloEncargado', 'todos']);
  });
  it('Desarrollador ve todas', async () => {
    expect(await leerNotas(s.dev)).toEqual(Object.keys(NOTAS).sort());
  });
  it('un usuario sin rol se trata como Operador', async () => {
    expect(await leerNotas(s.sinRol)).toEqual(['soloOperador', 'todos']);
  });

  it('la consulta sin filtro de rol se rechaza (no se pueden pedir notas ajenas)', async () => {
    await expect(getDocs(collection(s.operador.db, COL))).rejects.toMatchObject(DENEGADO);
    await expect(getDocs(query(collection(s.operador.db, COL), where('rolesVisibles', 'array-contains', 'admin'))))
      .rejects.toMatchObject(DENEGADO);
  });
  it('tampoco se puede leer por id una nota de otro rol', async () => {
    await expect(getDoc(doc(s.operador.db, COL, 'soloAdmin'))).rejects.toMatchObject(DENEGADO);
    expect((await getDoc(doc(s.operador.db, COL, 'soloOperador'))).exists()).toBe(true);
  });
});

describe('escrituras', () => {
  const nota = (rolesVisibles, extra = {}) => ({ titulo: 'x', tipo: 'texto', contenido: 'x', orden: 9, rolesVisibles, ...extra });

  it('crear exige al menos un rol válido', async () => {
    await expect(setDoc(doc(s.admin.db, COL, 'n1'), nota([]))).rejects.toMatchObject(DENEGADO);
    await expect(setDoc(doc(s.admin.db, COL, 'n2'), nota(['dev']))).rejects.toMatchObject(DENEGADO);
    const sinCampo = nota(['admin']);
    delete sinCampo.rolesVisibles;
    await expect(setDoc(doc(s.admin.db, COL, 'n3'), sinCampo)).rejects.toMatchObject(DENEGADO);
    await setDoc(doc(s.admin.db, COL, 'n4'), nota(['operador', 'encargado'], {
      estilo: { fondo: '#FEF3C7', texto: '#111827', negrita: true },
    }));
    expect((await adminDb.doc(`${COL}/n4`).get()).data()).toMatchObject({
      rolesVisibles: ['operador', 'encargado'], estilo: { fondo: '#FEF3C7', texto: '#111827', negrita: true },
    });
  });

  it('editar: no se puede dejar sin roles; el estilo se guarda', async () => {
    await expect(updateDoc(doc(s.admin.db, COL, 'soloAdmin'), { rolesVisibles: [] })).rejects.toMatchObject(DENEGADO);
    await updateDoc(doc(s.admin.db, COL, 'soloAdmin'), { estilo: { fondo: '#1E3A8A', texto: '#FFFFFF', negrita: false } });
    expect((await adminDb.doc(`${COL}/soloAdmin`).get()).data().estilo).toEqual({ fondo: '#1E3A8A', texto: '#FFFFFF', negrita: false });
  });

  it('con permiso de Administración solo se editan las notas que uno ve', async () => {
    await expect(updateDoc(doc(s.encargado.db, COL, 'soloOperador'), { titulo: 'y' })).rejects.toMatchObject(DENEGADO);
    await updateDoc(doc(s.encargado.db, COL, 'soloEncargado'), { titulo: 'y' });
  });

  it('sin permiso de Administración no se escribe', async () => {
    await expect(setDoc(doc(s.operador.db, COL, 'n5'), nota(['operador']))).rejects.toMatchObject(DENEGADO);
  });
});

describe('migración (scripts/migrarRolesNotas.js)', () => {
  it('deja las notas existentes visibles para todos los roles, sin tocar las que ya tienen roles', async () => {
    await adminDb.doc(`${COL}/vieja1`).set({ titulo: 'vieja', tipo: 'texto', contenido: 'a', orden: 20 });
    await adminDb.doc(`${COL}/vieja2`).set({ titulo: 'vacía', tipo: 'texto', contenido: 'b', orden: 21, rolesVisibles: [] });

    // Antes de migrar, nadie salvo el Desarrollador las ve.
    expect(await leerNotas(s.operador)).not.toContain('vieja1');
    expect(await leerNotas(s.dev)).toContain('vieja1');

    const simulacion = await migrarRolesNotas(adminDb);
    expect(simulacion.migradas).toBe(2);
    expect((await adminDb.doc(`${COL}/vieja1`).get()).data().rolesVisibles).toBeUndefined();

    expect((await migrarRolesNotas(adminDb, { aplicar: true })).migradas).toBe(2);
    for (const sesionRol of [s.admin, s.operador, s.encargado, s.dev]) {
      expect(await leerNotas(sesionRol)).toEqual(expect.arrayContaining(['vieja1', 'vieja2']));
    }
    expect((await adminDb.doc(`${COL}/soloAdmin`).get()).data().rolesVisibles).toEqual(['admin']);
    expect((await adminDb.doc(`${COL}/vieja1`).get()).data()).toMatchObject({ titulo: 'vieja', contenido: 'a', orden: 20 });

    // Idempotente.
    expect((await migrarRolesNotas(adminDb, { aplicar: true })).migradas).toBe(0);
  });
});
