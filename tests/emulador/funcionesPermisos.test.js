// Lógica de las Cloud Functions de permisos por centro de costo + rol
// (functions/permisos/servicio.js) contra el emulador de Firestore, con el
// Admin SDK de functions/: plantilla → usuarios, excepciones, cambio de
// plantilla, restablecer, usuario sin centro, usuario anterior a las
// plantillas, protección contra quedarse sin desarrollador y anti-escalada
// (un Administrador no se modifica a sí mismo ni a un Desarrollador).
import process from 'node:process';
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../../functions/package.json', import.meta.url));
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const servicio = require('./permisos/servicio.js');
const { migrarPlantillasPorRol } = require('./permisos/migracion.js');
const { claveElemento, claveMenu, claveVista } = require('./permisos/nucleo.mjs');

const PROYECTO = 'demo-workcraft';
const FIRESTORE = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
let db;

const LAB = '/laboratorio/codigoLaboratorio';
const COD = '/maestros/codigosMaestros';
const PLANTILLA_LAB = {
  permisos: { laboratorio: [LAB] },
  permisosGranulares: { [LAB]: { tabla: { visible: true, elements: { btn_editar: true, btn_eliminar: false } } } },
};
const YO = { uid: 'yo', nombre: 'Admin', rol: 'admin' };
const DEV = { uid: 'dev1', nombre: 'Dev', rol: 'dev' };

const usuario = async (uid) => (await db.collection('usuarios').doc(uid).get()).data();
const logs = async (ruta) => (await db.collection(`${ruta}/logs`).get()).docs.map((d) => d.data());
const crear = (uid, datos) => db.collection('usuarios').doc(uid).set({ nombreCompleto: uid, rol: 'operador', permisos: {}, permisosGranulares: {}, ...datos });
const puedeEliminar = (u) => u.permisosGranulares[LAB]?.tabla?.elements?.btn_eliminar !== false && Boolean(u.permisosGranulares[LAB]);

beforeAll(() => {
  db = getFirestore(initializeApp({ projectId: PROYECTO }, 'pruebas-permisos'));
});

beforeEach(async () => {
  // Base vacía en cada prueba (el emulador permite borrarla entera).
  await fetch(`http://${FIRESTORE}/emulator/v1/projects/${PROYECTO}/databases/(default)/documents`, { method: 'DELETE' });
  await db.collection('maestros_centros').doc('lab').set({ nombre: 'UNIDAD DE LABORATORIO', estado: 'ACTIVO' });
  await db.collection('maestros_centros').doc('prev').set({ nombre: 'UNIDAD DE PREVENCIÓN', estado: 'ACTIVO', usarEnGestiones: false });
  await crear('yo', { rol: 'admin', permisos: { administracion: ['/administracion/listadoUsuario'] }, permisosGranulares: { '/administracion/listadoUsuario': {} } });
});

