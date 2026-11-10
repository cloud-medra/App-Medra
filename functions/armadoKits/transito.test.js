// Despacho y tránsito de kits contra una Firestore en memoria: nada vuelve a
// descontar stock ni valor, y el kit se mueve siempre completo.
import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'node:module';
import { crearDb } from '../testutils/firestoreMemoria.mjs';
import { idLote, sumarLineas, TIPOS_ENTREGA } from '../bodega/nucleo.mjs';
import { codigoBarrasKit, leerCodigoKit, esCodigoKit } from './codigoKit.mjs';

const require = createRequire(import.meta.url);
const { guardarKitComo, eliminarKitComo, completarVencimientoComo } = require('./servicio');
const { gestionarTransitoKit, despacharKitComo, recibirKitComo, devolverKitComo } = require('./transito');
const bodega = require('../bodega/servicio');
const { gestionarCodigoBarraComo } = require('../bodega/codigosBarra');

const POR = { uid: 'dev', nombre: 'Dev', email: '' };
const A = 'prodA';
const B = 'prodB';
const LA1 = idLote(A, 'A1', '2029-01-01');
const LA2 = idLote(A, 'A2', '2030-01-01');
const LB = idLote(B, 'B1', null);

const inicial = () => ({
  [`bodega_productos/${A}`]: { nombre: 'Insumo A', referencia: 'REF-A', codigoMaestro: 'BOD-1', activo: true, disponible: 10, transito: 0, enCentro: 0, costoPromedio: 1000, valorStock: 10000 },
  [`bodega_productos/${B}`]: { nombre: 'Insumo B', referencia: 'REF-B', codigoMaestro: 'BOD-2', activo: true, disponible: 4, transito: 0, enCentro: 0, costoPromedio: 500, valorStock: 2000 },
  [`bodega_lotes/${LA1}`]: { productoId: A, lote: 'A1', vencimiento: '2029-01-01', disponible: 3 },
  [`bodega_lotes/${LA2}`]: { productoId: A, lote: 'A2', vencimiento: '2030-01-01', disponible: 7 },
  [`bodega_lotes/${LB}`]: { productoId: B, lote: 'B1', vencimiento: null, disponible: 4 },
  'maestros_centros/c1': { nombre: 'Pabellón 1', estado: 'ACTIVO' },
  'maestros_centros/c2': { nombre: 'Cerrado', estado: 'INACTIVO' },
  'usuarios/dev': { rol: 'dev', activo: true, nombreCompleto: 'Dev' },
  'usuarios/sin': { rol: 'operador', activo: true, permisos: { bodega: ['/bodega/maestroBodega'] } },
  'usuarios/egreso': { rol: 'operador', activo: true, permisos: { bodega: ['/bodega/egresoBodega'] }, permisosGranulares: { '/bodega/egresoBodega': {} } },
});

let db; let datos;
const kit = (id = 'F001') => datos.get(`kits_armados/${id}`);
const producto = (id) => datos.get(`bodega_productos/${id}`);
const lote = (id) => datos.get(`bodega_lotes/${id}`);
const movimientos = (tipo) => [...datos.entries()].filter(([r]) => /^bodega_movimientos\/[^/]+$/.test(r)).map(([, v]) => v).filter((m) => !tipo || m.tipo === tipo);
const logs = (id = 'F001') => [...datos.entries()].filter(([r]) => r.startsWith(`kits_armados/${id}/logs/`)).map(([, v]) => v);
const salidas = () => [...datos.entries()].filter(([r]) => /^bodega_salidas\/[^/]+$/.test(r)).map(([, v]) => v);
const foto = () => JSON.stringify({ a: producto(A), b: producto(B), l: [lote(LA1), lote(LA2), lote(LB)] });

// Kit con 3 líneas: 2 lotes del producto A (FEFO) y 1 sin vencimiento de B.
const armar = () => guardarKitComo(db, POR, {
  familia: 'FLEXIBLE', referencia: 'KFH',
  lineas: [
    { productoId: A, loteId: LA1, cantidad: 3 },
    { productoId: A, loteId: LA2, cantidad: 2 },
    { productoId: B, loteId: LB, cantidad: 1, confirmarSinVencimiento: true },
  ],
});
const despachar = (extra = {}) => despacharKitComo(db, POR, { kitId: 'F001', versionImpresa: 1, centroId: 'c1', confirmarAdvertencias: true, ...extra });

beforeEach(async () => {
  ({ db, datos } = crearDb(inicial()));
  await armar();
});

