import * as XLSX from 'xlsx';
import { COLUMNAS_EXCEL, filasExcelSolicitudes } from './solicitudesPrecio';

const COLUMNA_VECES_COSTO = COLUMNAS_EXCEL.indexOf('Veces costo');

// Hoja del Excel para TI. Veces costo queda como número con su valor
// completo; si tiene más de 4 decimales (Hemodinamia: 1/0,73) se muestra con
// 4 (1,3699), así costo × esa celda sigue dando la venta. El resto, General.
export const hojaSolicitudes = (registros) => {
  const hoja = XLSX.utils.json_to_sheet(filasExcelSolicitudes(registros), { header: COLUMNAS_EXCEL });
  hoja['!cols'] = [{ wch: 12 }, { wch: 24 }, { wch: 50 }, { wch: 30 }, { wch: 12 }, { wch: 11 }, { wch: 12 }, { wch: 18 }];
  registros.forEach((_, i) => {
    const celda = hoja[XLSX.utils.encode_cell({ r: i + 1, c: COLUMNA_VECES_COSTO })];
    if (celda?.t === 'n' && Math.abs(celda.v * 1e4 - Math.round(celda.v * 1e4)) > 1e-9) celda.z = '0.0000';
  });
  return hoja;
};

// Excel simple (mismo estilo que descargarDetalleErrores de Actualización
// Precios). XLSX.writeFile es síncrono: si lanza, el archivo no se generó y la
// pestaña no quita filas de la lista.
export const descargarExcelSolicitudes = (registros, ahora = new Date()) => {
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hojaSolicitudes(registros), 'Solicitud precios');
  // Fecha de Chile en el nombre (AAAA-MM-DD).
  const fecha = ahora.toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });
  XLSX.writeFile(libro, `solicitud_precios_TI_${fecha}.xlsx`);
};
