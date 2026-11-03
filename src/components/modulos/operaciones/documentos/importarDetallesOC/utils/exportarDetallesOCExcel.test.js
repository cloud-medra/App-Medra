import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import {
  ENCABEZADOS, celdasDetallesOC, hojaDetallesOC, serialExcel, correlativoDeId, nombreArchivoDetallesOC
} from './exportarDetallesOCExcel';
import { leerFilasDeBuffer } from './leerFilasDelExcel';

const ts = (d) => ({ toDate: () => d });
const RUTA = 'documentos_sistema/2026/meses/10/admisiones/116100/empresas/itmed_services_spa/detalles/';

const fila = (extra = {}) => ({
  id: '116100_20261027_itmed_services_spa_9892533_2',
  refPath: `${RUTA}116100_20261027_itmed_services_spa_9892533_2`,
  admision: '116100', paciente: 'PACIENTE', medico: 'MEDICO', fecha_cx: ts(new Date(2026, 9, 27)),
  proveedor: 'ITMED SERVICES SPA', codigo: '009892533', descripcion: 'TORNILLO', cantidad: 2, precio_u: 19375.2,
  atributo: '', oc: '62147', oc_monto: 38750.4, estado: 'Pendiente factura', fecha_recepcion: null,
  fecha_cargo: null, numero_guia: '', numero_factura: '', fecha_emision: null, fecha_ingreso: null,
  lote: 'L1', fecha_vencimiento: null, actualizadoEn: ts(new Date(2026, 10, 2, 16, 56, 3)),
  ...extra
});

describe('exportarDetallesOCExcel', () => {
  it('nombre del archivo', () => {
    expect(nombreArchivoDetallesOC('2026', '10')).toBe('detalles_oc_2026_10.xlsx');
  });

  it('columnas de la planilla primero y las de cruce al final', () => {
    expect(ENCABEZADOS.slice(0, 3)).toEqual(['ID_PACIENTE', 'PACIENTE', 'MEDICO']);
    expect(ENCABEZADOS[11]).toBe('OC_MONTO');
    expect(ENCABEZADOS.slice(21)).toEqual([
      'CRUCE_ID_FIRESTORE', 'CRUCE_ADMISION', 'CRUCE_PROVEEDOR', 'CRUCE_FECHA_CX', 'CRUCE_IMPORTADO_EL', 'CRUCE_CORRELATIVO'
    ]);
  });

  it('serial de Excel con la fecha local, sin correrse por UTC', () => {
    expect(serialExcel(new Date(2026, 9, 27))).toBe(46322);
    expect(serialExcel(new Date(2026, 9, 27, 12, 0, 0), true)).toBe(46322.5);
  });

  it('correlativo desde el ID', () => {
    expect(correlativoDeId('a_b_12')).toBe(12);
    expect(correlativoDeId('OC-999')).toBeNull();
  });

  it('montos como número con decimales, fechas como serial y texto tal cual', () => {
    const [c] = celdasDetallesOC([fila()]);
    const por = Object.fromEntries(ENCABEZADOS.map((h, i) => [h, c[i]]));
    expect(por.OC_MONTO).toMatchObject({ t: 'n', v: 38750.4 });
    expect(por.PRECIO_UNITARIO).toMatchObject({ t: 'n', v: 19375.2 });
    expect(por.CANTIDAD).toMatchObject({ t: 'n', v: 2 });
    expect(por.FECHA_CIRUGIA).toMatchObject({ t: 'n', v: 46322, z: 'dd-mm-yyyy' });
    expect(por.CODIGO_CLINICA).toEqual({ t: 's', v: '009892533' });
    expect(por.FECHA_RECEPCION).toBeNull();
    expect(por.CRUCE_ADMISION.v).toBe('116100');
    expect(por.CRUCE_PROVEEDOR.v).toBe('itmed_services_spa');
    expect(por.CRUCE_CORRELATIVO.v).toBe(2);
    expect(por.CRUCE_IMPORTADO_EL.v).toBeCloseTo(46328 + (16 * 3600 + 56 * 60 + 3) / 86400, 8);
  });

  it('ordena por fecha, admisión y proveedor', () => {
    const tarde = fila({ id: 'b_1', fecha_cx: ts(new Date(2026, 9, 29)) });
    const temprano = fila({ id: 'a_1', fecha_cx: ts(new Date(2026, 9, 3)) });
    const filas = celdasDetallesOC([tarde, temprano]);
    expect(filas.map(f => f[21].v)).toEqual(['a_1', 'b_1']);
  });

  it('el archivo se puede volver a importar: mismos montos y fechas', () => {
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hojaDetallesOC(XLSX, [fila(), fila({ id: 'x_1', oc_monto: 1150000 })]), 'planilla');
    const buffer = XLSX.write(libro, { type: 'array', bookType: 'xlsx' });
    const { filas, invalidas } = leerFilasDeBuffer(buffer);
    expect(invalidas).toEqual([]);
    expect(filas).toHaveLength(2);
    expect(filas.map(f => f.oc_monto).sort()).toEqual([1150000, 38750.4]);
    expect(filas[0].fecha_cx).toEqual(new Date(2026, 9, 27));
    expect(filas[0].admision).toBe('116100');
  });
});
