import { describe, it, expect } from 'vitest';
import { validarCaja, totalesCaja, faltanteCaja } from './nucleo.mjs';

describe('cajas: validarCaja', () => {
  it('nombre obligatorio, objetivo entero >= 0 y sin productos repetidos', () => {
    expect(validarCaja({ nombre: ' ', productos: [] }).errores[0]).toMatch(/obligatorio/);
    expect(validarCaja({ nombre: 'Caja', productos: [{ productoId: 'a', stockObjetivo: -1 }] }).errores[0]).toMatch(/entero/);
    expect(validarCaja({ nombre: 'Caja', productos: [{ productoId: 'a', stockObjetivo: 1 }, { productoId: 'a', stockObjetivo: 2 }] }).errores[0]).toMatch(/repetido/);
    const ok = validarCaja({ nombre: '  Caja   de tutores ', productos: [{ productoId: 'a', stockObjetivo: 3 }] });
    expect(ok.errores).toEqual([]);
    expect(ok.caja).toEqual({ nombre: 'Caja de tutores', descripcion: '', activa: true });
  });
});

describe('cajas: totales', () => {
  it('completitud sin premiar sobrantes; faltante nunca negativo', () => {
    const t = totalesCaja({
      a: { stockObjetivo: 10, stockActual: 5 },
      b: { stockObjetivo: 10, stockActual: 12 },
    });
    expect(t).toEqual({ cantidadProductos: 2, totalObjetivo: 20, totalActual: 17, totalFaltante: 5, completitud: 75 });
    expect(faltanteCaja({ stockObjetivo: 2, stockActual: 5 })).toBe(0);
    expect(totalesCaja({}).completitud).toBe(100);
  });
});
