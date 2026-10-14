import { describe, it, expect } from 'vitest';
import { filtrarProductos } from './filtrarProductos';

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
