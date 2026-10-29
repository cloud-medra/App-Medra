import { describe, it, expect } from 'vitest';
import { productosDeCaja, moverElemento } from './cajas';

describe('productosDeCaja', () => {
  it('respeta el orden manual y deja al final los que no tienen, por nombre natural', () => {
    const caja = {
      productos: {
        t10: { nombre: 'Tornillo 10', stockObjetivo: 2, stockActual: 0 },
        t2: { nombre: 'Tornillo 2', stockObjetivo: 1, stockActual: 1 },
        g: { nombre: 'Gasa', stockObjetivo: 5, stockActual: 2, orden: 1 },
        p: { nombre: 'Placa', stockObjetivo: 1, stockActual: 0, orden: 0 },
      },
    };
    const lista = productosDeCaja(caja);
    expect(lista.map((p) => p.productoId)).toEqual(['p', 'g', 't2', 't10']);
    expect(lista[1]).toMatchObject({ productoId: 'g', nombre: 'Gasa', faltante: 3 });
  });

  it('una caja sin orden se ve por nombre natural (como antes, sin migración)', () => {
    const caja = { productos: { a: { nombre: 'Tornillo 10' }, b: { nombre: 'tornillo 9' }, c: { nombre: 'Aguja' } } };
    expect(productosDeCaja(caja).map((p) => p.nombre)).toEqual(['Aguja', 'tornillo 9', 'Tornillo 10']);
    expect(productosDeCaja(null)).toEqual([]);
  });

  it('un producto filtrado (p. ej. solo los con faltante) conserva el orden relativo', () => {
    const caja = { productos: { a: { nombre: 'A', orden: 2, stockObjetivo: 1 }, b: { nombre: 'B', orden: 0, stockObjetivo: 1 }, c: { nombre: 'C', orden: 1, stockObjetivo: 1, stockActual: 1 } } };
    expect(productosDeCaja(caja).filter((p) => p.faltante > 0).map((p) => p.productoId)).toEqual(['b', 'a']);
  });
});

describe('moverElemento', () => {
  it('mueve hacia arriba y hacia abajo sin mutar la lista', () => {
    const lista = ['a', 'b', 'c', 'd'];
    expect(moverElemento(lista, 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(moverElemento(lista, 3, 1)).toEqual(['a', 'd', 'b', 'c']);
    expect(lista).toEqual(['a', 'b', 'c', 'd']);
  });

  it('sin movimiento o fuera de rango devuelve la misma lista', () => {
    const lista = ['a', 'b'];
    expect(moverElemento(lista, 1, 1)).toBe(lista);
    expect(moverElemento(lista, 0, -1)).toBe(lista);
    expect(moverElemento(lista, 1, 2)).toBe(lista);
  });
});
