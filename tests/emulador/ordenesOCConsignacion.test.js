// "Sincronizar OC" de Consignación contra los emuladores:
//   - storage.rules: un usuario solo de Consignación puede leer el índice de
//     OC y ver/descargar el PDF de una OC, pero no subirlo, reemplazarlo ni
//     borrarlo (eso sigue siendo de Documentos/Implantes).
//   - firestore.rules: puede escribir `orden` (+ log) en sus registros, y la
//     consulta de pendientes (orden == '' + rango de fechas) solo trae los
//     registros sin orden.
//   - scripts/agregarOrdenConsignacion.js: agrega orden '' a los registros
//     antiguos sin el campo, sin tocar los que ya tienen orden.
//   - Orden sincronizada (ordenOrigen 'oc') bloqueada en firestore.rules: nadie
//     la cambia ni la borra; la sincronización sigue escribiendo las vacías;
//     a mano solo números separados por ", ".
//   - scripts/marcarOrdenOrigenConsignacion.js: marca 'oc'/'manual' en las
//     órdenes anteriores al campo ordenOrigen.
import process from 'node:process';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'node:module';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import {
  getFirestore, connectFirestoreEmulator, collection, collectionGroup, query, where, getDocs,
  doc, updateDoc, addDoc, setDoc, deleteField, serverTimestamp,
} from 'firebase/firestore';
import { getStorage, connectStorageEmulator, ref, uploadBytes, getBytes, deleteObject } from 'firebase/storage';

const require = createRequire(new URL('../../functions/package.json', import.meta.url));
const adminApp = require('firebase-admin/app');
const { getFirestore: getFirestoreAdmin } = require('firebase-admin/firestore');
const { agregarOrdenConsignacion } = require('./scripts/agregarOrdenConsignacion.js');
const { marcarOrdenOrigenConsignacion } = require('./scripts/marcarOrdenOrigenConsignacion.js');

const PROYECTO = 'demo-workcraft';
const BUCKET = `${PROYECTO}.appspot.com`;
const FIRESTORE = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const AUTH = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
const STORAGE = process.env.FIREBASE_STORAGE_EMULATOR_HOST || '127.0.0.1:9199';
const PDF_OC = 'ordenes_oc/OC_4500001.pdf';
const INDICE = 'snapshots/indiceOC/indiceOC.json';
const BASE = 'consignacion_registros/2026/mes/septiembre/dia/15/detalles';
const apps = [];
let adminDb;
const s = {};

const pdf = (texto = '%PDF-1.4 prueba') => new TextEncoder().encode(texto);
const META_PDF = { contentType: 'application/pdf' };
const NO_AUTORIZADO = { code: 'storage/unauthorized' };
const DENEGADO = { code: 'permission-denied' };

const sesion = async (nombre, perfil) => {
  const app = initializeApp({ apiKey: 'demo', projectId: PROYECTO, authDomain: `${PROYECTO}.firebaseapp.com`, storageBucket: BUCKET }, `${nombre}-${Date.now()}`);
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${AUTH}`, { disableWarnings: true });
  const db = getFirestore(app);
  const [host, puerto] = FIRESTORE.split(':');
  connectFirestoreEmulator(db, host, Number(puerto));
  const storage = getStorage(app);
  const [hostS, puertoS] = STORAGE.split(':');
  connectStorageEmulator(storage, hostS, Number(puertoS));
  const { user } = await createUserWithEmailAndPassword(auth, `${nombre}-${Date.now()}@prueba.cl`, 'secreto123');
  await adminDb.doc(`usuarios/${user.uid}`).set(perfil);
  return { db, storage };
};

beforeAll(async () => {
  adminDb = getFirestoreAdmin(adminApp.initializeApp({ projectId: PROYECTO }, 'pruebas-oc-consignacion'));
  await fetch(`http://${FIRESTORE}/emulator/v1/projects/${PROYECTO}/databases/(default)/documents`, { method: 'DELETE' });
  s.documentos = await sesion('documentos', { rol: 'operador', permisos: { documentos: ['/documentos/importarDetallesOC'] } });
  s.consignacion = await sesion('consignacion', { rol: 'operador', permisos: { consignacion: ['/consignacion/cargasConsignacion'] } });
  s.otro = await sesion('otro', { rol: 'operador', permisos: { maestros: ['/maestros/codigosMaestros'] } });
  s.dev = await sesion('dev', { rol: 'dev', permisos: {} });

  // El PDF y el índice los sube quien tiene Documentos (como en la app).
  await uploadBytes(ref(s.documentos.storage, PDF_OC), pdf(), META_PDF);
  await uploadBytes(ref(s.documentos.storage, INDICE), new TextEncoder().encode('{"formato":2,"indice":{}}'), { contentType: 'application/json' });
});
afterAll(async () => { await Promise.all(apps.map((a) => deleteApp(a))); });

