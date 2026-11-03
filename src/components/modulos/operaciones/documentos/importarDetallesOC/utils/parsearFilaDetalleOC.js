// Normaliza una fila cruda del Excel "Detalles OC" a un objeto canónico con
// nombres de campo en minúscula y tipos estables (Date para fechas, Number
// para cantidad/precio, string recortado para el resto) — tanto para
// escribir en Firestore como para calcular el hash de comparación de forma
// determinística.
//
// Tolerante a cómo viene la planilla:
//   - Encabezados: sin importar tildes, mayúsculas, espacios o signos
//     ("FECHA CX", "Fecha_Cx ", "ADMISIÓN", "N° OC") y con sinónimos
//     ("CANTIDAD" = CANT, "ORDEN DE COMPRA" = OC). Ver mapearEncabezados().
//   - Fechas: Date, serial de Excel (número o texto), dd-mm-aaaa, dd/mm/aa,
//     dd.mm.aaaa, aaaa-mm-dd, con o sin hora, y "15-sep-2026".
//   - OC: número, texto, o formato contabilidad ("$ 4.500.001.234").
//   - Números: "$ 1.234.567", "1.234,5", "-" (cero en contabilidad).

const CAMPOS_TEXTO = [
  ['ID', 'id'],
  ['ADMISION', 'admision'],
  ['PACIENTE', 'paciente'],
  ['MEDICO', 'medico'],
  ['PROVEEDOR', 'proveedor'],
  ['CODIGO', 'codigo'],
  ['DESCRIPCION', 'descripcion'],
  ['ATRIBUTO', 'atributo'],
  ['ESTADO', 'estado'],
  ['NUMERO_GUIA', 'numero_guia'],
  ['NUMERO_FACTURA', 'numero_factura'],
  ['LOTE', 'lote']
];

const CAMPOS_NUMERICOS = [
  ['CANT', 'cantidad'],
  ['PRECIO_U', 'precio_u'],
  ['OC_MONTO', 'oc_monto']
];

const CAMPOS_FECHA = [
  ['FECHA_CX', 'fecha_cx'],
  ['FECHA_RECEPCION', 'fecha_recepcion'],
  ['FECHA_CARGO', 'fecha_cargo'],
  ['FECHA_EMISION', 'fecha_emision'],
  ['FECHA_INGRESO', 'fecha_ingreso'],
  ['FECHA_VENCIMIENTO', 'fecha_vencimiento']
];

// Columna canónica -> encabezados aceptados (ya normalizados con
// normalizarEncabezado). El primero es el nombre oficial de la planilla.
const SINONIMOS_ENCABEZADO = {
  ID: ['ID', 'ID_FILA'],
  // En la planilla real la admisión viene como ID_PACIENTE (ej. 114584).
  ADMISION: ['ADMISION', 'ID_PACIENTE', 'N_ADMISION', 'NRO_ADMISION', 'NUM_ADMISION', 'NUMERO_ADMISION'],
  PACIENTE: ['PACIENTE', 'NOMBRE_PACIENTE', 'NOMBRE'],
  MEDICO: ['MEDICO'],
  PROVEEDOR: ['PROVEEDOR', 'EMPRESA'],
  // CODIGO_CLINICA es el código del maestro (el que se cruza con el ítem).
  // CODIGO_PROVEEDOR trae texto descriptivo: va a DESCRIPCION, nunca a CODIGO.
  CODIGO: ['CODIGO', 'CODIGO_CLINICA', 'COD'],
  DESCRIPCION: ['DESCRIPCION', 'CODIGO_PROVEEDOR'],
  ATRIBUTO: ['ATRIBUTO'],
  OC: ['OC', 'N_OC', 'NRO_OC', 'NUM_OC', 'NUMERO_OC', 'OC_ORDEN', 'ORDEN', 'ORDEN_COMPRA', 'ORDEN_DE_COMPRA'],
  ESTADO: ['ESTADO'],
  NUMERO_GUIA: ['NUMERO_GUIA', 'N_GUIA', 'NRO_GUIA', 'GUIA'],
  NUMERO_FACTURA: ['NUMERO_FACTURA', 'N_FACTURA', 'NRO_FACTURA', 'FACTURA'],
  LOTE: ['LOTE'],
  CANT: ['CANT', 'CANTIDAD'],
  PRECIO_U: ['PRECIO_U', 'PRECIO_UNITARIO', 'PRECIO'],
  OC_MONTO: ['OC_MONTO', 'MONTO_OC'],
  FECHA_CX: ['FECHA_CX', 'FECHA_CIRUGIA', 'FECHA'],
  FECHA_RECEPCION: ['FECHA_RECEPCION'],
  FECHA_CARGO: ['FECHA_CARGO'],
  FECHA_EMISION: ['FECHA_EMISION'],
  FECHA_INGRESO: ['FECHA_INGRESO'],
  FECHA_VENCIMIENTO: ['FECHA_VENCIMIENTO']
};

