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
  doc, getDoc, setDoc, updateDoc, deleteDoc,
} from 'firebase/firestore';
import { consultaNotas, normalizarEstilo } from '../../src/components/modulos/administracion/notasAdmin/notasConfig.js';
import { crearNota, actualizarNota, intercambiarOrden } from '../../src/components/modulos/administracion/notasAdmin/notasServicio.js';

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
  soloDev: ['dev'],
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

describe('notas solo para desarrolladores (["dev"])', () => {
  const noDevs = () => [['Administrador', s.admin], ['Operador', s.operador], ['Encargado Centro', s.encargado], ['sin rol', s.sinRol]];

  it('el Desarrollador la ve; nadie más, con la consulta de la app', async () => {
    expect(await leerNotas(s.dev)).toContain('soloDev');
    for (const [, sesionRol] of noDevs()) expect(await leerNotas(sesionRol)).not.toContain('soloDev');
  });

  it('consultando directo a Firestore tampoco: ni por id, ni con array-contains "dev", ni sin filtro', async () => {
    for (const [, { db }] of noDevs()) {
      await expect(getDoc(doc(db, COL, 'soloDev'))).rejects.toMatchObject(DENEGADO);
      await expect(getDocs(query(collection(db, COL), where('rolesVisibles', 'array-contains', 'dev')))).rejects.toMatchObject(DENEGADO);
      await expect(getDocs(query(collection(db, COL), where('rolesVisibles', '==', ['dev'])))).rejects.toMatchObject(DENEGADO);
      await expect(getDocs(collection(db, COL))).rejects.toMatchObject(DENEGADO);
    }
    expect((await getDoc(doc(s.dev.db, COL, 'soloDev'))).data().rolesVisibles).toEqual(['dev']);
  });

  it('ni el Administrador ni quien tiene permiso de Administración la editan o borran', async () => {
    for (const { db } of [s.admin, s.encargado]) {
      await expect(updateDoc(doc(db, COL, 'soloDev'), { titulo: 'y' })).rejects.toMatchObject(DENEGADO);
      await expect(updateDoc(doc(db, COL, 'soloDev'), { rolesVisibles: ['admin'] })).rejects.toMatchObject(DENEGADO);
      await expect(deleteDoc(doc(db, COL, 'soloDev'))).rejects.toMatchObject(DENEGADO);
    }
    expect((await adminDb.doc(`${COL}/soloDev`).get()).data()).toMatchObject({ titulo: 'soloDev', rolesVisibles: ['dev'] });
  });

  it('"dev" es un valor válido: se crea, edita y borra una nota solo para desarrolladores', async () => {
    const ref = doc(s.dev.db, COL, 'devNueva');
    await setDoc(ref, { titulo: 'x', tipo: 'texto', contenido: 'x', orden: 30, rolesVisibles: ['dev'] });
    await updateDoc(ref, { titulo: 'editada' });
    expect((await adminDb.doc(`${COL}/devNueva`).get()).data()).toMatchObject({ titulo: 'editada', rolesVisibles: ['dev'] });
    await expect(setDoc(doc(s.dev.db, COL, 'devVacia'), { titulo: 'x', tipo: 'texto', orden: 31, rolesVisibles: [] }))
      .rejects.toMatchObject(DENEGADO);
    await expect(setDoc(doc(s.dev.db, COL, 'devTexto'), { titulo: 'x', tipo: 'texto', orden: 32, rolesVisibles: ['desarrollador'] }))
      .rejects.toMatchObject(DENEGADO);
    await deleteDoc(ref);
    expect((await adminDb.doc(`${COL}/devNueva`).get()).exists).toBe(false);
  });
});