describe('storage.rules: PDF de OC para un usuario solo de Consignación', () => {
  it('puede ver/descargar el PDF de una OC', async () => {
    const bytes = await getBytes(ref(s.consignacion.storage, PDF_OC));
    expect(new TextDecoder().decode(bytes)).toBe('%PDF-1.4 prueba');
  });

  it('no puede subir un PDF nuevo', async () => {
    await expect(uploadBytes(ref(s.consignacion.storage, 'ordenes_oc/OC_4500999.pdf'), pdf(), META_PDF))
      .rejects.toMatchObject(NO_AUTORIZADO);
  });

  it('no puede reemplazar el PDF existente', async () => {
    await expect(uploadBytes(ref(s.consignacion.storage, PDF_OC), pdf('%PDF-1.4 otro'), META_PDF))
      .rejects.toMatchObject(NO_AUTORIZADO);
    const bytes = await getBytes(ref(s.documentos.storage, PDF_OC));
    expect(new TextDecoder().decode(bytes)).toBe('%PDF-1.4 prueba');
  });

  it('no puede borrarlo', async () => {
    await expect(deleteObject(ref(s.consignacion.storage, PDF_OC))).rejects.toMatchObject(NO_AUTORIZADO);
  });

  it('un usuario sin Consignación/Documentos/Implantes no lo puede leer', async () => {
    await expect(getBytes(ref(s.otro.storage, PDF_OC))).rejects.toMatchObject(NO_AUTORIZADO);
  });
});

describe('storage.rules: índice de OC', () => {
  it('Consignación lo puede leer (para sincronizar) pero no escribir', async () => {
    await expect(getBytes(ref(s.consignacion.storage, INDICE))).resolves.toBeTruthy();
    await expect(uploadBytes(ref(s.consignacion.storage, INDICE), new TextEncoder().encode('{}'), { contentType: 'application/json' }))
      .rejects.toMatchObject(NO_AUTORIZADO);
  });

  it('un usuario sin permiso no lo puede leer', async () => {
    await expect(getBytes(ref(s.otro.storage, INDICE))).rejects.toMatchObject(NO_AUTORIZADO);
  });
});

