// "Sincronizar OC" de Consignación contra los emuladores:
//   - storage.rules: un usuario solo de Consignación puede leer el índice de
//     OC y ver/descargar el PDF de una OC, pero no subirlo, reemplazarlo ni
//     borrarlo (eso sigue siendo de Documentos/Implantes).
//   - firestore.rules: puede escribir `orden` (+ log) en sus registros, y la
//     consulta de pendientes (orden == '' + rango de fechas) solo trae los
//     registros sin orden.
//   - scripts/agregarOrdenConsignacion.js: agrega orden '' a los registros
//     antiguos sin el campo, sin tocar los que ya tienen orden.
import process from 'node:process';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'node:module';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import {
  getFirestore, connectFirestoreEmulator, collection, collectionGroup, query, where, getDocs,
  doc, updateDoc, addDoc,
} from 'firebase/firestore';
import { getStorage, connectStorageEmulator, ref, uploadBytes, getBytes, deleteObject } from 'firebase/storage';

const require = createRequire(new URL('../../functions/package.json', import.meta.url));
const adminApp = require('firebase-admin/app');
const { getFirestore: getFirestoreAdmin } = require('firebase-admin/firestore');
const { agregarOrdenConsignacion } = require('./scripts/agregarOrdenConsignacion.js');

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

  it('Consignación puede guardar la OC en orden y su log; otro módulo no', async () => {
    const refPendiente = doc(s.consignacion.db, `${BASE}/pendiente`);
    await updateDoc(refPendiente, { orden: '4500001' });
    await addDoc(collection(refPendiente, 'logs'), { accion: 'OC_ASIGNADA', detalles: { orden: '4500001' } });
    expect((await adminDb.doc(`${BASE}/pendiente`).get()).data().orden).toBe('4500001');
    await expect(updateDoc(doc(s.otro.db, `${BASE}/antiguo`), { orden: 'X' })).rejects.toMatchObject(DENEGADO);
  });
});
