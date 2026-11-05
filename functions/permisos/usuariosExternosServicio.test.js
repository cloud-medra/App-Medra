// crearUsuario, guardarPermisosUsuario y las asignaciones masivas con usuarios
// externos, sobre un Firestore en memoria (sin emuladores).
import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { guardarPermisosUsuario, asignarCentroCostoMasivo, asignarAdministradoresMasivo } = require('./servicio');
const { crearUsuario } = require('../usuarios/servicio');

// Firestore mínimo: documentos por ruta, transacciones que aplican al instante.
const crearDb = (inicial) => {
  const datos = new Map(Object.entries(inicial));
  const refDoc = (ruta) => ({
    path: ruta,
    id: ruta.split('/').pop(),
    get: async () => ({ exists: datos.has(ruta), id: ruta.split('/').pop(), ref: refDoc(ruta), data: () => (datos.has(ruta) ? { ...datos.get(ruta) } : undefined) }),
    set: async (d) => { datos.set(ruta, d); },
    create: async (d) => { datos.set(ruta, d); },
    update: async (d) => { datos.set(ruta, { ...datos.get(ruta), ...d }); },
    delete: async () => { datos.delete(ruta); },
    collection: (c) => refCol(`${ruta}/${c}`),
  });
  const refCol = (ruta, filtros = []) => ({
    doc: (id = `auto${datos.size}`) => refDoc(`${ruta}/${id}`),
    where: (campo, op, valor) => refCol(ruta, [...filtros, [campo, op, valor]]),
    get: async () => {
      const prefijo = `${ruta}/`;
      const docs = [...datos.keys()]
        .filter((k) => k.startsWith(prefijo) && !k.slice(prefijo.length).includes('/'))
        .map((k) => [k, datos.get(k)])
        .filter(([, d]) => filtros.every(([c, op, v]) => (op === 'in' ? v.includes(d[c]) : d[c] === v)))
        .map(([k, d]) => ({ exists: true, id: k.split('/').pop(), ref: refDoc(k), data: () => ({ ...d }) }));
      return { docs, empty: docs.length === 0, size: docs.length };
    },
  });
  const operar = (r, d, op) => { r[op](d); };
  return {
    datos,
    collection: (c) => refCol(c),
    batch: () => ({ set: (r, d) => operar(r, d, 'set'), update: (r, d) => operar(r, d, 'update'), delete: (r) => r.delete(), commit: async () => {} }),
    runTransaction: async (fn) => fn({
      get: (r) => r.get(),
      getAll: (...rs) => Promise.all(rs.map((r) => r.get())),
      set: (r, d) => operar(r, d, 'set'),
      create: (r, d) => operar(r, d, 'create'),
      update: (r, d) => operar(r, d, 'update'),
      delete: (r) => r.delete(),
    }),
  };
};

const POR_DEV = { uid: 'dev1', nombre: 'Dev', rol: 'dev' };
const POR_ADMIN = { uid: 'adm1', nombre: 'Admin', rol: 'admin' };
const INTERNO = { rol: 'operador', nombreCompleto: 'Ana', nombreUsuario: 'ana', centroCostoId: 'c1', excepciones: { agregados: [], quitados: [] }, permisos: { implantes: ['/implantes/x'] }, permisosGranulares: { '/implantes/x': {} }, administradoresAsignados: ['adm1'], instituciones: ['i1'] };
const EXTERNO = { tipoUsuario: 'externo', empresaId: 'e1', rol: 'operador', nombreCompleto: 'Beto', nombreUsuario: 'beto', centroCostoId: null, excepciones: { agregados: [], quitados: [] }, permisos: {}, permisosGranulares: {} };

let db;
const usuario = (uid) => db.datos.get(`usuarios/${uid}`);
beforeEach(() => {
  db = crearDb({
    'usuarios/dev1': { rol: 'dev' },
    'usuarios/adm1': { rol: 'admin', centroCostoId: 'c1', centrosAdministrados: ['c1'] },
    'usuarios/ana': INTERNO,
    'usuarios/beto': EXTERNO,
    'maestros_empresas/e1': { nombre: 'Empresa 1', estado: 'ACTIVO' },
    'maestros_empresas/e2': { nombre: 'Empresa 2', estado: 'ACTIVO' },
    'maestros_empresas/inactiva': { nombre: 'Inactiva', estado: 'INACTIVO' },
    'maestros_centros/c1': { nombre: 'Centro 1', estado: 'ACTIVO' },
    'plantillas_permisos/c1__operador': { permisos: { bodega: ['/bodega/x'] }, permisosGranulares: { '/bodega/x': {} } },
  });
});