describe('Firestore: sincronización de Consignación', () => {
  beforeAll(async () => {
    const base = { gestionId: '102345', nombre: 'JUAN PEREZ', empresa: 'MEDTRONIC', codigo: '00123', cantidad: 1 };
    await adminDb.doc(`${BASE}/pendiente`).set({ ...base, fecha: '2026-09-15', orden: '' });
    await adminDb.doc(`${BASE}/conOrden`).set({ ...base, fecha: '2026-09-15', orden: '4500777' });
    await adminDb.doc(`${BASE}/antiguo`).set({ ...base, fecha: '2026-09-15' }); // sin el campo orden
    await adminDb.doc(`${BASE}/fueraDeRango`).set({ ...base, fecha: '2025-01-01', orden: '' });
  });

  const pendientes = async () => {
    const snap = await getDocs(query(collectionGroup(s.consignacion.db, 'detalles'),
      where('orden', '==', ''), where('fecha', '>=', '2026-09-01'), where('fecha', '<=', '2026-09-30')));
    return snap.docs.filter((d) => d.ref.path.startsWith('consignacion_registros/')).map((d) => d.id).sort();
  };

  it('la consulta de pendientes no ve registros con orden ni los que no tienen el campo', async () => {
    expect(await pendientes()).toEqual(['pendiente']);
  });

  it('el script agrega orden "" solo a los registros sin el campo (y es idempotente)', async () => {
    const simulacion = await agregarOrdenConsignacion(adminDb);
    expect(simulacion).toMatchObject({ total: 4, sinCampo: 1, vacios: 2, conOrden: 1, porMes: { '2026-09': 1 } });
    expect((await adminDb.doc(`${BASE}/antiguo`).get()).data().orden).toBeUndefined();

    await agregarOrdenConsignacion(adminDb, { aplicar: true });
    expect((await adminDb.doc(`${BASE}/antiguo`).get()).data().orden).toBe('');
    expect((await adminDb.doc(`${BASE}/conOrden`).get()).data().orden).toBe('4500777');
    expect(await pendientes()).toEqual(['antiguo', 'pendiente']);
    expect(await agregarOrdenConsignacion(adminDb)).toMatchObject({ sinCampo: 0 });
  });

  it('Consignación puede guardar la OC en orden y su log (como la sincronización); otro módulo no', async () => {
    const refPendiente = doc(s.consignacion.db, `${BASE}/pendiente`);
    await updateDoc(refPendiente, { orden: '4500001', ordenOrigen: 'oc', ocActualizadoEn: serverTimestamp() });
    await addDoc(collection(refPendiente, 'logs'), { accion: 'OC_ASIGNADA', detalles: { orden: '4500001' } });
    expect((await adminDb.doc(`${BASE}/pendiente`).get()).data().orden).toBe('4500001');
    await expect(updateDoc(doc(s.otro.db, `${BASE}/antiguo`), { orden: 'X' })).rejects.toMatchObject(DENEGADO);
  });
});

describe('firestore.rules: orden sincronizada bloqueada', () => {
  const R = 'consignacion_registros/2026/mes/octubre/dia/01/detalles';
  const base = { gestionId: '200001', nombre: 'ANA', empresa: 'MEDTRONIC', codigo: '00123', cantidad: 1, fecha: '2026-10-01', estado: 'INGRESADO' };
  const ref = (sesionUsuario, id) => doc(sesionUsuario.db, `${R}/${id}`);
  const leer = async (id) => (await adminDb.doc(`${R}/${id}`).get()).data();

  beforeAll(async () => {
    await adminDb.doc(`${R}/sincronizada`).set({ ...base, orden: '4500001', ordenOrigen: 'oc' });
    await adminDb.doc(`${R}/vacia`).set({ ...base, orden: '' });
    await adminDb.doc(`${R}/manual`).set({ ...base, orden: '12345', ordenOrigen: 'manual' });
    await adminDb.doc(`${R}/libre`).set({ ...base, orden: 'texto viejo' }); // anterior a la validación
  });

  it('nadie puede editar ni borrar la orden sincronizada (tampoco dev)', async () => {
    for (const u of [s.consignacion, s.dev]) {
      await expect(updateDoc(ref(u, 'sincronizada'), { orden: '999' })).rejects.toMatchObject(DENEGADO);
      await expect(updateDoc(ref(u, 'sincronizada'), { orden: '' })).rejects.toMatchObject(DENEGADO);
      await expect(updateDoc(ref(u, 'sincronizada'), { orden: deleteField() })).rejects.toMatchObject(DENEGADO);
      await expect(updateDoc(ref(u, 'sincronizada'), { ordenOrigen: 'manual' })).rejects.toMatchObject(DENEGADO);
      await expect(updateDoc(ref(u, 'sincronizada'), { ordenOrigen: deleteField(), orden: '999' })).rejects.toMatchObject(DENEGADO);
      await expect(setDoc(ref(u, 'sincronizada'), { ...base, orden: '999' })).rejects.toMatchObject(DENEGADO);
    }
    expect(await leer('sincronizada')).toMatchObject({ orden: '4500001', ordenOrigen: 'oc' });
  });

  it('los demás campos de un registro con orden sincronizada se siguen editando', async () => {
    await updateDoc(ref(s.consignacion, 'sincronizada'), { estado: 'CARGADO', guias: '777' });
    expect(await leer('sincronizada')).toMatchObject({ estado: 'CARGADO', orden: '4500001' });
  });

  it('la sincronización sigue escribiendo una orden vacía', async () => {
    await updateDoc(ref(s.consignacion, 'vacia'), { orden: '4500002', ordenOrigen: 'oc', ocActualizadoEn: serverTimestamp() });
    expect(await leer('vacia')).toMatchObject({ orden: '4500002', ordenOrigen: 'oc' });
    // y desde ahí queda bloqueada
    await expect(updateDoc(ref(s.consignacion, 'vacia'), { orden: '1' })).rejects.toMatchObject(DENEGADO);
  });

  it('a mano: solo números separados por ", "; se puede corregir o borrar', async () => {
    await updateDoc(ref(s.consignacion, 'manual'), { orden: '12345, 12356', ordenOrigen: 'manual' });
    await updateDoc(ref(s.consignacion, 'manual'), { orden: '', ordenOrigen: '' });
    for (const orden of ['OC 12345', '12345,12356', '12345;12356', 'abc', '12345, ']) {
      await expect(updateDoc(ref(s.consignacion, 'manual'), { orden, ordenOrigen: 'manual' })).rejects.toMatchObject(DENEGADO);
    }
    await expect(updateDoc(ref(s.consignacion, 'manual'), { orden: '1', ordenOrigen: 'otro' })).rejects.toMatchObject(DENEGADO);
    await expect(updateDoc(ref(s.consignacion, 'manual'), { orden: '', ordenOrigen: 'oc' })).rejects.toMatchObject(DENEGADO);
  });

  it('un registro antiguo con texto libre en orden se puede editar en otros campos', async () => {
    await updateDoc(ref(s.consignacion, 'libre'), { estado: 'PENDIENTE' });
    expect(await leer('libre')).toMatchObject({ estado: 'PENDIENTE', orden: 'texto viejo' });
  });
});

