import { describe, it, expect } from 'vitest';
import { MESES, MODULOS, GRUPOS, etiquetaMes } from './constants';

describe('etiquetaMes', () => {
  it('muestra el nombre del mes y su número con dos dígitos', () => {
    expect(MESES.map(etiquetaMes)).toEqual([
      'Enero (01)', 'Febrero (02)', 'Marzo (03)', 'Abril (04)', 'Mayo (05)', 'Junio (06)',
      'Julio (07)', 'Agosto (08)', 'Septiembre (09)', 'Octubre (10)', 'Noviembre (11)', 'Diciembre (12)'
    ]);
  });
});

describe('GRUPOS', () => {
  it('Consumos va antes que Facturación, e Inventario (Bodega) al final', () => {
    expect(GRUPOS.map(g => g.id)).toEqual(['consumos', 'facturacion', 'inventario']);
    expect(GRUPOS.map(g => g.nombre)).toEqual(['Consumos (ingresos)', 'Facturación (costos)', 'Inventario']);
  });

  it('cada módulo pertenece a exactamente un grupo', () => {
    const ids = GRUPOS.flatMap(g => g.moduloIds);
    expect([...ids].sort()).toEqual(MODULOS.map(m => m.id).sort());
  });
});
