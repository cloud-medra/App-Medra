// Triggers ante eventos atrasados, repetidos o en desorden: Pub/Sub reintenta las
// entregas rechazadas por falta de capacidad y entrega "al menos una vez". Con
// Firestore en memoria.
import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'node:module';
import { admisionesARecalcular } from './admisiones/nucleo.mjs';
import { idDescripcionReporte } from './descripcionesReporte/nucleo.mjs';

const require = createRequire(import.meta.url);
const { aplicarCambioDescripcion, aplicarCambioFila } = require('./descripcionesReporte/servicio');
const { aplicarCierre } = require('./estadisticas/servicio');
const { alCambiarPeriodo } = require('./bodega/periodos');
const { aplicarCambioGestion, leerActual } = require('./admisiones/servicio');
const zonas = require('./bodymap/servicio');
const { aplicarCambioTicket } = require('./notificaciones/servicio');

// Firestore mínimo: documentos por ruta. Cuenta lecturas y permite fallar un commit.
const crearDb = (inicial = {}) => {
  const datos = new Map(Object.entries(inicial));
  let lecturas = 0;
  const refDoc = (ruta) => ({
    path: ruta,
    id: ruta.split('/').pop(),
    get: async () => {
      lecturas += 1;
      return { exists: datos.has(ruta), id: ruta.split('/').pop(), ref: refDoc(ruta), data: () => (datos.has(ruta) ? { ...datos.get(ruta) } : undefined), get: (k) => datos.get(ruta)?.[k] };
    },
    set: async (d, opciones) => { datos.set(ruta, opciones?.merge ? { ...datos.get(ruta), ...d } : d); },
    create: async (d) => {
      if (datos.has(ruta)) throw Object.assign(new Error('ya existe'), { code: 6 });
      datos.set(ruta, d);
    },
    update: async (d) => {
      if (!datos.has(ruta)) throw Object.assign(new Error('no encontrado'), { code: 5 });
      datos.set(ruta, { ...datos.get(ruta), ...d });
    },
    delete: async () => { datos.delete(ruta); },
    collection: (c) => refCol(`${ruta}/${c}`),
  });
  const docsDe = (prefijo, filtros, grupo) => [...datos.keys()]
    .filter((k) => (grupo ? k.includes(`/${grupo}/`) && k.split('/').at(-2) === grupo : k.startsWith(`${prefijo}/`) && !k.slice(prefijo.length + 1).includes('/')))
    .filter((k) => filtros.every(([c, , v]) => datos.get(k)[c] === v))
    .map((k) => ({ exists: true, id: k.split('/').pop(), ref: refDoc(k), data: () => ({ ...datos.get(k) }), get: (c) => datos.get(k)[c] }));
  const refCol = (ruta, filtros = [], grupo = null) => ({
    doc: (id = `auto${datos.size}`) => refDoc(`${ruta}/${id}`),
    where: (c, op, v) => refCol(ruta, [...filtros, [c, op, v]], grupo),
    select: () => refCol(ruta, filtros, grupo),
    get: async () => { const docs = docsDe(ruta, filtros, grupo); return { docs, empty: !docs.length, size: docs.length }; },
  });
  const db = {
    datos,
    lecturas: () => lecturas,
    collection: (c) => refCol(c),
    collectionGroup: (g) => refCol(null, [], g),
    doc: refDoc,
    getAll: (...rs) => Promise.all(rs.map((r) => r.get())),
    batch: () => {
      const ops = [];
      return {
        update: (r, d) => ops.push(() => r.update(d)),
        set: (r, d, o) => ops.push(() => r.set(d, o)),
        delete: (r) => ops.push(() => r.delete()),
        commit: async () => { for (const op of ops) await op(); },
      };
    },
    runTransaction: async (fn) => {
      const pendientes = [];
      const r = await fn({
        get: (x) => x.get(),
        getAll: (...rs) => Promise.all(rs.map((x) => x.get())),
        set: (x, d) => pendientes.push(() => x.set(d)),
        update: (x, d) => pendientes.push(() => x.update(d)),
        delete: (x) => pendientes.push(() => x.delete()),
      });
      for (const op of pendientes) await op();
      return r;
    },
  };
  return db;
};