// Sin estas columnas ninguna fila se puede guardar: se aborta la
// importación antes de escribir nada. ID es opcional: si no viene, el ID
// se genera desde admisión + fecha + proveedor + código (idFilaDetalleOC.js).
export const COLUMNAS_OBLIGATORIAS = ['ADMISION', 'FECHA_CX', 'PROVEEDOR', 'CODIGO', 'CANT'];

export const normalizarEncabezado = (texto) =>
  String(texto ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

// Encabezados del Excel -> { mapa: {CANONICA: 'encabezado original'}, faltantes: [...] }
export const mapearEncabezados = (encabezados) => {
  const porNormalizado = new Map();
  encabezados.forEach((h) => {
    const n = normalizarEncabezado(h);
    if (n && !porNormalizado.has(n)) porNormalizado.set(n, h);
  });
  const mapa = {};
  Object.entries(SINONIMOS_ENCABEZADO).forEach(([canonica, sinonimos]) => {
    const encontrado = sinonimos.find(s => porNormalizado.has(s));
    if (encontrado) mapa[canonica] = porNormalizado.get(encontrado);
  });
  const faltantes = COLUMNAS_OBLIGATORIAS.filter(c => !mapa[c]);
  return { mapa, faltantes };
};

// Valor de celda -> texto. Los enteros grandes se escriben sin notación
// científica ni ".0" (4500001234, no "4.500001234e9").
export const textoCelda = (valor) => {
  if (valor === null || valor === undefined) return '';
  if (typeof valor === 'number') {
    if (!Number.isFinite(valor)) return '';
    return Number.isInteger(valor) ? valor.toFixed(0) : String(valor);
  }
  if (valor instanceof Date) return isNaN(valor.getTime()) ? '' : valor.toISOString().slice(0, 10);
  return String(valor).replace(/\s+/g, ' ').trim();
};

// Número tolerante a formato chileno/contabilidad. null si no es un número.
//   "$ 1.234.567" -> 1234567 · "1.234,5" -> 1234.5 · "1,5" -> 1.5
//   "1.500" -> 1500 (punto = miles) · "-" -> 0 (cero en contabilidad)
export const numeroFlexible = (valor) => {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null;
  let s = String(valor ?? '').replace(/[$\s]|CLP/gi, '');
  if (s === '') return null;
  if (/^-+$/.test(s)) return 0;
  const negativo = /^\(.*\)$/.test(s) || s.startsWith('-');
  s = s.replace(/[()-]/g, '');
  const ultimoPunto = s.lastIndexOf('.');
  const ultimaComa = s.lastIndexOf(',');
  if (ultimoPunto >= 0 && ultimaComa >= 0) {
    // El separador que aparece último es el decimal.
    s = ultimaComa > ultimoPunto ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (ultimaComa >= 0) {
    s = /^\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
  } else if (ultimoPunto >= 0 && /^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, '');
  }
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return negativo ? -n : n;
};

// OC como texto. Si es puramente numérica (aunque venga con "$", puntos de
// miles o ",00" de contabilidad) queda solo con los dígitos; si trae letras
// ("OC-999") se respeta tal cual.
export const limpiarOC = (valor) => {
  if (typeof valor === 'number') return textoCelda(valor);
  const s = textoCelda(valor);
  if (s === '' || /^[-\s$]+$/.test(s)) return '';
  const sinMoneda = s.replace(/[$\s]/g, '').replace(/[.,]0+$/, '');
  if (/^[\d.,]+$/.test(sinMoneda)) return sinMoneda.replace(/[.,]/g, '');
  return s;
};

const MESES_TEXTO = {
  ENE: 1, JAN: 1, FEB: 2, MAR: 3, ABR: 4, APR: 4, MAY: 5, JUN: 6, JUL: 7,
  AGO: 8, AUG: 8, SEP: 9, SET: 9, OCT: 10, NOV: 11, DIC: 12, DEC: 12
};

const crearFecha = (anio, mes, dia) => {
  let y = Number(anio);
  if (y < 100) y += 2000; // "15-09-26" -> 2026
  const m = Number(mes); const d = Number(dia);
  if (!y || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const fecha = new Date(y, m - 1, d);
  // Descarta fechas imposibles (31-02 se "desborda" a marzo).
  return fecha.getMonth() === m - 1 ? fecha : null;
};

// Devuelve un Date "puro" (sin hora) o null si no se pudo interpretar. El
// día va primero (formato chileno): "05/09/2026" es 5 de septiembre.
export const parsearFechaExcel = (valor, XLSX) => {
  if (!valor && valor !== 0) return null;
  if (valor instanceof Date) {
    if (isNaN(valor.getTime())) return null;
    return new Date(valor.getFullYear(), valor.getMonth(), valor.getDate());
  }
  const desdeSerial = (n) => {
    if (!(n > 0 && n < 2958466)) return null; // hasta 9999-12-31
    const d = XLSX.SSF.parse_date_code(n);
    return d ? crearFecha(d.y, d.m, d.d) : null;
  };
  if (typeof valor === 'number') return desdeSerial(valor);

  const str = String(valor).trim();
  if (!str) return null;
  if (/^\d+(\.\d+)?$/.test(str)) return desdeSerial(Number(str)); // serial como texto

  let m = str.match(/^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})(?:$|[\sT])/);
  if (m) return crearFecha(m[1], m[2], m[3]);

  m = str.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})(?:$|\s)/);
  if (m) return crearFecha(m[3], m[2], m[1]);

  m = str.match(/^(\d{1,2})[\s/.-]+(?:DE\s+)?([A-Za-zÁÉÍÓÚáéíóú]{3,})\.?[\s/.-]+(?:DE\s+)?(\d{2}|\d{4})(?:$|\s)/i);
  if (m) {
    const mes = MESES_TEXTO[normalizarEncabezado(m[2]).slice(0, 3)];
    if (mes) return crearFecha(m[3], mes, m[1]);
  }
  return null;
};

