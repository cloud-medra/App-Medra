import { describe, it, expect } from 'vitest';
import { filtrarProductos, rangoVencimiento, vencimientoPorProducto, sinVencimientoPorProducto } from './filtrarProductos';

const P = [
  { id: '1', nombre: 'Guante nitrilo M', codigoMaestro: 'GN-M', categoriaId: 'c1', disponible: 10, transito: 0, stockMinimo: 20, codigosBarra: ['7801'] },
  { id: '2', nombre: 'Catéter venoso', codigoMaestro: 'CV-1', categoriaId: 'c2', disponible: 0, transito: 2, stockMinimo: null },
  { id: '3', nombre: 'Gasa estéril', codigoMaestro: 'GA-1', categoriaId: 'c1', disponible: 0, transito: 0, activo: false },
];
const ids = (l) => l.map((p) => p.id);

describe('filtrarProductos', () => {
  it('por defecto solo activos', () => expect(ids(filtrarProductos(P))).toEqual(['1', '2']));
  it('texto: palabras en cualquier orden, sin tildes, también códigos de barra', () => {
    expect(ids(filtrarProductos(P, { texto: 'venoso cateter' }))).toEqual(['2']);
    expect(ids(filtrarProductos(P, { texto: '7801' }))).toEqual(['1']);
  });
  it('categoría, con stock, bajo mínimo, inactivos', () => {
    expect(ids(filtrarProductos(P, { categoriaId: 'c1', estado: 'todos' }))).toEqual(['1', '3']);
    expect(ids(filtrarProductos(P, { conStock: true }))).toEqual(['1', '2']);
    expect(ids(filtrarProductos(P, { soloBajoMinimo: true }))).toEqual(['1']);
    expect(ids(filtrarProductos(P, { estado: 'inactivos' }))).toEqual(['3']);
  });
});

describe('filtro de vencimiento', () => {
  const HOY = '2026-10-14';
  it('rango a leer', () => {
    expect(rangoVencimiento('vencidos', 90, HOY)).toEqual({ hasta: '2026-10-13' });
    expect(rangoVencimiento('proximos', 30, HOY)).toEqual({ hasta: '2026-11-13' });
  });
  it('agrupa por producto con el vencimiento más próximo', () => {
    const lotes = [
      { productoId: 'a', vencimiento: '2026-10-01' }, { productoId: 'a', vencimiento: '2026-11-01' },
      { productoId: 'a', vencimiento: '2026-10-20' }, { productoId: 'b', vencimiento: '2026-10-14' },
    ];
    expect(vencimientoPorProducto(lotes, 'vencidos', HOY)).toEqual({ a: { vencimiento: '2026-10-01', lotes: 1 } });
    expect(vencimientoPorProducto(lotes, 'proximos', HOY)).toEqual({ a: { vencimiento: '2026-10-20', lotes: 2 }, b: { vencimiento: '2026-10-14', lotes: 1 } });
  });
});

describe('sinVencimientoPorProducto', () => {
  it('cuenta los lotes sin vencimiento por producto, solo de productos que manejan vencimiento', () => {
    const productos = { a: { manejaVencimiento: true }, b: { manejaVencimiento: false } };
    const lotes = [
      { productoId: 'a', vencimiento: null }, { productoId: 'a', vencimiento: null },
      { productoId: 'a', vencimiento: '2027-01-01' }, { productoId: 'b', vencimiento: null },
    ];
    expect(sinVencimientoPorProducto(lotes, productos)).toEqual({ a: { sinVencimiento: true, lotes: 2 } });
  });
});