const FILA = 'documentos_reportesInfo/2026/meses/octubre/registros/r1';
const rutaMaestro = (norm) => `maestros_descripciones_reporte/${idDescripcionReporte(norm)}`;

describe('descripcionesReporteMaestro', () => {
  const M = rutaMaestro('VASECTOMIA');
  const filas = (db) => ['r1', 'r2'].map((r) => db.datos.get(`documentos_reportesInfo/2026/meses/octubre/registros/${r}`));
  const base = () => crearDb({
    [`documentos_reportesInfo/2026/meses/octubre/registros/r1`]: { 'Descripción': 'VASECTOMIA', 'Admisión': '1', descripcionNorm: 'VASECTOMIA', admisionClave: '1', ocultaImplantes: false, ocultaDocumentos: false, descripcionOcultaImplantes: false },
    [`documentos_reportesInfo/2026/meses/octubre/registros/r2`]: { 'Descripción': 'VASECTOMIA', 'Admisión': '2', descripcionNorm: 'VASECTOMIA', admisionClave: '2', ocultaImplantes: false, ocultaDocumentos: false, descripcionOcultaImplantes: false },
    [M]: { descripcion: 'VASECTOMIA', ocultaImplantes: true, ocultaDocumentos: true },
  });

  it('dos switches seguidos, con los eventos en desorden: las filas quedan como el Maestro', async () => {
    // Es el caso de las 113 filas: el evento del primer switch llega último.
    const db = base();
    const ref = db.doc(M);
    const primero = { descripcion: 'VASECTOMIA', ocultaImplantes: true, ocultaDocumentos: false };
    const segundo = { descripcion: 'VASECTOMIA', ocultaImplantes: true, ocultaDocumentos: true };
    await aplicarCambioDescripcion(db, primero, segundo, ref);
    await aplicarCambioDescripcion(db, { descripcion: 'VASECTOMIA' }, primero, ref);
    filas(db).forEach((f) => expect(f).toMatchObject({ ocultaImplantes: true, ocultaDocumentos: true }));
  });

  it('un evento repetido no cambia nada más', async () => {
    const db = base();
    const ref = db.doc(M);
    const antes = { descripcion: 'VASECTOMIA' };
    const despues = { descripcion: 'VASECTOMIA', ocultaImplantes: true, ocultaDocumentos: true };
    expect((await aplicarCambioDescripcion(db, antes, despues, ref)).actualizadas).toBe(2);
    expect((await aplicarCambioDescripcion(db, antes, despues, ref)).actualizadas).toBe(0);
  });

  it('una escritura que no cambia los switches no lee nada', async () => {
    const db = base();
    const igual = { descripcion: 'VASECTOMIA', ocultaImplantes: true };
    expect(await aplicarCambioDescripcion(db, igual, { ...igual, filas: 3 }, db.doc(M))).toEqual({ filas: 0, actualizadas: 0 });
    expect(db.lecturas()).toBe(0);
  });

  it('si la descripción ya se borró no hace nada', async () => {
    const db = crearDb();
    expect(await aplicarCambioDescripcion(db, {}, { descripcion: 'X', ocultaImplantes: true }, db.doc(rutaMaestro('X')))).toEqual({ filas: 0, actualizadas: 0 });
  });
});

