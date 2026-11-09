// Vínculos de códigos de barra contra una Firestore en memoria: la Function
// nueva de Maestros y el comportamiento de las que ya existían.
import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'node:module';
import { crearDb } from '../testutils/firestoreMemoria.mjs';
import { idVinculo } from './gs1.mjs';

const require = createRequire(import.meta.url);
const { gestionarCodigoBarra, gestionarCodigoBarraComo } = require('./codigosBarra');
const servicio = require('./servicio');

const POR = { uid: 'dev', nombre: 'Dev', email: '' };
const MALO = '7800000000017';
const BUENO = '7800000000024';
const OTRO = '7800000000031';
const A = 'prodA';
const B = 'prodB';
const C = 'prodC';

const producto = (nombre, referencia, codigosBarra = []) => ({
  nombre, referencia, codigoMaestro: `BOD-${nombre}`, activo: true, codigosBarra,
  disponible: 7, transito: 2, enCentro: 1, transitoPorCentro: { c1: 2 }, enCentroPorCentro: { c1: 1 }, costoPromedio: 1234.5, valorStock: 11110, conMovimientos: true,
});
const vinculo = (clave, productoId) => ({ clave, codigoLeido: clave, productoId, creadoPor: { uid: 'u0', nombre: 'Original' }, creadoEn: 'fecha-original' });

const inicial = () => ({
  [`bodega_productos/${A}`]: producto('A', 'REF-A', [MALO]),
  [`bodega_productos/${B}`]: producto('B', 'REF-B', [BUENO]),
  [`bodega_productos/${C}`]: producto('C', 'REF-C'),
  [`bodega_codigos_barra/${idVinculo(MALO)}`]: vinculo(MALO, A),
  [`bodega_codigos_barra/${idVinculo(BUENO)}`]: vinculo(BUENO, B),
  'bodega_lotes/l1': { productoId: A, lote: 'L', vencimiento: '2030-01-01', disponible: 7 },
  'bodega_movimientos/m1': { productoId: A, tipo: 'INGRESO', cantidad: 7, codigoLeido: MALO, valor: 8641 },
  'bodega_documentos/d1': { lineas: [{ productoId: A, codigoLeido: MALO, cantidad: 7 }] },
  'usuarios/dev': { rol: 'dev', activo: true, nombreCompleto: 'Dev' },
  'usuarios/sin': { rol: 'operador', activo: true, permisos: { maestros: ['/maestros/codigosMaestros'] } },
  'usuarios/con': { rol: 'operador', activo: true, permisos: { maestros: ['/maestros/codigosBarra'] }, permisosGranulares: { '/maestros/codigosBarra': {} } },
  'usuarios/ext': { rol: 'operador', activo: true, tipoUsuario: 'externo', empresaId: 'e', permisos: { maestros: ['/maestros/codigosBarra'] } },
});