describe('plantilla por centro de costo', () => {
  it('definir la plantilla una vez y asignarla a varios usuarios: todos heredan al instante', async () => {
    await Promise.all(['u1', 'u2', 'u3'].map((u) => crear(u)));
    await servicio.guardarPlantillaCentroCosto(db, YO, { centroId: 'lab', rol: 'operador', plantilla: PLANTILLA_LAB });
    const r = await servicio.asignarCentroCostoMasivo(db, YO, { uids: ['u1', 'u2', 'u3'], centroCostoId: 'lab' });
    expect(r.actualizados).toBe(3);
    for (const uid of ['u1', 'u2', 'u3']) {
      const u = await usuario(uid);
      expect(u.centroCostoId).toBe('lab');
      expect(u.permisos).toEqual({ laboratorio: [LAB] });
      expect(puedeEliminar(u)).toBe(false);
    }
    expect((await logs('usuarios/u1')).find((l) => l.accion === 'CENTRO_COSTO_MASIVO')).toMatchObject({ accion: 'CENTRO_COSTO_MASIVO', usuarioUid: 'yo', detalle: { centroCostoId: { antes: null, despues: 'lab' } } });
  });

  it('una excepción afecta solo a ese usuario y sobrevive al cambio de plantilla; restablecer la quita', async () => {
    await Promise.all(['ana', 'luis'].map((u) => crear(u)));
    await servicio.guardarPlantillaCentroCosto(db, YO, { centroId: 'lab', rol: 'operador', plantilla: PLANTILLA_LAB });
    await servicio.asignarCentroCostoMasivo(db, YO, { uids: ['ana', 'luis'], centroCostoId: 'lab' });
    await servicio.guardarPermisosUsuario(db, YO, { uid: 'ana', excepciones: { agregados: [claveElemento(LAB, 'tabla', 'btn_eliminar')], quitados: [] } });
    expect(puedeEliminar(await usuario('ana'))).toBe(true);
    expect(puedeEliminar(await usuario('luis'))).toBe(false);
    expect((await logs('usuarios/ana')).find((l) => l.accion === 'PERMISOS').detalle.agregados.nuevos).toEqual([claveElemento(LAB, 'tabla', 'btn_eliminar')]);

    // La plantilla suma Maestro Códigos: llega a los dos y Ana conserva su excepción.
    const nueva = { permisos: { ...PLANTILLA_LAB.permisos, maestros: [COD] }, permisosGranulares: { ...PLANTILLA_LAB.permisosGranulares, [COD]: {} } };
    const r = await servicio.guardarPlantillaCentroCosto(db, YO, { centroId: 'lab', rol: 'operador', plantilla: nueva });
    expect(r.usuarios).toBe(2);
    const [ana, luis] = [await usuario('ana'), await usuario('luis')];
    expect(ana.permisos.maestros).toEqual([COD]);
    expect(luis.permisos.maestros).toEqual([COD]);
    expect(puedeEliminar(ana)).toBe(true);
    expect(puedeEliminar(luis)).toBe(false);
    expect((await logs('plantillas_permisos/lab__operador')).map((l) => l.accion)).toEqual(['PLANTILLA', 'PLANTILLA']);

    // Restablecer a la plantilla.
    await servicio.guardarPermisosUsuario(db, YO, { uid: 'ana', excepciones: { agregados: [], quitados: [] } });
    expect(puedeEliminar(await usuario('ana'))).toBe(false);
  });

  it('cambiar de centro conserva las excepciones sobre la nueva plantilla; sin centro quedan solo los propios', async () => {
    // Encargado: para un Operador el centro es obligatorio (ver más abajo).
    await crear('ana', { rol: 'encargado' });
    await servicio.guardarPlantillaCentroCosto(db, YO, { centroId: 'lab', rol: 'encargado', plantilla: PLANTILLA_LAB });
    const propio = { agregados: [claveMenu('maestros', COD), claveVista(COD)], quitados: [] };
    await servicio.guardarPermisosUsuario(db, YO, { uid: 'ana', centroCostoId: 'lab', excepciones: propio });
    expect(Object.keys((await usuario('ana')).permisos).sort()).toEqual(['laboratorio', 'maestros']);
    // "prev" no tiene plantilla: no otorga permisos.
    await servicio.guardarPermisosUsuario(db, YO, { uid: 'ana', centroCostoId: 'prev' });
    expect((await usuario('ana')).permisos).toEqual({ maestros: [COD] });
    await servicio.guardarPermisosUsuario(db, YO, { uid: 'ana', centroCostoId: null });
    const ana = await usuario('ana');
    expect(ana.centroCostoId).toBeNull();
    expect(ana.permisos).toEqual({ maestros: [COD] });
  });

  it('valida el centro y las excepciones', async () => {
    await crear('ana');
    await expect(servicio.guardarPermisosUsuario(db, YO, { uid: 'ana', centroCostoId: 'no-existe' })).rejects.toMatchObject({ code: 'invalid-argument' });
    await servicio.guardarPermisosUsuario(db, YO, { uid: 'ana', excepciones: { agregados: ['basura', claveVista(COD)], quitados: [] } });
    expect((await usuario('ana')).excepciones).toEqual({ agregados: [claveVista(COD)], quitados: [] });
  });
});

