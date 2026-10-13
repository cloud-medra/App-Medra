// Solicitudes de cambio de datos y buzón de Alertas (functions/solicitudes,
// functions/alertas) contra los emuladores de Firestore y Auth: a quién le
// llegan, quién puede resolverlas, qué se aplica, el correo confirmado, la
// auditoría y las reglas (quién lee qué; desde el navegador solo "leída").
import process from 'node:process';
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { createRequire } from 'node:module';
import { initializeApp as initializeClientApp, deleteApp } from 'firebase/app';
import { getAuth as getClientAuth, connectAuthEmulator, signInWithCustomToken } from 'firebase/auth';
import {
  getFirestore as getClientFirestore, connectFirestoreEmulator, doc, getDoc, getDocs, updateDoc, setDoc, collection, query, where, arrayRemove,
} from 'firebase/firestore';

const require = createRequire(new URL('../../functions/package.json', import.meta.url));
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const solicitudes = require('./solicitudes/servicio.js');
const permisos = require('./permisos/servicio.js');

const PROYECTO = 'demo-workcraft';
const FIRESTORE = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const AUTH = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
process.env.FIREBASE_AUTH_EMULATOR_HOST = AUTH;
const DENEGADO = expect.objectContaining({ code: 'permission-denied' });
const rechazo = (code) => expect.objectContaining({ code });

let db;
let auth;
const clientes = [];
// El correo es complementario y está desactivado: aquí se registra si se llamó.
const correos = [];
const notificar = async (_db, alerta) => { correos.push(alerta); return { enviados: 0, omitido: 'deshabilitado' }; };

const crearUsuario = async (uid, perfil) => {
  await auth.createUser({ uid, email: `${uid}@prueba.cl`, password: 'secreto123' });
  await db.collection('usuarios').doc(uid).set({ nombreCompleto: uid.toUpperCase(), nombreUsuario: uid, email: `${uid}@prueba.cl`, rol: 'operador', permisos: {}, permisosGranulares: {}, ...perfil });
  await db.collection('nombres_usuario').doc(uid).set({ uid, nombreUsuario: uid });
};
// SDK del navegador con la sesión de `uid` (para probar las reglas).
const sesion = async (uid) => {
  const app = initializeClientApp({ apiKey: 'demo', projectId: PROYECTO, authDomain: `${PROYECTO}.firebaseapp.com` }, `cliente-sol-${uid}-${Date.now()}`);
  clientes.push(app);
  const a = getClientAuth(app);
  connectAuthEmulator(a, `http://${AUTH}`, { disableWarnings: true });
  const cdb = getClientFirestore(app);
  const [host, puerto] = FIRESTORE.split(':');
  connectFirestoreEmulator(cdb, host, Number(puerto));
  await signInWithCustomToken(a, await auth.createCustomToken(uid));
  return cdb;
};
const perfil = async (uid) => (await db.collection('usuarios').doc(uid).get()).data();
const leer = async (col, id) => (await db.collection(col).doc(id).get()).data();
const crear = (uid, tipo, valorSolicitado, motivo = 'Necesito el cambio') => solicitudes.crearSolicitud(db, auth, uid, { tipo, valorSolicitado, motivo }, { notificar });
const aprobar = (uid, id) => solicitudes.resolverSolicitud(db, auth, uid, { id, decision: 'aprobar' });
const rechazar = (uid, id, motivo) => solicitudes.resolverSolicitud(db, auth, uid, { id, decision: 'rechazar', motivo });

beforeAll(() => {
  const app = initializeApp({ projectId: PROYECTO }, 'pruebas-solicitudes');
  db = getFirestore(app);
  auth = getAuth(app);
});
afterAll(() => Promise.all(clientes.map((c) => deleteApp(c))));

beforeEach(async () => {
  await fetch(`http://${FIRESTORE}/emulator/v1/projects/${PROYECTO}/databases/(default)/documents`, { method: 'DELETE' });
  await fetch(`http://${AUTH}/emulator/v1/projects/${PROYECTO}/accounts`, { method: 'DELETE' });
  correos.length = 0;
  await db.collection('maestros_centros').doc('lab').set({ nombre: 'LABORATORIO', estado: 'ACTIVO' });
  await db.collection('maestros_centros').doc('vac').set({ nombre: 'VACUNATORIO', estado: 'ACTIVO' });
  await crearUsuario('dev1', { rol: 'dev' });
  await crearUsuario('adlab', { rol: 'admin', centrosAdministrados: ['lab'] });
  await crearUsuario('adlab2', { rol: 'admin', centrosAdministrados: ['lab'] });
  await crearUsuario('advac', { rol: 'admin', centrosAdministrados: ['vac'] });
  await crearUsuario('adinactivo', { rol: 'admin', centrosAdministrados: ['lab'], activo: false });
  await crearUsuario('enc', { rol: 'encargado', centroCostoId: 'lab' });
  await crearUsuario('op', { centroCostoId: 'lab' });
});

