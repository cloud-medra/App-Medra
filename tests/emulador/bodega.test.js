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
const INGRESO = '/bodega/ingresoBodega';
const CARGA = '/bodega/cargaInicialBodega';
const EGRESO = '/bodega/egresoBodega';
const TRANSITO = '/bodega/transitoBodega';
const CENTROS = '/bodega/centrosBodega';
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
const PERMISOS_BODEGA = {
  permisos: { bodega: [MAESTRO, CATALOGOS, INGRESO, CARGA, EGRESO, TRANSITO, CENTROS] },
  permisosGranulares: { [MAESTRO]: {}, [CATALOGOS]: {}, [INGRESO]: {}, [CARGA]: {}, [EGRESO]: {}, [TRANSITO]: {}, [CENTROS]: {} },
};
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
  await db.collection('maestros_centros').doc('uci').set({ nombre: 'UCI', estado: 'ACTIVO' });
  await db.collection('maestros_centros').doc('viejo').set({ nombre: 'CENTRO VIEJO', estado: 'INACTIVO' });
  await db.collection('maestros_empresas').doc('acme').set({ nombre: 'ACME SPA', rut: '76.000.000-0', estado: 'ACTIVO' });
  await db.collection('maestros_empresas').doc('otra').set({ nombre: 'OTRA SPA', estado: 'ACTIVO' });
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

