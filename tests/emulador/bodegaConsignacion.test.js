// Bodega · Stock consignado (functions/bodega) contra los emuladores de
// Firestore y Auth: dueño del stock en el lote (ingreso en consignación y
// carga inicial con dueño), "dejar en centro" desde el tránsito (y entregar
// o devolver desde ahí), reposición de cajas solo con stock propio,
// consignaciones por empresa, verificarBodega y reglas.
import process from 'node:process';
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { createRequire } from 'node:module';
import { initializeApp as initializeClientApp, deleteApp } from 'firebase/app';
import { getAuth as getClientAuth, connectAuthEmulator, signInWithCustomToken } from 'firebase/auth';
import { getFirestore as getClientFirestore, connectFirestoreEmulator, doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';

const require = createRequire(new URL('../../functions/package.json', import.meta.url));
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const bodega = require('./bodega/servicio.js');
const { verificar } = require('./scripts/verificarBodega.js');

const PROYECTO = 'demo-workcraft';
const FIRESTORE = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const AUTH = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
process.env.FIREBASE_AUTH_EMULATOR_HOST = AUTH;
const rechazo = (code) => expect.objectContaining({ code });
const DENEGADO_REGLAS = expect.objectContaining({ code: 'permission-denied' });

const MAESTRO = '/bodega/maestroBodega';
const INGRESO = '/bodega/ingresoBodega';
const CARGA = '/bodega/cargaInicialBodega';
const EGRESO = '/bodega/egresoBodega';
const TRANSITO = '/bodega/transitoBodega';
const CENTROS = '/bodega/centrosBodega';
const CAJAS = '/bodega/cajasBodega';
const CONSIGNACIONES = '/bodega/consignacionesBodega';
const RUTAS = [MAESTRO, INGRESO, CARGA, EGRESO, TRANSITO, CENTROS, CAJAS, CONSIGNACIONES];

let db;
let auth;
const clientes = [];

const crearUsuario = async (uid, perfil) => {
  await auth.createUser({ uid, email: `${uid}@prueba.cl`, password: 'secreto123' });
  await db.collection('usuarios').doc(uid).set({ nombreCompleto: uid.toUpperCase(), email: `${uid}@prueba.cl`, rol: 'operador', permisos: {}, permisosGranulares: {}, ...perfil });
};
const sesion = async (uid) => {
  const app = initializeClientApp({ apiKey: 'demo', projectId: PROYECTO, authDomain: `${PROYECTO}.firebaseapp.com` }, `cliente-consig-${uid}-${Date.now()}`);
  clientes.push(app);
  const a = getClientAuth(app);
  connectAuthEmulator(a, `http://${AUTH}`, { disableWarnings: true });
  const cdb = getClientFirestore(app);
  const [host, puerto] = FIRESTORE.split(':');
  connectFirestoreEmulator(cdb, host, Number(puerto));
  await signInWithCustomToken(a, await auth.createCustomToken(uid));
  return cdb;
};
const leer = async (col, id) => (await db.collection(col).doc(id).get()).data();
const conPermisos = (granulares = {}) => ({
  permisos: { bodega: RUTAS },
  permisosGranulares: { ...Object.fromEntries(RUTAS.map((r) => [r, {}])), ...granulares },
});
const crearProducto = async (nombre, extra = {}) => (await bodega.guardarProducto(db, 'op', { producto: { nombre, unidadId: 'uni', manejaLote: true, manejaVencimiento: true, ...extra } })).id;

beforeAll(() => {
  const app = initializeApp({ projectId: PROYECTO }, 'pruebas-bodega-consignacion');
  db = getFirestore(app);
  auth = getAuth(app);
});
afterAll(() => Promise.all(clientes.map((c) => deleteApp(c))));

let stent;
const PROPIO = () => `${stent}__L1__2027-01-31`;
const ACME = () => `${stent}__L1__2027-01-31__C_acme`;
const OTRA = () => `${stent}__L9__SV__C_otra`;

beforeEach(async () => {
  await fetch(`http://${FIRESTORE}/emulator/v1/projects/${PROYECTO}/databases/(default)/documents`, { method: 'DELETE' });
  await fetch(`http://${AUTH}/emulator/v1/projects/${PROYECTO}/accounts`, { method: 'DELETE' });
  // Carga inicial confirmada y reponer cajas: con permiso explícito (la confirmación es sensible).
  await crearUsuario('op', conPermisos({ [CARGA]: { carga: { visible: true, elements: { btn_confirmar: true } } } }));
  await crearUsuario('soloTransito', { permisos: { bodega: [TRANSITO] }, permisosGranulares: { [TRANSITO]: { acciones: { visible: true, elements: { btn_dejar_centro: false } } } } });
  await crearUsuario('ajeno', { permisos: { inventario: ['/inventario/generalInventario'] } });
  await crearUsuario('maestros', { permisos: { maestros: ['/maestros/centrosMaestros'] } });
  await db.collection('bodega_catalogos').doc('uni').set({ tipo: 'UNIDAD', nombre: 'UNIDAD', activo: true });
  await db.collection('maestros_centros').doc('pab').set({ nombre: 'PABELLÓN', estado: 'ACTIVO' });
  await db.collection('maestros_empresas').doc('acme').set({ nombre: 'ACME SPA', estado: 'ACTIVO' });
  await db.collection('maestros_empresas').doc('otra').set({ nombre: 'OTRA SPA', estado: 'ACTIVO' });

  stent = await crearProducto('PRUEBA STENT');
  const guia = (numero, consignacion) => ({ tipoDocumento: 'GUIA', numero, proveedorId: 'acme', fecha: '2026-10-16', consignacion });
  // Mismo producto + lote + vencimiento: 4 propios y 6 de ACME en consignación.
  await bodega.confirmarDocumento(db, 'op', { tipo: 'INGRESO', cabecera: guia('P-1', false), lineas: [{ productoId: stent, lote: 'L1', vencimiento: '2027-01-31', cantidad: 4 }] });
  await bodega.confirmarDocumento(db, 'op', { tipo: 'INGRESO', cabecera: guia('C-1', true), lineas: [{ productoId: stent, lote: 'L1', vencimiento: '2027-01-31', cantidad: 6 }] });
});

describe('dueño del stock', () => {
  it('ingreso en consignación: el mismo lote queda separado por dueño; el producto suma todo', async () => {
    expect(await leer('bodega_lotes', PROPIO())).toMatchObject({ disponible: 4, propietarioId: null, propietarioNombre: '' });
    expect(await leer('bodega_lotes', ACME())).toMatchObject({ disponible: 6, propietarioId: 'acme', propietarioNombre: 'ACME SPA', lote: 'L1' });
    expect(await leer('bodega_productos', stent)).toMatchObject({ disponible: 10, transito: 0, enCentro: 0 });
    const movs = (await db.collection('bodega_movimientos').where('loteId', '==', ACME()).get()).docs.map((d) => d.data());
    expect(movs).toEqual([expect.objectContaining({ tipo: 'INGRESO', propietarioId: 'acme', propietarioNombre: 'ACME SPA', saldoLote: { disponible: 6, transito: 0, enCentro: 0 } })]);
    const docs = (await db.collection('bodega_documentos').where('numero', '==', 'C-1').get()).docs.map((d) => d.data());
    expect(docs[0]).toMatchObject({ consignacion: true, propietarioId: 'acme', propietarioNombre: 'ACME SPA' });
  });

  it('carga inicial con empresa dueña (debe existir)', async () => {
    await bodega.confirmarDocumento(db, 'op', { tipo: 'CARGA_INICIAL', cabecera: { observacion: 'X', propietarioId: 'otra' }, lineas: [{ productoId: stent, lote: 'L9', cantidad: 2 }] });
    expect(await leer('bodega_lotes', OTRA())).toMatchObject({ disponible: 2, propietarioId: 'otra', propietarioNombre: 'OTRA SPA' });
    await expect(bodega.confirmarDocumento(db, 'op', { tipo: 'CARGA_INICIAL', cabecera: { propietarioId: 'nada' }, lineas: [{ productoId: stent, lote: 'L9', cantidad: 1 }] }))
      .rejects.toEqual(rechazo('invalid-argument'));
  });

  it('la reposición de cajas usa solo stock propio', async () => {
    await bodega.guardarCaja(db, 'op', { nombre: 'KIT', productos: [{ productoId: stent, stockObjetivo: 8 }] });
    const caja = (await db.collection('bodega_cajas').get()).docs[0].id;
    await expect(bodega.reponerCaja(db, 'op', { cajaId: caja, cantidades: { [stent]: 5 } })).rejects.toEqual(rechazo('invalid-argument'));
    await bodega.reponerCaja(db, 'op', { cajaId: caja, cantidades: { [stent]: 4 } });
    expect(await leer('bodega_lotes', PROPIO())).toMatchObject({ disponible: 0 });
    expect(await leer('bodega_lotes', ACME())).toMatchObject({ disponible: 6 });
  });
});

describe('dejar en centro', () => {
  const egresarAcme = (cantidad) => bodega.egresar(db, 'op', { lineas: [{ productoId: stent, loteId: ACME(), cantidad, centroId: 'pab' }], solicitante: 'Dr', observacion: '' });
  const transito = async () => (await db.collection('bodega_transitos').where('loteId', '==', ACME()).get()).docs.map((d) => ({ id: d.id, ...d.data() }))[0];
  const gestionar = (acciones, uid = 'op') => bodega.gestionarTransito(db, uid, { origen: 'transito', acciones });

  it('egreso → dejar en centro → entregar y devolver desde el centro; todo cuadra', async () => {
    await egresarAcme(5);
    let t = await transito();
    expect(t).toMatchObject({ pendiente: 5, enCentro: 0, propietarioId: 'acme', propietarioNombre: 'ACME SPA' });

    const r = await gestionar([{ transitoId: t.id, accion: 'DEJAR_EN_CENTRO', cantidad: 3 }]);
    expect(r.transitos[0]).toMatchObject({ pendiente: 2, enCentro: 3, estado: 'ABIERTO' });
    expect(await leer('bodega_lotes', ACME())).toMatchObject({ disponible: 1, transito: 2, transitoPorCentro: { pab: 2 }, enCentro: 3, enCentroPorCentro: { pab: 3 } });
    expect(await leer('bodega_transito_centros', 'pab')).toMatchObject({ unidades: 2, enCentro: 3, productosEnCentro: { [stent]: 3 } });
    expect(await verificar(db)).toEqual([]);

    // Desde el centro: entregar (usado) pide admisión; devolver vuelve al disponible.
    await expect(gestionar([{ transitoId: t.id, accion: 'ENTREGAR', desde: 'CENTRO', cantidad: 1, observacion: 'x' }])).rejects.toEqual(rechazo('invalid-argument'));
    await gestionar([{ transitoId: t.id, accion: 'ENTREGAR', desde: 'CENTRO', cantidad: 1, idEntrega: '123', observacion: 'Paciente' }]);
    await gestionar([{ transitoId: t.id, accion: 'DEVOLVER', desde: 'CENTRO', cantidad: 2 }]);
    await expect(gestionar([{ transitoId: t.id, accion: 'DEVOLVER', desde: 'CENTRO', cantidad: 1 }])).rejects.toEqual(rechazo('failed-precondition'));
    await gestionar([{ transitoId: t.id, accion: 'DEVOLVER', cantidad: 2 }]);
    t = await transito();
    expect(t).toMatchObject({ pendiente: 0, enCentro: 0, entregado: 1, devuelto: 4, estado: 'CERRADO' });
    expect(await leer('bodega_lotes', ACME())).toMatchObject({ disponible: 5, transito: 0, enCentro: 0, enCentroPorCentro: {} });
    expect(await leer('bodega_productos', stent)).toMatchObject({ disponible: 9, transito: 0, enCentro: 0 });

    const tipos = (await db.collection('bodega_movimientos').where('loteId', '==', ACME()).get()).docs.map((d) => d.data().tipo).sort();
    expect(tipos).toEqual(['DEJADO_EN_CENTRO', 'DEVOLUCION', 'DEVOLUCION_DESDE_CENTRO', 'ENTREGA_DESDE_CENTRO', 'INGRESO', 'SALIDA_A_TRANSITO']);
    expect(await verificar(db)).toEqual([]);
  });

  it('dejar en centro tiene su propio permiso; no se pasa de lo pendiente', async () => {
    await egresarAcme(2);
    const t = await transito();
    await expect(gestionar([{ transitoId: t.id, accion: 'DEJAR_EN_CENTRO', cantidad: 1 }], 'soloTransito')).rejects.toEqual(rechazo('permission-denied'));
    await expect(gestionar([{ transitoId: t.id, accion: 'DEJAR_EN_CENTRO', cantidad: 3 }])).rejects.toEqual(rechazo('failed-precondition'));
  });

  it('reglas: no se borra un centro que solo tiene stock dejado en él', async () => {
    await egresarAcme(1);
    const t = await transito();
    await gestionar([{ transitoId: t.id, accion: 'DEJAR_EN_CENTRO', cantidad: 1 }]);
    expect(await leer('bodega_transito_centros', 'pab')).toMatchObject({ unidades: 0, enCentro: 1 });
    const cdb = await sesion('maestros');
    await expect(deleteDoc(doc(cdb, 'maestros_centros', 'pab'))).rejects.toEqual(DENEGADO_REGLAS);
  });
});

describe('consignaciones por empresa', () => {
  const guardar = (lineas, uid = 'op', extra = {}) => bodega.guardarConsignacion(db, uid, { empresaId: 'acme', lineas, ...extra });

  it('crea, edita y quita líneas con auditoría; normaliza lote y calcula el lote del dueño', async () => {
    const r = await guardar([{ productoId: stent, lote: ' l1', vencimiento: '2027-01-31', cantidadConsignada: 8 }]);
    expect(r).toMatchObject({ id: 'acme', empresaNombre: 'ACME SPA', cantidadLineas: 1, totalConsignado: 8 });
    expect(r.lineas[0]).toMatchObject({ lote: 'L1', loteId: ACME(), productoNombre: 'PRUEBA STENT' });
    await guardar([
      { productoId: stent, lote: 'L1', vencimiento: '2027-01-31', cantidadConsignada: 6 },
      { productoId: stent, lote: 'L2', vencimiento: '2028-01-31', cantidadConsignada: 2 },
    ], 'op', { observacion: 'Contrato 2026' });
    await guardar([{ productoId: stent, lote: 'L2', vencimiento: '2028-01-31', cantidadConsignada: 2 }], 'op', { observacion: 'Contrato 2026' });
    const c = await leer('bodega_consignaciones', 'acme');
    expect(c).toMatchObject({ empresaNombre: 'ACME SPA', cantidadLineas: 1, totalConsignado: 2, observacion: 'Contrato 2026', creadoPor: { uid: 'op' } });
    const logs = (await db.collection('bodega_consignaciones').doc('acme').collection('logs').get()).docs.map((d) => d.data());
    expect(logs.map((l) => l.accion).sort()).toEqual(['CREACION', 'EDICION', 'EDICION']);
    const quitada = logs.find((l) => l.detalle.cambios.some((x) => x.despues === null));
    expect(quitada.detalle.cambios).toEqual([expect.objectContaining({ lote: 'L1', antes: 6, despues: null })]);
  });

  it('valida en servidor: empresa existente, repetidos, cantidades y permiso', async () => {
    await expect(guardar([], 'op', { empresaId: 'nada' })).rejects.toEqual(rechazo('invalid-argument'));
    await expect(guardar([
      { productoId: stent, lote: 'L1', vencimiento: '2027-01-31', cantidadConsignada: 1 },
      { productoId: stent, lote: 'l1', vencimiento: '2027-01-31', cantidadConsignada: 1 },
    ])).rejects.toEqual(rechazo('invalid-argument'));
    await expect(guardar([{ productoId: stent, cantidadConsignada: 1.5 }])).rejects.toEqual(rechazo('invalid-argument'));
    await expect(guardar([], 'ajeno')).rejects.toEqual(rechazo('permission-denied'));
  });

  it('reglas: se leen con el módulo Bodega; nadie escribe desde el navegador', async () => {
    await guardar([{ productoId: stent, lote: 'L1', vencimiento: '2027-01-31', cantidadConsignada: 1 }]);
    const op = await sesion('op');
    expect((await getDoc(doc(op, 'bodega_consignaciones', 'acme'))).data()).toMatchObject({ totalConsignado: 1 });
    await expect(setDoc(doc(op, 'bodega_consignaciones', 'acme'), { totalConsignado: 99 }, { merge: true })).rejects.toEqual(DENEGADO_REGLAS);
    const ajeno = await sesion('ajeno');
    await expect(getDoc(doc(ajeno, 'bodega_consignaciones', 'acme'))).rejects.toEqual(DENEGADO_REGLAS);
  });
});
