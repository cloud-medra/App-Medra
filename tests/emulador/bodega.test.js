// Bodega, Fase 1 (functions/bodega): catálogos, maestro de productos y
// códigos de barra contra los emuladores de Firestore y Auth. Permisos
// granulares (incluidas las acciones sensibles), unicidad, validaciones en
// servidor y reglas (el navegador solo lee; no se borra un centro con
// tránsito en Bodega).
import process from 'node:process';
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { createRequire } from 'node:module';
import { initializeApp as initializeClientApp, deleteApp } from 'firebase/app';
import { getAuth as getClientAuth, connectAuthEmulator, signInWithCustomToken } from 'firebase/auth';
import {
  getFirestore as getClientFirestore, connectFirestoreEmulator, doc, getDoc, getDocs, setDoc, deleteDoc, collection,
} from 'firebase/firestore';

const require = createRequire(new URL('../../functions/package.json', import.meta.url));
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const bodega = require('./bodega/servicio.js');

const PROYECTO = 'demo-workcraft';
const FIRESTORE = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const AUTH = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
process.env.FIREBASE_AUTH_EMULATOR_HOST = AUTH;
const rechazo = (code) => expect.objectContaining({ code });
const DENEGADO_REGLAS = expect.objectContaining({ code: 'permission-denied' });

const MAESTRO = '/bodega/maestroBodega';
const CATALOGOS = '/bodega/catalogosBodega';
const GTIN = '07612345678900';

let db;
let auth;
const clientes = [];

