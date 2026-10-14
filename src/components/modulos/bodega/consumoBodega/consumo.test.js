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
  it('primer día del mes', () => expect(primerDiaDelMes('2026-10-14')).toBe('2026-10-01'));
});