describe('a quién le llega (aprobadores = destinatarios de la alerta)', () => {
  it('operador sin asignados: todos los administradores activos de su centro + desarrolladores (nunca un Encargado)', async () => {
    const { id } = await crear('op', 'nombreCompleto', 'Op Nuevo');
    const s = await leer('solicitudes', id);
    expect(s.aprobadores.sort()).toEqual(['adlab', 'adlab2', 'dev1']);
    expect(s).toMatchObject({ criterioAprobadores: 'centro', estado: 'pendiente', valorActual: 'OP', valorSolicitado: 'Op Nuevo', centroId: 'lab' });
    const alerta = await leer('alertas', s.alertaId);
    expect(alerta).toMatchObject({ tipo: 'solicitud', estado: 'pendiente', datos: { solicitudId: id, tipoSolicitud: 'nombreCompleto', solicitanteUid: 'op' } });
    expect(alerta.destinatarios.sort()).toEqual(['adlab', 'adlab2', 'dev1']);
    expect(alerta.noLeidas.sort()).toEqual(['adlab', 'adlab2', 'dev1']);
    expect(correos).toHaveLength(1); // preparado: se llama, pero hoy no envía
  });

  it('con administradores asignados: solo ellos (los que siguen siendo del centro) + desarrolladores', async () => {
    await db.collection('usuarios').doc('op').update({ administradoresAsignados: ['adlab2', 'advac'] });
    const { id } = await crear('op', 'nombreCompleto', 'Op Nuevo');
    expect((await leer('solicitudes', id)).aprobadores.sort()).toEqual(['adlab2', 'dev1']);
  });

  it('"todos los administradores del centro" se resuelve al crear (incluye a uno nuevo)', async () => {
    await db.collection('usuarios').doc('op').update({ administradoresAsignados: ['adlab'], todosLosAdministradoresDelCentro: true });
    await crearUsuario('adnuevo', { rol: 'admin', centrosAdministrados: ['lab'] });
    const { id } = await crear('op', 'nombreCompleto', 'Op Nuevo');
    expect((await leer('solicitudes', id)).aprobadores.sort()).toEqual(['adlab', 'adlab2', 'adnuevo', 'dev1']);
  });

  it('operador antiguo sin centro: todos los administradores activos + desarrolladores', async () => {
    await crearUsuario('viejo', {});
    const { id } = await crear('viejo', 'nombreCompleto', 'Viejo Nuevo');
    const s = await leer('solicitudes', id);
    expect(s.criterioAprobadores).toBe('sinCentro');
    expect(s.aprobadores.sort()).toEqual(['adlab', 'adlab2', 'advac', 'dev1']);
  });

  it('un Administrador: solo los desarrolladores', async () => {
    const { id } = await crear('adlab', 'nombreCompleto', 'Admin Lab');
    expect((await leer('solicitudes', id)).aprobadores).toEqual(['dev1']);
  });
});

describe('crear: validaciones', () => {
  it('valida tipo, formato, motivo, que cambie y que esté libre; una abierta por tipo', async () => {
    await expect(crear('op', 'telefono', '123')).rejects.toEqual(rechazo('invalid-argument'));
    await expect(crear('op', 'nombreUsuario', 'con espacio')).rejects.toEqual(rechazo('invalid-argument'));
    await expect(crear('op', 'nombreUsuario', 'nuevo', '  ')).rejects.toEqual(rechazo('invalid-argument'));
    await expect(crear('op', 'nombreUsuario', 'op')).rejects.toEqual(rechazo('invalid-argument'));
    await expect(crear('op', 'nombreUsuario', 'ENC')).rejects.toEqual(rechazo('already-exists'));
    await expect(crear('op', 'email', 'enc@prueba.cl')).rejects.toEqual(rechazo('already-exists'));
    await crear('op', 'nombreUsuario', 'opnuevo');
    await expect(crear('op', 'nombreUsuario', 'opotro')).rejects.toEqual(rechazo('failed-precondition'));
    await expect(crear('op', 'nombreCompleto', 'Op Otro')).resolves.toMatchObject({ id: expect.any(String) });
    await expect(solicitudes.crearSolicitud(db, auth, undefined, {})).rejects.toEqual(rechazo('unauthenticated'));
  });
});