describe('guardarPermisosUsuario: pasar a externo', () => {
  it('deja rol Operador, sin centro y sin ningún permiso, con auditoría', async () => {
    await guardarPermisosUsuario(db, POR_DEV, { uid: 'ana', tipoUsuario: 'externo', empresaId: 'e1' });
    expect(usuario('ana')).toMatchObject({
      tipoUsuario: 'externo', empresaId: 'e1', rol: 'operador', centroCostoId: null, permisos: {}, permisosGranulares: {},
      administradoresAsignados: [], instituciones: [],
    });
    const log = [...db.datos.entries()].find(([k]) => k.startsWith('usuarios/ana/logs/'))[1];
    expect(log.cambios ?? log.detalle ?? log).toMatchObject({ tipoUsuario: { antes: null, despues: 'externo' }, empresaId: { antes: null, despues: 'e1' } });
  });

  it('sin empresa, o con empresa inactiva o inexistente, se rechaza', async () => {
    await expect(guardarPermisosUsuario(db, POR_DEV, { uid: 'ana', tipoUsuario: 'externo' })).rejects.toThrow(/empresa es obligatoria/);
    await expect(guardarPermisosUsuario(db, POR_DEV, { uid: 'ana', tipoUsuario: 'externo', empresaId: 'inactiva' })).rejects.toThrow(/inactiva/);
    await expect(guardarPermisosUsuario(db, POR_DEV, { uid: 'ana', tipoUsuario: 'externo', empresaId: 'nada' })).rejects.toThrow(/no existe/);
    expect(usuario('ana').tipoUsuario).toBeUndefined();
  });

  it('un tipo inválido se rechaza', async () => {
    await expect(guardarPermisosUsuario(db, POR_DEV, { uid: 'ana', tipoUsuario: 'otro' })).rejects.toThrow(/Tipo de usuario inválido/);
  });

  it('un Administrador no se cambia a sí mismo el tipo', async () => {
    await expect(guardarPermisosUsuario(db, POR_ADMIN, { uid: 'adm1', tipoUsuario: 'externo', empresaId: 'e1' })).rejects.toThrow(/propio/);
  });

  it('no deja el sistema sin su último desarrollador', async () => {
    await expect(guardarPermisosUsuario(db, POR_DEV, { uid: 'dev1', tipoUsuario: 'externo', empresaId: 'e1' })).rejects.toThrow(/último desarrollador/);
  });
});

describe('guardarPermisosUsuario: un externo no recibe nada interno', () => {
  it.each([
    ['rol Administrador', { rol: 'admin' }, /rol Operador/],
    ['rol Desarrollador', { rol: 'dev' }, /rol Operador/],
    ['centro de costo', { centroCostoId: 'c1' }, /centro de costo/],
    ['centros administrados', { centrosAdministrados: ['c1'] }, /administra/],
    ['administradores asignados', { administradoresAsignados: ['adm1'] }, /administra/],
    ['instituciones', { instituciones: ['i1'] }, /instituciones/],
    ['módulo interno', { excepciones: { agregados: ['m|implantes|/implantes/x'], quitados: [] } }, /módulos para externos/],
  ])('%s: se rechaza y no cambia nada', async (_n, cambio, error) => {
    await expect(guardarPermisosUsuario(db, POR_DEV, { uid: 'beto', ...cambio })).rejects.toThrow(error);
    expect(usuario('beto')).toEqual(EXTERNO);
  });

  it('sí se editan sus datos sin perder empresa ni tipo', async () => {
    await guardarPermisosUsuario(db, POR_DEV, { uid: 'beto', datos: { nombreCompleto: 'Beto Soto' } });
    expect(usuario('beto')).toMatchObject({ nombreCompleto: 'Beto Soto', tipoUsuario: 'externo', empresaId: 'e1', permisos: {} });
  });

  it('cambiar de empresa valida la nueva', async () => {
    await guardarPermisosUsuario(db, POR_DEV, { uid: 'beto', empresaId: 'e2' });
    expect(usuario('beto').empresaId).toBe('e2');
    await expect(guardarPermisosUsuario(db, POR_DEV, { uid: 'beto', empresaId: 'inactiva' })).rejects.toThrow(/inactiva/);
    expect(usuario('beto').empresaId).toBe('e2');
  });

  it('con su empresa ya inactiva se le pueden editar los datos', async () => {
    db.datos.set('maestros_empresas/e1', { estado: 'INACTIVO' });
    await guardarPermisosUsuario(db, POR_DEV, { uid: 'beto', datos: { activo: true }, empresaId: 'e1' });
    expect(usuario('beto').empresaId).toBe('e1');
  });
});