describe('escrituras', () => {
  const nota = (rolesVisibles, extra = {}) => ({ titulo: 'x', tipo: 'texto', contenido: 'x', orden: 9, rolesVisibles, ...extra });

  it('crear exige al menos un rol válido', async () => {
    await expect(setDoc(doc(s.admin.db, COL, 'n1'), nota([]))).rejects.toMatchObject(DENEGADO);
    await expect(setDoc(doc(s.admin.db, COL, 'n2'), nota(['admin', 'supervisor']))).rejects.toMatchObject(DENEGADO);
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
    // Las solo para desarrolladores quedan intactas: siguen privadas.
    expect((await adminDb.doc(`${COL}/soloDev`).get()).data()).toEqual({
      titulo: 'soloDev', tipo: 'texto', contenido: 'soloDev', orden: Object.keys(NOTAS).indexOf('soloDev'), rolesVisibles: ['dev'],
    });
    for (const sesionRol of [s.admin, s.operador, s.encargado, s.sinRol]) {
      expect(await leerNotas(sesionRol)).not.toContain('soloDev');
    }
    expect((await adminDb.doc(`${COL}/vieja1`).get()).data()).toMatchObject({ titulo: 'vieja', contenido: 'a', orden: 20 });

    // Idempotente.
    expect((await migrarRolesNotas(adminDb, { aplicar: true })).migradas).toBe(0);
  });
});

// Guardado con el mismo código que Notas Admin (notasServicio), sobre datos
// como los de producción al desplegar: notas viejas aún sin rolesVisibles
// (migración pendiente) mezcladas con notas nuevas.
describe('guardado tal como lo hace la app', () => {
  // Lo que useNotasPanel entrega al formulario: las visibles, por orden.
  const listado = async ({ db, perfil }) => {
    const snap = await getDocs(query(collection(db, COL), ...consultaNotas(perfil).restricciones));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.orden - b.orden);
  };
  const formulario = (extra = {}) => ({
    titulo: ' Aviso ', tipo: 'texto', contenido: ' Hola ', items: [''],
    rolesVisibles: ['admin', 'operador', 'encargado'], estilo: normalizarEstilo({ fondo: '#FEF3C7', negrita: true }),
    ...extra,
  });

  beforeAll(async () => {
    const snap = await adminDb.collection(COL).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
    await adminDb.doc(`${COL}/antigua`).set({ titulo: 'antigua', tipo: 'texto', contenido: 'a', orden: 0, autor: 'X' });
    await adminDb.doc(`${COL}/antiguaChecklist`).set({ tipo: 'checklist', items: [{ texto: 't', completado: false }], orden: 1 });
    await adminDb.doc(`${COL}/nueva`).set({ titulo: 'nueva', tipo: 'texto', contenido: 'b', orden: 2, rolesVisibles: ['admin'] });
  });

  it('Desarrollador publica una nota aunque haya notas sin migrar (las corre un lugar)', async () => {
    const id = await crearNota(s.dev.db, await listado(s.dev), { ...formulario(), autor: 'Dev' });
    const creada = (await adminDb.doc(`${COL}/${id}`).get()).data();
    expect(creada).toMatchObject({
      titulo: 'Aviso', contenido: 'Hola', orden: 0, autor: 'Dev',
      rolesVisibles: ['admin', 'operador', 'encargado'], estilo: { fondo: '#FEF3C7', texto: null, negrita: true },
    });
    expect((await adminDb.doc(`${COL}/antigua`).get()).data()).toEqual({ titulo: 'antigua', tipo: 'texto', contenido: 'a', orden: 1, autor: 'X' });
  });

  it('Desarrollador publica una nota solo para desarrolladores, y reordena notas sin migrar', async () => {
    const id = await crearNota(s.dev.db, await listado(s.dev), { ...formulario({ rolesVisibles: ['dev'] }), autor: 'Dev' });
    expect((await adminDb.doc(`${COL}/${id}`).get()).data().rolesVisibles).toEqual(['dev']);
    const [a, b] = (await listado(s.dev)).filter((n) => n.id.startsWith('antigua'));
    await intercambiarOrden(s.dev.db, a, a.orden, b, b.orden);
  });

  it('Administrador publica (solo corre las que ve) y edita una nota vieja agregándole roles', async () => {
    const visibles = await listado(s.admin);
    expect(visibles.map((n) => n.id)).not.toContain('antigua');
    await crearNota(s.admin.db, visibles, { ...formulario({ rolesVisibles: ['operador'] }), autor: 'Admin' });
    await actualizarNota(s.dev.db, 'antigua', formulario({ tipo: 'checklist', items: ['x', ' '] }));
    expect((await adminDb.doc(`${COL}/antigua`).get()).data()).toMatchObject({
      contenido: '', items: [{ texto: 'x', completado: false }], rolesVisibles: ['admin', 'operador', 'encargado'],
    });
  });

  it('el checklist de una nota sin migrar se puede marcar en el Dashboard (Desarrollador)', async () => {
    await updateDoc(doc(s.dev.db, COL, 'antiguaChecklist'), { items: [{ texto: 't', completado: true }] });
  });

  it('con muchas notas el batch no supera el límite de accesos de las reglas', async () => {
    await Promise.all(Array.from({ length: 30 }, (_, i) => adminDb.doc(`${COL}/muchas${i}`).set({
      titulo: `m${i}`, tipo: 'texto', contenido: 'm', orden: 100 + i, rolesVisibles: ['admin', 'encargado'],
    })));
    await crearNota(s.encargado.db, await listado(s.encargado), { ...formulario(), autor: 'Enc' });
    await crearNota(s.admin.db, await listado(s.admin), { ...formulario(), autor: 'Admin' });
  });

  it('pero no se cambian los roles de una nota a una lista inválida ni se le quita el campo', async () => {
    await expect(updateDoc(doc(s.dev.db, COL, 'antiguaChecklist'), { rolesVisibles: [] })).rejects.toMatchObject(DENEGADO);
    await expect(updateDoc(doc(s.dev.db, COL, 'nueva'), { rolesVisibles: ['jefe'] })).rejects.toMatchObject(DENEGADO);
    await expect(updateDoc(doc(s.dev.db, COL, 'nueva'), { estilo: 'rojo' })).rejects.toMatchObject(DENEGADO);
    const { deleteField } = await import('firebase/firestore');
    await expect(updateDoc(doc(s.dev.db, COL, 'nueva'), { rolesVisibles: deleteField() })).rejects.toMatchObject(DENEGADO);
  });
});

