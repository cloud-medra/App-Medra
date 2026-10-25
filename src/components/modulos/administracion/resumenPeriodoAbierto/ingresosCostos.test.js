import { describe, it, expect } from 'vitest';
import { resumenIngresosCostos } from './ingresosCostos';

const grupo = (grupoId, montoTotal, nombres) => ({
  grupoId,
  montoTotal,
  desgloseModulos: nombres.map((moduloNombre) => ({ moduloNombre })),
});

describe('resumenIngresosCostos', () => {
  it('resta costos (Facturación) a ingresos (Consumos) e indica los módulos de cada lado', () => {
    const r = resumenIngresosCostos([
      grupo('consumos', 1500000, ['Implantes', 'Consignación', 'Hemodinamia']),
      grupo('facturacion', 400000, ['Laboratorio', 'Vacunatorio']),
    ]);
    expect(r).toEqual({
      ingresos: 1500000,
      costos: 400000,
      diferencia: 1100000,
      modulosIngresos: ['Implantes', 'Consignación', 'Hemodinamia'],
      modulosCostos: ['Laboratorio', 'Vacunatorio'],
    });
  });

  it('la diferencia puede ser negativa', () => {
    const r = resumenIngresosCostos([grupo('consumos', 100, []), grupo('facturacion', 250, [])]);
    expect(r.diferencia).toBe(-150);
  });

  it('sin alguno de los dos grupos no hay tarjeta', () => {
    expect(resumenIngresosCostos(null)).toBeNull();
    expect(resumenIngresosCostos([grupo('consumos', 100, [])])).toBeNull();
  });
});
