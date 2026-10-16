import { describe, it, expect } from 'vitest';
import { duenosPorLote, resolverDuenos } from './duenosConteo';

const foto = [
  { productoId: 'p1', lote: 'A', vencimiento: '2027-01-31', propietarioId: null },
  { productoId: 'p1', lote: 'A', vencimiento: '2027-01-31', propietarioId: 'acme', propietarioNombre: 'ACME' },
  { productoId: 'p1', lote: 'B', vencimiento: null, propietarioId: 'acme', propietarioNombre: 'ACME' },
];

describe('dueño de lo contado en el inventario', () => {
  it('agrupa los dueños posibles por producto + lote + vencimiento', () => {
    expect(duenosPorLote(foto)['p1|A|2027-01-31']).toEqual([{ propietarioId: null, propietarioNombre: '' }, { propietarioId: 'acme', propietarioNombre: 'ACME' }]);
  });

  it('un dueño: se usa; ninguno: propio; varios: pregunta hasta que se elija', () => {
    const conteo = [
      { key: 'k1', productoId: 'p1', lote: 'b', vencimiento: '', cantidad: 2 },
      { key: 'k2', productoId: 'p1', lote: 'NUEVO', vencimiento: '', cantidad: 1 },
      { key: 'k3', productoId: 'p1', lote: 'A', vencimiento: '2027-01-31', cantidad: 3 },
    ];
    const r = resolverDuenos(conteo, foto);
    expect(r.conteos.map((c) => c.propietarioId)).toEqual(['acme', null, null]);
    expect(r.ambiguos.map((a) => a.linea.key)).toEqual(['k3']);
    const elegido = resolverDuenos(conteo, foto, { k3: 'acme' });
    expect(elegido.ambiguos).toEqual([]);
    expect(elegido.conteos[2]).toEqual({ productoId: 'p1', lote: 'A', vencimiento: '2027-01-31', propietarioId: 'acme', cantidad: 3 });
    expect(resolverDuenos(conteo, foto, { k3: '' }).conteos[2].propietarioId).toBeNull();
  });
});