describe('resolver', () => {
  it('un administrador destinatario aprueba: el nombre de usuario se aplica con su índice y queda en la auditoría', async () => {
    const { id } = await crear('op', 'nombreUsuario', 'OpNuevo');
    await expect(aprobar('adlab', id)).resolves.toEqual({ estado: 'aplicada' });
    expect((await perfil('op')).nombreUsuario).toBe('OpNuevo');
    expect(await leer('nombres_usuario', 'opnuevo')).toEqual({ uid: 'op', nombreUsuario: 'OpNuevo' });
    expect(await leer('nombres_usuario', 'op')).toBeUndefined();
    const s = await leer('solicitudes', id);
    expect(s).toMatchObject({ estado: 'aplicada', resueltoPorUid: 'adlab', resueltoPor: 'ADLAB' });
    expect((await leer('alertas', s.alertaId))).toMatchObject({ estado: 'resuelta', noLeidas: [], resultado: { decision: 'aprobada', porUid: 'adlab' } });
    const logs = (await db.collection('usuarios/op/logs').get()).docs.map((d) => d.data());
    expect(logs).toEqual([expect.objectContaining({ accion: 'SOLICITUD_APLICADA', usuarioUid: 'adlab', detalle: expect.objectContaining({ campo: 'nombreUsuario', antes: 'op', despues: 'OpNuevo' }) })]);
    const historial = (await db.collection(`solicitudes/${id}/historial`).orderBy('fecha').get()).docs.map((d) => d.data().accion);
    expect(historial).toEqual(['CREADA', 'APROBADA_Y_APLICADA']);
    await expect(aprobar('adlab2', id)).rejects.toEqual(rechazo('failed-precondition'));
  });

  it('un administrador que no es destinatario (de otro centro) no puede; el desarrollador sí', async () => {
    const { id } = await crear('op', 'nombreCompleto', 'Op Nuevo');
    await expect(aprobar('advac', id)).rejects.toEqual(DENEGADO);
    await expect(aprobar('enc', id)).rejects.toEqual(DENEGADO);
    await expect(aprobar('op', id)).rejects.toEqual(DENEGADO); // su propia solicitud
    await expect(aprobar('dev1', id)).resolves.toEqual({ estado: 'aplicada' });
    expect((await perfil('op')).nombreCompleto).toBe('Op Nuevo');
  });

  it('rechazar exige motivo y no cambia nada', async () => {
    const { id } = await crear('op', 'nombreCompleto', 'Op Nuevo');
    await expect(rechazar('adlab', id, ' ')).rejects.toEqual(rechazo('invalid-argument'));
    await expect(rechazar('adlab', id, 'No corresponde')).resolves.toEqual({ estado: 'rechazada' });
    expect((await perfil('op')).nombreCompleto).toBe('OP');
    expect(await leer('solicitudes', id)).toMatchObject({ estado: 'rechazada', motivoRechazo: 'No corresponde' });
  });

  it('si el nombre se tomó entre medio, aprobar falla y la solicitud sigue pendiente', async () => {
    const { id } = await crear('op', 'nombreUsuario', 'libre');
    await db.collection('nombres_usuario').doc('libre').set({ uid: 'enc', nombreUsuario: 'libre' });
    await expect(aprobar('adlab', id)).rejects.toEqual(rechazo('already-exists'));
    expect((await leer('solicitudes', id)).estado).toBe('pendiente');
  });

  it('cancelar: solo el propio usuario y mientras esté abierta; cierra la alerta', async () => {
    const { id } = await crear('op', 'nombreCompleto', 'Op Nuevo');
    await expect(solicitudes.cancelarSolicitud(db, 'enc', { id })).rejects.toEqual(rechazo('not-found'));
    await expect(solicitudes.cancelarSolicitud(db, 'op', { id })).resolves.toEqual({ estado: 'cancelada' });
    const s = await leer('solicitudes', id);
    expect((await leer('alertas', s.alertaId)).estado).toBe('resuelta');
    await expect(solicitudes.cancelarSolicitud(db, 'op', { id })).rejects.toEqual(rechazo('failed-precondition'));
  });
});

