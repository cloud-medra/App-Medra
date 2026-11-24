// Excel con el detalle de las guías de despacho de consignación (Ingresar
// Guía): una fila por línea de guía y una hoja por mes de emisión.
//
// Las columnas son las de la hoja "Guías" de la plantilla de contingencia de
// Implantes (COLUMNAS_GUIAS en scripts/respaldoImplantes/libroRespaldo.js):
// el usuario pega este Excel desde A3 de esa hoja y la macro TraerGuia lee
// las columnas POR POSICIÓN. Si cambia el orden aquí, cambia allá también.
//
// De dónde sale cada columna (decisión del 24-11-2026):
//   - N° guía: numeroGuia (el "Folio" de la guía).
//   - Referencia: codigo, el código del producto tal como viene en la guía,
//     que es la referencia del proveedor (la que se busca en Códigos).
//   - Código: vacío. El código interno de Códigos Maestros no se guarda con
//     la guía y buscarlo costaría lecturas; la plantilla lo calcula desde la
//     Referencia. Se deja la columna para no mover las demás.
//   - Delivery: numeroDocumento (el "Folio Referencia"), el mismo número con
//     que Cargas de Consignación busca la guía.
//   - Cantidad, Lote, Vencimiento y Descripción: tal como se guardaron.
// Los kits que Consignación excluye de las guías (exclusionKitsGuia.js) no
// van, igual que en Cargas.
import * as XLSX from 'xlsx';
import { estaExcluidoDeGuia } from './exclusionKitsGuia';

export const COLUMNAS_EXCEL_GUIAS = Object.freeze(['N° guía', 'Referencia', 'Código', 'Delivery', 'Cantidad', 'Lote', 'Vencimiento', 'Descripción']);

const NOMBRES_MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const SIN_FECHA = 'Sin fecha de emisión';

const texto = (v) => (v === null || v === undefined ? '' : String(v).trim());

// Cantidad como número cuando lo es (para sumar en Excel); si no, el texto.
const cantidad = (v) => {
  const t = texto(v);
  if (t === '') return '';
  const n = Number(t.replace(',', '.'));
  return Number.isFinite(n) ? n : t;
};

// 'AAAA-MM' de la fecha de emisión ('AAAA-MM-DD'), o null si no la tiene.
const mesDe = (fechaEmision) => {
  const m = /^(\d{4})-(\d{2})/.exec(texto(fechaEmision));
  return m && Number(m[2]) >= 1 && Number(m[2]) <= 12 ? `${m[1]}-${m[2]}` : null;
};

export const nombreHojaMes = (clave) => {
  if (!clave) return SIN_FECHA;
  const [anio, mes] = clave.split('-');
  return `${NOMBRES_MESES[Number(mes) - 1]} ${anio}`;
};

export const filaExcelGuia = (d) => [
  texto(d.numeroGuia), texto(d.codigo), '', texto(d.numeroDocumento),
  cantidad(d.cantidad), texto(d.lote), texto(d.vencimiento), texto(d.descripcion),
];

// Orden dentro de cada mes: fecha de emisión, N° guía y la línea de la guía
// (las guardadas antes del campo `linea` quedan en el orden en que llegaron).
const comparar = (a, b) => texto(a.fechaEmision).localeCompare(texto(b.fechaEmision))
  || texto(a.numeroGuia).localeCompare(texto(b.numeroGuia), 'es', { numeric: true })
  || texto(a.numeroDocumento).localeCompare(texto(b.numeroDocumento), 'es', { numeric: true })
  || (Number(a.linea) || 0) - (Number(b.linea) || 0);

// [{ nombre: 'Noviembre 2026', filas: [[...], ...] }], del mes más reciente
// al más antiguo; las líneas sin fecha de emisión van en una hoja al final.
export const hojasPorMes = (detalles) => {
  const porMes = new Map();
  (detalles || [])
    .filter((d) => !estaExcluidoDeGuia(d.codigo))
    .map((d, i) => ({ ...d, _orden: i }))
    .sort((a, b) => comparar(a, b) || a._orden - b._orden)
    .forEach((d) => {
      const clave = mesDe(d.fechaEmision);
      if (!porMes.has(clave)) porMes.set(clave, []);
      porMes.get(clave).push(filaExcelGuia(d));
    });
  return [...porMes.entries()]
    .sort(([a], [b]) => (a === null) - (b === null) || String(b).localeCompare(String(a)))
    .map(([clave, filas]) => ({ nombre: nombreHojaMes(clave), filas }));
};

const ANCHOS = [12, 22, 12, 14, 9, 16, 12, 40];

export const construirLibroGuias = (detalles) => {
  const libro = XLSX.utils.book_new();
  const hojas = hojasPorMes(detalles);
  hojas.forEach(({ nombre, filas }) => {
    const hoja = XLSX.utils.aoa_to_sheet([[...COLUMNAS_EXCEL_GUIAS], ...filas]);
    hoja['!cols'] = ANCHOS.map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(libro, hoja, nombre);
  });
  return { libro, hojas: hojas.length, lineas: hojas.reduce((s, h) => s + h.filas.length, 0) };
};

// Descarga el Excel; devuelve cuántas hojas y líneas tuvo (0 líneas: no descarga).
export const descargarExcelGuias = (detalles, nombreArchivo) => {
  const resultado = construirLibroGuias(detalles);
  if (resultado.lineas > 0) XLSX.writeFile(resultado.libro, nombreArchivo);
  return resultado;
};

// guias_consignacion_AAAA-MM-DD_HHMM.xlsx (hora local).
export const nombreArchivoGuias = (prefijo, fecha = new Date()) => {
  const p = (n) => String(n).padStart(2, '0');
  return `${prefijo}_${fecha.getFullYear()}-${p(fecha.getMonth() + 1)}-${p(fecha.getDate())}_${p(fecha.getHours())}${p(fecha.getMinutes())}.xlsx`;
};