// `filaCruda`: objeto con las columnas CANÓNICAS como claves (ver
// leerFilasDelExcel, que traduce los encabezados reales con
// mapearEncabezados). `id` queda '' si el Excel no lo trae: lo asigna
// después asignarIdsFilas.
export const normalizarFilaDetalleOC = (filaCruda, XLSX) => {
  const id = textoCelda(filaCruda['ID']);
  const resultado = {};

  CAMPOS_TEXTO.forEach(([origen, destino]) => {
    resultado[destino] = textoCelda(filaCruda[origen]);
  });
  resultado.admision = resultado.admision.replace(/\.0+$/, '');
  resultado.oc = limpiarOC(filaCruda['OC']);

  // Un numérico vacío (o que no es número) se guarda como 0, pero queda
  // anotado en `_vacios`: al reimportar, un 0 escrito en el Excel SÍ pisa
  // el valor guardado y una celda vacía no (planificarImportacion.js).
  const vacios = [];
  CAMPOS_NUMERICOS.forEach(([origen, destino]) => {
    const n = numeroFlexible(filaCruda[origen]);
    if (n === null) vacios.push(destino);
    resultado[destino] = n ?? 0;
  });
  resultado._vacios = vacios;

  CAMPOS_FECHA.forEach(([origen, destino]) => {
    resultado[destino] = parsearFechaExcel(filaCruda[origen], XLSX);
  });

  resultado.id = id;
  return resultado;
};

// Motivos por los que una fila normalizada no se puede guardar (lista vacía
// = fila válida). `filaCruda` se usa para mostrar el valor original.
export const validarFilaDetalleOC = (fila, filaCruda = {}) => {
  const motivos = [];
  if (!fila.admision) motivos.push('ADMISION vacía');
  if (!fila.fecha_cx) {
    const original = textoCelda(filaCruda['FECHA_CX']);
    motivos.push(original ? `FECHA_CX "${original}" no se reconoce como fecha` : 'FECHA_CX vacía');
  }
  if (/[/]/.test(fila.admision)) motivos.push(`ADMISION "${fila.admision}" contiene "/"`);
  if (fila.id && /[/]/.test(fila.id)) motivos.push(`ID "${fila.id}" contiene "/"`);
  return motivos;
};
