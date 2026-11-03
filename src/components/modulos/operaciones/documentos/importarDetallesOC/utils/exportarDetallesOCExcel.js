// "Descargar Excel del mes" de Importar Detalles OC: TODAS las filas
// guardadas del período (documentos_sistema/{anio}/meses/{mes}/..., la misma
// fuente que suma el Resumen Mensual de facturación), para cruzarlas a mano
// contra el Excel importado. Solo lectura: usa las filas que la pantalla ya
// cargó (0 lecturas extra).
//
// Columnas: primero las 21 de la planilla real, con sus nombres y en su
// orden (ver parsearFilaDetalleOC.test.js), y al final las de apoyo para el
// cruce con prefijo CRUCE_: no son sinónimos de ninguna columna de la
// importación, así que reimportar este archivo las ignora.
//
// Montos y cantidades van como número (con sus decimales) y las fechas como
// fecha de Excel (serial), armadas con la fecha LOCAL (hora de Chile): así
// un 27-10 guardado a medianoche no se corre de día por UTC.

// [encabezado, campo de la fila, tipo]
export const COLUMNAS_PLANILLA = [
  ['ID_PACIENTE', 'admision', 'texto'],
  ['PACIENTE', 'paciente', 'texto'],
  ['MEDICO', 'medico', 'texto'],
  ['FECHA_CIRUGIA', 'fecha_cx', 'fecha'],
  ['PROVEEDOR', 'proveedor', 'texto'],
  ['CODIGO_CLINICA', 'codigo', 'texto'],
  ['CODIGO_PROVEEDOR', 'descripcion', 'texto'],
  ['CANTIDAD', 'cantidad', 'numero'],
  ['PRECIO_UNITARIO', 'precio_u', 'monto'],
  ['ATRIBUTO', 'atributo', 'texto'],
  ['OC', 'oc', 'texto'],
  ['OC_MONTO', 'oc_monto', 'monto'],
  ['ESTADO', 'estado', 'texto'],
  ['FECHA_RECEPCION', 'fecha_recepcion', 'fecha'],
  ['FECHA_CARGO', 'fecha_cargo', 'fecha'],
  ['NUMERO_GUIA', 'numero_guia', 'texto'],
  ['NUMERO_FACTURA', 'numero_factura', 'texto'],
  ['FECHA_EMISION', 'fecha_emision', 'fecha'],
  ['FECHA_INGRESO', 'fecha_ingreso', 'fecha'],
  ['LOTE', 'lote', 'texto'],
  ['FECHA_VENCIMIENTO', 'fecha_vencimiento', 'fecha']
];

// Admisión y proveedor salen de la RUTA del documento (donde quedó
// guardado), no de sus campos: es lo que agrupa las filas al importar.
export const COLUMNAS_CRUCE = [
  ['CRUCE_ID_FIRESTORE', (f) => f.id ?? '', 'texto'],
  ['CRUCE_ADMISION', (f) => partesRuta(f.refPath).admision, 'texto'],
  ['CRUCE_PROVEEDOR', (f) => partesRuta(f.refPath).proveedor, 'texto'],
  ['CRUCE_FECHA_CX', (f) => f.fecha_cx, 'fecha'],
  // actualizadoEn: lo escribe la importación que creó o cambió la fila.
  ['CRUCE_IMPORTADO_EL', (f) => f.actualizadoEn, 'fechaHora'],
  ['CRUCE_CORRELATIVO', (f) => correlativoDeId(f.id), 'numero']
];

export const ENCABEZADOS = [...COLUMNAS_PLANILLA, ...COLUMNAS_CRUCE].map(([h]) => h);

const FORMATOS = { monto: '#,##0.00', fecha: 'dd-mm-yyyy', fechaHora: 'dd-mm-yyyy hh:mm:ss' };

export const nombreArchivoDetallesOC = (anio, mes) => `detalles_oc_${anio}_${mes}.xlsx`;