// Perfiles incompletos: las reglas niegan sin error de evaluación.
describe('perfil de usuario incompleto', () => {
  it('sin documento de usuario no se leen ni escriben notas', async () => {
    const app = initializeApp({ apiKey: 'demo', projectId: PROYECTO }, `sinperfil-${Date.now()}`);
    apps.push(app);
    const auth = getAuth(app);
    connectAuthEmulator(auth, `http://${AUTH}`, { disableWarnings: true });
    const db = getFirestore(app);
    const [host, puerto] = FIRESTORE.split(':');
    connectFirestoreEmulator(db, host, Number(puerto));
    await createUserWithEmailAndPassword(auth, `sinperfil-${Date.now()}@prueba.cl`, 'secreto123');
    await expect(getDocs(query(collection(db, COL), where('rolesVisibles', 'array-contains', 'operador')))).rejects.toMatchObject(DENEGADO);
    await expect(setDoc(doc(db, COL, 'x'), { orden: 0, rolesVisibles: ['operador'] })).rejects.toMatchObject(DENEGADO);
  });

  it('sin permisos ni permisosGranulares: lee lo de su rol y no escribe', async () => {
    const pelado = await sesion('pelado', { rol: 'encargado' });
    expect(await leerNotas(pelado)).not.toHaveLength(0);
    await expect(setDoc(doc(pelado.db, COL, 'y'), { orden: 0, rolesVisibles: ['encargado'] })).rejects.toMatchObject(DENEGADO);
  });
});