describe('ingreso por documento y carga inicial (Fase 2)', () => {
  const cabeceraIngreso = (extra = {}) => ({ tipoDocumento: 'GUIA', numero: 'g-100', ordenCompra: 'oc-9', proveedorId: 'acme', fecha: '2026-10-14', observacion: 'Prueba', ...extra });
  const ingresar = (uid, lineas, extra = {}) => bodega.confirmarDocumento(db, uid, { tipo: 'INGRESO', cabecera: cabeceraIngreso(extra.cabecera), lineas, ...(extra.id ? { id: extra.id } : {}) });
  const cargar = (uid, lineas, extra = {}) => bodega.confirmarDocumento(db, uid, { tipo: 'CARGA_INICIAL', cabecera: { observacion: 'Carga E1' }, lineas, ...extra });
  const conCargaSensible = async (uid) => db.collection('usuarios').doc(uid).set({ permisosGranulares: { [CARGA]: { carga: { visible: true, elements: { btn_confirmar: true, btn_cerrar_carga: true } } } } }, { merge: true });
  const movimientos = async (productoId) => (await db.collection('bodega_movimientos').where('productoId', '==', productoId).get()).docs.map((d) => d.data()).sort((a, b) => a.orden - b.orden);
  let sonda;
  let gasa;

  beforeEach(async () => {
    sonda = (await crearProducto('op', { nombre: 'PRUEBA SONDA', categoriaId: 'cat' })).id;
    gasa = (await crearProducto('op', { nombre: 'PRUEBA GASA', manejaLote: false, manejaVencimiento: false })).id;
  });

  it('confirma un ingreso: agrupa líneas del mismo lote, suma stock, deja kardex y documento', async () => {
    const r = await ingresar('op', [
      { productoId: sonda, lote: ' l 1', vencimiento: '2027-06-30', cantidad: 2, codigoLeido: '(01)X' },
      { productoId: sonda, lote: 'L1', vencimiento: '2027-06-30', cantidad: 3 },
      { productoId: sonda, lote: 'L2', vencimiento: '2027-01-31', cantidad: 1 },
      { productoId: gasa, lote: 'ignorado', vencimiento: '2030-01-01', cantidad: 10 },
    ]);
    expect(r).toMatchObject({ lineas: 3, unidades: 16 });
    expect(await leer('bodega_lotes', `${sonda}__L1__2027-06-30`)).toMatchObject({ disponible: 5, transito: 0, soloCargaInicial: false, ultimoMovimientoTipo: 'INGRESO' });
    expect(await leer('bodega_lotes', `${gasa}__SL__SV`)).toMatchObject({ disponible: 10, lote: '', vencimiento: '' });
    expect(await leer('bodega_productos', sonda)).toMatchObject({ disponible: 6, transito: 0, conMovimientos: true });
    const kardex = await movimientos(sonda);
    expect(kardex.map((m) => [m.tipo, m.lote, m.cantidad, m.saldoLote.disponible, m.saldoProducto.disponible])).toEqual([
      ['INGRESO', 'L1', 5, 5, 5], ['INGRESO', 'L2', 1, 1, 6],
    ]);
    expect(kardex[0]).toMatchObject({ usuario: { uid: 'op' }, documentoRef: { id: r.id, tipo: 'INGRESO', tipoDocumento: 'GUIA', numero: 'G-100', proveedorNombre: 'ACME SPA' }, observacion: 'Prueba' });
    expect(await leer('bodega_documentos', r.id)).toMatchObject({ estado: 'CONFIRMADO', numero: 'G-100', ordenCompra: 'OC-9', proveedorNombre: 'ACME SPA', numeroLineas: 3, totalUnidades: 16 });
  });

  it('no repite tipo + número del mismo proveedor (otro proveedor u otro tipo sí)', async () => {
    const linea = [{ productoId: gasa, cantidad: 1 }];
    await ingresar('op', linea);
    await expect(ingresar('op', linea, { cabecera: { numero: ' G-100 ' } })).rejects.toEqual(rechazo('already-exists'));
    await expect(ingresar('op', linea, { cabecera: { proveedorId: 'otra' } })).resolves.toBeTruthy();
    await expect(ingresar('op', linea, { cabecera: { tipoDocumento: 'FACTURA' } })).resolves.toBeTruthy();
  });

  it('valida en servidor y es todo o nada', async () => {
    await expect(ingresar('op', [{ productoId: sonda, lote: '', vencimiento: '2027-01-01', cantidad: 1 }])).rejects.toEqual(rechazo('invalid-argument'));
    await expect(ingresar('op', [{ productoId: sonda, lote: 'L', vencimiento: '2027-02-30', cantidad: 1 }])).rejects.toEqual(rechazo('invalid-argument'));
    await expect(ingresar('op', [{ productoId: gasa, cantidad: 1.5 }])).rejects.toEqual(rechazo('invalid-argument'));
    await expect(ingresar('op', [{ productoId: 'no-existe', cantidad: 1 }])).rejects.toEqual(rechazo('invalid-argument'));
    await expect(ingresar('op', [])).rejects.toEqual(rechazo('invalid-argument'));
    await expect(ingresar('op', [{ productoId: gasa, cantidad: 1 }], { cabecera: { numero: '' } })).rejects.toEqual(rechazo('invalid-argument'));
    await expect(ingresar('op', [{ productoId: gasa, cantidad: 1 }], { cabecera: { proveedorId: 'nadie' } })).rejects.toEqual(rechazo('invalid-argument'));
    await expect(ingresar('op', Array.from({ length: 151 }, () => ({ productoId: gasa, cantidad: 1 })))).rejects.toEqual(rechazo('invalid-argument'));
    // Una línea mala (producto inactivo) no deja nada escrito de las buenas.
    await db.collection('bodega_productos').doc(sonda).update({ activo: false });
    await expect(ingresar('op', [{ productoId: gasa, cantidad: 5 }, { productoId: sonda, lote: 'L', vencimiento: '2027-01-01', cantidad: 1 }])).rejects.toEqual(rechazo('invalid-argument'));
    expect((await db.collection('bodega_lotes').get()).size).toBe(0);
    expect((await db.collection('bodega_movimientos').get()).size).toBe(0);
    expect((await leer('bodega_productos', gasa)).disponible).toBe(0);
    await expect(ingresar('ajeno', [{ productoId: gasa, cantidad: 1 }])).rejects.toEqual(rechazo('permission-denied'));
  });

  it('borradores: guardar incompleto, avisar duplicado, confirmar desde el borrador; un confirmado no se edita ni se borra', async () => {
    const { id } = await bodega.guardarBorrador(db, 'op', { tipo: 'INGRESO', cabecera: { numero: 'g-200' }, lineas: [{ productoId: sonda, lote: 'x', cantidad: 2 }] });
    expect(await leer('bodega_documentos', id)).toMatchObject({ estado: 'BORRADOR', numero: 'G-200', lineas: [{ productoId: sonda, lote: 'X', cantidad: 2 }], creadoPor: { uid: 'op' } });
    await bodega.guardarBorrador(db, 'op', { id, tipo: 'INGRESO', cabecera: cabeceraIngreso({ numero: 'G-200' }), lineas: [{ productoId: gasa, cantidad: 4 }] });
    const r = await ingresar('op', [{ productoId: gasa, cantidad: 4 }], { id, cabecera: { numero: 'G-200' } });
    expect(r.id).toBe(id);
    expect(await leer('bodega_documentos', id)).toMatchObject({ estado: 'CONFIRMADO', creadoPor: { uid: 'op' }, confirmadoPor: { uid: 'op' } });
    await expect(bodega.guardarBorrador(db, 'op', { id, tipo: 'INGRESO', cabecera: {}, lineas: [] })).rejects.toEqual(rechazo('failed-precondition'));
    await expect(bodega.eliminarBorrador(db, 'op', { id })).rejects.toEqual(rechazo('failed-precondition'));
    await expect(ingresar('op', [{ productoId: gasa, cantidad: 1 }], { id, cabecera: { numero: 'G-201' } })).rejects.toEqual(rechazo('failed-precondition'));
    // Otro borrador con el mismo documento: se guarda, pero avisa.
    const dup = await bodega.guardarBorrador(db, 'op', { tipo: 'INGRESO', cabecera: cabeceraIngreso({ numero: 'g-200' }), lineas: [] });
    expect(dup.duplicado).toBe(true);
    await bodega.eliminarBorrador(db, 'op', { id: dup.id });
    expect(await leer('bodega_documentos', dup.id)).toBeUndefined();
  });

  it('carga inicial: acción sensible; un lote se carga varias veces mientras solo tenga cargas iniciales', async () => {
    const linea = [{ productoId: sonda, lote: 'C1', vencimiento: '2028-01-01', cantidad: 3 }];
    await expect(cargar('op', linea)).rejects.toEqual(rechazo('permission-denied'));
    await conCargaSensible('op');
    await cargar('op', linea);
    await cargar('op', linea);
    const idLote = `${sonda}__C1__2028-01-01`;
    expect(await leer('bodega_lotes', idLote)).toMatchObject({ disponible: 6, soloCargaInicial: true });
    expect((await movimientos(sonda)).map((m) => m.tipo)).toEqual(['CARGA_INICIAL', 'CARGA_INICIAL']);
    // Un ingreso sobre ese lote lo saca de "solo carga inicial".
    await ingresar('op', linea);
    expect((await leer('bodega_lotes', idLote)).soloCargaInicial).toBe(false);
    await expect(cargar('op', linea)).rejects.toEqual(rechazo('failed-precondition'));
    // Otro lote del mismo producto sí.
    await expect(cargar('op', [{ ...linea[0], lote: 'C2' }])).resolves.toBeTruthy();
  });

  it('cerrar la carga inicial (sensible) la bloquea para todos', async () => {
    await expect(bodega.configurarCargaInicial(db, 'op', { cerrada: true })).rejects.toEqual(rechazo('permission-denied'));
    await conCargaSensible('op');
    await bodega.configurarCargaInicial(db, 'op', { cerrada: true });
    await expect(cargar('dev1', [{ productoId: gasa, cantidad: 1 }])).rejects.toEqual(rechazo('failed-precondition'));
    await bodega.configurarCargaInicial(db, 'op', { cerrada: false });
    await expect(cargar('dev1', [{ productoId: gasa, cantidad: 1 }])).resolves.toBeTruthy();
  });

  it('con un inventario abierto no se mueve stock de los productos de su alcance', async () => {
    await db.collection('bodega_control').doc('estado').set({ inventarioAbierto: { id: 'inv1', alcance: { categorias: ['cat'] } } });
    await expect(ingresar('op', [{ productoId: sonda, lote: 'L', vencimiento: '2027-01-01', cantidad: 1 }])).rejects.toEqual(rechazo('failed-precondition'));
    await expect(ingresar('op', [{ productoId: gasa, cantidad: 1 }])).resolves.toBeTruthy(); // sin categoría: fuera del alcance
    await db.collection('bodega_control').doc('estado').set({ inventarioAbierto: { id: 'inv2', alcance: { categorias: [] } } });
    await expect(ingresar('op', [{ productoId: gasa, cantidad: 1 }], { cabecera: { numero: 'G-300' } })).rejects.toEqual(rechazo('failed-precondition'));
  });

  it('reglas: se leen documentos, lotes y movimientos; no se escriben desde el navegador', async () => {
    const r = await ingresar('op', [{ productoId: gasa, cantidad: 1 }]);
    const op = await sesion('op');
    await expect(getDoc(doc(op, 'bodega_documentos', r.id))).resolves.toBeTruthy();
    await expect(getDocs(collection(op, 'bodega_movimientos'))).resolves.toBeTruthy();
    await expect(setDoc(doc(op, 'bodega_documentos', r.id), { estado: 'BORRADOR' }, { merge: true })).rejects.toEqual(DENEGADO_REGLAS);
    await expect(setDoc(doc(op, 'bodega_movimientos', 'x'), { cantidad: 1 })).rejects.toEqual(DENEGADO_REGLAS);
    await expect(setDoc(doc(op, 'bodega_control', 'config'), { cargaInicialCerrada: false })).rejects.toEqual(DENEGADO_REGLAS);
  });
});

