// Un ítem del maestro clínico admite un solo producto de Bodega: el rechazo
// indica cuál lo tiene, y la creación normal sigue igual.
import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'node:module';
import { crearDb } from '../testutils/firestoreMemoria.mjs';
import { idVinculo } from './gs1.mjs';
import { idUnico } from './nucleo.mjs';

const require = createRequire(import.meta.url);
const servicio = require('./servicio');

const POR = { uid: 'dev', nombre: 'Dev', email: '' };
const M1 = 'maestroOcupado';
const M2 = 'maestroLibre';
const P1 = 'pu3033a';
const CODIGO = '7800000000017';
const OCUPADO = '7800000000024';

const base = { nombre: 'Nuevo', unidadId: 'u1', manejaLote: true, manejaVencimiento: true };
const inicial = () => ({
  'bodega_catalogos/u1': { tipo: 'UNIDAD', nombre: 'Unidad', activo: true },
  [`maestros_codigos/${M1}`]: { codigo: '9891935', referencia: 'PU3033A', descriptorAuto: 'URETEROSCOPIO', precioNeto: 550000 },
  [`maestros_codigos/${M2}`]: { codigo: '7777', referencia: 'LIBRE', descriptorAuto: 'LIBRE', precioNeto: 1000 },
  [`bodega_productos/${P1}`]: { nombre: 'URETEROSCOPIO', referencia: 'PU3033A', codigoMaestro: 'BOD-71', activo: true, maestroCodigoId: M1, codigosBarra: [], disponible: 0, transito: 0, enCentro: 0 },
  'bodega_productos/otro': { nombre: 'OTRO', referencia: 'REF-O', codigoMaestro: 'BOD-9', activo: true, codigosBarra: [OCUPADO], disponible: 0, transito: 0, enCentro: 0 },
  [`bodega_codigos_barra/${idVinculo(OCUPADO)}`]: { clave: OCUPADO, codigoLeido: OCUPADO, productoId: 'otro', creadoPor: { nombre: 'Original' } },
  [`bodega_unicos/${idUnico.maestroClinico(M1)}`]: { tipo: 'maestroClinico', refId: P1 },
});

let db; let datos;
const lectura = (c) => servicio.lecturaParaVincular(c);
const crear = (extra = {}, codigos = []) => servicio.guardarProductoComo(db, POR, { producto: { ...base, ...extra }, codigos });
const totalProductos = () => [...datos.keys()].filter((k) => /^bodega_productos\/[^/]+$/.test(k)).length;
const logs = (id) => [...datos.entries()].filter(([r]) => r.startsWith(`bodega_productos/${id}/logs/`)).map(([, v]) => v);
const DETALLE = { motivo: 'maestro-con-producto', productoId: P1, referencia: 'PU3033A', codigoMaestro: 'BOD-71', nombre: 'URETEROSCOPIO', activo: true };

beforeEach(() => { ({ db, datos } = crearDb(inicial())); });

describe('el ítem ya tiene producto', () => {
  it('sin código escaneado: rechaza, indica el producto y no crea nada', async () => {
    const total = totalProductos();
    await expect(crear({ maestroCodigoId: M1 })).rejects.toMatchObject({
      code: 'already-exists',
      message: 'Ese producto del maestro clínico ya tiene producto en Bodega: PU3033A · URETEROSCOPIO.',
      details: DETALLE,
    });
    expect(totalProductos()).toBe(total);
  });

  it('con código escaneado: tampoco crea nada ni vincula el código', async () => {
    const total = totalProductos();
    await expect(crear({ maestroCodigoId: M1 }, [lectura(CODIGO)])).rejects.toMatchObject({ details: DETALLE });
    expect(totalProductos()).toBe(total);
    expect(datos.has(`bodega_codigos_barra/${idVinculo(CODIGO)}`)).toBe(false);
  });

  it('la regla no cambia aunque el producto dueño esté inactivo', async () => {
    datos.set(`bodega_productos/${P1}`, { ...datos.get(`bodega_productos/${P1}`), activo: false });
    await expect(crear({ maestroCodigoId: M1 })).rejects.toMatchObject({ details: { ...DETALLE, activo: false } });
  });

  it('si el candado apunta a un producto que no existe, mantiene el mensaje y no identifica producto', async () => {
    datos.delete(`bodega_productos/${P1}`);
    await expect(crear({ maestroCodigoId: M1 })).rejects.toMatchObject({
      message: 'Ese producto del maestro clínico ya está vinculado a otro producto de Bodega.',
      details: { motivo: 'maestro-con-producto', productoId: null, activo: false },
    });
  });

  it('editar un producto hacia un ítem ocupado también se rechaza', async () => {
    await expect(servicio.guardarProductoComo(db, POR, { id: 'otro', producto: { ...base, nombre: 'OTRO', maestroCodigoId: M1 } })).rejects.toMatchObject({ details: DETALLE });
    expect(datos.get('bodega_productos/otro').maestroCodigoId).toBeUndefined();
  });

  it('editar el producto que ya tiene el ítem no se bloquea', async () => {
    await servicio.guardarProductoComo(db, POR, { id: P1, producto: { ...base, nombre: 'URETEROSCOPIO EDITADO', maestroCodigoId: M1 } });
    expect(datos.get(`bodega_productos/${P1}`).nombre).toBe('URETEROSCOPIO EDITADO');
    expect(datos.get(`bodega_unicos/${idUnico.maestroClinico(M1)}`).refId).toBe(P1);
  });
});