describe('descripcionesReporteFila', () => {
  const crearFila = { 'Descripción': 'A', 'Admisión': '' };

  it('fila borrada antes de que llegue el evento: cuenta el evento y no falla', async () => {
    const db = crearDb({ [rutaMaestro('A')]: { descripcion: 'A', filas: 1 } });
    await expect(aplicarCambioFila(db, db.doc(FILA), null, crearFila)).resolves.toMatchObject({ contador: { resta: null, suma: 'A' } });
    expect(db.datos.has(FILA)).toBe(false);
  });

  it('se borra justo entre la lectura y la escritura: no falla', async () => {
    const db = crearDb({ [FILA]: crearFila });
    const ref = db.doc(FILA);
    const borrada = { ...ref, update: async () => { throw Object.assign(new Error('no encontrado'), { code: 5 }); } };
    await expect(aplicarCambioFila(db, borrada, null, crearFila)).resolves.toMatchObject({ contador: { suma: 'A' } });
    expect(await aplicarCambioFila(db, borrada, null, crearFila)).not.toHaveProperty('campos');
  });

  it('otro error de escritura sí se informa', async () => {
    const db = crearDb({ [FILA]: crearFila });
    const fallida = { ...db.doc(FILA), update: async () => { throw Object.assign(new Error('caído'), { code: 14 }); } };
    await expect(aplicarCambioFila(db, fallida, null, crearFila)).rejects.toThrow('caído');
  });

  it('evento atrasado: los campos salen de la fila actual, no de la foto del evento', async () => {
    const db = crearDb({
      [FILA]: { 'Descripción': 'B', 'Admisión': '' },
      [rutaMaestro('A')]: { descripcion: 'A', ocultaDocumentos: false },
      [rutaMaestro('B')]: { descripcion: 'B', ocultaDocumentos: true },
    });
    await aplicarCambioFila(db, db.doc(FILA), null, crearFila);
    expect(db.datos.get(FILA)).toMatchObject({ descripcionNorm: 'B', ocultaDocumentos: true });
  });
});

describe('zonasDiagnosticoGestionImplante', () => {
  const buscar = (db, d) => [...db.datos.entries()].find(([, v]) => v.descripcion === d)?.[1];
  const conEntrada = async (d, n) => {
    const db = crearDb();
    await zonas.aplicarCambioGestion(db, null, { descripcion: d });
    const [clave] = [...db.datos.keys()];
    db.datos.set(clave, { ...db.datos.get(clave), gestiones: n });
    return db;
  };

  it('cambiar la descripción resta a la anterior y suma a la nueva en una sola transacción', async () => {
    const db = await conEntrada('RODILLA', 3);
    let transacciones = 0;
    const rt = db.runTransaction;
    db.runTransaction = (fn) => { transacciones += 1; return rt(fn); };
    await zonas.aplicarCambioGestion(db, { descripcion: 'RODILLA' }, { descripcion: 'CADERA' });
    expect(transacciones).toBe(1);
    expect(buscar(db, 'RODILLA').gestiones).toBe(2);
    expect(buscar(db, 'CADERA').gestiones).toBe(1);
  });

  it('si la transacción falla no queda a medias', async () => {
    const db = await conEntrada('RODILLA', 3);
    db.runTransaction = async () => { throw new Error('caído'); };
    await expect(zonas.aplicarCambioGestion(db, { descripcion: 'RODILLA' }, { descripcion: 'CADERA' })).rejects.toThrow('caído');
    expect(buscar(db, 'RODILLA').gestiones).toBe(3);
    expect(buscar(db, 'CADERA')).toBeUndefined();
  });

  it('crear, borrar y nunca bajar de 0', async () => {
    const db = await conEntrada('RODILLA', 0);
    await zonas.aplicarCambioGestion(db, { descripcion: 'RODILLA' }, null);
    expect(buscar(db, 'RODILLA').gestiones).toBe(0);
    await zonas.aplicarCambioGestion(db, { descripcion: 'NUNCA VISTA' }, null);
    expect(buscar(db, 'NUNCA VISTA')).toBeUndefined();
  });

  it('sin cambio de descripción no abre transacción', async () => {
    const db = crearDb();
    db.runTransaction = async () => { throw new Error('no debería'); };
    expect(await zonas.aplicarCambioGestion(db, { descripcion: 'A' }, { descripcion: ' a ' })).toEqual({ cambio: false });
  });
});

