import { describe, it, expect } from 'vitest';
import { combinarItemsActualizados } from './combinarItemsActualizados';

const reg = (id, extra) => ({ id, ref: { path: `c/${id}` }, estado: 'INGRESADO', ...extra });

describe('combinarItemsActualizados', () => {
  it('reemplaza por ruta las filas que vienen del detalle y conserva el orden', () => {
    const registros = [reg('a'), reg('b'), reg('c')];
    const items = [reg('c', { estado: 'CARGADO' }), reg('a', { estado: 'CARGADO' })];
    expect(combinarItemsActualizados(registros, items).map((r) => [r.id, r.estado]))
      .toEqual([['a', 'CARGADO'], ['b', 'INGRESADO'], ['c', 'CARGADO']]);
  });

  it('ignora filas que no están en la tabla y devuelve el mismo arreglo si no hay cambios', () => {
    const registros = [reg('a')];
    expect(combinarItemsActualizados(registros, [reg('otro', { estado: 'CARGADO' })])).toBe(registros);
    expect(combinarItemsActualizados(registros, [])).toBe(registros);
    expect(combinarItemsActualizados(registros, undefined)).toBe(registros);
  });
});
