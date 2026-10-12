// Exporta a Excel TODAS las filas filtradas (no solo la página), con las
// mismas columnas y textos que la tabla. Los montos van como número con
// formato $ (se pueden sumar en Excel) y al final una fila TOTAL de Monto OC.
import { COLUMNAS, montoNumerico } from './columnasSeguimiento';

const FORMATO_PESOS = '"$" #,##0';

// Matriz [encabezados, ...filas, fila TOTAL] — separada para poder testearla
// sin generar el archivo.
export const filasParaExcel = (filas, total) => {
  const encabezados = COLUMNAS.map((c) => c.label);
  const cuerpo = filas.map((fila) => COLUMNAS.map((c) => {
    if (c.tipo === 'moneda') return montoNumerico(fila[c.key]);
    if (c.key === 'cantidad') return montoNumerico(fila.cantidad);
    const v = c.valor(fila);
    return v === '-' ? '' : v;
  }));
  const filaTotal = COLUMNAS.map((c, i) => (i === 0 ? 'TOTAL' : c.key === 'oc_monto' ? total : ''));
  return [encabezados, ...cuerpo, filaTotal];
};

export const exportarSeguimientoExcel = async (filas, { total, nombreArchivo }) => {
  const XLSX = await import('xlsx');
  const hoja = XLSX.utils.aoa_to_sheet(filasParaExcel(filas, total));
  const columnasMoneda = COLUMNAS.map((c, i) => (c.tipo === 'moneda' ? i : -1)).filter((i) => i >= 0);
  for (let r = 1; r <= filas.length + 1; r++) {
    columnasMoneda.forEach((c) => {
      const celda = hoja[XLSX.utils.encode_cell({ r, c })];
      if (celda && celda.t === 'n') celda.z = FORMATO_PESOS;
    });
  }
  hoja['!cols'] = COLUMNAS.map((c) => ({ wpx: c.ancho }));
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, 'Seguimiento');
  XLSX.writeFile(libro, nombreArchivo);
};
