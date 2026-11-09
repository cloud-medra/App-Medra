import { describe, it, expect } from 'vitest';
import { filasDeVinculos, filtrarFilas, buscarPorLectura, referenciaVisible } from './filasCodigos';

const productos = [
  { id: 'a', nombre: 'Aguja Kirschner', referencia: '292.080.01', codigoMaestro: 'BOD-1' },
  { id: 'b', nombre: 'Tornillo', maestroCodigo: { referencia: 'MC-2' }, codigoMaestro: 'BOD-2' },
];
const vinculos = [
  { clave: '07612345678900', codigoLeido: '(01)07612345678900(10)X', productoId: 'b' },
  { clave: '7800000000017', codigoLeido: '7800000000017', productoId: 'a' },
  { clave: '999', productoId: 'noExiste' },
];
const filas = filasDeVinculos(vinculos, productos);

describe('filasDeVinculos', () => {
  it('une referencia y nombre, y toma la referencia del maestro clínico si falta', () => {
    expect(filas.find((f) => f.clave === '7800000000017')).toMatchObject({ referencia: '292.080.01', nombre: 'Aguja Kirschner' });
    expect(filas.find((f) => f.clave === '07612345678900').referencia).toBe('MC-2');
  });
  it('avisa un producto inexistente y ordena por nombre', () => {
    expect(filas.map((f) => f.nombre)).toEqual(['(producto no encontrado)', 'Aguja Kirschner', 'Tornillo']);
  });
  it('referencia visible con respaldo', () => {
    expect(referenciaVisible({ codigoMaestro: 'BOD-9' })).toBe('BOD-9');
    expect(referenciaVisible({})).toBe('—');
  });
});

describe('filtrarFilas', () => {
  it('busca por referencia, nombre o código, sin mayúsculas ni tildes', () => {
    expect(filtrarFilas(filas, '292.080').map((f) => f.productoId)).toEqual(['a']);
    expect(filtrarFilas(filas, 'tórnillo').map((f) => f.productoId)).toEqual(['b']);
    expect(filtrarFilas(filas, '78000000').map((f) => f.productoId)).toEqual(['a']);
    expect(filtrarFilas(filas, '  ')).toHaveLength(3);
  });
});

describe('buscarPorLectura', () => {
  it('encuentra con los caracteres del lector', () => {
    expect(buscarPorLectura(filas, ' 7800000000017\r\n')).toMatchObject({ tipo: 'encontrado', fila: { productoId: 'a' } });
  });
  it('un GS1 con otro lote encuentra el mismo GTIN', () => {
    expect(buscarPorLectura(filas, '(01)07612345678900(10)OTRO')).toMatchObject({ tipo: 'encontrado', fila: { productoId: 'b' } });
  });
  it('sin vincular devuelve la lectura para ofrecer agregarlo', () => {
    expect(buscarPorLectura(filas, '123456')).toMatchObject({ tipo: 'sinVincular', lectura: { clave: '123456' } });
  });
  it('un código de solo lote no identifica una referencia', () => {
    expect(buscarPorLectura(filas, '(17)301231(10)ABC')).toEqual({ tipo: 'soloLote' });
  });
  it('lectura vacía', () => {
    expect(buscarPorLectura(filas, '   ')).toBeNull();
  });
});
