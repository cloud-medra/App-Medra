import { describe, it, expect } from 'vitest';
import {
  numeroExportado, normalizarFilas, codigosDesdeFilas, empresasDesdeFilas, centrosDesdeFilas, recargosDesdeFilas, fechaDesdeNombre,
  reporteInfoDesdeFilas, previsionesDesdeFilas, conveniosDesdeFilas, valoresDistintos, esExportOficial,
} from './catalogosExportados.js';

const codigo = (extra = {}) => ({
  CODIGO: '000123', REFERENCIA: ' REF-1 ', DESCRIPTOR_EMPRESA: 'D', EMPRESA: 'A', TIPO: 'COTIZACION', SEGMENTO: 'IMPLANTES', CLASE: 'TORNILLO',
  DESCRIPTOR_AUTO: 'REF-1 D', PRECIO_NETO: '15000', CX: '', OBSERVACION: '', REGISTRADO_POR: 'X', ESTADO: 'ACTIVO', ...extra,
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

  it('códigos: quita inactivas y filas sin referencia; conserva ceros del código', () => {
    const { registros, resumen, advertencias } = codigosDesdeFilas([
      codigo(),
      codigo({ REFERENCIA: 'VIEJA', ESTADO: 'INACTIVO' }),
      codigo({ REFERENCIA: '' }),
    ]);
    expect(registros).toEqual([expect.objectContaining({ codigo: '000123', referencia: 'REF-1', precio: 15000, empresa: 'A' })]);
    expect(resumen).toEqual({ leidas: 3, cargadas: 1, inactivas: 1 });
    expect(advertencias).toEqual([]);
  });

  it('códigos: avisa si el CSV es anterior (sin ESTADO) y si faltan columnas', () => {
    const fila = codigo();
    delete fila.ESTADO; delete fila.CX;
    const { registros, advertencias } = codigosDesdeFilas([fila]);
    expect(registros).toHaveLength(1);
    expect(advertencias[0]).toContain('no se pudieron quitar las inactivas');
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

  it('reconoce la exportación oficial de cada maestro por su nombre', () => {
    expect(esExportOficial('recargos', 'recargos_maestros_2026-11-23.xlsx')).toBe(true);
    expect(esExportOficial('recargos', 'recargos_transcritos_de_pantalla.xlsx')).toBe(false);
    expect(esExportOficial('codigos', 'registros_con_codigo_2026-11-23.csv')).toBe(true);
    expect(esExportOficial('codigos', 'codigos (1).csv')).toBe(false);
    // Reporte Info viene de la clínica: cualquier nombre vale.
    expect(esExportOficial('reporteInfo', 'reporte_noviembre.xlsx')).toBe(true);
  });

  it('toma la fecha del nombre del archivo exportado', () => {
    expect(fechaDesdeNombre('registros_con_codigo_2026-11-23.csv')).toBe('2026-11-23');
    expect(fechaDesdeNombre('codigos.csv')).toBeNull();
  });

  it('Previsiones y Convenios: nombres activos sin repetir', () => {
    expect(previsionesDesdeFilas([{ NOMBRE: 'FONASA', ESTADO: 'ACTIVO' }, { NOMBRE: 'X', ESTADO: 'INACTIVO' }]).registros.map((r) => r.nombre)).toEqual(['FONASA']);
    expect(conveniosDesdeFilas([{ NOMBRE: 'B' }, { NOMBRE: 'A' }, { NOMBRE: 'a' }]).registros.map((r) => r.nombre)).toEqual(['A', 'B']);
  });
});

describe('Reporte Info', () => {
  // Como el Excel de la clínica: encabezados con tildes y signos, varias filas por admisión.
  const fila = (Fecha, adm, art, extra = {}) => ({
    Fecha, 'Admisión': adm, Rut: '1-9', Paciente: 'PACIENTE', 'Cod.Artículo': art, 'Descripción': 'DESC ' + art,
    'Previsión': 'ISAPRE', Isapre: 'ISAPRE A', Convenio: 'CONV 1', '1° Cirujano': 'DR X', ...extra,
  });

  it('una fila por admisión, con la misma lógica que el sistema (Isapre como previsión)', () => {
    const { registros, resumen, advertencias } = reporteInfoDesdeFilas([
      fila('2026-11-20', 102001, 'B200'),
      fila('2026-11-20', 102001, 'A100', { Convenio: '' }),
      fila(new Date(Date.UTC(2026, 10, 21)), '102003', 'A100', { Isapre: 'FONASA' }),
      fila(46000, 102004, 'A100'), // número de serie de Excel (2025-12-09)
      fila('2026-08-01', 101999, 'A100'),
      fila('2026-11-22', '', 'A100'),
    ], { desde: '2025-12-01' });
    expect(registros.map((r) => r.admision)).toEqual(['102003', '102001', '101999', '102004']);
    // Primera fila por fecha y Cod.Artículo (A100); el campo vacío se toma de la siguiente.
    expect(registros.find((r) => r.admision === '102001')).toMatchObject({ descripcion: 'DESC A100', convenio: 'CONV 1', prevision: 'ISAPRE A', cirujano: 'DR X', paciente: 'PACIENTE' });
    expect(registros.find((r) => r.admision === '102003')).toMatchObject({ prevision: 'FONASA', fecha: '2026-11-21' });
    expect(registros.find((r) => r.admision === '102004').fecha).toBe('2025-12-09');
    expect(resumen).toEqual({ leidas: 6, cargadas: 4, fueraDePeriodo: 0, sinAdmision: 1 });
    expect(advertencias).toEqual([]);
    // Con un período más corto quedan fuera las anteriores.
    expect(reporteInfoDesdeFilas([fila('2026-08-01', 101999, 'A'), fila('2026-11-20', 1, 'A')], { desde: '2026-09-24' }).resumen)
      .toMatchObject({ cargadas: 1, fueraDePeriodo: 1 });
  });

  it('avisa si el archivo no trae Convenio (el Exportar de Reportes Info no lo incluye)', () => {
    const f = fila('2026-11-20', 1, 'A');
    delete f.Convenio;
    const { advertencias } = reporteInfoDesdeFilas([f]);
    expect(advertencias[0]).toContain('No trae Convenio');
    expect(advertencias[0]).toContain('archivo original de la clínica');
    expect(() => reporteInfoDesdeFilas([{ Paciente: 'X' }])).toThrow(/ADMISION, FECHA/);
  });

  it('listas de respaldo con los valores distintos de Reporte Info', () => {
    expect(valoresDistintos([{ convenio: 'B' }, { convenio: 'A' }, { convenio: 'B' }, { convenio: '' }], 'convenio').map((v) => v.nombre)).toEqual(['A', 'B']);
  });
});
