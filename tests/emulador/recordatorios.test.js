// Recordatorios contra el emulador (firestore.rules), con las mismas
// funciones que usa la app (recordatoriosServicio.js):
//   - cada usuario lee solo sus tareas y solo marca como realizadas las suyas;
//   - sin la pestaña "Mis recordatorios" no ve nada aunque esté asignado;
//   - solo admin/dev o la pestaña "Administrar tareas" crean, editan y borran;
//   - el Realizado (historial) lleva la hora del servidor y no se edita ni borra.
import process from 'node:process';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'node:module';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import {
  getFirestore, connectFirestoreEmulator, getDocs, getDoc, doc, setDoc, updateDoc, deleteDoc, collection,
} from 'firebase/firestore';
import {
  consultaTareasDe, consultaRealizadosDe, crearTarea, actualizarTarea, cambiarActivaTarea, borrarTarea,
  marcarRealizado, leerHistorialTarea, refTareas,
} from '../../src/components/modulos/administracion/recordatorios/recordatoriosServicio.js';

const require = createRequire(new URL('../../functions/package.json', import.meta.url));
const adminApp = require('firebase-admin/app');
const { getFirestore: getFirestoreAdmin } = require('firebase-admin/firestore');

const PROYECTO = 'demo-workcraft';
const FIRESTORE = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const AUTH = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
const VISTA = '/administracion/recordatorios';
const MIS = '/administracion/recordatorios/mis';
const ADMINISTRAR = '/administracion/recordatorios/administrar';
const DENEGADO = { code: 'permission-denied' };
const apps = [];
let adminDb;
const s = {};

const perfil = (...pestanas) => ({
  rol: 'operador',
  permisos: { administracion: [VISTA] },
  permisosGranulares: Object.fromEntries([VISTA, ...pestanas].map((r) => [r, {}])),
});

const sesion = async (nombre, datosPerfil) => {
  const app = initializeApp({ apiKey: 'demo', projectId: PROYECTO, authDomain: `${PROYECTO}.firebaseapp.com` }, `${nombre}-${Date.now()}`);
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${AUTH}`, { disableWarnings: true });
  const db = getFirestore(app);
  const [host, puerto] = FIRESTORE.split(':');
  connectFirestoreEmulator(db, host, Number(puerto));
  const { user } = await createUserWithEmailAndPassword(auth, `${nombre}-${Date.now()}@prueba.cl`, 'secreto123');
  await adminDb.doc(`usuarios/${user.uid}`).set(datosPerfil);
  return { db, uid: user.uid };
};

const idsTareas = async (u) => (await getDocs(consultaTareasDe(u.db, u.uid))).docs.map((d) => d.data().titulo).sort();
const tarea = (titulo, asignados, dias = [1]) => ({ titulo, descripcion: '', dias, asignados });
const t = {};

beforeAll(async () => {
  adminDb = getFirestoreAdmin(adminApp.initializeApp({ projectId: PROYECTO }, 'pruebas-recordatorios'));
  await fetch(`http://${FIRESTORE}/emulator/v1/projects/${PROYECTO}/databases/(default)/documents`, { method: 'DELETE' });
  s.admin = await sesion('admin', { rol: 'admin', permisos: {} });
  s.ana = await sesion('ana', perfil(MIS));
  s.beto = await sesion('beto', perfil(MIS));
  s.sinPestana = await sesion('sinpestana', perfil()); // tiene la vista, pero no "Mis recordatorios"
  s.otro = await sesion('otro', { rol: 'operador', permisos: { administracion: ['/administracion/notasAdmin'] }, permisosGranulares: {} });
  s.gestor = await sesion('gestor', perfil(ADMINISTRAR));

  const desde = '2026-10-12';
  t.ana = await crearTarea(s.admin.db, tarea('Revisar facturas', [s.ana.uid]), { desde, creadoPor: 'admin' });
  t.beto = await crearTarea(s.admin.db, tarea('Ver laboratorio', [s.beto.uid], [2]), { desde, creadoPor: 'admin' });
  t.ambos = await crearTarea(s.admin.db, tarea('Ver órdenes', [s.ana.uid, s.beto.uid, s.sinPestana.uid, s.otro.uid], [3]), { desde, creadoPor: 'admin' });
});
afterAll(async () => { await Promise.all(apps.map((a) => deleteApp(a))); });

describe('leer tareas', () => {
  it('cada usuario ve solo las tareas que tiene asignadas', async () => {
    expect(await idsTareas(s.ana)).toEqual(['Revisar facturas', 'Ver órdenes']);
    expect(await idsTareas(s.beto)).toEqual(['Ver laboratorio', 'Ver órdenes']);
  });

  it('no puede leer la tarea de otro, ni la colección completa', async () => {
    await expect(getDoc(doc(s.ana.db, 'recordatorios_tareas', t.beto))).rejects.toMatchObject(DENEGADO);
    await expect(getDocs(refTareas(s.ana.db))).rejects.toMatchObject(DENEGADO);
  });

  it('sin la pestaña "Mis recordatorios" no ve nada, aunque esté asignado', async () => {
    await expect(getDocs(consultaTareasDe(s.sinPestana.db, s.sinPestana.uid))).rejects.toMatchObject(DENEGADO);
    await expect(getDocs(consultaTareasDe(s.otro.db, s.otro.uid))).rejects.toMatchObject(DENEGADO);
  });

  it('quien administra lee todas', async () => {
    expect((await getDocs(refTareas(s.gestor.db))).size).toBe(3);
  });
});