describe('correo: aprobado, se aplica al confirmar desde la nueva dirección', () => {
  it('aprobar no lo cambia; al confirmar (Auth cambia) sincronizarCorreo lo aplica', async () => {
    const { id } = await crear('op', 'email', 'Op.Nuevo@prueba.cl');
    expect((await leer('solicitudes', id)).valorSolicitado).toBe('op.nuevo@prueba.cl');
    await expect(aprobar('adlab', id)).resolves.toEqual({ estado: 'aprobada' });
    expect((await perfil('op')).email).toBe('op@prueba.cl');
    expect((await auth.getUser('op')).email).toBe('op@prueba.cl');
    // El usuario abre el enlace de verifyBeforeUpdateEmail.
    await auth.updateUser('op', { email: 'op.nuevo@prueba.cl' });
    expect(await solicitudes.sincronizarCorreo(db, auth, await auth.getUser('op'), await perfil('op'))).toBe('aplicada');
    expect((await perfil('op')).email).toBe('op.nuevo@prueba.cl');
    expect((await leer('solicitudes', id)).estado).toBe('aplicada');
  });
});

describe('Editar usuario: el administrador cambia el dato directamente', () => {
  const ADMIN = { uid: 'adlab', nombre: 'ADLAB', rol: 'admin' };
  it('se aplica, queda en la auditoría y cancela la solicitud abierta de ese dato; el correo cambia también en Auth', async () => {
    const { id } = await crear('op', 'nombreCompleto', 'Op Pedido');
    await permisos.guardarPermisosUsuario(db, ADMIN, { uid: 'op', datos: { nombreCompleto: 'Op Directo', email: 'Op.Directo@prueba.cl' } }, { auth });
    expect(await perfil('op')).toMatchObject({ nombreCompleto: 'Op Directo', email: 'op.directo@prueba.cl' });
    expect((await auth.getUser('op')).email).toBe('op.directo@prueba.cl');
    expect(await leer('solicitudes', id)).toMatchObject({ estado: 'cancelada', resueltoPorUid: 'adlab' });
    const logs = (await db.collection('usuarios/op/logs').get()).docs.map((d) => d.data());
    expect(logs).toEqual([expect.objectContaining({ accion: 'PERMISOS', detalle: expect.objectContaining({ email: { antes: 'op@prueba.cl', despues: 'op.directo@prueba.cl' } }) })]);
    // Entrar después no lo revierte: Auth y perfil coinciden.
    expect(await solicitudes.sincronizarCorreo(db, auth, await auth.getUser('op'), await perfil('op'))).toBeNull();
  });

  it('un correo en uso no se guarda', async () => {
    await expect(permisos.guardarPermisosUsuario(db, ADMIN, { uid: 'op', datos: { email: 'enc@prueba.cl' } }, { auth })).rejects.toEqual(rechazo('already-exists'));
    expect((await perfil('op')).email).toBe('op@prueba.cl');
  });

  it('centros administrados y administradores asignados: solo administradores activos del centro', async () => {
    await expect(permisos.guardarPermisosUsuario(db, ADMIN, { uid: 'op', administradoresAsignados: ['advac'] })).rejects.toEqual(rechazo('invalid-argument'));
    await expect(permisos.guardarPermisosUsuario(db, ADMIN, { uid: 'op', administradoresAsignados: ['adinactivo'] })).rejects.toEqual(rechazo('invalid-argument'));
    await expect(permisos.guardarPermisosUsuario(db, ADMIN, { uid: 'op', administradoresAsignados: ['enc'] })).rejects.toEqual(rechazo('invalid-argument'));
    await permisos.guardarPermisosUsuario(db, ADMIN, { uid: 'op', administradoresAsignados: ['adlab2'] });
    expect((await perfil('op')).administradoresAsignados).toEqual(['adlab2']);
    // Cambiar de centro los vacía.
    await permisos.guardarPermisosUsuario(db, { uid: 'dev1', nombre: 'DEV1', rol: 'dev' }, { uid: 'op', centroCostoId: 'vac' });
    expect((await perfil('op')).administradoresAsignados).toEqual([]);
    // Un Administrador no se cambia sus propios centros.
    await expect(permisos.guardarPermisosUsuario(db, ADMIN, { uid: 'adlab', centrosAdministrados: ['lab', 'vac'] })).rejects.toEqual(DENEGADO);
    await permisos.guardarPermisosUsuario(db, { uid: 'dev1', nombre: 'DEV1', rol: 'dev' }, { uid: 'adlab', centrosAdministrados: ['lab', 'vac'] });
    expect((await perfil('adlab')).centrosAdministrados).toEqual(['lab', 'vac']);
  });

  it('asignación masiva: mismo centro, solo Operadores/Encargados', async () => {
    await crearUsuario('op2', { centroCostoId: 'lab' });
    await crearUsuario('op3', { centroCostoId: 'vac' });
    await expect(permisos.asignarAdministradoresMasivo(db, ADMIN, { uids: ['op', 'op3'], todosLosAdministradoresDelCentro: true })).rejects.toEqual(rechazo('invalid-argument'));
    await permisos.asignarAdministradoresMasivo(db, ADMIN, { uids: ['op', 'op2', 'enc'], administradoresAsignados: ['adlab'] });
    expect((await perfil('op2')).administradoresAsignados).toEqual(['adlab']);
    expect((await perfil('enc')).administradoresAsignados).toEqual(['adlab']);
  });

  it('el centro de costo es obligatorio para un Operador', async () => {
    await expect(permisos.guardarPermisosUsuario(db, ADMIN, { uid: 'op', centroCostoId: null })).rejects.toEqual(rechazo('invalid-argument'));
    await expect(permisos.guardarPermisosUsuario(db, ADMIN, { uid: 'enc', rol: 'operador', centroCostoId: null })).rejects.toEqual(rechazo('invalid-argument'));
    await expect(permisos.asignarCentroCostoMasivo(db, ADMIN, { uids: ['op'], centroCostoId: null })).rejects.toEqual(rechazo('invalid-argument'));
  });
});

