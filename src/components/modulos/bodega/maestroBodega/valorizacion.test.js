import { describe, it, expect } from 'vitest';
import { precioNetoProducto, totalValorizado, totalValorizadoLista } from './valorizacion';

describe('valorización del Maestro', () => {
  it('precio neto del maestro clínico copiado en el producto (null si no tiene)', () => {
    expect(precioNetoProducto({ maestroCodigo: { precioNeto: 1500 } })).toBe(1500);
    expect(precioNetoProducto({ maestroCodigo: { precioNeto: 0 } })).toBeNull();
    expect(precioNetoProducto({ maestroCodigo: null })).toBeNull();
    expect(precioNetoProducto({})).toBeNull();
  });
  it('Total $ = precio neto × disponible B.G.; sin precio, 0', () => {
    expect(totalValorizado({ disponible: 4, transito: 9, maestroCodigo: { precioNeto: 1500 } })).toBe(6000);
    expect(totalValorizado({ disponible: 4 })).toBe(0);
    expect(totalValorizado({ maestroCodigo: { precioNeto: 1500 } })).toBe(0);
    expect(totalValorizadoLista([{ disponible: 2, maestroCodigo: { precioNeto: 100 } }, { disponible: 5 }])).toBe(200);
  });
});
