import { describe, it, expect } from 'vitest';
import { costoMaestroDe, camposPrecio, errorPrecio, precioANumero, calcularVentaItem, diferencias } from './precioEspecial';

const REGLAS = [{ desde: 0, hasta: 100000, vecesCosto: 1.5 }];
const buscarRegla = (c) => REGLAS.find((r) => c >= r.desde && c <= r.hasta) || null;

describe('precio especial de Consignación', () => {
  it('el precio del maestro es el guardado, o el actual si nunca se editó', () => {
    expect(costoMaestroDe({ costo: 1000 })).toBe(1000);
    expect(costoMaestroDe({ costo: 800, costoMaestro: 1000 })).toBe(1000);
  });

  it('marca precio especial solo si difiere del maestro', () => {
    expect(camposPrecio(800, 1000)).toEqual({ costo: 800, costoMaestro: 1000, precioEspecial: true });
    expect(camposPrecio(1000, 1000)).toEqual({ costo: 1000, costoMaestro: 1000, precioEspecial: false });
  });

  it('valida que el precio sea un número mayor que cero', () => {
    expect(errorPrecio('')).toMatch(/Ingresa/);
    expect(errorPrecio('0')).toMatch(/mayor que cero/);
    expect(errorPrecio('-5')).toMatch(/mayor que cero/);
    expect(errorPrecio('abc')).toMatch(/Ingresa/);
    expect(errorPrecio('12.500')).toBeNull();
    expect(precioANumero('12.500')).toBe(12500);
  });

  it('calcula venta, recargo y margen con la misma fórmula que Implantes', () => {
    expect(calcularVentaItem(1000, 2, buscarRegla)).toEqual({ vecesCosto: 1.5, venta: 3000, total: 2000, margen: 1000 });
    expect(calcularVentaItem(500000, 1, buscarRegla)).toEqual({ vecesCosto: null, venta: null, total: 500000, margen: null });
  });

  it('diferencias: solo los campos que cambiaron, con su valor anterior', () => {
    const anterior = { costo: 1000, cantidad: 2, lote: 'L1' };
    const { cambios, anteriores } = diferencias(anterior, { costo: 800, cantidad: 2, lote: 'L1', precioEspecial: true });
    expect(cambios).toEqual({ costo: 800, precioEspecial: true });
    expect(anteriores).toEqual({ costoAnterior: 1000, precioEspecialAnterior: null });
  });
});