describe('guardarPermisosUsuario: volver a interno', () => {
  it('sin centro de costo se rechaza: es Operador', async () => {
    await expect(guardarPermisosUsuario(db, POR_DEV, { uid: 'beto', tipoUsuario: 'interno' })).rejects.toThrow(/centro de costo es obligatorio/);
    expect(usuario('beto').tipoUsuario).toBe('externo');
  });

  it('con centro: deja de tener empresa y toma la plantilla', async () => {
    await guardarPermisosUsuario(db, POR_DEV, { uid: 'beto', tipoUsuario: 'interno', centroCostoId: 'c1', excepciones: { agregados: [], quitados: [] } });
    expect(usuario('beto')).toMatchObject({ tipoUsuario: 'interno', empresaId: null, centroCostoId: 'c1', permisos: { bodega: ['/bodega/x'] } });
  });
});

describe('asignaciones masivas', () => {
  it('rechazan a un externo', async () => {
    await expect(asignarCentroCostoMasivo(db, POR_DEV, { uids: ['beto'], centroCostoId: 'c1' })).rejects.toThrow(/externo/);
    await expect(asignarAdministradoresMasivo(db, POR_DEV, { uids: ['beto'], todosLosAdministradoresDelCentro: true })).rejects.toThrow(/externo/);
    expect(usuario('beto')).toEqual(EXTERNO);
  });
});

describe('guardarPermisosUsuario: internos sin cambios', () => {
  it('editar a un interno no le agrega tipo ni empresa', async () => {
    await guardarPermisosUsuario(db, POR_DEV, { uid: 'ana', datos: { nombreCompleto: 'Ana María' } });
    expect(usuario('ana').nombreCompleto).toBe('Ana María');
    expect(usuario('ana').tipoUsuario).toBeUndefined();
    expect(usuario('ana').empresaId).toBeUndefined();
  });
});

describe('crearUsuario', () => {
  const auth = { createUser: async () => ({ uid: 'nuevo', email: 'n@x.cl' }), deleteUser: async () => {} };
  const BASE = { nombreCompleto: 'Nuevo', nombreUsuario: 'nuevo', email: 'n@x.cl', password: 'secreto1' };

  it('externo: empresa, rol Operador, cuenta completa y cambio obligatorio de contraseña', async () => {
    await crearUsuario(db, auth, POR_DEV, { ...BASE, tipoUsuario: 'externo', empresaId: 'e1' });
    expect(usuario('nuevo')).toMatchObject({
      tipoUsuario: 'externo', empresaId: 'e1', rol: 'operador', centroCostoId: null, permisos: {}, permisosGranulares: {},
      passwordChanged: false, estadoCreacion: { completo: true, paso2: true },
    });
  });

  it('externo sin empresa válida o con otro rol: no crea la cuenta', async () => {
    let creada = false;
    const authVigilado = { ...auth, createUser: async () => { creada = true; return { uid: 'nuevo', email: 'n@x.cl' }; } };
    await expect(crearUsuario(db, authVigilado, POR_DEV, { ...BASE, tipoUsuario: 'externo' })).rejects.toThrow(/empresa es obligatoria/);
    await expect(crearUsuario(db, authVigilado, POR_DEV, { ...BASE, tipoUsuario: 'externo', empresaId: 'inactiva' })).rejects.toThrow(/inactiva/);
    await expect(crearUsuario(db, authVigilado, POR_DEV, { ...BASE, tipoUsuario: 'externo', empresaId: 'e1', rol: 'admin' })).rejects.toThrow(/rol Operador/);
    expect(creada).toBe(false);
  });

  it('interno: como siempre, por pasos y con cambio obligatorio', async () => {
    await crearUsuario(db, auth, POR_DEV, BASE);
    expect(usuario('nuevo')).toMatchObject({ tipoUsuario: 'interno', rol: 'operador', passwordChanged: false, estadoCreacion: { completo: false, paso2: false } });
    expect(usuario('nuevo').empresaId).toBeUndefined();
  });
});