describe('reglas: solicitudes y alertas', () => {
  it('cada uno ve sus alertas y solo se marca a sí mismo como leído; nadie las crea ni las resuelve desde el navegador', async () => {
    const { id } = await crear('op', 'nombreCompleto', 'Op Nuevo');
    const { alertaId } = await leer('solicitudes', id);
    const adlab = await sesion('adlab');
    const advac = await sesion('advac');
    const dev = await sesion('dev1');
    expect((await getDoc(doc(adlab, 'alertas', alertaId))).exists()).toBe(true);
    await expect(getDoc(doc(advac, 'alertas', alertaId))).rejects.toEqual(DENEGADO);
    expect((await getDoc(doc(dev, 'alertas', alertaId))).exists()).toBe(true);
    // Las consultas de la pantalla.
    expect((await getDocs(query(collection(adlab, 'alertas'), where('destinatarios', 'array-contains', 'adlab')))).size).toBe(1);
    expect((await getDocs(query(collection(adlab, 'alertas'), where('noLeidas', 'array-contains', 'adlab')))).size).toBe(1);
    expect((await getDocs(collection(dev, 'alertas'))).size).toBe(1);
    await expect(getDocs(collection(adlab, 'alertas'))).rejects.toEqual(DENEGADO);
    // Marcar leída: solo a sí mismo.
    await expect(updateDoc(doc(adlab, 'alertas', alertaId), { noLeidas: arrayRemove('adlab2') })).rejects.toEqual(DENEGADO);
    await expect(updateDoc(doc(adlab, 'alertas', alertaId), { estado: 'resuelta' })).rejects.toEqual(DENEGADO);
    await expect(updateDoc(doc(adlab, 'alertas', alertaId), { noLeidas: arrayRemove('adlab') })).resolves.toBeUndefined();
    expect((await leer('alertas', alertaId)).noLeidas.sort()).toEqual(['adlab2', 'dev1']);
    await expect(setDoc(doc(adlab, 'alertas', 'nueva'), { destinatarios: ['adlab'] })).rejects.toEqual(DENEGADO);
  });

  it('una solicitud la ven el solicitante, sus aprobadores y los desarrolladores; nadie la escribe desde el navegador', async () => {
    const { id } = await crear('op', 'nombreCompleto', 'Op Nuevo');
    const op = await sesion('op');
    const enc = await sesion('enc');
    const advac = await sesion('advac');
    const adlab = await sesion('adlab');
    expect((await getDoc(doc(op, 'solicitudes', id))).data().estado).toBe('pendiente');
    expect((await getDocs(query(collection(op, 'solicitudes'), where('solicitanteUid', '==', 'op')))).size).toBe(1);
    expect((await getDoc(doc(adlab, 'solicitudes', id))).exists()).toBe(true);
    expect((await getDocs(collection(adlab, 'solicitudes', id, 'historial'))).size).toBe(1);
    await expect(getDoc(doc(enc, 'solicitudes', id))).rejects.toEqual(DENEGADO);
    await expect(getDoc(doc(advac, 'solicitudes', id))).rejects.toEqual(DENEGADO);
    await expect(updateDoc(doc(op, 'solicitudes', id), { estado: 'aplicada' })).rejects.toEqual(DENEGADO);
    await expect(updateDoc(doc(adlab, 'solicitudes', id), { estado: 'aplicada' })).rejects.toEqual(DENEGADO);
    // Ni el propio usuario cambia sus datos directamente.
    await expect(updateDoc(doc(op, 'usuarios', 'op'), { nombreCompleto: 'X' })).rejects.toEqual(DENEGADO);
    await expect(getDoc(doc(op, 'mail', 'x'))).rejects.toEqual(DENEGADO);
  });
});
