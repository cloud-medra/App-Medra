// Reglas de Hemodinamia (igual que Implantes) contra los emuladores:
//   - storage.rules: PDF por admisión (hemodinamia/{admisión}/documentos:
//     solo crear y nunca sobrescribir, PDF, permiso hemodinamia); Respaldo de documentos
//     (hemodinamia_respaldo/); PDF de OC (ordenes_oc) e índice de OC.
//   - firestore.rules: hemodinamia_respaldo_documentos (vista y acciones de
//     /hemodinamia/respaldoDocumentos), ocImport y ordenesOC con permiso
//     hemodinamia, maestros_codigos con el ítem Hemodinamia → Códigos.
import process from 'node:process';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'node:module';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { getStorage, connectStorageEmulator, ref, uploadBytes, getBytes } from 'firebase/storage';

const require = createRequire(new URL('../../functions/package.json', import.meta.url));
const adminApp = require('firebase-admin/app');
const { getFirestore: getFirestoreAdmin } = require('firebase-admin/firestore');

const PROYECTO = 'demo-workcraft';
const BUCKET = `${PROYECTO}.appspot.com`;
const FIRESTORE = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const AUTH = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
const STORAGE = process.env.FIREBASE_STORAGE_EMULATOR_HOST || '127.0.0.1:9199';
const RESPALDO = '/hemodinamia/respaldoDocumentos';
const CODIGOS = '/hemodinamia/codigosHemodinamia';
const apps = [];
let adminDb;
const s = {};

const pdf = () => new TextEncoder().encode('%PDF-1.4 prueba');
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
  return { db, storage, uid: user.uid };
};

beforeAll(async () => {
  adminDb = getFirestoreAdmin(adminApp.initializeApp({ projectId: PROYECTO }, 'pruebas-reglas-hemodinamia'));
  await fetch(`http://${FIRESTORE}/emulator/v1/projects/${PROYECTO}/databases/(default)/documents`, { method: 'DELETE' });
  s.hemo = await sesion('hemo', {
    rol: 'operador',
    permisos: { hemodinamia: ['/hemodinamia/gestionHemodinamia', RESPALDO, CODIGOS] },
    permisosGranulares: { [RESPALDO]: { acciones: { visible: true, elements: { btn_subir: true } }, tabla_documentos: { visible: true, elements: {} } } },
  });
  s.hemoSinRespaldo = await sesion('hemosinresp', { rol: 'operador', permisos: { hemodinamia: ['/hemodinamia/gestionHemodinamia'] } });
  s.implantes = await sesion('impl', { rol: 'operador', permisos: { implantes: ['/implantes/gestionImplantes'] } });
});
afterAll(() => Promise.all(apps.map((a) => deleteApp(a))));

describe('Storage: documentos de admisión de Hemodinamia', () => {
  it('con permiso hemodinamia: sube un PDF nuevo y lo lee; no sobrescribe; no PDF no', async () => {
    const r = ref(s.hemo.storage, 'hemodinamia/555/documentos/555 - ANA - DP.pdf');
    await expect(uploadBytes(r, pdf(), META_PDF)).resolves.toBeTruthy();
    await expect(getBytes(r)).resolves.toBeTruthy();
    // (Sobrescribir: ver "nunca se sobrescribe" más abajo.)
    await expect(uploadBytes(ref(s.hemo.storage, 'hemodinamia/555/documentos/x.txt'), pdf(), { contentType: 'text/plain' })).rejects.toMatchObject(NO_AUTORIZADO);
  });

  it('cada módulo en su carpeta: Implantes no lee ni sube en la de Hemodinamia (ni al revés)', async () => {
    await expect(getBytes(ref(s.implantes.storage, 'hemodinamia/555/documentos/555 - ANA - DP.pdf'))).rejects.toMatchObject(NO_AUTORIZADO);
    await expect(uploadBytes(ref(s.implantes.storage, 'hemodinamia/556/documentos/a.pdf'), pdf(), META_PDF)).rejects.toMatchObject(NO_AUTORIZADO);
    await expect(uploadBytes(ref(s.hemo.storage, 'implantes/556/documentos/a.pdf'), pdf(), META_PDF)).rejects.toMatchObject(NO_AUTORIZADO);
  });
});

