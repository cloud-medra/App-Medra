// Excel para TI: columnas en orden y Veces costo como número, con 4
// decimales visibles solo cuando tiene más (Hemodinamia).
import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { hojaSolicitudes } from './descargarExcelSolicitudes';

describe('hojaSolicitudes', () => {
  const hoja = hojaSolicitudes([
    { codigo: '1', referencia: 'H', modulos: ['Hemodinamia'], costo: 50370, vecesCosto: 1 / 0.73, venta: 69000 },
    { codigo: '2', referencia: 'C', modulos: ['Consignación'], costo: 22604.4, vecesCosto: 3, venta: 67813 },
  ]);
  const filas = XLSX.utils.sheet_to_json(hoja, { header: 1 });

  it('encabezados en el orden pedido', () => {
    expect(filas[0]).toEqual(['Código', 'Referencia', 'Descripción', 'Módulo', 'Costo', 'Veces costo', 'Venta', 'Fecha agregada']);
  });

  it('veces costo de Hemodinamia: valor completo con formato 0.0000; el resto sin formato', () => {
    expect(hoja.F2.v).toBe(1 / 0.73);
    expect(hoja.F2.z).toBe('0.0000');
    expect(hoja.F3.v).toBe(3);
    expect(hoja.F3.z).toBeUndefined();
    expect(hoja.E3.v).toBe(22604.4); // costo exacto
  });
});
