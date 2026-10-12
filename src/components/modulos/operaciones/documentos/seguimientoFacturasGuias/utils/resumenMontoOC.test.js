import { describe, it, expect } from 'vitest';
import { calcularResumenMontoOC } from './resumenMontoOC';
import { montoNumerico, formatearMonedaCLP, formatearFechaCelda, COLUMNAS } from './columnasSeguimiento';
import { filasParaExcel } from './exportarSeguimientoExcel';

describe('montos y formatos', () => {
  it('convierte montos vacíos o guardados como texto sin dar NaN', () => {
    expect(montoNumerico(1500)).toBe(1500);
    expect(montoNumerico('$ 1.234.567')).toBe(1234567);
    expect(montoNumerico('1234567')).toBe(1234567);
    expect(montoNumerico('1.234,5')).toBe(1234.5);
    expect(montoNumerico('')).toBeNull();
    expect(montoNumerico(null)).toBeNull();
    expect(montoNumerico(undefined)).toBeNull();
    expect(montoNumerico(NaN)).toBeNull();
    expect(montoNumerico('abc')).toBeNull();
  });

  it('moneda chilena y fecha dd-mm-aaaa', () => {
    expect(formatearMonedaCLP(1234567)).toBe('$ 1.234.567');
    expect(formatearMonedaCLP('$ 1.234.567')).toBe('$ 1.234.567');
    expect(formatearMonedaCLP(0)).toBe('$ 0');
    expect(formatearMonedaCLP('')).toBe('-');
    expect(formatearFechaCelda(new Date(2027, 2, 5))).toBe('05-03-2027');
    expect(formatearFechaCelda({ toDate: () => new Date(2026, 11, 31) })).toBe('31-12-2026');
    expect(formatearFechaCelda(null)).toBe('-');
  });

  it('incluye las columnas nuevas con los nombres de campo del importador', () => {
    const keys = COLUMNAS.map((c) => c.key);
    ['oc_monto', 'atributo', 'lote', 'fecha_vencimiento', 'precio_u'].forEach((k) => expect(keys).toContain(k));
    const fila = { oc_monto: 2500000, precio_u: '12.990', atributo: 'Estéril', lote: 'L-77', fecha_vencimiento: new Date(2028, 0, 9) };
    const valor = (k) => COLUMNAS.find((c) => c.key === k).valor(fila);
    expect(valor('oc_monto')).toBe('$ 2.500.000');
    expect(valor('precio_u')).toBe('$ 12.990');
    expect(valor('atributo')).toBe('Estéril');
    expect(valor('lote')).toBe('L-77');
    expect(valor('fecha_vencimiento')).toBe('09-01-2028');
  });
});

describe('calcularResumenMontoOC', () => {
  it('suma oc_monto de todas las filas, con vacíos/texto como 0 o su número', () => {
    const r = calcularResumenMontoOC([
      { oc: '1', oc_monto: 1000 },
      { oc: '2', oc_monto: '$ 2.500' },
      { oc: '3', oc_monto: '' },
      { oc: '4' },
      { oc: '5', oc_monto: null },
      { oc: '6', oc_monto: 'sin dato' },
      { oc: '7', oc_monto: NaN }
    ]);
    expect(r.total).toBe(3500);
    expect(Number.isNaN(r.total)).toBe(false);
    expect(r.registros).toBe(7);
    expect(r.duplicados).toEqual([]);
    expect(r.totalSinDuplicados).toBe(3500);
  });

  it('sin filas: total 0 y 0 registros', () => {
    expect(calcularResumenMontoOC([])).toEqual({ total: 0, registros: 0, duplicados: [], filasDuplicadas: 0, totalSinDuplicados: 0 });
  });

  // Caso real: OC 61740, admisión 115569, mismo día, dos códigos de $ 98.000.
  const DIA = new Date(2026, 9, 5);
  const linea = (extra) => ({ oc: '61740', admision: '115569', fecha_cx: DIA, codigo: '254139', lote: 'L1', oc_monto: 98000, ...extra });

  it('misma OC con códigos distintos y el mismo monto: suma completa y sin aviso', () => {
    const r = calcularResumenMontoOC([linea(), linea({ codigo: '254138' })]);
    expect(r.total).toBe(196000);
    expect(r.registros).toBe(2);
    expect(r.duplicados).toEqual([]);
    expect(r.totalSinDuplicados).toBe(196000);
  });

  it('basta con que cambie un campo (código, lote, admisión, fecha o monto) para que no sea duplicado', () => {
    [
      { codigo: '254138' },
      { lote: 'L2' },
      { admision: '115570' },
      { fecha_cx: new Date(2026, 9, 6) },
      { oc_monto: 98001 },
      { oc: '61741' }
    ].forEach((cambio) => {
      expect(calcularResumenMontoOC([linea(), linea(cambio)]).duplicados).toEqual([]);
    });
  });

  it('una fila exactamente duplicada (misma OC, código, lote, admisión, fecha y monto) sí avisa', () => {
    const r = calcularResumenMontoOC([
      linea(),
      // Misma fila importada dos veces (fecha como Timestamp y monto como texto).
      linea({ fecha_cx: { toDate: () => new Date(2026, 9, 5) }, oc_monto: '$ 98.000' }),
      linea({ codigo: '254138' })
    ]);
    expect(r.total).toBe(294000);
    expect(r.duplicados).toEqual([
      { oc: '61740', codigo: '254139', lote: 'L1', admision: '115569', fecha: '05-10-2026', monto: 98000, filas: 2 }
    ]);
    expect(r.filasDuplicadas).toBe(1);
    expect(r.totalSinDuplicados).toBe(196000);
  });
});

describe('exportación a Excel', () => {
  it('todas las filas, columnas nuevas, montos como número y fila TOTAL', () => {
    const filas = [
      { id: 'a', admision: '1', oc: '45', oc_monto: '$ 1.000', precio_u: 500, cantidad: 2, lote: 'L1', atributo: 'X', fecha_vencimiento: new Date(2027, 5, 1) },
      { id: 'b', admision: '2', oc: '46', oc_monto: '', precio_u: null }
    ];
    const m = filasParaExcel(filas, 1000);
    const col = (label) => m[0].indexOf(label);
    expect(m).toHaveLength(4);
    expect(m[0]).toEqual(expect.arrayContaining(['Monto OC', 'Atributo', 'Lote', 'Vencimiento', 'Precio U.']));
    expect(m[1][col('Monto OC')]).toBe(1000);
    expect(m[1][col('Precio U.')]).toBe(500);
    expect(m[1][col('Lote')]).toBe('L1');
    expect(m[1][col('Vencimiento')]).toBe('01-06-2027');
    expect(m[2][col('Monto OC')]).toBeNull();
    expect(m[2][col('Lote')]).toBe('');
    expect(m[3][0]).toBe('TOTAL');
    expect(m[3][col('Monto OC')]).toBe(1000);
  });
});
