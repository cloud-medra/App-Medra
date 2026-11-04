import * as XLSX from 'xlsx';
import { COLUMNAS_EXCEL, filasExcelSolicitudes } from './solicitudesPrecio';

// Excel simple para TI (mismo estilo que descargarDetalleErrores de
// Actualización Precios). XLSX.writeFile es síncrono: si lanza, el archivo no
// se generó y la pestaña no quita filas de la lista.
export const descargarExcelSolicitudes = (registros, ahora = new Date()) => {
  const hoja = XLSX.utils.json_to_sheet(filasExcelSolicitudes(registros), { header: COLUMNAS_EXCEL });
  hoja['!cols'] = [{ wch: 24 }, { wch: 50 }, { wch: 30 }, { wch: 12 }, { wch: 12 }, { wch: 18 }];
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, 'Solicitud precios');
  // Fecha de Chile en el nombre (AAAA-MM-DD).
  const fecha = ahora.toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });
  XLSX.writeFile(libro, `solicitud_precios_TI_${fecha}.xlsx`);
};