describe('egreso a tránsito por centro y gestión del tránsito (Fase 3)', () => {
  let sonda;
  let gasa;
  const L1 = () => `${sonda}__L1__2027-01-31`;
  const L2 = () => `${sonda}__L2__2028-06-30`;
  const GASA = () => `${gasa}__SL__SV`;
  const egresar = (uid, lineas, extra = {}) => bodega.egresar(db, uid, { lineas, solicitante: 'Dr. Prueba', observacion: 'Pabellón 3', ...extra });
  const gestionar = (uid, acciones, origen = 'transito') => bodega.gestionarTransito(db, uid, { origen, acciones });
  const transitosDe = async (centroId) => (await db.collection('bodega_transitos').where('centroId', '==', centroId).get()).docs.map((d) => ({ id: d.id, ...d.data() }));
  const kardex = async (productoId) => (await db.collection('bodega_movimientos').where('productoId', '==', productoId).get()).docs.map((d) => d.data());

  beforeEach(async () => {
    sonda = (await crearProducto('op', { nombre: 'PRUEBA SONDA', categoriaId: 'cat' })).id;
    gasa = (await crearProducto('op', { nombre: 'PRUEBA GASA', manejaLote: false, manejaVencimiento: false })).id;
    await bodega.confirmarDocumento(db, 'op', {
      tipo: 'INGRESO',
      cabecera: { tipoDocumento: 'GUIA', numero: 'T-1', proveedorId: 'acme', fecha: '2026-10-14' },
      lineas: [
        { productoId: sonda, lote: 'L1', vencimiento: '2027-01-31', cantidad: 5 },
        { productoId: sonda, lote: 'L2', vencimiento: '2028-06-30', cantidad: 5 },
        { productoId: gasa, cantidad: 20 },
      ],
    });
  });

  it('una salida con líneas para varios centros: disponible -> tránsito del centro, en una transacción', async () => {
    const r = await egresar('op', [
      { productoId: sonda, loteId: L1(), cantidad: 2, centroId: 'pab' },
      { productoId: sonda, loteId: L1(), cantidad: 1, centroId: 'pab' }, // se agrupa
      { productoId: sonda, loteId: L1(), cantidad: 1, centroId: 'uci' },
      { productoId: gasa, loteId: GASA(), cantidad: 10, centroId: 'pab' },
    ]);
    expect(r).toMatchObject({ numero: 1, lineas: 3 });
    expect(await leer('bodega_lotes', L1())).toMatchObject({ disponible: 1, transito: 4, transitoPorCentro: { pab: 3, uci: 1 }, soloCargaInicial: false });
    expect(await leer('bodega_productos', sonda)).toMatchObject({ disponible: 6, transito: 4, transitoPorCentro: { pab: 3, uci: 1 } });
    expect(await leer('bodega_transito_centros', 'pab')).toMatchObject({ centroNombre: 'PABELLÓN', unidades: 13, productos: { [sonda]: 3, [gasa]: 10 }, productosDistintos: 2, transitosAbiertos: 2 });
    expect(await leer('bodega_transito_centros', 'uci')).toMatchObject({ unidades: 1, transitosAbiertos: 1 });
    const pab = await transitosDe('pab');
    expect(pab.map((t) => [t.productoNombre, t.lote, t.cantidadSalida, t.pendiente, t.estado, t.centroNombre]).sort()).toEqual([
      ['PRUEBA GASA', '', 10, 10, 'ABIERTO', 'PABELLÓN'], ['PRUEBA SONDA', 'L1', 3, 3, 'ABIERTO', 'PABELLÓN'],
    ]);
    expect(pab[0]).toMatchObject({ salidaNumero: 1, solicitante: 'Dr. Prueba', usuario: { uid: 'op' } });
    const salidas = (await kardex(sonda)).filter((m) => m.tipo === 'SALIDA_A_TRANSITO');
    expect(salidas.map((m) => [m.centroId, m.cantidad]).sort()).toEqual([['pab', 3], ['uci', 1]]);
    expect(salidas[0]).toMatchObject({ documentoRef: { tipo: 'SALIDA', numero: '1' }, transitoId: expect.any(String) });
    expect((await leer('bodega_salidas', r.id)).resumenPorCentro).toMatchObject({ pab: { nombre: 'PABELLÓN', lineas: 2, unidades: 13 }, uci: { unidades: 1 } });
    expect((await egresar('op', [{ productoId: gasa, loteId: GASA(), cantidad: 1, centroId: 'uci' }])).numero).toBe(2);
  });

  it('valida centro activo, stock suficiente y es todo o nada', async () => {
    await expect(egresar('op', [{ productoId: sonda, loteId: L1(), cantidad: 1, centroId: 'viejo' }])).rejects.toEqual(rechazo('invalid-argument'));
    await expect(egresar('op', [{ productoId: sonda, loteId: L1(), cantidad: 1, centroId: 'nadie' }])).rejects.toEqual(rechazo('invalid-argument'));
    await expect(egresar('op', [{ productoId: sonda, loteId: L1(), cantidad: 1 }])).rejects.toEqual(rechazo('invalid-argument'));
    await expect(egresar('op', [{ productoId: gasa, loteId: L1(), cantidad: 1, centroId: 'pab' }])).rejects.toEqual(rechazo('invalid-argument')); // lote de otro producto
    const err = await egresar('op', [
      { productoId: gasa, loteId: GASA(), cantidad: 5, centroId: 'pab' },
      { productoId: sonda, loteId: L1(), cantidad: 4, centroId: 'pab' },
      { productoId: sonda, loteId: L1(), cantidad: 2, centroId: 'uci' }, // 6 > 5
    ]).catch((e) => e);
    expect(err.code).toBe('failed-precondition');
    expect(err.message).toContain('lote L1');
    expect((await leer('bodega_lotes', GASA())).disponible).toBe(20);
    expect(await leer('bodega_transito_centros', 'pab')).toBeUndefined();
    await expect(egresar('ajeno', [{ productoId: gasa, loteId: GASA(), cantidad: 1, centroId: 'pab' }])).rejects.toEqual(rechazo('permission-denied'));
  });

  it('entregar (parcial, con ID y observación), devolver y nota; cierra al quedar en cero', async () => {
    await egresar('op', [{ productoId: sonda, loteId: L1(), cantidad: 3, centroId: 'pab' }]);
    const [t] = await transitosDe('pab');
    await expect(gestionar('op', [{ transitoId: t.id, accion: 'ENTREGAR', cantidad: 1, observacion: 'usado' }])).rejects.toEqual(rechazo('invalid-argument')); // sin ID
    await expect(gestionar('op', [{ transitoId: t.id, accion: 'ENTREGAR', cantidad: 1, idEntrega: '123' }])).rejects.toEqual(rechazo('invalid-argument')); // sin observación
    await gestionar('op', [{ transitoId: t.id, accion: 'ENTREGAR', cantidad: 1, idEntrega: ' cx-55 ', observacion: 'Usado en cirugía' }]);
    expect(await leer('bodega_transitos', t.id)).toMatchObject({ pendiente: 2, entregado: 1, estado: 'ABIERTO' });
    expect(await leer('bodega_lotes', L1())).toMatchObject({ disponible: 2, transito: 2, transitoPorCentro: { pab: 2 } });
    await gestionar('op', [{ transitoId: t.id, accion: 'NOTA', nota: 'Pendiente de confirmar uso' }]);
    await expect(gestionar('op', [{ transitoId: t.id, accion: 'DEVOLVER', cantidad: 3 }])).rejects.toEqual(rechazo('failed-precondition'));
    await gestionar('op', [{ transitoId: t.id, accion: 'DEVOLVER', cantidad: 2 }]);
    expect(await leer('bodega_transitos', t.id)).toMatchObject({ pendiente: 0, entregado: 1, devuelto: 2, estado: 'CERRADO' });
    expect(await leer('bodega_lotes', L1())).toMatchObject({ disponible: 4, transito: 0, transitoPorCentro: {} });
    expect(await leer('bodega_productos', sonda)).toMatchObject({ disponible: 9, transito: 0, transitoPorCentro: {} });
    expect(await leer('bodega_transito_centros', 'pab')).toMatchObject({ unidades: 0, productos: {}, productosDistintos: 0, transitosAbiertos: 0 });
    const historial = (await db.collection('bodega_transitos').doc(t.id).collection('historial').get()).docs.map((d) => d.data());
    expect(historial.map((h) => h.accion).sort()).toEqual(['DEVOLVER', 'ENTREGAR', 'NOTA', 'SALIDA']);
    expect(historial.find((h) => h.accion === 'ENTREGAR')).toMatchObject({ idEntrega: 'CX-55', observacion: 'Usado en cirugía', cantidad: 1 });
    const movs = await kardex(sonda);
    expect(movs.find((m) => m.tipo === 'ENTREGA')).toMatchObject({ centroId: 'pab', idEntrega: 'CX-55', cantidad: 1, saldoLote: { disponible: 2, transito: 2 } });
    expect(movs.find((m) => m.tipo === 'DEVOLUCION')).toMatchObject({ centroId: 'pab', cantidad: 2, saldoLote: { disponible: 4, transito: 0 } });
    await expect(gestionar('op', [{ transitoId: t.id, accion: 'ENTREGAR', cantidad: 1, idEntrega: 'x', observacion: 'y' }])).rejects.toEqual(rechazo('failed-precondition'));
    // Ahora el centro sí se puede borrar (reglas).
    const maestros = await sesion('maestros');
    await expect(deleteDoc(doc(maestros, 'maestros_centros', 'pab'))).resolves.toBeUndefined();
  });

  it('acción masiva: varias en una transacción; si una falla no se aplica ninguna', async () => {
    await egresar('op', [
      { productoId: sonda, loteId: L1(), cantidad: 2, centroId: 'uci' },
      { productoId: sonda, loteId: L2(), cantidad: 2, centroId: 'uci' },
    ]);
    const [a, b] = await transitosDe('uci');
    const err = await gestionar('op', [
      { transitoId: a.id, accion: 'ENTREGAR', cantidad: 2, idEntrega: 'ID-1', observacion: 'común' },
      { transitoId: b.id, accion: 'ENTREGAR', cantidad: 3, idEntrega: 'ID-1', observacion: 'común' },
    ], 'centros').catch((e) => e);
    expect(err.code).toBe('failed-precondition');
    expect((await leer('bodega_transitos', a.id)).pendiente).toBe(2);
    await gestionar('op', [
      { transitoId: a.id, accion: 'ENTREGAR', cantidad: 2, idEntrega: 'ID-1', observacion: 'común' },
      { transitoId: b.id, accion: 'ENTREGAR', cantidad: 2, idEntrega: 'ID-2', observacion: 'otra' },
    ], 'centros');
    expect(await leer('bodega_transito_centros', 'uci')).toMatchObject({ unidades: 0, transitosAbiertos: 0 });
    expect(await leer('bodega_productos', sonda)).toMatchObject({ disponible: 6, transito: 0 });
  });

  it('permisos por vista de origen; con inventario abierto: no se egresa ni se devuelve, sí se entrega', async () => {
    await egresar('op', [{ productoId: sonda, loteId: L1(), cantidad: 2, centroId: 'pab' }]);
    const [t] = await transitosDe('pab');
    await db.collection('usuarios').doc('op').set({ permisosGranulares: { [CENTROS]: { acciones: { visible: true, elements: { btn_entregar: false } } } } }, { merge: true });
    await expect(gestionar('op', [{ transitoId: t.id, accion: 'ENTREGAR', cantidad: 1, idEntrega: 'A', observacion: 'B' }], 'centros')).rejects.toEqual(rechazo('permission-denied'));
    await db.collection('bodega_control').doc('estado').set({ inventarioAbierto: { id: 'inv', alcance: { categorias: [] } } });
    await expect(egresar('op', [{ productoId: gasa, loteId: GASA(), cantidad: 1, centroId: 'pab' }])).rejects.toEqual(rechazo('failed-precondition'));
    await expect(gestionar('op', [{ transitoId: t.id, accion: 'DEVOLVER', cantidad: 1 }])).rejects.toEqual(rechazo('failed-precondition'));
    await expect(gestionar('op', [{ transitoId: t.id, accion: 'ENTREGAR', cantidad: 1, idEntrega: 'A', observacion: 'B' }])).resolves.toBeTruthy();
  });

  it('verificarBodega.js: todo cuadra después de ingresos, salidas, entregas y devoluciones; detecta un descuadre', async () => {
    const { verificar } = require('./scripts/verificarBodega.js');
    await egresar('op', [
      { productoId: sonda, loteId: L1(), cantidad: 3, centroId: 'pab' },
      { productoId: sonda, loteId: L2(), cantidad: 1, centroId: 'uci' },
      { productoId: gasa, loteId: GASA(), cantidad: 4, centroId: 'pab' },
    ]);
    const pab = await transitosDe('pab');
    await gestionar('op', [
      { transitoId: pab[0].id, accion: 'ENTREGAR', cantidad: 1, idEntrega: 'A', observacion: 'B' },
      { transitoId: pab[1].id, accion: 'DEVOLVER', cantidad: pab[1].pendiente },
    ]);
    expect(await verificar(db)).toEqual([]);
    await db.collection('bodega_productos').doc(gasa).update({ disponible: 999 });
    expect((await verificar(db)).join(' ')).toContain('disponible 999');
  });

  it('reglas: no se borra un centro con tránsito; los tránsitos se leen pero no se escriben', async () => {
    await egresar('op', [{ productoId: gasa, loteId: GASA(), cantidad: 1, centroId: 'uci' }]);
    const maestros = await sesion('maestros');
    await expect(deleteDoc(doc(maestros, 'maestros_centros', 'uci'))).rejects.toEqual(DENEGADO_REGLAS);
    const op = await sesion('op');
    const [t] = await transitosDe('uci');
    await expect(getDoc(doc(op, 'bodega_transitos', t.id))).resolves.toBeTruthy();
    await expect(setDoc(doc(op, 'bodega_transitos', t.id), { pendiente: 0 }, { merge: true })).rejects.toEqual(DENEGADO_REGLAS);
    await expect(setDoc(doc(op, 'bodega_transito_centros', 'uci'), { unidades: 0 })).rejects.toEqual(DENEGADO_REGLAS);
  });
});