const partesRuta = (ruta) => {
  const m = String(ruta || '').match(/\/admisiones\/([^/]+)\/empresas\/([^/]+)\/detalles\//);
  return { admision: m?.[1] ?? '', proveedor: m?.[2] ?? '' };
};

// "..._510012_2" -> 2. Un ID que vino en el Excel no tiene correlativo.
export const correlativoDeId = (id) => {
  const m = String(id ?? '').match(/_(\d+)$/);
  return m ? Number(m[1]) : null;
};

const aFecha = (valor) => {
  if (!valor) return null;
  const d = typeof valor.toDate === 'function' ? valor.toDate() : new Date(valor);
  return isNaN(d.getTime()) ? null : d;
};

// Date -> serial de Excel (días desde 1899-12-30) con la fecha y hora
// locales. `conHora` false deja solo el día.
export const serialExcel = (fecha, conHora = false) => {
  const dia = Date.UTC(fecha.getFullYear(), fecha.getMonth(), fecha.getDate()) / 86400000 + 25569;
  if (!conHora) return dia;
  return dia + (fecha.getHours() * 3600 + fecha.getMinutes() * 60 + fecha.getSeconds()) / 86400;
};

const numero = (v) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (v === null || v === undefined || String(v).trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// Celda de SheetJS ({t, v, z}) o null si queda vacía.
export const celda = (valor, tipo) => {
  if (tipo === 'fecha' || tipo === 'fechaHora') {
    const d = aFecha(valor);
    return d ? { t: 'n', v: serialExcel(d, tipo === 'fechaHora'), z: FORMATOS[tipo] } : null;
  }
  if (tipo === 'numero' || tipo === 'monto') {
    const n = numero(valor);
    return n === null ? null : { t: 'n', v: n, ...(FORMATOS[tipo] ? { z: FORMATOS[tipo] } : {}) };
  }
  const s = valor === null || valor === undefined ? '' : String(valor);
  return s === '' ? null : { t: 's', v: s };
};

// Orden estable para cruzar: fecha, admisión, proveedor e ID.
const claveOrden = (f) => {
  const d = aFecha(f.fecha_cx);
  return [d ? serialExcel(d) : 0, String(f.admision ?? ''), String(f.proveedor ?? ''), String(f.id ?? '')];
};
const comparar = (a, b) => {
  const x = claveOrden(a); const y = claveOrden(b);
  return (x[0] - y[0]) || x[1].localeCompare(y[1], 'es', { numeric: true })
    || x[2].localeCompare(y[2], 'es') || x[3].localeCompare(y[3], 'es', { numeric: true });
};

// Filas del período -> matriz de celdas [fila][columna] (sin encabezados).
export const celdasDetallesOC = (filas) => [...filas].sort(comparar).map((f) => [
  ...COLUMNAS_PLANILLA.map(([, campo, tipo]) => celda(f[campo], tipo)),
  ...COLUMNAS_CRUCE.map(([, valor, tipo]) => celda(valor(f), tipo))
]);

// Hoja "planilla" (el nombre que busca la importación) con encabezados,
// filtro y la fila de títulos fija.
export const hojaDetallesOC = (XLSX, filas) => {
  const cuerpo = celdasDetallesOC(filas);
  const hoja = {};
  ENCABEZADOS.forEach((h, c) => { hoja[XLSX.utils.encode_cell({ r: 0, c })] = { t: 's', v: h }; });
  cuerpo.forEach((fila, i) => fila.forEach((cel, c) => {
    if (cel) hoja[XLSX.utils.encode_cell({ r: i + 1, c })] = cel;
  }));
  const ref = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: cuerpo.length, c: ENCABEZADOS.length - 1 } });
  hoja['!ref'] = ref;
  hoja['!autofilter'] = { ref };
  hoja['!cols'] = ENCABEZADOS.map((h) => ({ wch: Math.max(10, h.length + 2) }));
  return hoja;
};

export const exportarDetallesOCExcel = async (filas, { anio, mes }) => {
  const XLSX = await import('xlsx');
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hojaDetallesOC(XLSX, filas), 'planilla');
  XLSX.writeFile(libro, nombreArchivoDetallesOC(anio, mes));
};
