import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { COLUMNAS_EXCEL_GUIAS, filaExcelGuia, hojasPorMes, construirLibroGuias, nombreHojaMes, nombreArchivoGuias } from './excelGuias';

const linea = (extra) => ({
  numeroGuia: '814761', numeroDocumento: '1479810199', fechaEmision: '2026-11-10',
  codigo: 'REF-1', descripcion: 'Placa', lote: 'L1', vencimiento: '31-12-2027', cantidad: 2, ...extra,
});

describe('Excel de guías de consignación', () => {
  it('mismas columnas y orden que la hoja Guías de la plantilla de contingencia', () => {
    expect(COLUMNAS_EXCEL_GUIAS).toEqual(['N° guía', 'Referencia', 'Código', 'Delivery', 'Cantidad', 'Lote', 'Vencimiento', 'Descripción']);
    // Referencia = código leído de la guía; Delivery = N° documento (Folio Referencia).
    expect(filaExcelGuia(linea())).toEqual(['814761', 'REF-1', '', '1479810199', 2, 'L1', '31-12-2027', 'Placa']);
  });

  it('cantidad como número si lo es; vacíos como texto vacío', () => {
    expect(filaExcelGuia(linea({ cantidad: '3' }))[4]).toBe(3);
    expect(filaExcelGuia(linea({ cantidad: '1,5' }))[4]).toBe(1.5);
    expect(filaExcelGuia(linea({ cantidad: null }))[4]).toBe('');
    expect(filaExcelGuia(linea({ cantidad: 'caja' }))[4]).toBe('caja');
    expect(filaExcelGuia({ numeroGuia: 5 })).toEqual(['5', '', '', '', '', '', '', '']);
  });

  it('una hoja por mes de emisión, del más reciente al más antiguo, y sin fecha al final', () => {
    const hojas = hojasPorMes([
      linea({ fechaEmision: '2026-10-03', numeroGuia: '10' }),
      linea({ fechaEmision: '', numeroGuia: '99' }),
      linea({ fechaEmision: '2026-11-02', numeroGuia: '20' }),
      linea({ fechaEmision: '2025-12-31', numeroGuia: '1' }),
    ]);
    expect(hojas.map((h) => h.nombre)).toEqual(['Noviembre 2026', 'Octubre 2026', 'Diciembre 2025', 'Sin fecha de emisión']);
    expect(nombreHojaMes('2026-01')).toBe('Enero 2026');
  });

  it('ordena por fecha, N° guía y línea dentro del mes', () => {
    const [hoja] = hojasPorMes([
      linea({ fechaEmision: '2026-11-05', numeroGuia: '100', codigo: 'B', linea: 2 }),
      linea({ fechaEmision: '2026-11-05', numeroGuia: '100', codigo: 'A', linea: 1 }),
      linea({ fechaEmision: '2026-11-05', numeroGuia: '9', codigo: 'C', linea: 1 }),
      linea({ fechaEmision: '2026-11-01', numeroGuia: '500', codigo: 'D' }),
    ]);
    expect(hoja.filas.map((f) => f[1])).toEqual(['D', 'C', 'A', 'B']);
  });

  it('no incluye los kits que Consignación excluye de las guías', () => {
    const [hoja] = hojasPorMes([linea({ codigo: 'KITBYPASSTCRL2' }), linea({ codigo: 'REF-2' })]);
    expect(hoja.filas.map((f) => f[1])).toEqual(['REF-2']);
  });

  it('arma el libro con encabezado en cada hoja', () => {
    const { libro, hojas, lineas } = construirLibroGuias([linea(), linea({ fechaEmision: '2026-10-01', codigo: 'X' })]);
    expect({ hojas, lineas }).toEqual({ hojas: 2, lineas: 2 });
    expect(libro.SheetNames).toEqual(['Noviembre 2026', 'Octubre 2026']);
    const filas = XLSX.utils.sheet_to_json(libro.Sheets['Octubre 2026'], { header: 1 });
    expect(filas).toEqual([[...COLUMNAS_EXCEL_GUIAS], ['814761', 'X', '', '1479810199', 2, 'L1', '31-12-2027', 'Placa']]);
    expect(construirLibroGuias([]).lineas).toBe(0);
  });

  it('nombre del archivo con fecha y hora', () => {
    expect(nombreArchivoGuias('guias_consignacion', new Date(2026, 10, 24, 9, 5))).toBe('guias_consignacion_2026-11-24_0905.xlsx');
  });
});