describe('código de barras del kit', () => {
  it('lleva prefijo, ID y versión, solo letras y números', () => {
    expect(codigoBarrasKit({ codigo: 'F001', version: 2 })).toBe('KITF001V2');
    expect(codigoBarrasKit({ codigo: 'F1000' })).toBe('KITF1000V1');
  });
  it('se lee con lo que agrega el lector', () => {
    expect(leerCodigoKit(' kitf001v3\r\n')).toEqual({ codigo: 'F001', version: 3 });
    expect(leerCodigoKit(']C0KITF001V1')).toEqual({ codigo: 'F001', version: 1 });
  });
  it('un código de producto o GS1 no es un kit', () => {
    ['7800000000017', '(01)07612345678900(10)ABC', 'KITF001', 'F001', 'KIT-F001-V1', ''].forEach((c) => expect(esCodigoKit(c)).toBe(false));
  });
  it('no se puede vincular a un producto por ningún camino', async () => {
    expect(() => bodega.lecturaParaVincular('KITF001V1')).toThrow(/código de barras de un kit/);
    await expect(Promise.resolve().then(() => gestionarCodigoBarraComo(db, POR, { accion: 'AGREGAR', productoId: A, codigoLeido: 'KITF001V1' }))).rejects.toThrow(/kit/);
    expect(datos.has('bodega_codigos_barra/KITF001V1')).toBe(false);
  });
  it('un código de producto normal se sigue vinculando igual', async () => {
    await bodega.vincularCodigoComo(db, POR, { productoId: A, lectura: bodega.lecturaParaVincular('7800000000017') });
    expect(producto(A).codigosBarra).toEqual(['7800000000017']);
  });
});

describe('estado inicial', () => {
  it('un kit nuevo queda ARMADO, versión 1, y editarlo sube la versión', async () => {
    expect(kit()).toMatchObject({ estado: 'ARMADO', version: 1 });
    const r = await guardarKitComo(db, POR, { familia: 'FLEXIBLE', kitId: 'F001', lineas: [{ productoId: A, loteId: LA1, cantidad: 3 }, { productoId: A, loteId: LA2, cantidad: 1 }, { productoId: B, loteId: LB, cantidad: 1 }] });
    expect(r.version).toBe(2);
    expect(kit().version).toBe(2);
  });
  it('sin cambios no sube la versión', async () => {
    const r = await guardarKitComo(db, POR, { familia: 'FLEXIBLE', kitId: 'F001', lineas: kit().lineas.map((l) => ({ productoId: l.productoId, loteId: l.loteId, cantidad: l.cantidad })) });
    expect(r).toMatchObject({ sinCambios: true, version: 1 });
  });
  it('completar un vencimiento también sube la versión', async () => {
    await completarVencimientoComo(db, POR, { familia: 'FLEXIBLE', kitId: 'F001', loteId: LB, vencimiento: '2031-01-01' });
    expect(kit().version).toBe(2);
  });
});