const crearUsuario = async (uid, perfil) => {
  await auth.createUser({ uid, email: `${uid}@prueba.cl`, password: 'secreto123' });
  await db.collection('usuarios').doc(uid).set({ nombreCompleto: uid.toUpperCase(), email: `${uid}@prueba.cl`, rol: 'operador', permisos: {}, permisosGranulares: {}, ...perfil });
};
const sesion = async (uid) => {
  const app = initializeClientApp({ apiKey: 'demo', projectId: PROYECTO, authDomain: `${PROYECTO}.firebaseapp.com` }, `cliente-bodega-${uid}-${Date.now()}`);
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

// Operador con el Maestro de Bodega (acciones sin configurar: permitidas,
// salvo las sensibles) y Categorías.
const PERMISOS_BODEGA = { permisos: { bodega: [MAESTRO, CATALOGOS] }, permisosGranulares: { [MAESTRO]: {}, [CATALOGOS]: {} } };
const conSensibles = {
  permisos: { bodega: [MAESTRO] },
  permisosGranulares: { [MAESTRO]: { productos: { visible: true, elements: { btn_inactivar: true } }, codigos: { visible: true, elements: { btn_desvincular: true } } } },
};
const productoBase = (extra = {}) => ({ nombre: 'Guante nitrilo M', unidadId: 'uni', manejaLote: true, manejaVencimiento: true, ...extra });
const crearProducto = (uid, extra = {}, opciones = {}) => bodega.guardarProducto(db, uid, { producto: productoBase(extra), ...opciones });

beforeAll(() => {
  const app = initializeApp({ projectId: PROYECTO }, 'pruebas-bodega');
  db = getFirestore(app);
  auth = getAuth(app);
});
afterAll(() => Promise.all(clientes.map((c) => deleteApp(c))));

beforeEach(async () => {
  await fetch(`http://${FIRESTORE}/emulator/v1/projects/${PROYECTO}/databases/(default)/documents`, { method: 'DELETE' });
  await fetch(`http://${AUTH}/emulator/v1/projects/${PROYECTO}/accounts`, { method: 'DELETE' });
  await crearUsuario('dev1', { rol: 'dev' });
  await crearUsuario('op', PERMISOS_BODEGA);
  await crearUsuario('sensible', conSensibles);
  await crearUsuario('maestros', { permisos: { maestros: ['/maestros/centrosMaestros'] } });
  await crearUsuario('ajeno', { permisos: { inventario: ['/inventario/generalInventario'] } });
  await crearUsuario('inactivo', { ...PERMISOS_BODEGA, activo: false });
  await db.collection('bodega_catalogos').doc('uni').set({ tipo: 'UNIDAD', nombre: 'UNIDAD', activo: true });
  await db.collection('bodega_catalogos').doc('caja').set({ tipo: 'UNIDAD', nombre: 'CAJA', activo: false });
  await db.collection('bodega_catalogos').doc('cat').set({ tipo: 'CATEGORIA', nombre: 'INSUMOS', activo: true });
  await db.collection('maestros_codigos').doc('mc1').set({ codigo: '0301001', referencia: 'REF-9', descriptorAuto: 'GUANTE NITRILO', empresa: 'ACME', precioNeto: 1200 });
  await db.collection('maestros_centros').doc('pab').set({ nombre: 'PABELLÓN', estado: 'ACTIVO' });
});

describe('catálogos (categorías y unidades)', () => {
  it('crea, renombra e inactiva; nombre único por tipo; requiere la acción', async () => {
    const { id } = await bodega.guardarCatalogo(db, 'op', { tipo: 'CATEGORIA', nombre: ' suturas ' });
    expect(await leer('bodega_catalogos', id)).toMatchObject({ tipo: 'CATEGORIA', nombre: 'SUTURAS', activo: true });
    // Sin distinguir tildes ni mayúsculas.
    await expect(bodega.guardarCatalogo(db, 'op', { tipo: 'CATEGORIA', nombre: 'Súturas' })).rejects.toEqual(rechazo('already-exists'));
    await expect(bodega.guardarCatalogo(db, 'op', { tipo: 'CATEGORIA', nombre: 'SUTURAS' })).rejects.toEqual(rechazo('already-exists'));
    // Mismo nombre en otro tipo: permitido.
    await expect(bodega.guardarCatalogo(db, 'op', { tipo: 'UNIDAD', nombre: 'SUTURAS' })).resolves.toMatchObject({ tipo: 'UNIDAD' });
    await bodega.guardarCatalogo(db, 'op', { id, tipo: 'CATEGORIA', nombre: 'Suturas y agujas', activo: false });
    expect(await leer('bodega_catalogos', id)).toMatchObject({ nombre: 'SUTURAS Y AGUJAS', activo: false });
    // El nombre anterior quedó libre.
    await expect(bodega.guardarCatalogo(db, 'op', { tipo: 'CATEGORIA', nombre: 'SUTURAS' })).resolves.toBeTruthy();
    await expect(bodega.guardarCatalogo(db, 'op', { id, tipo: 'UNIDAD', nombre: 'X' })).rejects.toEqual(rechazo('invalid-argument'));
    await expect(bodega.guardarCatalogo(db, 'ajeno', { tipo: 'UNIDAD', nombre: 'KG' })).rejects.toEqual(rechazo('permission-denied'));
    await expect(bodega.guardarCatalogo(db, 'inactivo', { tipo: 'UNIDAD', nombre: 'KG' })).rejects.toEqual(rechazo('permission-denied'));
    await expect(bodega.guardarCatalogo(db, undefined, { tipo: 'UNIDAD', nombre: 'KG' })).rejects.toEqual(rechazo('unauthenticated'));
  });
});

describe('productos', () => {
  it('crea con código automático correlativo, totales en cero y auditoría', async () => {
    const a = await crearProducto('op');
    const b = await crearProducto('op', { nombre: 'Gasa' });
    expect(a.producto.codigoMaestro).toBe('BOD-00001');
    expect(b.producto.codigoMaestro).toBe('BOD-00002');
    const doc1 = await leer('bodega_productos', a.id);
    expect(doc1).toMatchObject({ nombre: 'Guante nitrilo M', disponible: 0, transito: 0, transitoPorCentro: {}, activo: true, conMovimientos: false, creadoPor: { uid: 'op' } });
    const logs = await db.collection('bodega_productos').doc(a.id).collection('logs').get();
    expect(logs.docs.map((d) => d.data().accion)).toEqual(['CREACION']);
  });

  it('código maestro único (sin importar mayúsculas/espacios) y liberado al cambiarlo', async () => {
    const a = await crearProducto('op', { codigoMaestro: 'gn-01' });
    expect(a.producto.codigoMaestro).toBe('GN-01');
    await expect(crearProducto('op', { codigoMaestro: ' GN-01 ' })).rejects.toEqual(rechazo('already-exists'));
    await bodega.guardarProducto(db, 'op', { id: a.id, producto: productoBase({ codigoMaestro: 'GN-02' }) });
    await expect(crearProducto('op', { codigoMaestro: 'GN-01' })).resolves.toBeTruthy();
    // El automático salta un código que alguien escribió a mano.
    await crearProducto('op', { codigoMaestro: 'BOD-00001' });
    expect((await crearProducto('op')).producto.codigoMaestro).toBe('BOD-00002');
  });

  it('valida en servidor: datos, unidad/categoría existentes y activas', async () => {
    await expect(crearProducto('op', { nombre: '  ' })).rejects.toEqual(rechazo('invalid-argument'));
    await expect(crearProducto('op', { unidadId: 'no-existe' })).rejects.toEqual(rechazo('invalid-argument'));
    await expect(crearProducto('op', { unidadId: 'cat' })).rejects.toEqual(rechazo('invalid-argument')); // es categoría
    await expect(crearProducto('op', { unidadId: 'caja' })).rejects.toEqual(rechazo('invalid-argument')); // inactiva
    await expect(crearProducto('op', { stockMinimo: -1 })).rejects.toEqual(rechazo('invalid-argument'));
    await expect(crearProducto('op', { categoriaId: 'cat', stockMinimo: '5' })).resolves.toMatchObject({ producto: { categoriaId: 'cat', stockMinimo: 5 } });
  });

  it('una unidad que quedó inactiva se conserva al editar', async () => {
    const { id } = await crearProducto('op');
    await db.collection('bodega_catalogos').doc('uni').update({ activo: false });
    await expect(bodega.guardarProducto(db, 'op', { id, producto: productoBase({ nombre: 'Otro nombre' }) })).resolves.toBeTruthy();
  });

  it('vínculo opcional con el maestro clínico (copia sus datos; uno por producto de Bodega)', async () => {
    const { id } = await crearProducto('op', { maestroCodigoId: 'mc1' });
    expect((await leer('bodega_productos', id)).maestroCodigo).toEqual({ codigo: '0301001', referencia: 'REF-9', descriptor: 'GUANTE NITRILO', empresa: 'ACME', clase: '', precioNeto: 1200 });
    await expect(crearProducto('op', { maestroCodigoId: 'mc1' })).rejects.toEqual(rechazo('already-exists'));
    await expect(crearProducto('op', { maestroCodigoId: 'nada' })).rejects.toEqual(rechazo('invalid-argument'));
    // Al quitarlo, queda libre.
    await bodega.guardarProducto(db, 'op', { id, producto: productoBase() });
    await expect(crearProducto('op', { maestroCodigoId: 'mc1' })).resolves.toBeTruthy();
  });

  it('activar/inactivar es acción sensible; no se inactiva con stock', async () => {
    const { id } = await crearProducto('op');
    await expect(bodega.guardarProducto(db, 'op', { id, producto: productoBase({ activo: false }) })).rejects.toEqual(rechazo('permission-denied'));
    await db.collection('usuarios').doc('sensible').update({ 'permisos.bodega': [MAESTRO] });
    await db.collection('bodega_productos').doc(id).update({ transito: 1, transitoPorCentro: { pab: 1 } });
    await expect(bodega.guardarProducto(db, 'sensible', { id, producto: productoBase({ activo: false }) })).rejects.toEqual(rechazo('failed-precondition'));
    await db.collection('bodega_productos').doc(id).update({ transito: 0, transitoPorCentro: {} });
    await bodega.guardarProducto(db, 'sensible', { id, producto: productoBase({ activo: false }) });
    expect((await leer('bodega_productos', id)).activo).toBe(false);
    await expect(bodega.guardarProducto(db, 'dev1', { id, producto: productoBase({ activo: true }) })).resolves.toBeTruthy();
  });

  it('con movimientos no cambia si maneja lote/vencimiento; los totales no se tocan desde el formulario', async () => {
    const { id } = await crearProducto('op');
    await db.collection('bodega_productos').doc(id).update({ conMovimientos: true, disponible: 7 });
    await expect(bodega.guardarProducto(db, 'op', { id, producto: productoBase({ manejaLote: false }) })).rejects.toEqual(rechazo('failed-precondition'));
    await bodega.guardarProducto(db, 'op', { id, producto: { ...productoBase({ nombre: 'Nuevo' }), disponible: 999 } });
    expect(await leer('bodega_productos', id)).toMatchObject({ nombre: 'Nuevo', disponible: 7 });
    const logs = await db.collection('bodega_productos').doc(id).collection('logs').where('accion', '==', 'EDICION').get();
    expect(logs.docs[0].data().detalle.cambios.nombre).toEqual({ antes: 'Guante nitrilo M', despues: 'Nuevo' });
  });

  it('sin permiso del Maestro no crea ni edita', async () => {
    await expect(crearProducto('ajeno')).rejects.toEqual(rechazo('permission-denied'));
    await db.collection('usuarios').doc('op').set({ permisosGranulares: { [MAESTRO]: { productos: { visible: true, elements: { btn_crear: false } } }, [CATALOGOS]: {} } }, { merge: true });
    await expect(crearProducto('op')).rejects.toEqual(rechazo('permission-denied'));
  });
});

describe('códigos de barra', () => {
  it('crear el producto con el código escaneado (GS1: se vincula el GTIN)', async () => {
    const { id } = await crearProducto('op', {}, { codigos: [`(01)${GTIN}(17)261231(10)L1`] });
    expect(await leer('bodega_codigos_barra', GTIN)).toMatchObject({ clave: GTIN, productoId: id, creadoPor: { uid: 'op' } });
    expect((await leer('bodega_productos', id)).codigosBarra).toEqual([GTIN]);
    // Un código que solo trae lote no identifica producto.
    await expect(crearProducto('op', {}, { codigos: ['(10)L1'] })).rejects.toEqual(rechazo('invalid-argument'));
  });

  it('vincular: idempotente; si está en otro producto avisa con detalle y solo reasigna con permiso sensible', async () => {
    const a = await crearProducto('op');
    const b = await crearProducto('op', { nombre: 'Otro' });
    await expect(bodega.vincularCodigo(db, 'op', { productoId: a.id, codigoLeido: '7801234567893' })).resolves.toMatchObject({ clave: '7801234567893' });
    await expect(bodega.vincularCodigo(db, 'op', { productoId: a.id, codigoLeido: '7801234567893' })).resolves.toMatchObject({ yaVinculado: true });

    const err = await bodega.vincularCodigo(db, 'op', { productoId: b.id, codigoLeido: '7801234567893' }).catch((e) => e);
    expect(err.code).toBe('failed-precondition');
    expect(err.details).toMatchObject({ motivo: 'vinculado-a-otro', productoId: a.id, codigoMaestro: 'BOD-00001' });
    await expect(bodega.vincularCodigo(db, 'op', { productoId: b.id, codigoLeido: '7801234567893', reasignar: true })).rejects.toEqual(rechazo('permission-denied'));

    await db.collection('usuarios').doc('sensible').set({ permisos: { bodega: [MAESTRO] } }, { merge: true });
    await bodega.vincularCodigo(db, 'sensible', { productoId: b.id, codigoLeido: '7801234567893', reasignar: true });
    expect(await leer('bodega_codigos_barra', '7801234567893')).toMatchObject({ productoId: b.id, reasignadoDe: a.id });
    expect((await leer('bodega_productos', a.id)).codigosBarra).toEqual([]);
    expect((await leer('bodega_productos', b.id)).codigosBarra).toEqual(['7801234567893']);
  });

  it('no vincula a un producto inactivo ni códigos vacíos o solo de lote', async () => {
    const { id } = await crearProducto('op');
    await db.collection('bodega_productos').doc(id).update({ activo: false });
    await expect(bodega.vincularCodigo(db, 'op', { productoId: id, codigoLeido: 'X1' })).rejects.toEqual(rechazo('failed-precondition'));
    await expect(bodega.vincularCodigo(db, 'op', { productoId: id, codigoLeido: '  ' })).rejects.toEqual(rechazo('invalid-argument'));
    await expect(bodega.vincularCodigo(db, 'op', { productoId: id, codigoLeido: '(17)261231' })).rejects.toEqual(rechazo('invalid-argument'));
  });

  it('desvincular es sensible y solo del producto dueño', async () => {
    const { id } = await crearProducto('op', {}, { codigos: ['ABC-1'] });
    await expect(bodega.desvincularCodigo(db, 'op', { productoId: id, clave: 'ABC-1' })).rejects.toEqual(rechazo('permission-denied'));
    await db.collection('usuarios').doc('sensible').set({ permisos: { bodega: [MAESTRO] } }, { merge: true });
    await expect(bodega.desvincularCodigo(db, 'sensible', { productoId: 'otro', clave: 'ABC-1' })).rejects.toEqual(rechazo('failed-precondition'));
    await bodega.desvincularCodigo(db, 'sensible', { productoId: id, clave: 'ABC-1' });
    expect(await leer('bodega_codigos_barra', 'ABC-1')).toBeUndefined();
    expect((await leer('bodega_productos', id)).codigosBarra).toEqual([]);
  });
});

describe('reglas de Firestore', () => {
  it('con el módulo Bodega se lee; sin él, no; nadie escribe desde el navegador', async () => {
    const { id } = await crearProducto('op');
    const op = await sesion('op');
    await expect(getDoc(doc(op, 'bodega_productos', id))).resolves.toBeTruthy();
    await expect(getDocs(collection(op, 'bodega_catalogos'))).resolves.toBeTruthy();
    await expect(setDoc(doc(op, 'bodega_productos', id), { disponible: 100 }, { merge: true })).rejects.toEqual(DENEGADO_REGLAS);
    await expect(setDoc(doc(op, 'bodega_codigos_barra', 'X'), { productoId: id })).rejects.toEqual(DENEGADO_REGLAS);
    await expect(getDoc(doc(op, 'bodega_unicos', 'codigo__BOD-00001'))).rejects.toEqual(DENEGADO_REGLAS);

    const dev = await sesion('dev1');
    await expect(setDoc(doc(dev, 'bodega_lotes', 'x'), { disponible: 1 })).rejects.toEqual(DENEGADO_REGLAS);

    const ajeno = await sesion('ajeno');
    await expect(getDoc(doc(ajeno, 'bodega_productos', id))).rejects.toEqual(DENEGADO_REGLAS);
  });

  it('Maestros → Centros: no se borra un centro con tránsito en Bodega (sí sin tránsito); lee el total', async () => {
    const maestros = await sesion('maestros');
    await db.collection('bodega_transito_centros').doc('pab').set({ unidades: 3, productos: { p: 3 }, productosDistintos: 1 });
    await expect(getDoc(doc(maestros, 'bodega_transito_centros', 'pab'))).resolves.toBeTruthy();
    await expect(deleteDoc(doc(maestros, 'maestros_centros', 'pab'))).rejects.toEqual(DENEGADO_REGLAS);
    // Los logs del centro y la edición siguen permitidos.
    await expect(setDoc(doc(maestros, 'maestros_centros', 'pab', 'logs', 'l1'), { accion: 'EDICION' })).resolves.toBeUndefined();
    await expect(setDoc(doc(maestros, 'maestros_centros', 'pab'), { estado: 'INACTIVO' }, { merge: true })).resolves.toBeUndefined();

    await db.collection('bodega_transito_centros').doc('pab').set({ unidades: 0, productos: {}, productosDistintos: 0 });
    await expect(deleteDoc(doc(maestros, 'maestros_centros', 'pab'))).resolves.toBeUndefined();
    await db.collection('maestros_centros').doc('uci').set({ nombre: 'UCI', estado: 'ACTIVO' });
    await expect(deleteDoc(doc(maestros, 'maestros_centros', 'uci'))).resolves.toBeUndefined(); // sin documento de tránsito

    const ajeno = await sesion('ajeno');
    await expect(getDoc(doc(ajeno, 'bodega_transito_centros', 'pab'))).rejects.toEqual(DENEGADO_REGLAS);
  });
});

describe('migración de códigos de barra desde Inventario (functions/scripts/migrarCodigosBarraBodega.js)', () => {
  const migracion = require('./scripts/migrarCodigosBarraBodega.js');

  it('simula sin escribir, crea productos con sus códigos, completa existentes, salta conflictos y es repetible', async () => {
    await db.collection('maestros_codigos').doc('mc2').set({ codigo: '0301001', referencia: 'R2', descriptorAuto: 'SONDA FOLEY', clase: 'INSUMOS' });
    await db.collection('maestros_codigos').doc('mc3').set({ codigo: '', referencia: 'R3', descriptorAuto: 'PLACA', clase: 'IMPLANTES' });
    const inv = db.collection('inventario_codigos_barra');
    await inv.doc(GTIN).set({ clave: GTIN, codigoLeido: `(01)${GTIN}(10)L1`, productoId: 'mc2' });
    await inv.doc('780111').set({ clave: '780111', codigoLeido: '780111', productoId: 'mc2' });
    await inv.doc('780222').set({ clave: '780222', productoId: 'mc3' });
    await inv.doc('780333').set({ clave: '780333', productoId: 'mc1' }); // mc1 ya está en Bodega
    await inv.doc('780444').set({ clave: '780444', productoId: 'mc3' }); // en Bodega es de otro producto
    await inv.doc('780555').set({ clave: '780555', productoId: 'borrado' });
    const existente = await crearProducto('op', { maestroCodigoId: 'mc1' });
    const otro = await crearProducto('op', { nombre: 'Otro' }, { codigos: ['780444'] });

    const plan = await migracion.planificar(db);
    expect(plan.crear.map((p) => [p.maestroId, p.clase, p.codigos.length]).sort()).toEqual([['mc2', 'INSUMOS', 2], ['mc3', 'IMPLANTE', 1]]);
    expect(plan.completar).toEqual([expect.objectContaining({ productoId: existente.id, codigos: [{ clave: '780333', codigoLeido: '780333' }] })]);
    expect(plan.conflictos).toEqual([expect.objectContaining({ clave: '780444', productoBodegaId: otro.id })]);
    expect(plan.huerfanos).toEqual([{ maestroId: 'borrado', codigos: ['780555'] }]);
    expect([...plan.categoriasNuevas].sort()).toEqual(['IMPLANTE']); // INSUMOS ya existe
    expect((await db.collection('bodega_productos').get()).size).toBe(2); // la simulación no escribió

    expect(await migracion.aplicar(db, plan)).toEqual([]);
    const sonda = (await db.collection('bodega_productos').where('maestroCodigoId', '==', 'mc2').get()).docs[0];
    expect(sonda.data()).toMatchObject({ nombre: 'SONDA FOLEY', referencia: 'R2', categoriaId: 'cat', unidadId: 'uni', manejaLote: true, maestroCodigo: { codigo: '0301001' } });
    expect(sonda.data().codigosBarra.sort()).toEqual([GTIN, '780111'].sort());
    expect(await leer('bodega_codigos_barra', '780333')).toMatchObject({ productoId: existente.id });
    expect(await leer('bodega_codigos_barra', '780444')).toMatchObject({ productoId: otro.id }); // no se reasignó
    // Inventario no se tocó.
    expect(await leer('inventario_codigos_barra', '780111')).toEqual({ clave: '780111', codigoLeido: '780111', productoId: 'mc2' });

    const otraVez = await migracion.planificar(db);
    expect(otraVez.crear).toEqual([]);
    expect(otraVez.completar).toEqual([]);
  });
});
