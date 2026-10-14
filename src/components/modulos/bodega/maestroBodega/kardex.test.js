import { describe, it, expect } from 'vitest';
import { ordenarKardex, signoMovimiento, referenciaMovimiento } from './kardex';

const ts = (n) => ({ toMillis: () => n });

describe('kardex', () => {
  it('ordena por fecha desc y, en la misma transacción, por orden desc', () => {
    const m = [{ id: 'a', fecha: ts(1), orden: 0 }, { id: 'b', fecha: ts(2), orden: 0 }, { id: 'c', fecha: ts(2), orden: 1 }];
    expect(ordenarKardex(m).map((x) => x.id)).toEqual(['c', 'b', 'a']);
  });
  it('signo sobre el disponible', () => {
    expect(['INGRESO', 'SALIDA_A_TRANSITO', 'ENTREGA', 'DEVOLUCION', 'AJUSTE_NEGATIVO'].map(signoMovimiento)).toEqual([1, -1, 0, 1, -1]);
  });
  it('referencia legible del documento', () => {
    expect(referenciaMovimiento({ documentoRef: { tipo: 'INGRESO', tipoDocumento: 'FACTURA', numero: 'F-1', proveedorNombre: 'ACME' } })).toBe('Factura F-1 · ACME');
    expect(referenciaMovimiento({ documentoRef: { tipo: 'SALIDA', numero: '7' } })).toBe('Salida N° 7');
    expect(referenciaMovimiento({})).toBe('');
  });
});