describe('admisiones', () => {
  const RUTA = 'consignacion_registros/2026/mes/octubre/dia/01/detalles/g1';
  const registro = (estado) => ({ gestionId: '100', estado, fecha: '2026-10-01' });

  it('evento atrasado: con el documento actual queda el estado real, no el viejo', async () => {
    const db = crearDb({ [RUTA]: registro('SOLICITADO') });
    const r = db.doc(RUTA);
    // Llega primero el cambio a SOLICITADO y después, atrasado, el de CARGADO.
    await aplicarCambioGestion(db, RUTA, registro('CARGADO'), await leerActual(r), 'consignacion');
    await aplicarCambioGestion(db, RUTA, registro('INGRESADO'), await leerActual(r), 'consignacion');
    expect(db.datos.get('admisiones_gestionadas_consignacion/100')).toMatchObject({ estado: 'imputada', itemsPendientes: 0 });
  });

  it('documento ya borrado: lo saca de la admisión', async () => {
    const db = crearDb({ [RUTA]: registro('CARGADO') });
    const r = db.doc(RUTA);
    await aplicarCambioGestion(db, RUTA, null, await leerActual(r), 'consignacion');
    db.datos.delete(RUTA);
    await aplicarCambioGestion(db, RUTA, null, await leerActual(r), 'consignacion');
    await aplicarCambioGestion(db, RUTA, registro('CARGADO'), await leerActual(r), 'consignacion');
    expect(db.datos.has('admisiones_gestionadas_consignacion/100')).toBe(false);
  });

  describe('admisionesARecalcular', () => {
    const g = (id) => ({ gestionId: id });
    it('marca ganada o perdida en esta ejecución', () => {
      expect(admisionesARecalcular(null, g('1'), { 1: 'creada' })).toEqual([{ admision: '1', gestionada: true }]);
      expect(admisionesARecalcular(g('1'), null, { 1: 'borrada' })).toEqual([{ admision: '1', gestionada: false }]);
    });

    it('entrega repetida tras cortarse: "sin cambios" igual recalcula y lee la marca', () => {
      expect(admisionesARecalcular(null, g('1'), { 1: 'sin cambios' })).toEqual([{ admision: '1', gestionada: null }]);
      expect(admisionesARecalcular(g('1'), null, { 1: 'sin cambios' })).toEqual([{ admision: '1', gestionada: null }]);
    });

    it('cambio de admisión: las dos', () => {
      expect(admisionesARecalcular(g('1'), g('2'), { 1: 'borrada', 2: 'creada' })).toEqual([{ admision: '1', gestionada: false }, { admision: '2', gestionada: true }]);
    });

    it('una edición sin cambio de admisión no recalcula nada', () => {
      expect(admisionesARecalcular(g('1'), g('1'), { 1: 'actualizada' })).toEqual([]);
      expect(admisionesARecalcular(g('1'), g('1'), { 1: 'sin cambios' })).toEqual([]);
    });
  });
});