let db; let datos;
const prod = (id) => datos.get(`bodega_productos/${id}`);
const link = (clave) => datos.get(`bodega_codigos_barra/${idVinculo(clave)}`);
const logs = (id) => [...datos.entries()].filter(([r]) => r.startsWith(`bodega_productos/${id}/logs/`)).map(([, v]) => v);
const op = (d) => gestionarCodigoBarraComo(db, POR, d);
const CAMPOS_STOCK = ['disponible', 'transito', 'enCentro', 'transitoPorCentro', 'enCentroPorCentro', 'costoPromedio', 'valorStock', 'conMovimientos'];
const fotoStock = () => JSON.stringify({
  productos: [A, B, C].map((id) => CAMPOS_STOCK.map((c) => prod(id)[c])),
  resto: [...datos.entries()].filter(([r]) => /^bodega_(lotes|movimientos|documentos)\//.test(r)),
});

beforeEach(() => { ({ db, datos } = crearDb(inicial())); });

describe('corregir un código mal vinculado', () => {
  it('editar deja libre el valor anterior y se puede vincular el correcto', async () => {
    await op({ accion: 'EDITAR', clave: MALO, esperadoProductoId: A, codigoLeido: OTRO });
    expect(link(MALO)).toBeUndefined();
    expect(link(OTRO)).toMatchObject({ clave: OTRO, productoId: A, creadoPor: { nombre: 'Original' }, creadoEn: 'fecha-original', modificadoPor: POR });
    expect(prod(A).codigosBarra).toEqual([OTRO]);
    await op({ accion: 'AGREGAR', productoId: C, codigoLeido: MALO });
    expect(link(MALO).productoId).toBe(C);
  });

  it('audita acción, valor anterior y nuevo, referencias, usuario y momento', async () => {
    await op({ accion: 'EDITAR', clave: MALO, esperadoProductoId: A, codigoLeido: OTRO });
    expect(logs(A)[0]).toMatchObject({
      accion: 'CODIGO_EDITADO', usuario: 'Dev', usuarioUid: 'dev',
      detalle: { valorAnterior: { clave: MALO }, valorNuevo: { clave: OTRO }, productoOrigen: { id: A, referencia: 'REF-A' }, productoDestino: { id: A, referencia: 'REF-A' } },
    });
    expect(logs(A)[0].fecha).toBeTruthy();
  });

  it('normaliza igual que hoy: espacios, control y GS1 guardan el GTIN', async () => {
    await op({ accion: 'AGREGAR', productoId: C, codigoLeido: `  ${OTRO}\r\n` });
    expect(link(OTRO).productoId).toBe(C);
    await op({ accion: 'AGREGAR', productoId: C, codigoLeido: '(01)07612345678900(10)ABC' });
    expect(link('07612345678900')).toMatchObject({ clave: '07612345678900', codigoLeido: '(01)07612345678900(10)ABC' });
  });

  it('un código de solo lote o vacío se rechaza', async () => {
    await expect(Promise.resolve().then(() => op({ accion: 'AGREGAR', productoId: C, codigoLeido: '(17)301231(10)ABC' }))).rejects.toThrow(/solo trae lote/);
    await expect(Promise.resolve().then(() => op({ accion: 'AGREGAR', productoId: C, codigoLeido: '   ' }))).rejects.toThrow(/vacío/);
  });

  it('editar al mismo valor se rechaza', async () => {
    await expect(Promise.resolve().then(() => op({ accion: 'EDITAR', clave: MALO, esperadoProductoId: A, codigoLeido: ` ${MALO} ` }))).rejects.toThrow(/igual/);
  });
});

describe('un código no queda en dos referencias', () => {
  it('agregar uno que ya existe se rechaza e indica referencia y producto', async () => {
    await expect(op({ accion: 'AGREGAR', productoId: C, codigoLeido: MALO })).rejects.toMatchObject({
      message: expect.stringContaining('REF-A'),
      details: { motivo: 'vinculado-a-otro', productoId: A, referencia: 'REF-A', nombre: 'A' },
    });
    expect(link(MALO).productoId).toBe(A);
    expect(prod(C).codigosBarra).toEqual([]);
  });

  it('agregarlo a su propio producto también se rechaza', async () => {
    await expect(op({ accion: 'AGREGAR', productoId: A, codigoLeido: MALO })).rejects.toMatchObject({ details: { motivo: 'vinculado-a-otro' } });
  });

  it('editar hacia un código ocupado se rechaza sin cambiar nada', async () => {
    await expect(op({ accion: 'EDITAR', clave: MALO, esperadoProductoId: A, codigoLeido: BUENO })).rejects.toMatchObject({ details: { referencia: 'REF-B' } });
    expect(link(MALO).productoId).toBe(A);
    expect(link(BUENO).productoId).toBe(B);
    expect(logs(A)).toHaveLength(0);
  });
});

describe('mover y eliminar', () => {
  it('mover actualiza vínculo y ambas listas, y audita en las dos referencias', async () => {
    await op({ accion: 'MOVER', clave: MALO, esperadoProductoId: A, productoDestinoId: C });
    expect(link(MALO)).toMatchObject({ productoId: C, reasignadoDe: A, creadoEn: 'fecha-original' });
    expect(prod(A).codigosBarra).toEqual([]);
    expect(prod(C).codigosBarra).toEqual([MALO]);
    [A, C].forEach((id) => expect(logs(id)[0]).toMatchObject({
      accion: 'CODIGO_MOVIDO', detalle: { productoOrigen: { referencia: 'REF-A' }, productoDestino: { referencia: 'REF-C' }, valorAnterior: { clave: MALO } },
    }));
  });

  it('no mueve a la misma referencia ni a una inactiva', async () => {
    await expect(op({ accion: 'MOVER', clave: MALO, esperadoProductoId: A, productoDestinoId: A })).rejects.toThrow(/ya está/);
    datos.set(`bodega_productos/${C}`, { ...prod(C), activo: false });
    await expect(op({ accion: 'MOVER', clave: MALO, esperadoProductoId: A, productoDestinoId: C })).rejects.toThrow(/inactiva/);
  });

  it('eliminar quita el vínculo y audita, sin tocar stock, costos ni kardex', async () => {
    const antes = fotoStock();
    await op({ accion: 'ELIMINAR', clave: MALO, esperadoProductoId: A });
    expect(link(MALO)).toBeUndefined();
    expect(prod(A).codigosBarra).toEqual([]);
    expect(fotoStock()).toBe(antes);
    expect(datos.get('bodega_movimientos/m1').codigoLeido).toBe(MALO);
    expect(logs(A)[0]).toMatchObject({ accion: 'CODIGO_ELIMINADO', detalle: { valorAnterior: { clave: MALO }, valorNuevo: null } });
  });

  it('editar y mover tampoco tocan stock, costos ni kardex', async () => {
    const antes = fotoStock();
    await op({ accion: 'EDITAR', clave: MALO, esperadoProductoId: A, codigoLeido: OTRO });
    await op({ accion: 'MOVER', clave: OTRO, esperadoProductoId: A, productoDestinoId: C });
    expect(fotoStock()).toBe(antes);
  });

  it('un vínculo huérfano se puede eliminar', async () => {
    datos.set(`bodega_codigos_barra/${idVinculo(OTRO)}`, vinculo(OTRO, 'noExiste'));
    await op({ accion: 'ELIMINAR', clave: OTRO, esperadoProductoId: 'noExiste' });
    expect(link(OTRO)).toBeUndefined();
  });
});

describe('dos usuarios sobre el mismo código', () => {
  const dos = (x, y) => Promise.allSettled([op(x), op(y)]);
  const estados = (r) => r.map((x) => x.status).sort();

  it('dos ediciones: gana una y la lista queda con un solo código', async () => {
    const r = await dos({ accion: 'EDITAR', clave: MALO, esperadoProductoId: A, codigoLeido: OTRO }, { accion: 'EDITAR', clave: MALO, esperadoProductoId: A, codigoLeido: '7800000000048' });
    expect(estados(r)).toEqual(['fulfilled', 'rejected']);
    expect(r.find((x) => x.status === 'rejected').reason.details.motivo).toBe('cambio-concurrente');
    expect(prod(A).codigosBarra).toHaveLength(1);
    expect(link(prod(A).codigosBarra[0]).productoId).toBe(A);
  });

  it('mover y eliminar a la vez: gana uno y queda consistente', async () => {
    const r = await dos({ accion: 'MOVER', clave: MALO, esperadoProductoId: A, productoDestinoId: C }, { accion: 'ELIMINAR', clave: MALO, esperadoProductoId: A });
    expect(estados(r)).toEqual(['fulfilled', 'rejected']);
    const v = link(MALO);
    if (v) expect(prod(C).codigosBarra).toEqual([MALO]);
    else expect(prod(C).codigosBarra).toEqual([]);
    expect(prod(A).codigosBarra).toEqual([]);
  });

  it('dos agregan el mismo código libre a referencias distintas: solo uno queda', async () => {
    const r = await dos({ accion: 'AGREGAR', productoId: A, codigoLeido: OTRO }, { accion: 'AGREGAR', productoId: C, codigoLeido: OTRO });
    expect(estados(r)).toEqual(['fulfilled', 'rejected']);
    expect([prod(A).codigosBarra.includes(OTRO), prod(C).codigosBarra.includes(OTRO)].filter(Boolean)).toHaveLength(1);
  });

  it('se rechaza si el código ya no está donde el usuario lo vio', async () => {
    await op({ accion: 'MOVER', clave: MALO, esperadoProductoId: A, productoDestinoId: C });
    await expect(op({ accion: 'ELIMINAR', clave: MALO, esperadoProductoId: A })).rejects.toMatchObject({ details: { motivo: 'cambio-concurrente' } });
    expect(link(MALO).productoId).toBe(C);
  });
});

describe('permisos', () => {
  const llamar = (uid, d) => gestionarCodigoBarra(db, uid, d);
  it('el rol dev puede', async () => {
    await expect(llamar('dev', { accion: 'ELIMINAR', clave: MALO, esperadoProductoId: A })).resolves.toMatchObject({ clave: MALO });
  });
  it('sin el ítem asignado no puede, aunque tenga el módulo Maestros', async () => {
    await expect(llamar('sin', { accion: 'ELIMINAR', clave: MALO, esperadoProductoId: A })).rejects.toThrow(/permiso/);
    expect(link(MALO)).toBeDefined();
  });
  it('con el ítem asignado puede', async () => {
    await expect(llamar('con', { accion: 'ELIMINAR', clave: MALO, esperadoProductoId: A })).resolves.toMatchObject({ clave: MALO });
  });
  it('un externo no puede, sin sesión tampoco, y una acción desconocida se rechaza', async () => {
    await expect(llamar('ext', { accion: 'ELIMINAR', clave: MALO, esperadoProductoId: A })).rejects.toThrow();
    await expect(llamar(undefined, { accion: 'ELIMINAR', clave: MALO, esperadoProductoId: A })).rejects.toThrow(/sesión/);
    await expect(llamar('dev', { accion: 'BORRAR_TODO' })).rejects.toThrow(/no válida/);
    expect(link(MALO)).toBeDefined();
  });
});

describe('Functions existentes: mismo comportamiento y la referencia en el error', () => {
  const lectura = (codigo) => servicio.lecturaParaVincular(codigo);

  it('bodegaVincularCodigo: vincula un código libre igual que antes', async () => {
    const r = await servicio.vincularCodigoComo(db, POR, { productoId: C, lectura: lectura(OTRO) });
    expect(r).toEqual({ clave: OTRO, productoId: C, reasignadoDe: null });
    expect(link(OTRO)).toMatchObject({ productoId: C, codigoLeido: OTRO, creadoPor: POR });
    expect(prod(C).codigosBarra).toEqual([OTRO]);
    expect(logs(C)[0]).toMatchObject({ accion: 'CODIGO_VINCULADO', detalle: { clave: OTRO, reasignadoDe: null } });
  });

  it('bodegaVincularCodigo: mismo producto informa yaVinculado sin escribir', async () => {
    const r = await servicio.vincularCodigoComo(db, POR, { productoId: A, lectura: lectura(MALO) });
    expect(r).toEqual({ clave: MALO, productoId: A, yaVinculado: true });
    expect(logs(A)).toHaveLength(0);
  });

  it('bodegaVincularCodigo: de otro producto se rechaza con referencia, sin perder los datos anteriores', async () => {
    await expect(servicio.vincularCodigoComo(db, POR, { productoId: C, lectura: lectura(MALO) })).rejects.toMatchObject({
      code: 'failed-precondition',
      message: `El código ${MALO} ya está vinculado a la referencia REF-A · BOD-A A.`,
      details: { motivo: 'vinculado-a-otro', productoId: A, codigoMaestro: 'BOD-A', nombre: 'A', referencia: 'REF-A' },
    });
    expect(link(MALO).productoId).toBe(A);
  });

  describe('Reasignar', () => {
    const reasignar = (extra = {}) => servicio.vincularCodigoComo(db, POR, { productoId: C, lectura: lectura(MALO), reasignar: true, esperadoProductoId: A, ...extra });
    const sinEscrituras = () => {
      expect(logs(A)).toHaveLength(0);
      expect(logs(C)).toHaveLength(0);
      expect(prod(C).codigosBarra).toEqual([]);
    };

    it('normal: mueve el código, audita igual que la Function nueva y conserva quién vinculó', async () => {
      const r = await reasignar();
      expect(r).toEqual({ clave: MALO, productoId: C, reasignadoDe: A });
      expect(link(MALO)).toMatchObject({ productoId: C, reasignadoDe: A, creadoPor: { nombre: 'Original' }, creadoEn: 'fecha-original', modificadoPor: POR });
      expect(prod(A).codigosBarra).toEqual([]);
      expect(prod(C).codigosBarra).toEqual([MALO]);
      const esperado = {
        accion: 'CODIGO_REASIGNADO', usuario: 'Dev', usuarioUid: 'dev',
        detalle: { valorAnterior: { clave: MALO, codigoLeido: MALO }, valorNuevo: { clave: MALO, codigoLeido: MALO }, productoOrigen: { id: A, referencia: 'REF-A', nombre: 'A' }, productoDestino: { id: C, referencia: 'REF-C', nombre: 'C' } },
      };
      [A, C].forEach((id) => { expect(logs(id)).toHaveLength(1); expect(logs(id)[0]).toMatchObject(esperado); expect(logs(id)[0].fecha).toBeTruthy(); });
    });

    it('la auditoría tiene los mismos campos que mover con la Function nueva', async () => {
      await reasignar();
      const reasignado = logs(C)[0].detalle;
      ({ db, datos } = crearDb(inicial()));
      await op({ accion: 'MOVER', clave: MALO, esperadoProductoId: A, productoDestinoId: C });
      expect(logs(C)[0].detalle).toEqual(reasignado);
    });

    it('el código cambió de producto: rechaza sin escribir e indica dónde está ahora', async () => {
      datos.set(`bodega_codigos_barra/${idVinculo(MALO)}`, vinculo(MALO, B));
      await expect(reasignar()).rejects.toMatchObject({
        code: 'failed-precondition',
        message: `El código ${MALO} ahora está en la referencia REF-B · B. Actualiza la página e inténtalo de nuevo.`,
        details: { motivo: 'cambio-concurrente', productoId: B, referencia: 'REF-B', nombre: 'B' },
      });
      expect(link(MALO).productoId).toBe(B);
      sinEscrituras();
    });

    it('el código cambió al producto de destino: también se rechaza', async () => {
      datos.set(`bodega_codigos_barra/${idVinculo(MALO)}`, vinculo(MALO, C));
      await expect(reasignar()).rejects.toMatchObject({ details: { motivo: 'cambio-concurrente', referencia: 'REF-C' } });
      expect(logs(C)).toHaveLength(0);
    });

    it('el código fue eliminado: rechaza sin crear el vínculo', async () => {
      datos.delete(`bodega_codigos_barra/${idVinculo(MALO)}`);
      await expect(reasignar()).rejects.toMatchObject({
        message: `El código ${MALO} ya no está vinculado a ninguna referencia. Actualiza la página e inténtalo de nuevo.`,
        details: { motivo: 'cambio-concurrente', productoId: null },
      });
      expect(link(MALO)).toBeUndefined();
      sinEscrituras();
    });

    it('una solicitud sin el producto visto se rechaza sin escribir (página antigua)', async () => {
      await expect(Promise.resolve().then(() => reasignar({ esperadoProductoId: null }))).rejects.toMatchObject({ code: 'failed-precondition', message: expect.stringContaining('Actualiza la página') });
      expect(link(MALO).productoId).toBe(A);
      expect(prod(A).codigosBarra).toEqual([MALO]);
      sinEscrituras();
    });

    it('la función pública también rechaza sin el producto visto', async () => {
      await expect(servicio.vincularCodigo(db, 'dev', { productoId: C, codigoLeido: MALO, reasignar: true })).rejects.toMatchObject({ message: expect.stringContaining('Actualiza la página') });
      expect(link(MALO).productoId).toBe(A);
      sinEscrituras();
    });

    it('la función pública pasa el producto visto', async () => {
      await expect(servicio.vincularCodigo(db, 'dev', { productoId: C, codigoLeido: MALO, reasignar: true, esperadoProductoId: A })).resolves.toMatchObject({ reasignadoDe: A });
    });

    it('dos usuarios reasignando a la vez: gana uno y el otro ve dónde quedó', async () => {
      const r = await Promise.allSettled([reasignar(), reasignar({ productoId: B })]);
      expect(r.map((x) => x.status).sort()).toEqual(['fulfilled', 'rejected']);
      expect(r.find((x) => x.status === 'rejected').reason.details.motivo).toBe('cambio-concurrente');
      expect(prod(A).codigosBarra).toEqual([]);
    });

    it('no toca stock, costos ni kardex', async () => {
      const antes = fotoStock();
      await reasignar();
      expect(fotoStock()).toBe(antes);
    });

    it('un código de un producto inexistente se puede reasignar con su id', async () => {
      datos.set(`bodega_codigos_barra/${idVinculo(OTRO)}`, vinculo(OTRO, 'noExiste'));
      await expect(servicio.vincularCodigoComo(db, POR, { productoId: C, lectura: lectura(OTRO) })).rejects.toMatchObject({ details: { productoId: 'noExiste' } });
      await servicio.vincularCodigoComo(db, POR, { productoId: C, lectura: lectura(OTRO), reasignar: true, esperadoProductoId: 'noExiste' });
      expect(link(OTRO).productoId).toBe(C);
    });
  });

  it('el mensaje no menciona referencia si el producto no la tiene', async () => {
    datos.set(`bodega_productos/${A}`, { ...prod(A), referencia: '' });
    await expect(servicio.vincularCodigoComo(db, POR, { productoId: C, lectura: lectura(MALO) })).rejects.toMatchObject({
      message: `El código ${MALO} ya está vinculado a BOD-A A.`, details: { referencia: '' },
    });
  });

  describe('bodegaGuardarProducto', () => {
    const nuevo = { nombre: 'Nuevo', codigoMaestro: 'NUE-1', unidadId: 'u1', manejaLote: true, manejaVencimiento: true };
    beforeEach(() => datos.set('bodega_catalogos/u1', { tipo: 'UNIDAD', nombre: 'Unidad', activo: true }));

    it('crea con un código libre igual que antes', async () => {
      const r = await servicio.guardarProductoComo(db, POR, { producto: nuevo, codigos: [lectura(OTRO)] });
      expect(r.producto.codigosBarra).toEqual([OTRO]);
      expect(link(OTRO).productoId).toBe(r.id);
    });

    it('con un código de otro se rechaza con referencia y no crea nada', async () => {
      const total = [...datos.keys()].filter((k) => k.startsWith('bodega_productos/')).length;
      await expect(servicio.guardarProductoComo(db, POR, { producto: nuevo, codigos: [lectura(MALO)] })).rejects.toMatchObject({
        details: { motivo: 'vinculado-a-otro', referencia: 'REF-A', nombre: 'A' },
      });
      expect([...datos.keys()].filter((k) => k.startsWith('bodega_productos/')).length).toBe(total);
    });

    const reasignarAlCrear = (esperados) => servicio.guardarProductoComo(db, POR, { producto: nuevo, codigos: [lectura(MALO)], reasignar: true, esperados });
    const totalProductos = () => [...datos.keys()].filter((k) => /^bodega_productos\/[^/]+$/.test(k)).length;

    it('reasignar al crear quita el código del otro producto, audita igual y conserva quién vinculó', async () => {
      const r = await reasignarAlCrear({ [MALO]: A });
      expect(link(MALO)).toMatchObject({ productoId: r.id, reasignadoDe: A, creadoPor: { nombre: 'Original' }, modificadoPor: POR });
      expect(prod(A).codigosBarra).toEqual([]);
      const detalle = { valorAnterior: { clave: MALO }, productoOrigen: { id: A, referencia: 'REF-A' }, productoDestino: { id: r.id, nombre: 'Nuevo' } };
      expect(logs(A)[0]).toMatchObject({ accion: 'CODIGO_REASIGNADO', detalle });
      expect(logs(r.id).find((l) => l.accion === 'CODIGO_REASIGNADO')).toMatchObject({ detalle });
    });

    it('reasignar al crear se rechaza sin escribir si el código cambió, fue eliminado o falta el producto visto', async () => {
      const total = totalProductos();
      await expect(reasignarAlCrear({ [MALO]: B })).rejects.toMatchObject({ details: { motivo: 'cambio-concurrente', referencia: 'REF-A' } });
      await expect(Promise.resolve().then(() => reasignarAlCrear(undefined))).rejects.toMatchObject({ message: expect.stringContaining('Actualiza la página') });
      datos.delete(`bodega_codigos_barra/${idVinculo(MALO)}`);
      await expect(reasignarAlCrear({ [MALO]: A })).rejects.toMatchObject({ details: { motivo: 'cambio-concurrente', productoId: null } });
      expect(totalProductos()).toBe(total);
      expect(prod(A).codigosBarra).toEqual([MALO]);
      expect(logs(A)).toHaveLength(0);
    });
  });
});