describe('agregar el código al producto que tiene el enlace', () => {
  it('usa el vínculo normal, con su validación y auditoría', async () => {
    const r = await servicio.vincularCodigoComo(db, POR, { productoId: P1, lectura: lectura(CODIGO) });
    expect(r).toEqual({ clave: CODIGO, productoId: P1, reasignadoDe: null });
    expect(datos.get(`bodega_codigos_barra/${idVinculo(CODIGO)}`)).toMatchObject({ productoId: P1, creadoPor: POR });
    expect(datos.get(`bodega_productos/${P1}`).codigosBarra).toEqual([CODIGO]);
    expect(logs(P1)[0]).toMatchObject({ accion: 'CODIGO_VINCULADO', usuario: 'Dev' });
  });

  it('si el código ya es de otro producto, se rechaza sin escribir', async () => {
    await expect(servicio.vincularCodigoComo(db, POR, { productoId: P1, lectura: lectura(OCUPADO) })).rejects.toMatchObject({
      details: { motivo: 'vinculado-a-otro', productoId: 'otro', referencia: 'REF-O' },
    });
    expect(datos.get(`bodega_codigos_barra/${idVinculo(OCUPADO)}`).productoId).toBe('otro');
    expect(datos.get(`bodega_productos/${P1}`).codigosBarra).toEqual([]);
    expect(logs(P1)).toHaveLength(0);
  });
});

describe('la creación normal sigue igual', () => {
  it('con un ítem libre: crea el producto, su candado y la copia del maestro clínico', async () => {
    const r = await crear({ maestroCodigoId: M2 });
    expect(r.producto).toMatchObject({ nombre: 'Nuevo', maestroCodigoId: M2, maestroCodigo: { codigo: '7777', referencia: 'LIBRE' }, disponible: 0, codigoMaestro: 'BOD-00001' });
    expect(datos.get(`bodega_unicos/${idUnico.maestroClinico(M2)}`)).toEqual({ tipo: 'maestroClinico', refId: r.id });
    expect(logs(r.id)[0].accion).toBe('CREACION');
  });

  it('con un código libre: lo vincula en la misma operación', async () => {
    const r = await crear({ maestroCodigoId: M2 }, [lectura(CODIGO)]);
    expect(r.producto.codigosBarra).toEqual([CODIGO]);
    expect(datos.get(`bodega_codigos_barra/${idVinculo(CODIGO)}`).productoId).toBe(r.id);
  });

  it('sin maestro clínico: también crea', async () => {
    const r = await crear();
    expect(r.producto.maestroCodigoId).toBeNull();
  });

  it('un segundo producto con el mismo ítem queda rechazado: uno solo por ítem', async () => {
    await crear({ maestroCodigoId: M2 });
    await expect(crear({ maestroCodigoId: M2, nombre: 'Segundo' })).rejects.toMatchObject({ details: { motivo: 'maestro-con-producto', nombre: 'Nuevo' } });
  });

  it('dos usuarios creando con el mismo ítem a la vez: solo uno lo logra', async () => {
    const r = await Promise.allSettled([crear({ maestroCodigoId: M2 }), crear({ maestroCodigoId: M2, nombre: 'Segundo' })]);
    expect(r.map((x) => x.status).sort()).toEqual(['fulfilled', 'rejected']);
  });
});