describe('notificacionesTicket', () => {
  const T = 'tickets/t1';
  const A = 'alertas/ticket_t1';
  const ticket = { numero: 'TK-1', titulo: 'x', estado: 'NUEVO', creadoPor: 'op', administradores: ['adm'] };
  const usuarios = { 'usuarios/adm': { rol: 'admin' }, 'usuarios/dev': { rol: 'dev' } };
  let db;
  beforeEach(() => { db = crearDb({ ...usuarios, [T]: ticket }); });

  it('evento repetido: no pisa una alerta ya leída', async () => {
    expect((await aplicarCambioTicket(db, 't1', null, ticket)).accion).toBe('crear');
    db.datos.set(A, { ...db.datos.get(A), noLeidas: [] });
    expect(await aplicarCambioTicket(db, 't1', null, ticket)).toEqual({ accion: null });
    expect(db.datos.get(A).noLeidas).toEqual([]);
  });

  it('evento atrasado de un ticket ya resuelto: no crea la alerta', async () => {
    db.datos.set(T, { ...ticket, estado: 'EN_REVISION' });
    expect(await aplicarCambioTicket(db, 't1', null, ticket)).toEqual({ accion: null });
    expect(db.datos.has(A)).toBe(false);
  });

  it('un "resuelto" atrasado no resuelve un ticket que volvió a NUEVO', async () => {
    db.datos.set(A, { estado: 'pendiente' });
    expect(await aplicarCambioTicket(db, 't1', ticket, { ...ticket, estado: 'EN_REVISION' })).toEqual({ accion: null });
    expect(db.datos.get(A).estado).toBe('pendiente');
  });

  it('ticket eliminado: resuelve la alerta', async () => {
    db.datos.delete(T);
    db.datos.set(A, { estado: 'pendiente' });
    expect(await aplicarCambioTicket(db, 't1', ticket, null)).toEqual({ accion: 'resolver' });
    expect(db.datos.get(A)).toMatchObject({ estado: 'resuelta', resultado: 'eliminado' });
  });
});

describe('cierres de período con eventos en desorden', () => {
  const C = 'cierres_periodos/2026_octubre_bodega';
  const per = (estado) => ({ modulo: 'bodega', anio: '2026', mes: 'octubre', estado });

  it('estadisticasCierre: un "cerrado" que llega tras reabrir no congela el mes', async () => {
    const R = 'cierres_periodos/2026_octubre_implantes';
    const c = (estado) => ({ modulo: 'implantes', anio: '2026', mes: 'octubre', estado });
    const db = crearDb({ [R]: c('REABIERTO') });
    expect(await aplicarCierre(db, c('ABIERTO'), c('CERRADO'), db.doc(R))).toBe('evento-atrasado');
    expect([...db.datos.keys()].filter((k) => k.startsWith('estadisticas'))).toEqual([]);
  });

  it('estadisticasCierre: otro módulo o sin cambio de estado no lee el cierre', async () => {
    const db = crearDb();
    expect(await aplicarCierre(db, per('ABIERTO'), per('CERRADO'), db.doc(C))).toBe('otro-modulo');
    const i = { modulo: 'implantes', anio: '2026', mes: 'octubre', estado: 'ABIERTO' };
    expect(await aplicarCierre(db, i, { ...i, x: 1 }, db.doc(C))).toBe('sin-cambio');
    expect(db.lecturas()).toBe(0);
  });

  it('bodegaPeriodo: un "cerrado" atrasado no toca la foto', async () => {
    const db = crearDb({ [C]: per('REABIERTO') });
    expect(await alCambiarPeriodo(db, per('ABIERTO'), per('CERRADO'), db.doc(C))).toMatchObject({ accion: 'evento-atrasado' });
    expect([...db.datos.keys()].some((k) => k.startsWith('bodega_periodos'))).toBe(false);
  });

  it('bodegaPeriodo: sin cambio relevante no lee nada, y otro módulo tampoco', async () => {
    const db = crearDb();
    expect(await alCambiarPeriodo(db, per('ABIERTO'), { ...per('ABIERTO'), x: 1 }, db.doc(C))).toBeNull();
    expect(await alCambiarPeriodo(db, null, { ...per('ABIERTO'), modulo: 'implantes' }, db.doc(C))).toBeNull();
    expect(db.lecturas()).toBe(0);
  });

  it('bodegaPeriodo: apertura repetida no falla', async () => {
    const db = crearDb({ [C]: per('ABIERTO') });
    const r1 = await alCambiarPeriodo(db, null, per('ABIERTO'), db.doc(C));
    const r2 = await alCambiarPeriodo(db, null, per('ABIERTO'), db.doc(C));
    expect(r1).toEqual(r2);
    expect(r1).toMatchObject({ accion: 'apertura', asignados: 0 });
  });
});
