import { describe, it, expect } from 'vitest';
import { agruparConsumo, primerDiaDelMes } from './consumo';

describe('consumo por centro', () => {
  it('agrupa por centro y producto, ordenado por unidades', () => {
    const e = [
      { centroId: 'pab', centroNombre: 'PAB', productoId: 'a', productoNombre: 'Gasa', cantidad: 2 },
      { centroId: 'pab', centroNombre: 'PAB', productoId: 'b', productoNombre: 'Sonda', cantidad: 5 },
      { centroId: 'pab', centroNombre: 'PAB', productoId: 'a', productoNombre: 'Gasa', cantidad: 1 },
      { centroId: 'uci', centroNombre: 'UCI', productoId: 'a', productoNombre: 'Gasa', cantidad: 10 },
    ];
    const r = agruparConsumo(e);
    expect(r.map((c) => [c.centroNombre, c.unidades])).toEqual([['UCI', 10], ['PAB', 8]]);
    expect(r[1].productos.map((p) => [p.productoNombre, p.unidades, p.entregas])).toEqual([['Sonda', 5, 1], ['Gasa', 3, 2]]);
  });
  it('suma el valor de las entregas y de los kits recibidos, sin valor cuenta 0', () => {
    const r = agruparConsumo([
      { centroId: 'pab', centroNombre: 'PAB', productoId: 'a', productoNombre: 'Gasa', cantidad: 2, valor: 2000, tipo: 'ENTREGA' },
      { centroId: 'pab', centroNombre: 'PAB', productoId: 'a', productoNombre: 'Gasa', cantidad: 3, valor: 3150, tipo: 'ENTREGA_KIT', kitCodigo: 'F001' },
      { centroId: 'pab', centroNombre: 'PAB', productoId: 'b', productoNombre: 'Sonda', cantidad: 1 },
    ]);
    expect(r[0]).toMatchObject({ unidades: 6, valor: 5150 });
    expect(r[0].productos.map((p) => [p.productoNombre, p.unidades, p.valor, p.entregas])).toEqual([['Gasa', 5, 5150, 2], ['Sonda', 1, 0, 1]]);
  });
  it('primer día del mes', () => expect(primerDiaDelMes('2026-10-14')).toBe('2026-10-01'));
});
