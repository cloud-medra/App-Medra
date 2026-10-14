import { describe, it, expect, vi } from 'vitest';
import { criterioFacturado, calcularMesesDesdeSnapshot } from './resumenFacturacionService';
import { filasResumenMensual, formatearPorcentaje } from '../seguimientoFacturasGuias/utils/filasResumenMensual';

vi.mock('../../../../../firebaseConfig', () => ({ db: {} }));

describe('criterioFacturado', () => {
  it('facturado solo con N° de factura distinto de vacío/"0" y estado distinto de "Pendiente factura"', () => {
    expect(criterioFacturado({ numero_factura: '123', estado: 'Facturado' })).toBe(true);
    expect(criterioFacturado({ numero_factura: '123', estado: 'Pendiente factura' })).toBe(false);
    expect(criterioFacturado({ numero_factura: '', estado: 'Facturado' })).toBe(false);
    expect(criterioFacturado({ numero_factura: '0', estado: 'Facturado' })).toBe(false);
    expect(criterioFacturado({ numero_factura: ' 0 ', estado: 'Facturado' })).toBe(false);
    expect(criterioFacturado({ estado: 'Facturado' })).toBe(false);
    expect(criterioFacturado({ numero_factura: null, estado: 'Facturado' })).toBe(false);
  });
});

describe('calcularMesesDesdeSnapshot', () => {
  const snap = {
    a: { f: '2026-09-10', v: { oc_monto: 100000, numero_factura: 'F1', estado: 'Facturado' } },
    b: { f: '2026-09-20', v: { oc_monto: 50000, numero_factura: '', estado: 'Pendiente factura' } },
    c: { f: '2026-10-01', v: { oc_monto: 70000, numero_factura: 'F2', estado: 'Facturado' } },
    d: { f: '2025-12-31', v: { oc_monto: '', numero_factura: '', estado: '' } }
  };

  it('suma solo los meses pedidos y deja en 0 los pedidos sin filas', () => {
    expect(calcularMesesDesdeSnapshot(snap, ['2026-09', '2026-11', '2025-12'])).toEqual({
      2026: {
        '09': { total: 150000, facturado: 100000, pendiente: 50000, cantidad: 2, cantidadPendiente: 1 },
        11: { total: 0, facturado: 0, pendiente: 0, cantidad: 0, cantidadPendiente: 0 }
      },
      2025: { 12: { total: 0, facturado: 0, pendiente: 0, cantidad: 1, cantidadPendiente: 1 } }
    });
  });
});

describe('filasResumenMensual', () => {
  it('12 meses + totales con % sobre el total anual y "—" sin total', () => {
    const { filas, totales } = filasResumenMensual({
      '01': { total: 100000, facturado: 50000 },
      '02': { total: 300000, facturado: 300000 }
    });
    expect(filas).toHaveLength(12);
    expect(filas[0]).toMatchObject({ etiqueta: 'Enero', pendiente: 50000, pctFacturado: 50, pctPendiente: 50 });
    expect(formatearPorcentaje(filas[2].pctFacturado)).toBe('—');
    expect(totales).toMatchObject({ total: 400000, facturado: 350000, pendiente: 50000, pctFacturado: 87.5, pctPendiente: 12.5 });
    expect(formatearPorcentaje(totales.pctFacturado)).toBe('87,5 %');
  });
});