describe('Storage: nunca se sobrescribe un PDF existente (resource == null)', () => {
  it('documentos de admisión: Implantes y Hemodinamia rechazan sobrescribir', async () => {
    const implantes = await sesion('impl2', { rol: 'operador', permisos: { implantes: ['/implantes/gestionImplantes'] } });
    const rImpl = ref(implantes.storage, 'implantes/777/documentos/a.pdf');
    const rHemo = ref(s.hemo.storage, 'hemodinamia/777/documentos/a.pdf');
    await expect(uploadBytes(rImpl, pdf(), META_PDF)).resolves.toBeTruthy();
    await expect(uploadBytes(rHemo, pdf(), META_PDF)).resolves.toBeTruthy();
    await expect(uploadBytes(rImpl, pdf(), META_PDF)).rejects.toMatchObject(NO_AUTORIZADO);
    await expect(uploadBytes(rHemo, pdf(), META_PDF)).rejects.toMatchObject(NO_AUTORIZADO);
  });

  it('Archivo digital (Documentos): tampoco se sobrescribe', async () => {
    const RUTA = '/documentos/archivoDigital';
    const archivo = await sesion('archivo', {
      rol: 'operador', permisos: { documentos: [RUTA] },
      permisosGranulares: { [RUTA]: { archivos: { visible: true, elements: { btn_subir: true } } } },
    });
    const r = ref(archivo.storage, 'documentos_archivo/n1/informe.pdf');
    await expect(uploadBytes(r, pdf(), META_PDF)).resolves.toBeTruthy();
    await expect(uploadBytes(r, pdf(), META_PDF)).rejects.toMatchObject(NO_AUTORIZADO);
  });

  it('respaldo de documentos: tampoco se sobrescribe', async () => {
    const r = ref(s.hemo.storage, 'hemodinamia_respaldo/r9/555 - ANA - DP.pdf');
    await expect(uploadBytes(r, pdf(), META_PDF)).resolves.toBeTruthy();
    await expect(uploadBytes(r, pdf(), META_PDF)).rejects.toMatchObject(NO_AUTORIZADO);
  });
});

describe('Respaldo de documentos de Hemodinamia', () => {
  it('con la acción Subir crea el registro y el PDF en hemodinamia_respaldo; sin la vista, no', async () => {
    const ruta = 'hemodinamia_respaldo/r1/555 - ANA - DP.pdf';
    await expect(uploadBytes(ref(s.hemo.storage, ruta), pdf(), META_PDF)).resolves.toBeTruthy();
    await expect(setDoc(doc(s.hemo.db, 'hemodinamia_respaldo_documentos', 'r1'), { ruta, eliminado: false, idAdmision: '555' })).resolves.toBeUndefined();
    await expect(getDoc(doc(s.hemo.db, 'hemodinamia_respaldo_documentos', 'r1'))).resolves.toBeTruthy();
    await expect(getDoc(doc(s.hemoSinRespaldo.db, 'hemodinamia_respaldo_documentos', 'r1'))).rejects.toMatchObject(DENEGADO);
    await expect(setDoc(doc(s.hemoSinRespaldo.db, 'hemodinamia_respaldo_documentos', 'r2'), { ruta: 'hemodinamia_respaldo/r2/a.pdf', eliminado: false })).rejects.toMatchObject(DENEGADO);
    // La ruta debe ser de su propia carpeta.
    await expect(setDoc(doc(s.hemo.db, 'hemodinamia_respaldo_documentos', 'r3'), { ruta: 'implantes_respaldo/r3/a.pdf', eliminado: false })).rejects.toMatchObject(DENEGADO);
  });
});

describe('OC: índice, PDF y meta con permiso hemodinamia', () => {
  it('lee el índice, sube el PDF de una OC y escribe ocImport/meta y ordenesOC', async () => {
    await adminDb.doc('ocImport/meta').set({ version: 1 });
    await expect(uploadBytes(ref(s.hemo.storage, 'ordenes_oc/OC_123.pdf'), pdf(), META_PDF)).resolves.toBeTruthy();
    await expect(getBytes(ref(s.hemo.storage, 'ordenes_oc/OC_123.pdf'))).resolves.toBeTruthy();
    await expect(updateDoc(doc(s.hemo.db, 'ocImport', 'meta'), { ultimaSyncVersionHemodinamia: 1 })).resolves.toBeUndefined();
    await expect(setDoc(doc(s.hemo.db, 'ordenesOC', 'registroPdf'), { pdfs: { 123: { subidoPor: 'x' } } }, { merge: true })).resolves.toBeUndefined();
    await expect(uploadBytes(ref(s.hemo.storage, 'snapshots/indiceOC/indiceOC.json'), new TextEncoder().encode('{}'), { contentType: 'application/json' })).resolves.toBeTruthy();
    await expect(getBytes(ref(s.hemo.storage, 'snapshots/indiceOC/indiceOC.json'))).resolves.toBeTruthy();
  });
});

describe('Códigos desde Hemodinamia', () => {
  it('con el ítem Hemodinamia → Códigos edita maestros_codigos; sin él, no', async () => {
    await expect(setDoc(doc(s.hemo.db, 'maestros_codigos', 'c1'), { referencia: 'X', segmento: 'HEMODINAMIA' })).resolves.toBeUndefined();
    await expect(setDoc(doc(s.hemoSinRespaldo.db, 'maestros_codigos', 'c2'), { referencia: 'Y' })).rejects.toMatchObject(DENEGADO);
  });
});
