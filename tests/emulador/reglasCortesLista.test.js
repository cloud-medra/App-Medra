// Cortes de lista [0:n] en firestore.rules con n = 0, contra los emuladores.
// En las reglas, `lista[0:0]` no da una lista vacía: lanza "Index out of
// bound error. Index: [-1]", y un error en la regla es un rechazo
// ("Missing or insufficient permissions"). Pasó en:
//   - Implantes → Fibras → Corregir: bajar los usos previos a 0 (FIB-0001,
//     de 2 a 0) se rechazaba en esCorreccion.
//   - Tickets: el creador no podía escribir el primer mensaje de un ticket
//     sin mensajes (actualizacionDelCreador).
// Ambos cortes ahora se saltan con `n == 0 ||` (ver también
// tests/reglasCortesLista.test.js, que lo revisa sin emulador).
import process from 'node:process';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'node:module';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, doc, collection, updateDoc, writeBatch, serverTimestamp } from 'firebase/firestore';

const require = createRequire(new URL('../../functions/package.json', import.meta.url));
const adminApp = require('firebase-admin/app');
const { getFirestore: getFirestoreAdmin } = require('firebase-admin/firestore');

const PROYECTO = 'demo-workcraft';
const FIRESTORE = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const AUTH = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
const RUTA_FIBRAS = '/implantes/fibrasReutilizables';
const apps = [];
let adminDb;
const s = {};

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
  return { db, uid: user.uid };
};

// Fibra con usos previos y sin usos registrados en el sistema (como FIB-0001).
const fibraBase = (previos, extra = {}) => ({
  codigoInterno: 'FIB-0001', referencia: 'FL-550', lote: 'A254240', vencimiento: '2030-10-14',
  usosTotales: 10, usosPrevios: previos, numerosOcupados: [], usosConsumidos: previos,
  estado: 'ACTIVA', fechasUso: {}, ubicacion: 'EN BODEGA', ultimoCambio: null, ...extra,
});

// Lo mismo que escribe editarFibra: la fibra y su log de corrección juntos.
const corregir = (sesionUsuario, fibraId, cambios) => {
  const { db, uid } = sesionUsuario;
  const refLog = doc(collection(db, 'implantes_fibras', fibraId, 'logs'));
  const batch = writeBatch(db);
  batch.update(doc(db, 'implantes_fibras', fibraId), {
    ...cambios,
    ultimaCorreccion: { motivo: 'prueba', logId: refLog.id },
    actualizadoEl: serverTimestamp(),
    actualizadoPor: { uid, nombre: 'Prueba' },
  });
  batch.set(refLog, { accion: 'EDICION', detalles: { despues: cambios }, usuario: 'Prueba', uid, timestamp: serverTimestamp() });
  return batch.commit();
};

beforeAll(async () => {
  adminDb = getFirestoreAdmin(adminApp.initializeApp({ projectId: PROYECTO }, 'pruebas-reglas-cortes'));
  await fetch(`http://${FIRESTORE}/emulator/v1/projects/${PROYECTO}/databases/(default)/documents`, { method: 'DELETE' });
  s.fibras = await sesion('fibras', {
    rol: 'operador',
    permisos: { implantes: [RUTA_FIBRAS] },
    permisosGranulares: { [RUTA_FIBRAS]: { tabla_fibras: { visible: true, elements: { action_editar: true } } } },
  });
  s.creador = await sesion('creador', { rol: 'operador', permisos: { general: ['/general/soporte'] } });
});
afterAll(() => Promise.all(apps.map((a) => deleteApp(a))));

describe('Fibras → Corregir: usos previos a 0', () => {
  it('baja los usos previos de 2 a 0 (antes: error de índice en [0:0])', async () => {
    await adminDb.doc('implantes_fibras/FIB-0001').set(fibraBase(2));
    await expect(corregir(s.fibras, 'FIB-0001', { usosPrevios: 0, usosConsumidos: 0 })).resolves.toBeUndefined();
  });

  it('sigue rechazando previos que chocan con un uso registrado o consumidos incoherentes', async () => {
    await adminDb.doc('implantes_fibras/FIB-0002').set(fibraBase(0, {
      codigoInterno: 'FIB-0002', numerosOcupados: [2], usosConsumidos: 1, fechasUso: { 2: '2026-10-30' },
    }));
    await expect(corregir(s.fibras, 'FIB-0002', { usosPrevios: 2, usosConsumidos: 3 })).rejects.toMatchObject(DENEGADO);
    await adminDb.doc('implantes_fibras/FIB-0003').set(fibraBase(2, { codigoInterno: 'FIB-0003' }));
    await expect(corregir(s.fibras, 'FIB-0003', { usosPrevios: 0 })).rejects.toMatchObject(DENEGADO);
  });
});

describe('Tickets: mensajes del creador', () => {
  const mensaje = (uid, texto) => ({ autorUid: uid, tipo: 'mensaje', deGestor: false, texto });
  const ticket = (uid, mensajes) => ({ creadoPor: uid, estado: 'NUEVO', mensajes, noLeidoUsuario: false, pendienteGestor: true });
  const responder = (uid, mensajes) => updateDoc(doc(s.creador.db, 'tickets', 'T1'), {
    mensajes, noLeidoUsuario: false, pendienteGestor: true, actualizadoEl: serverTimestamp(),
  });

  it('escribe el primer mensaje de un ticket sin mensajes (antes: error de índice en [0:0])', async () => {
    const { uid } = s.creador;
    await adminDb.doc('tickets/T1').set(ticket(uid, []));
    await expect(responder(uid, [mensaje(uid, 'hola')])).resolves.toBeUndefined();
  });

  it('agrega el siguiente sin tocar los anteriores; alterarlos se rechaza', async () => {
    const { uid } = s.creador;
    await adminDb.doc('tickets/T1').set(ticket(uid, [mensaje(uid, 'a')]));
    await expect(responder(uid, [mensaje(uid, 'CAMBIADO'), mensaje(uid, 'b')])).rejects.toMatchObject(DENEGADO);
    await expect(responder(uid, [mensaje(uid, 'a'), mensaje(uid, 'b')])).resolves.toBeUndefined();
  });
});
