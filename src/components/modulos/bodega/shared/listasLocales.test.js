import { describe, it, expect } from 'vitest';
import { mezclarPorId, aplicarResultadoTransitos, lotesHasta, ponerPrimero } from './listasLocales';

describe('mezclarPorId', () => {
  it('reemplaza mezclando campos y agrega los nuevos al final', () => {
    const lista = [{ id: 'a', nombre: 'A', contado: 1 }, { id: 'b', nombre: 'B', contado: null }];
    expect(mezclarPorId(lista, [{ id: 'b', contado: 5 }, { id: 'c', nombre: 'C', contado: 2 }])).toEqual([
      { id: 'a', nombre: 'A', contado: 1 },
      { id: 'b', nombre: 'B', contado: 5 },
      { id: 'c', nombre: 'C', contado: 2 },
    ]);
  });
  it('no muta la lista original', () => {
    const lista = [{ id: 'a', contado: 1 }];
    mezclarPorId(lista, [{ id: 'a', contado: 2 }]);
    expect(lista[0].contado).toBe(1);
  });
});

describe('aplicarResultadoTransitos', () => {
  const lista = [
    { id: 't1', productoNombre: 'X', pendiente: 5, entregado: 0, estado: 'ABIERTO' },
    { id: 't2', productoNombre: 'Y', pendiente: 2, entregado: 0, estado: 'ABIERTO' },
  ];
  it('aplica saldos y quita los cerrados', () => {
    expect(aplicarResultadoTransitos(lista, [
      { id: 't1', pendiente: 3, entregado: 2, devuelto: 0, estado: 'ABIERTO' },
      { id: 't2', pendiente: 0, entregado: 2, devuelto: 0, estado: 'CERRADO' },
    ])).toEqual([{ id: 't1', productoNombre: 'X', pendiente: 3, entregado: 2, devuelto: 0, estado: 'ABIERTO' }]);
  });
  it('ignora ids que no están en la lista', () => {
    expect(aplicarResultadoTransitos(lista, [{ id: 'otro', estado: 'ABIERTO' }])).toEqual(lista);
  });
});

describe('lotesHasta', () => {
  it('filtra por vencimiento <= hasta', () => {
    const lotes = [{ id: 1, vencimiento: '2026-01-01' }, { id: 2, vencimiento: '2026-06-30' }, { id: 3, vencimiento: '2026-07-01' }];
    expect(lotesHasta(lotes, '2026-06-30').map((l) => l.id)).toEqual([1, 2]);
  });
});

describe('ponerPrimero', () => {
  it('pone el documento al inicio, sin duplicarlo, y recorta', () => {
    const lista = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect(ponerPrimero(lista, { id: 'b', x: 1 }).map((d) => d.id)).toEqual(['b', 'a', 'c']);
    expect(ponerPrimero(lista, { id: 'z' }, 3).map((d) => d.id)).toEqual(['z', 'a', 'b']);
  });
});
