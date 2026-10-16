import { describe, it, expect } from 'vitest';
import { validarCaja, totalesCaja, faltanteCaja, resultadoInventarioCaja, repartirFEFO, planReposicionCaja, aplicarMovimiento } from './nucleo.mjs';

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

describe('cajas: reposición', () => {
  it('reparte FEFO: vence primero, sin lote/vencimiento al final, y falla si no alcanza', () => {
    const lotes = [
      { id: 'sl', lote: null, vencimiento: null, disponible: 10 },
      { id: 'b', lote: 'B', vencimiento: '2027-06-01', disponible: 2 },
      { id: 'a', lote: 'A', vencimiento: '2027-01-01', disponible: 3 },
      { id: 'cero', lote: 'C', vencimiento: '2026-01-01', disponible: 0 },
    ];
    expect(repartirFEFO(lotes, 6).map((p) => [p.loteId, p.cantidad])).toEqual([['a', 3], ['b', 2], ['sl', 1]]);
    expect(() => repartirFEFO(lotes, 16)).toThrow(/insuficiente/);
  });

  it('plan: parcial permitido; no más del faltante ni de lo disponible', () => {
    const productos = {
      a: { nombre: 'Tutor S', stockObjetivo: 10, stockActual: 4 },
      b: { nombre: 'Tutor M', stockObjetivo: 5, stockActual: 5 },
      c: { nombre: 'Venda', stockObjetivo: 3, stockActual: 0 },
    };
    const ok = planReposicionCaja(productos, { a: 2 }, { a: 50, c: 0 });
    expect(ok.errores).toEqual([]);
    expect(ok.lineas).toEqual([
      { productoId: 'a', nombre: 'Tutor S', codigoMaestro: '', faltanteAntes: 6, cantidad: 2, pendiente: 4 },
      { productoId: 'c', nombre: 'Venda', codigoMaestro: '', faltanteAntes: 3, cantidad: 0, pendiente: 3 },
    ]);
    expect(planReposicionCaja(productos, { a: 7 }, { a: 50 }).errores[0]).toMatch(/más del faltante/);
    expect(planReposicionCaja(productos, { a: 3 }, { a: 2 }).errores[0]).toMatch(/solo tiene 2/);
    expect(planReposicionCaja(productos, {}, {}).errores[0]).toMatch(/al menos una/);
  });

  it('REPOSICION_CAJA baja el disponible y no toca el tránsito', () => {
    expect(aplicarMovimiento({ disponible: 5, transito: 2 }, { tipo: 'REPOSICION_CAJA', cantidad: 3 })).toEqual({ disponible: 2, transito: 2, transitoPorCentro: {}, enCentro: 0, enCentroPorCentro: {} });
  });
});