describe('despachar', () => {
  it('carga el kit completo, con todas sus líneas y lotes, y lo deja en tránsito', async () => {
    const r = await despachar({ observacion: 'Para pabellón' });
    expect(r).toMatchObject({ codigo: 'F001', estado: 'EN_TRANSITO', salidaNumero: 1, centroNombre: 'Pabellón 1' });
    const movs = movimientos('KIT_DESPACHO');
    expect(movs.map((m) => [m.loteId, m.cantidad])).toEqual([[LA1, 3], [LA2, 2], [LB, 1]]);
    movs.forEach((m) => expect(m).toMatchObject({ centroId: 'c1', kitCodigo: 'F001', linea: null, valor: 0, documentoRef: { tipo: 'SALIDA', numero: '1' } }));
    expect(salidas()).toHaveLength(1);
    expect(salidas()[0]).toMatchObject({ numero: 1, tipo: 'KIT', kitCodigo: 'F001', totalUnidades: 6 });
    expect(salidas()[0].lineas).toHaveLength(3);
    expect(kit()).toMatchObject({ estado: 'EN_TRANSITO', despacho: { salidaNumero: 1, centroId: 'c1', version: 1, usuario: POR, observacion: 'Para pabellón' } });
    expect(logs().find((l) => l.accion === 'DESPACHADO')).toMatchObject({ usuario: 'Dev', detalle: { salidaNumero: 1, centro: 'Pabellón 1' } });
  });

  it('no vuelve a descontar stock ni valor', async () => {
    const antes = foto();
    await despachar();
    expect(foto()).toBe(antes);
    expect(producto(A)).toMatchObject({ disponible: 5, transito: 0 });
  });

  it('el doble escaneo se rechaza', async () => {
    await despachar();
    await expect(despachar()).rejects.toMatchObject({ details: { motivo: 'estado', estado: 'EN_TRANSITO' } });
    expect(salidas()).toHaveLength(1);
  });

  it('dos usuarios despachando el mismo kit a la vez: solo uno lo logra', async () => {
    const r = await Promise.allSettled([despachar(), despacharKitComo(db, { ...POR, uid: 'u2' }, { kitId: 'F001', versionImpresa: 1, centroId: 'c1', confirmarAdvertencias: true })]);
    expect(r.map((x) => x.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect(salidas()).toHaveLength(1);
    expect(movimientos('KIT_DESPACHO')).toHaveLength(3);
    expect(datos.get('bodega_control/contadores')).toEqual({ salidas: 1 });
  });

  it('un kit inexistente se rechaza', async () => {
    await expect(despachar({ kitId: 'F999' })).rejects.toMatchObject({ code: 'not-found' });
  });

  it('con líneas vencidas o sin vencimiento exige confirmación', async () => {
    datos.set('kits_armados/F001', { ...kit(), lineas: kit().lineas.map((l, i) => (i === 0 ? { ...l, vencimiento: '2020-01-01' } : l)) });
    await expect(despachar({ confirmarAdvertencias: false })).rejects.toMatchObject({ details: { motivo: 'advertencias', vencidas: 1, sinVencimiento: 1 } });
    expect(kit().estado).toBe('ARMADO');
    await despachar();
    expect(logs().find((l) => l.accion === 'DESPACHADO').detalle).toMatchObject({ vencidas: 1, sinVencimiento: 1 });
  });

  it('una hoja impresa antes de editar el kit queda bloqueada con ambas versiones', async () => {
    await guardarKitComo(db, POR, { familia: 'FLEXIBLE', kitId: 'F001', lineas: [{ productoId: A, loteId: LA1, cantidad: 3 }, { productoId: B, loteId: LB, cantidad: 1 }] });
    await expect(despachar({ versionImpresa: 1 })).rejects.toMatchObject({
      message: 'La hoja impresa del kit F001 es la versión 1, pero su contenido actual es la versión 2. Reimprime el PDF del kit y escanea la hoja nueva.',
      details: { motivo: 'version', versionImpresa: 1, versionActual: 2 },
    });
    await expect(despachar({ versionImpresa: 2 })).resolves.toMatchObject({ estado: 'EN_TRANSITO' });
  });

  it('sin la versión impresa, sin centro o con un centro inactivo se rechaza', async () => {
    await expect(Promise.resolve().then(() => despachar({ versionImpresa: undefined }))).rejects.toThrow(/hoja impresa/);
    await expect(Promise.resolve().then(() => despachar({ centroId: '' }))).rejects.toThrow(/centro/);
    await expect(despachar({ centroId: 'c2' })).rejects.toThrow(/inactivo/);
    expect(kit().estado).toBe('ARMADO');
  });
});

describe('bloqueo mientras está en tránsito o entregado', () => {
  const intentos = () => [
    guardarKitComo(db, POR, { familia: 'FLEXIBLE', kitId: 'F001', lineas: [{ productoId: A, loteId: LA1, cantidad: 1 }] }),
    eliminarKitComo(db, POR, { familia: 'FLEXIBLE', kitId: 'F001' }),
    completarVencimientoComo(db, POR, { familia: 'FLEXIBLE', kitId: 'F001', loteId: LB, vencimiento: '2031-01-01' }),
  ];
  it('en tránsito no se edita, elimina ni completa', async () => {
    await despachar();
    const antes = foto();
    for (const p of intentos()) await expect(p).rejects.toMatchObject({ details: { motivo: 'estado' } });
    expect(foto()).toBe(antes);
    expect(kit().estado).toBe('EN_TRANSITO');
  });
  it('entregado tampoco', async () => {
    await despachar();
    await recibirKitComo(db, POR, { kitId: 'F001' });
    for (const p of intentos()) await expect(p).rejects.toThrow(/entregado/);
  });
});

describe('recibir, rechazar y anular', () => {
  it('recibir lo deja ENTREGADO, sin mover stock, y entra a Consumo por centro con su valor', async () => {
    const valorKit = kit().lineas.reduce((n, l) => n + l.valor, 0);
    await despachar();
    const antes = foto();
    await recibirKitComo(db, POR, { kitId: 'F001', observacion: 'Recibido' });
    expect(foto()).toBe(antes);
    expect(kit()).toMatchObject({ estado: 'ENTREGADO', recepcion: { usuario: POR, observacion: 'Recibido' } });
    const entregas = movimientos('ENTREGA_KIT');
    expect(TIPOS_ENTREGA).toContain('ENTREGA_KIT');
    expect(entregas.map((m) => m.cantidad)).toEqual([3, 2, 1]);
    expect(entregas.reduce((n, m) => n + m.valor, 0)).toBe(valorKit);
    entregas.forEach((m) => expect(m).toMatchObject({ centroId: 'c1', linea: null, kitCodigo: 'F001' }));
    await expect(recibirKitComo(db, POR, { kitId: 'F001' })).rejects.toThrow(/entregado/);
  });

  it('Control Mensual: solo cuenta la salida a kits, una vez', async () => {
    await despachar();
    await recibirKitComo(db, POR, { kitId: 'F001' });
    const lineas = sumarLineas(movimientos());
    expect(lineas.salidaKits.unidades).toBe(6);
    expect(lineas.consumo.valor).toBe(0);
    expect(lineas.retornoKits.valor).toBe(0);
  });

  it('rechazar exige motivo y lo vuelve a ARMADO, editable y despachable otra vez', async () => {
    await despachar();
    await expect(Promise.resolve().then(() => devolverKitComo(db, POR, { kitId: 'F001', accion: 'RECHAZAR', motivo: ' ' }))).rejects.toThrow(/motivo/);
    const antes = foto();
    await devolverKitComo(db, POR, { kitId: 'F001', accion: 'RECHAZAR', motivo: 'No lo pidieron' });
    expect(foto()).toBe(antes);
    expect(kit()).toMatchObject({ estado: 'ARMADO', despacho: null, ultimaDevolucion: { accion: 'RECHAZAR', motivo: 'No lo pidieron', salidaNumero: 1 } });
    expect(salidas()[0].kitDevuelto).toMatchObject({ accion: 'RECHAZAR' });
    expect(movimientos('KIT_DEVUELTO').map((m) => m.observacion)).toEqual(['Rechazado: No lo pidieron', 'Rechazado: No lo pidieron', 'Rechazado: No lo pidieron']);
    await despachar();
    expect(kit().despacho.salidaNumero).toBe(2);
  });

  it('anular deja el mismo resultado con otro motivo registrado, y después se puede eliminar', async () => {
    await despachar();
    await devolverKitComo(db, POR, { kitId: 'F001', accion: 'ANULAR', motivo: 'Error de centro' });
    expect(logs().some((l) => l.accion === 'DESPACHO_ANULADO')).toBe(true);
    await eliminarKitComo(db, POR, { familia: 'FLEXIBLE', kitId: 'F001' });
    expect(producto(A)).toMatchObject({ disponible: 10, valorStock: 10000, costoPromedio: 1000 });
  });

  it('no se recibe, rechaza ni anula un kit que no está en tránsito', async () => {
    await expect(recibirKitComo(db, POR, { kitId: 'F001' })).rejects.toMatchObject({ details: { estado: 'ARMADO' } });
    await expect(devolverKitComo(db, POR, { kitId: 'F001', accion: 'ANULAR', motivo: 'x' })).rejects.toMatchObject({ details: { estado: 'ARMADO' } });
  });
});

describe('permisos de la Function', () => {
  it('dev puede; quien no tiene la vista no; quien tiene Egreso despacha pero no recibe', async () => {
    await expect(gestionarTransitoKit(db, 'sin', { accion: 'DESPACHAR', kitId: 'F001', versionImpresa: 1, centroId: 'c1', confirmarAdvertencias: true })).rejects.toThrow(/permiso/);
    await expect(gestionarTransitoKit(db, 'egreso', { accion: 'DESPACHAR', kitId: 'F001', versionImpresa: 1, centroId: 'c1', confirmarAdvertencias: true })).resolves.toMatchObject({ estado: 'EN_TRANSITO' });
    await expect(gestionarTransitoKit(db, 'egreso', { accion: 'RECIBIR', kitId: 'F001' })).rejects.toThrow(/permiso/);
    await expect(gestionarTransitoKit(db, 'dev', { accion: 'RECIBIR', kitId: 'F001' })).resolves.toMatchObject({ estado: 'ENTREGADO' });
    await expect(gestionarTransitoKit(db, 'dev', { accion: 'BORRAR' })).rejects.toThrow(/no válida/);
  });
});