describe('marcar Realizado', () => {
  const marcar = (u, tareaId, fecha = '2026-10-12', uid = u.uid) =>
    marcarRealizado(u.db, { uid, usuarioNombre: 'X', tarea: { id: tareaId, titulo: 'T' }, fecha });

  it('marca su propia tarea; queda en su historial con la hora del servidor', async () => {
    await marcar(s.ana, t.ana);
    const snap = await getDocs(consultaRealizadosDe(s.ana.db, s.ana.uid, '2026-10-06'));
    expect(snap.docs.map((d) => d.id)).toEqual([`${t.ana}_2026-10-12`]);
    expect(snap.docs[0].data().realizadoEn.toDate()).toBeInstanceOf(Date);
  });

  it('no puede marcar una tarea que no le está asignada', async () => {
    await expect(marcar(s.ana, t.beto)).rejects.toMatchObject(DENEGADO);
  });

  it('no puede marcar ni leer los Realizados de otro usuario', async () => {
    await expect(marcar(s.ana, t.ambos, '2026-10-14', s.beto.uid)).rejects.toMatchObject(DENEGADO);
    await expect(getDocs(consultaRealizadosDe(s.ana.db, s.beto.uid, '2026-10-06'))).rejects.toMatchObject(DENEGADO);
  });

  it('sin la pestaña no puede marcar, aunque esté asignado', async () => {
    await expect(marcar(s.sinPestana, t.ambos, '2026-10-14')).rejects.toMatchObject(DENEGADO);
  });

  it('el historial no se edita, no se borra y no acepta una hora del cliente', async () => {
    const ref = doc(s.ana.db, 'recordatorios_realizados', s.ana.uid, 'realizados', `${t.ana}_2026-10-12`);
    await expect(updateDoc(ref, { fecha: '2026-10-19' })).rejects.toMatchObject(DENEGADO);
    await expect(deleteDoc(ref)).rejects.toMatchObject(DENEGADO);
    await expect(setDoc(doc(s.ana.db, 'recordatorios_realizados', s.ana.uid, 'realizados', `${t.ana}_2026-10-19`), {
      tareaId: t.ana, titulo: 'T', fecha: '2026-10-19', uid: s.ana.uid, usuarioNombre: 'X', realizadoEn: new Date(),
    })).rejects.toMatchObject(DENEGADO);
    // id que no corresponde a tarea + fecha
    await expect(setDoc(doc(s.ana.db, 'recordatorios_realizados', s.ana.uid, 'realizados', 'otro_id'), {
      tareaId: t.ana, titulo: 'T', fecha: '2026-10-19', uid: s.ana.uid, usuarioNombre: 'X', realizadoEn: new Date(),
    })).rejects.toMatchObject(DENEGADO);
  });

  it('quien administra ve el historial de la tarea (quién y cuándo)', async () => {
    await marcar(s.beto, t.ambos, '2026-10-14');
    const historial = await leerHistorialTarea(s.gestor.db, { id: t.ambos, asignados: [s.ana.uid, s.beto.uid] });
    expect(historial.map((h) => [h.uid, h.fecha])).toEqual([[s.beto.uid, '2026-10-14']]);
    await expect(leerHistorialTarea(s.ana.db, { id: t.ambos, asignados: [s.beto.uid] })).rejects.toMatchObject(DENEGADO);
  });
});

describe('administrar tareas', () => {
  it('un usuario que solo recibe no puede crear, editar ni borrar', async () => {
    await expect(crearTarea(s.ana.db, tarea('Mía', [s.ana.uid]), { desde: '2026-10-12' })).rejects.toMatchObject(DENEGADO);
    await expect(actualizarTarea(s.ana.db, t.ana, tarea('Cambiada', [s.ana.uid]))).rejects.toMatchObject(DENEGADO);
    await expect(cambiarActivaTarea(s.ana.db, t.ana, false)).rejects.toMatchObject(DENEGADO);
    await expect(borrarTarea(s.ana.db, t.ana)).rejects.toMatchObject(DENEGADO);
  });

  it('con la pestaña "Administrar tareas" crea, edita, desactiva y borra', async () => {
    const id = await crearTarea(s.gestor.db, tarea('Temporal', [s.ana.uid], [4, 5]), { desde: '2026-10-12', creadoPor: 'gestor' });
    await actualizarTarea(s.gestor.db, id, { ...tarea('Temporal 2', [s.ana.uid, s.beto.uid], [5]), activa: true });
    await cambiarActivaTarea(s.gestor.db, id, false);
    expect((await adminDb.doc(`recordatorios_tareas/${id}`).get()).data()).toMatchObject({ titulo: 'Temporal 2', activa: false, dias: [5] });
    await borrarTarea(s.gestor.db, id);
    expect((await adminDb.doc(`recordatorios_tareas/${id}`).get()).exists).toBe(false);
  });

  it('rechaza tareas inválidas (sin días, sin usuarios, día fuera de rango, campos extra)', async () => {
    for (const mala of [tarea('X', [s.ana.uid], []), tarea('X', []), tarea('X', [s.ana.uid], [8]), tarea('', [s.ana.uid])]) {
      await expect(crearTarea(s.admin.db, mala, { desde: '2026-10-12' })).rejects.toMatchObject(DENEGADO);
    }
    await expect(setDoc(doc(collection(s.admin.db, 'recordatorios_tareas')), {
      ...tarea('X', [s.ana.uid]), activa: true, desde: '2026-10-12', extra: 1,
    })).rejects.toMatchObject(DENEGADO);
  });
});
