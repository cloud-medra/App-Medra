import { describe, it, expect } from 'vitest';
import {
  numeroExportado, normalizarFilas, codigosDesdeFilas, empresasDesdeFilas, centrosDesdeFilas, recargosDesdeFilas, fechaDesdeNombre,
} from './catalogosExportados.js';

const codigo = (extra = {}) => ({
  CODIGO: '000123', REFERENCIA: ' REF-1 ', DESCRIPTOR_EMPRESA: 'D', EMPRESA: 'A', TIPO: 'COTIZACION', SEGMENTO: 'IMPLANTES', CLASE: 'TORNILLO',
  DESCRIPTOR_AUTO: 'REF-1 D', PRECIO_NETO: '15000', CX: '', OBSERVACION: '', REGISTRADO_POR: 'X', ESTADO: 'ACTIVO', FIBRA_REUTILIZABLE: 'NO', ...extra,
});

describe('lectura de exportaciones de la app', () => {
  it('normaliza encabezados (BOM, espacios, mayúsculas)', () => {
    expect(normalizarFilas([{ '﻿codigo': 1, 'Veces Costo': 2 }])).toEqual([{ CODIGO: 1, VECES_COSTO: 2 }]);
  });

  it('convierte precios de CSV o Excel', () => {
    expect(numeroExportado('150000')).toBe(150000);
    expect(numeroExportado('150000.5')).toBe(150000.5);
    expect(numeroExportado('1.500.000')).toBe(1500000);
    expect(numeroExportado('1234,5')).toBe(1234.5);
    expect(numeroExportado(99)).toBe(99);
    expect(numeroExportado('abc')).toBe(0);
  });

  it('códigos: quita inactivas, fibras y filas sin referencia; conserva ceros del código', () => {
    const { registros, resumen, advertencias } = codigosDesdeFilas([
      codigo(),
      codigo({ REFERENCIA: 'VIEJA', ESTADO: 'INACTIVO' }),
      codigo({ REFERENCIA: 'FIB', FIBRA_REUTILIZABLE: 'SI' }),
      codigo({ REFERENCIA: '' }),
    ]);
    expect(registros).toEqual([expect.objectContaining({ codigo: '000123', referencia: 'REF-1', precio: 15000, empresa: 'A' })]);
    expect(resumen).toEqual({ leidas: 4, cargadas: 1, inactivas: 1, fibras: 1 });
    expect(advertencias).toEqual([]);
  });

  it('códigos: avisa si el CSV es anterior (sin ESTADO ni FIBRA) y si faltan columnas', () => {
    const fila = codigo();
    delete fila.ESTADO; delete fila.FIBRA_REUTILIZABLE; delete fila.CX;
    const { registros, advertencias } = codigosDesdeFilas([fila]);
    expect(registros).toHaveLength(1);
    expect(advertencias[0]).toContain('no se pudieron quitar las inactivas ni las fibras');
    expect(advertencias[1]).toContain('CX');
    expect(() => codigosDesdeFilas([{ CODIGO: '1' }])).toThrow(/REFERENCIA/);
  });

  it('empresas activas, sin repetir y ordenadas; centros de gestiones; recargos activos', () => {
    expect(empresasDesdeFilas([
      { NOMBRE: 'B', RUT: '2', ESTADO: 'ACTIVO' }, { NOMBRE: 'A', RUT: '1', ESTADO: 'ACTIVO' },
      { NOMBRE: 'b', ESTADO: 'ACTIVO' }, { NOMBRE: 'C', ESTADO: 'INACTIVO' }, { NOMBRE: '' },
    ]).registros.map((e) => e.nombre)).toEqual(['A', 'B']);
    expect(centrosDesdeFilas([
      { NOMBRE: 'PABELLON', ESTADO: 'ACTIVO', USAR_EN_GESTIONES: 'SI' }, { NOMBRE: 'BODEGA', ESTADO: 'ACTIVO', USAR_EN_GESTIONES: 'NO' },
    ]).registros.map((c) => c.nombre)).toEqual(['PABELLON']);
    expect(recargosDesdeFilas([
      { DESDE: 100, HASTA: 200, 'VECES COSTO': 1.5, ESTADO: 'ACTIVO' }, { DESDE: 0, HASTA: 99, 'VECES COSTO': 2, ESTADO: 'ACTIVO' },
      { DESDE: 0, HASTA: 99, 'VECES COSTO': 9, ESTADO: 'INACTIVO' },
    ]).registros.map((r) => [r.desde, r.vecesCosto])).toEqual([[0, 2], [100, 1.5]]);
  });

  it('toma la fecha del nombre del archivo exportado', () => {
    expect(fechaDesdeNombre('registros_con_codigo_2026-11-23.csv')).toBe('2026-11-23');
    expect(fechaDesdeNombre('codigos.csv')).toBeNull();
  });
});