describe('scripts/marcarOrdenOrigenConsignacion.js', () => {
  const R = 'consignacion_registros/2026/mes/noviembre/dia/02/detalles';
  const base = { gestionId: '300001', fecha: '2026-11-02', codigo: '00123', cantidad: 1 };
  const log = (ref, orden, ms) => ref.collection('logs').add({ accion: 'OC_ASIGNADA', detalles: { orden }, timestamp: new Date(ms) });

  it('marca oc solo si la orden actual es la que escribió la sincronización', async () => {
    const { Timestamp } = require('firebase-admin/firestore');
    const ts = Timestamp.now();
    const sinc = adminDb.doc(`${R}/sinc`);
    await sinc.set({ ...base, orden: '4500010', ocActualizadoEn: ts });
    await log(sinc, '4500010', 1000);
    const cambiada = adminDb.doc(`${R}/cambiada`);
    await cambiada.set({ ...base, orden: '999', ocActualizadoEn: ts });
    await log(cambiada, '4500011', 1000);
    await adminDb.doc(`${R}/mano`).set({ ...base, orden: '555' });
    await adminDb.doc(`${R}/vacia`).set({ ...base, orden: '' });

    const antes = await marcarOrdenOrigenConsignacion(adminDb);
    expect(antes).toMatchObject({ cambiadasAMano: 1 });
    expect((await sinc.get()).data().ordenOrigen).toBeUndefined();

    await marcarOrdenOrigenConsignacion(adminDb, { aplicar: true });
    expect((await sinc.get()).data().ordenOrigen).toBe('oc');
    expect((await cambiada.get()).data().ordenOrigen).toBe('manual');
    expect((await adminDb.doc(`${R}/mano`).get()).data().ordenOrigen).toBe('manual');
    expect((await adminDb.doc(`${R}/vacia`).get()).data().ordenOrigen).toBeUndefined();
    expect(await marcarOrdenOrigenConsignacion(adminDb)).toMatchObject({ oc: 0, manual: 0 });

    // y la recién marcada queda bloqueada
    await expect(updateDoc(doc(s.consignacion.db, `${R}/sinc`), { orden: '1' })).rejects.toMatchObject(DENEGADO);
  });
});