describe('usuarios anteriores a las plantillas (mi usuario)', () => {
  it('cambiar solo sus datos no toca sus permisos', async () => {
    const antes = await usuario('yo');
    await servicio.guardarPermisosUsuario(db, YO, { uid: 'yo', datos: { nombreCompleto: 'Admin Renombrado' } });
    const despues = await usuario('yo');
    expect(despues.nombreCompleto).toBe('Admin Renombrado');
    expect(despues.rol).toBe('admin');
    expect(despues.permisos).toEqual(antes.permisos);
    expect(despues.permisosGranulares).toEqual(antes.permisosGranulares);
    expect(despues.centroCostoId).toBeUndefined();
  });
});

describe('protección contra quedarse sin desarrollador', () => {
  beforeEach(() => crear('dev1', { rol: 'dev' }));

  it('el último desarrollador no puede quitarse el rol ni inactivarse; con otro sí', async () => {
    await expect(servicio.guardarPermisosUsuario(db, DEV, { uid: 'dev1', rol: 'admin' })).rejects.toMatchObject({ code: 'failed-precondition' });
    await expect(servicio.guardarPermisosUsuario(db, DEV, { uid: 'dev1', datos: { activo: false } })).rejects.toMatchObject({ code: 'failed-precondition' });
    expect((await usuario('dev1')).rol).toBe('dev');

    await crear('dev2', { rol: 'dev' });
    await servicio.guardarPermisosUsuario(db, DEV, { uid: 'dev1', rol: 'encargado' });
    expect((await usuario('dev1')).rol).toBe('encargado');
    // Ahora "dev2" es el último (un Administrador no cuenta).
    await expect(servicio.guardarPermisosUsuario(db, { ...DEV, uid: 'dev2' }, { uid: 'dev2', datos: { activo: false } })).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('el centro de costo no cambia los permisos de un Administrador (no usa plantilla)', async () => {
    await servicio.guardarPlantillaCentroCosto(db, DEV, { centroId: 'lab', rol: 'operador', plantilla: PLANTILLA_LAB });
    const antes = await usuario('yo');
    await servicio.asignarCentroCostoMasivo(db, DEV, { uids: ['yo'], centroCostoId: 'lab' });
    const yo = await usuario('yo');
    expect(yo.centroCostoId).toBe('lab');
    expect(yo.permisos).toEqual(antes.permisos);
    expect(yo.permisosGranulares).toEqual(antes.permisosGranulares);
  });
});

describe('quién puede usar las funciones (rol + ítem de Administración)', () => {
  const LISTADO = '/administracion/listadoUsuario';
  const CENTRO = '/administracion/permisosCentro';

  it('Administrador con el ítem sí; sin el ítem, no; Desarrollador siempre', async () => {
    await expect(servicio.exigirAdministrador(db, 'yo', [LISTADO])).resolves.toMatchObject({ uid: 'yo', rol: 'admin' });
    await expect(servicio.exigirAdministrador(db, 'yo', [CENTRO])).rejects.toMatchObject({ code: 'permission-denied' });
    await crear('dev1', { rol: 'dev' });
    await expect(servicio.exigirAdministrador(db, 'dev1', [CENTRO])).resolves.toMatchObject({ uid: 'dev1', rol: 'dev' });
  });

  it('un operador con el ítem, un inactivo o sin sesión, no', async () => {
    await crear('op', { permisos: { administracion: [LISTADO] } });
    await crear('inactivo', { rol: 'admin', activo: false, permisos: { administracion: [LISTADO] } });
    await expect(servicio.exigirAdministrador(db, 'op', [LISTADO])).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(servicio.exigirAdministrador(db, 'inactivo', [LISTADO])).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(servicio.exigirAdministrador(db, undefined, [LISTADO])).rejects.toMatchObject({ code: 'unauthenticated' });
  });
});

describe('anti-escalada', () => {
  beforeEach(async () => {
    await crear('dev1', { rol: 'dev' });
    await crear('op');
  });
  const DENEGADO = { code: 'permission-denied' };

  it('un Administrador no cambia su propio rol, estado, centro ni permisos', async () => {
    await expect(servicio.guardarPermisosUsuario(db, YO, { uid: 'yo', rol: 'operador' })).rejects.toMatchObject(DENEGADO);
    await expect(servicio.guardarPermisosUsuario(db, YO, { uid: 'yo', datos: { activo: false } })).rejects.toMatchObject(DENEGADO);
    await expect(servicio.guardarPermisosUsuario(db, YO, { uid: 'yo', centroCostoId: 'lab' })).rejects.toMatchObject(DENEGADO);
    await expect(servicio.guardarPermisosUsuario(db, YO, { uid: 'yo', excepciones: { agregados: [claveMenu('laboratorio', LAB)], quitados: [] } })).rejects.toMatchObject(DENEGADO);
    await expect(servicio.asignarCentroCostoMasivo(db, YO, { uids: ['yo'], centroCostoId: 'lab' })).rejects.toMatchObject(DENEGADO);
    expect((await usuario('yo')).rol).toBe('admin');
  });

  it('un Administrador no modifica a un Desarrollador ni asigna ese rol', async () => {
    await expect(servicio.guardarPermisosUsuario(db, YO, { uid: 'dev1', datos: { nombreCompleto: 'Otro' } })).rejects.toMatchObject(DENEGADO);
    await expect(servicio.guardarPermisosUsuario(db, YO, { uid: 'op', rol: 'dev' })).rejects.toMatchObject(DENEGADO);
    await expect(servicio.asignarCentroCostoMasivo(db, YO, { uids: ['op', 'dev1'], centroCostoId: 'lab' })).rejects.toMatchObject(DENEGADO);
    expect((await usuario('op')).rol).toBe('operador');
    expect((await usuario('dev1')).nombreCompleto).toBe('dev1');
  });

  it('un Administrador sí edita a un operador (incluido hacerlo Administrador)', async () => {
    await servicio.guardarPermisosUsuario(db, YO, { uid: 'op', rol: 'admin', datos: { nombreCompleto: 'Op Nuevo' } });
    expect(await usuario('op')).toMatchObject({ rol: 'admin', nombreCompleto: 'Op Nuevo' });
  });

  it('el Desarrollador puede todo eso', async () => {
    await servicio.guardarPermisosUsuario(db, DEV, { uid: 'op', rol: 'dev' });
    await servicio.guardarPermisosUsuario(db, DEV, { uid: 'yo', rol: 'encargado' });
    expect((await usuario('op')).rol).toBe('dev');
    expect((await usuario('yo')).rol).toBe('encargado');
  });
});

describe('plantillas por centro + rol', () => {
  const PLANTILLA_ENC = {
    permisos: { laboratorio: [LAB], maestros: [COD] },
    permisosGranulares: { [LAB]: { tabla: { visible: true, elements: { btn_editar: true, btn_eliminar: true } } }, [COD]: {} },
  };

  it('cada usuario recibe la plantilla de su centro y su rol', async () => {
    await crear('op', { rol: 'operador' });
    await crear('enc', { rol: 'encargado' });
    await servicio.guardarPlantillaCentroCosto(db, YO, { centroId: 'lab', rol: 'operador', plantilla: PLANTILLA_LAB });
    await servicio.guardarPlantillaCentroCosto(db, YO, { centroId: 'lab', rol: 'encargado', plantilla: PLANTILLA_ENC });
    await servicio.asignarCentroCostoMasivo(db, YO, { uids: ['op', 'enc'], centroCostoId: 'lab' });
    const [op, enc] = [await usuario('op'), await usuario('enc')];
    expect(op.permisos).toEqual({ laboratorio: [LAB] });
    expect(puedeEliminar(op)).toBe(false);
    expect(Object.keys(enc.permisos).sort()).toEqual(['laboratorio', 'maestros']);
    expect(puedeEliminar(enc)).toBe(true);
  });

  it('guardar una plantilla recalcula solo a los usuarios de esa combinación y registra centro y rol', async () => {
    await crear('op', { rol: 'operador' });
    await crear('enc', { rol: 'encargado' });
    await servicio.asignarCentroCostoMasivo(db, YO, { uids: ['op', 'enc'], centroCostoId: 'lab' });
    const r = await servicio.guardarPlantillaCentroCosto(db, YO, { centroId: 'lab', rol: 'encargado', plantilla: PLANTILLA_ENC });
    expect(r.usuarios).toBe(1);
    expect((await usuario('enc')).permisos.maestros).toEqual([COD]);
    expect((await usuario('op')).permisos).toEqual({}); // Laboratorio – Operador sigue sin configurar
    const [log] = await logs('plantillas_permisos/lab__encargado');
    expect(log).toMatchObject({ accion: 'PLANTILLA', detalle: { centroId: 'lab', centroNombre: 'UNIDAD DE LABORATORIO', rol: 'encargado', rolNombre: 'Encargado de centro' } });
    expect((await db.collection('plantillas_permisos').doc('lab__encargado').get()).data()).toMatchObject({ centroId: 'lab', rol: 'encargado' });
  });

  it('al cambiar el rol se recalcula en la función y se conservan las excepciones', async () => {
    await crear('ana', { rol: 'operador' });
    await servicio.guardarPlantillaCentroCosto(db, YO, { centroId: 'lab', rol: 'operador', plantilla: PLANTILLA_LAB });
    await servicio.guardarPlantillaCentroCosto(db, YO, { centroId: 'lab', rol: 'encargado', plantilla: PLANTILLA_ENC });
    const exc = { agregados: [claveMenu('administracion', '/administracion/notasAdmin'), claveVista('/administracion/notasAdmin')], quitados: [] };
    await servicio.guardarPermisosUsuario(db, YO, { uid: 'ana', centroCostoId: 'lab', excepciones: exc });
    expect(Object.keys((await usuario('ana')).permisos).sort()).toEqual(['administracion', 'laboratorio']);

    await servicio.guardarPermisosUsuario(db, YO, { uid: 'ana', rol: 'encargado' });
    const ana = await usuario('ana');
    expect(ana.rol).toBe('encargado');
    expect(Object.keys(ana.permisos).sort()).toEqual(['administracion', 'laboratorio', 'maestros']);
    expect(puedeEliminar(ana)).toBe(true);
    expect(ana.excepciones).toEqual(exc);
    expect((await logs('usuarios/ana')).some((l) => l.detalle.rol?.despues === 'encargado')).toBe(true);
  });

  it('una combinación sin plantilla no otorga permisos (solo las excepciones)', async () => {
    await crear('enc', { rol: 'encargado' });
    await servicio.guardarPlantillaCentroCosto(db, YO, { centroId: 'lab', rol: 'operador', plantilla: PLANTILLA_LAB });
    await servicio.guardarPermisosUsuario(db, YO, { uid: 'enc', centroCostoId: 'lab', excepciones: { agregados: [], quitados: [] } });
    expect((await usuario('enc')).permisos).toEqual({});
  });

  it('las plantillas son solo para Operador y Encargado (Administrador y Desarrollador no usan)', async () => {
    await expect(servicio.guardarPlantillaCentroCosto(db, YO, { centroId: 'lab', rol: 'admin', plantilla: PLANTILLA_LAB })).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(servicio.guardarPlantillaCentroCosto(db, YO, { centroId: 'lab', plantilla: PLANTILLA_LAB })).rejects.toMatchObject({ code: 'invalid-argument' });
  });
});

describe('migración de plantillas sin rol (migrarPlantillasPorRol)', () => {
  const antigua = async (centroId, plantilla) => {
    const ref = db.collection('plantillas_permisos').doc(centroId);
    await ref.set({ ...plantilla, actualizadoPor: 'Admin' });
    await ref.collection('logs').doc('l1').set({ accion: 'PLANTILLA', usuario: 'Admin' });
  };
  const efectivo = async (uid) => { const u = await usuario(uid); return { permisos: u.permisos, permisosGranulares: u.permisosGranulares }; };

  it('pasa a Operador (y a Encargado si tiene usuarios en el centro) sin que nadie gane ni pierda permisos', async () => {
    // Estado anterior: plantilla "lab" sin rol aplicada a un operador y a un encargado.
    await antigua('lab', PLANTILLA_LAB);
    const exc = { agregados: [claveElemento(LAB, 'tabla', 'btn_eliminar')], quitados: [] };
    await crear('op', { rol: 'operador', centroCostoId: 'lab', excepciones: exc, ...require('./permisos/nucleo.mjs').combinar(PLANTILLA_LAB, exc) });
    await crear('enc', { rol: 'encargado', centroCostoId: 'lab', excepciones: { agregados: [], quitados: [] }, ...require('./permisos/nucleo.mjs').combinar(PLANTILLA_LAB) });
    await antigua('prev', { permisos: {}, permisosGranulares: {} }); // centro sin usuarios
    const antes = { op: await efectivo('op'), enc: await efectivo('enc') };

    const simulacion = await migrarPlantillasPorRol(db);
    expect(simulacion).toEqual([
      { centroId: 'lab', roles: ['operador', 'encargado'], conflictos: [], usuarios: 2, rolesConUsuarios: ['operador', 'encargado'], cambian: [] },
      { centroId: 'prev', roles: ['operador'], conflictos: [], usuarios: 0, rolesConUsuarios: [], cambian: [] },
    ]);
    expect((await db.collection('plantillas_permisos').doc('lab').get()).exists).toBe(true); // la simulación no escribe

    await migrarPlantillasPorRol(db, { aplicar: true });
    const ids = (await db.collection('plantillas_permisos').get()).docs.map((d) => d.id).sort();
    expect(ids).toEqual(['lab__encargado', 'lab__operador', 'prev__operador']);
    expect((await db.collection('plantillas_permisos').doc('lab__operador').get()).data()).toMatchObject({ ...PLANTILLA_LAB, centroId: 'lab', rol: 'operador', migradoDe: 'lab' });
    expect((await logs('plantillas_permisos/lab__operador')).map((l) => l.accion).sort()).toEqual(['MIGRACION', 'PLANTILLA']);
    expect((await logs('plantillas_permisos/lab'))).toEqual([]);

    // Nadie gana ni pierde: ni los campos guardados ni al recalcular con el modelo nuevo.
    expect(await efectivo('op')).toEqual(antes.op);
    await servicio.guardarPermisosUsuario(db, YO, { uid: 'op' });
    await servicio.guardarPermisosUsuario(db, YO, { uid: 'enc' });
    expect(await efectivo('op')).toEqual(antes.op);
    expect(await efectivo('enc')).toEqual(antes.enc);

    // Idempotente.
    expect(await migrarPlantillasPorRol(db, { aplicar: true })).toEqual([]);
  });

  it('no pisa una plantilla centro + rol que ya exista: la informa y no migra ese centro', async () => {
    await antigua('lab', PLANTILLA_LAB);
    await db.collection('plantillas_permisos').doc('lab__operador').set({ permisos: {}, permisosGranulares: {}, centroId: 'lab', rol: 'operador' });
    const [r] = await migrarPlantillasPorRol(db, { aplicar: true });
    expect(r.conflictos).toEqual(['operador']);
    expect((await db.collection('plantillas_permisos').doc('lab').get()).exists).toBe(true);
    expect((await db.collection('plantillas_permisos').doc('lab__operador').get()).data().permisos).toEqual({});
  });
});
