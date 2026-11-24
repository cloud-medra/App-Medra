// Exportar datos (módulo Exportación, solo Desarrollador): todo lo registrado
// en un mes en Implantes, Hemodinamia y Consignación, en una sola tabla, y el
// Excel para pasarlo a la planilla de Implantes (decisión del 24-11-2026: el
// usuario deja la app para Implantes y después borra los datos).
//
// Fuentes (sin lecturas extra: cada documento ya trae todo):
//   - Implantes y Hemodinamia: una gestión por documento, con sus ítems en
//     cotizaciones[0].items (mismo mapeo que filasDesdeGestiones del
//     respaldo, scripts/respaldoImplantes/datosRespaldo.js).
//   - Consignación: un registro por línea (consignacion_registros/…/detalles).
//     Lote y vencimiento escritos en Cargas, o si no los de la guía vinculada.
//
// El Excel trae la tabla y dos hojas con las columnas de Gestiones e Ítems de
// la planilla EN SUS MISMAS LETRAS (COLUMNAS_GESTIONES y DEF_ITEMS de
// scripts/respaldoImplantes/libroRespaldo.js): las columnas con fórmula de
// la planilla van vacías y marcadas "no pegar", porque están bloqueadas.
import * as XLSX from 'xlsx';
import { LADOS, LADO_POR_DEFECTO } from '../../../../../functions/bodymap/nucleo.mjs';

export const SEGMENTOS = Object.freeze({ implantes: 'IMPLANTES', hemodinamia: 'HEMODINAMIA', consignacion: 'CONSIGNACION' });
const ORDEN_SEGMENTO = ['IMPLANTES', 'CONSIGNACION', 'HEMODINAMIA'];

const texto = (v) => (v === null || v === undefined ? '' : String(v).trim());
const numero = (v) => {
  if (v === null || v === undefined || v === '') return '';
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : '';
};

export const tipoLineaDe = (item) => {
  if (item?.padPadreId) return 'CONTENIDO PAD';
  if (item?.lotePadreId) return 'LOTE ADICIONAL';
  if (item?.esPad) return 'PAD PADRE';
  return 'NORMAL';
};

const nombreLado = (id) => {
  if (!id || id === LADO_POR_DEFECTO) return '';
  return LADOS.find((l) => l.id === id)?.nombre || texto(id);
};

// CLAVE de la planilla (fórmula de Gestiones A): admisión|empresa|AAAA-MM-DD.
export const claveDe = ({ admision, empresa, fecha }) => `${texto(admision)}|${texto(empresa)}|${texto(fecha)}`;

const itemsDe = (g) => (Array.isArray(g?.cotizaciones?.[0]?.items) ? g.cotizaciones[0].items : []);

// Una gestión de Implantes o Hemodinamia → una fila por ítem (o una sola,
// sin datos de ítem, si no tiene ítems).
const filasDeGestion = (g, segmento) => {
  const cabecera = {
    segmento,
    centro: texto(g.centro),
    admision: texto(g.gestionId || g.agendaId),
    fecha: texto(g.fecha),
    empresa: texto(g.empresa),
    nombre: texto(g.nombre),
    totalCotizacion: numero(g.costo) || numero(g.cotizaciones?.[0]?.totalCotizacion),
    informe: texto(g.informe),
    // Para la planilla.
    lado: nombreLado(g.lado),
    observacion: texto(g.observacion),
    convenio: texto(g.convenio),
    prevision: texto(g.prevision),
    medico: texto(g.medico),
    descripcion: texto(g.descripcion),
    estadoGestion: texto(g.estado),
    registradoPor: texto(g.registradoPor),
  };
  const items = itemsDe(g);
  if (!items.length) return [{ ...cabecera, sinItems: true }];
  return items.map((it, i) => ({
    ...cabecera,
    tipoLinea: tipoLineaDe(it),
    numCotizacion: texto(it.numCotizacion),
    referencia: texto(it.referencia),
    cantidad: numero(it.cantidad),
    numGuia: '',
    lote: texto(it.lote),
    vencimiento: texto(it.vencimiento),
    estadoCarga: texto(it.estadoCarga),
    precio: numero(it.precio),
    idItem: texto(it.id) || `#${i}`,
    idPadre: texto(it.padPadreId || it.lotePadreId),
    orden: i,
  }));
};

// Un registro de Consignación → una fila (su propia línea).
const filaDeConsignacion = (r) => {
  const costo = numero(r.costo);
  const cantidad = numero(r.cantidad);
  return {
    segmento: SEGMENTOS.consignacion,
    centro: texto(r.centro),
    admision: texto(r.gestionId),
    fecha: texto(r.fecha),
    empresa: texto(r.empresa),
    nombre: texto(r.nombre),
    // Consignación no tiene total de cotización: el de la línea (costo × cantidad).
    totalCotizacion: costo !== '' && cantidad !== '' ? costo * cantidad : '',
    informe: '',
    tipoLinea: 'NORMAL',
    numCotizacion: '',
    referencia: texto(r.referencia),
    cantidad,
    numGuia: texto(r.numeroGuiaVinculada),
    lote: texto(r.lote) || texto(r.loteGuiaVinculado),
    vencimiento: texto(r.vencimiento) || texto(r.vencimientoGuiaVinculado),
    estadoCarga: texto(r.estado),
    precio: costo,
    convenio: texto(r.convenio),
    prevision: texto(r.prevision),
    medico: texto(r.medico),
    descripcion: texto(r.descripcion),
    registradoPor: texto(r.registradoPor),
    idItem: texto(r.id),
    idPadre: '',
    orden: 0,
  };
};

// { implantes: [docs], hemodinamia: [docs], consignacion: [docs] } → filas
// ordenadas por segmento, fecha, admisión, empresa y orden de la línea.
export const filasExportacion = ({ implantes = [], hemodinamia = [], consignacion = [] } = {}) => {
  const filas = [
    ...implantes.flatMap((g) => filasDeGestion(g, SEGMENTOS.implantes)),
    ...hemodinamia.flatMap((g) => filasDeGestion(g, SEGMENTOS.hemodinamia)),
    ...consignacion.map(filaDeConsignacion),
  ];
  return filas
    .map((f, i) => ({ ...f, clave: claveDe(f), _i: i }))
    .sort((a, b) => ORDEN_SEGMENTO.indexOf(a.segmento) - ORDEN_SEGMENTO.indexOf(b.segmento)
      || a.fecha.localeCompare(b.fecha)
      || a.admision.localeCompare(b.admision, 'es', { numeric: true })
      || a.empresa.localeCompare(b.empresa)
      || a._i - b._i)
    .map((f) => { const fila = { ...f }; delete fila._i; return fila; });
};

// --- Excel ----------------------------------------------------------------------

export const COLUMNAS_TABLA = Object.freeze([
  ['segmento', 'Segmento'], ['centro', 'Centro'], ['admision', 'Admisión'], ['fecha', 'Fecha'],
  ['empresa', 'Empresa'], ['nombre', 'Nombre'], ['totalCotizacion', 'Total cotización'], ['informe', 'Informe'],
  ['tipoLinea', 'Tipo de línea'], ['numCotizacion', 'N° cotización'], ['referencia', 'Referencia'],
  ['cantidad', 'Cantidad'], ['numGuia', 'N° guía'], ['lote', 'Lote'], ['vencimiento', 'Vencimiento'],
]);

// 'AAAA-MM-DD' → número de serie de Excel con formato de fecha; otro texto, tal cual.
const MS_DIA = 86400000;
const BASE_EXCEL = Date.UTC(1899, 11, 30);
export const celdaFecha = (valor) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto(valor));
  if (!m) return texto(valor);
  return { t: 'n', v: (Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) - BASE_EXCEL) / MS_DIA, z: 'dd-mm-yyyy' };
};

// Celda de SheetJS desde un valor (número, texto o celda ya armada).
const celda = (v) => {
  if (v && typeof v === 'object') return v;
  if (typeof v === 'number') return { t: 'n', v };
  return { t: 's', v: texto(v) };
};

const hojaDesde = (filas, anchos) => {
  const hoja = XLSX.utils.aoa_to_sheet([]);
  filas.forEach((fila, r) => fila.forEach((v, c) => {
    if (v === undefined || v === null || v === '') return;
    hoja[XLSX.utils.encode_cell({ r, c })] = celda(v);
  }));
  const ultimaCol = Math.max(...filas.map((f) => f.length)) - 1;
  hoja['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(filas.length - 1, 0), c: Math.max(ultimaCol, 0) } });
  if (anchos) hoja['!cols'] = anchos.map((wch) => ({ wch }));
  return hoja;
};

const NO_PEGAR = '(no pegar)';
// Letra → índice (A = 0).
const col = (letra) => XLSX.utils.decode_col(letra);

// Gestiones de la planilla: A CLAVE (referencia), B..G, H Estado (fórmula),
// I..Q. Una fila por CLAVE.
export const filasPlanillaGestiones = (filas) => {
  const vistas = new Set();
  const salida = [];
  // Total de consignación: la suma de sus líneas (así cuadra con los ítems).
  const totalConsignacion = new Map();
  filas.filter((f) => f.segmento === SEGMENTOS.consignacion).forEach((f) => {
    totalConsignacion.set(f.clave, (totalConsignacion.get(f.clave) || 0) + (Number(f.totalCotizacion) || 0));
  });
  filas.forEach((f) => {
    if (vistas.has(f.clave)) return;
    vistas.add(f.clave);
    const fila = [];
    fila[col('A')] = f.clave;
    fila[col('B')] = f.admision;
    fila[col('C')] = celdaFecha(f.fecha);
    fila[col('D')] = f.empresa;
    fila[col('E')] = f.nombre;
    fila[col('F')] = f.segmento === SEGMENTOS.consignacion ? (totalConsignacion.get(f.clave) || '') : f.totalCotizacion;
    fila[col('G')] = f.informe;
    fila[col('I')] = f.centro;
    fila[col('J')] = f.segmento;
    fila[col('K')] = f.lado;
    fila[col('L')] = f.observacion;
    fila[col('M')] = f.convenio;
    fila[col('N')] = f.prevision;
    fila[col('O')] = f.medico;
    fila[col('P')] = f.descripcion;
    fila[col('Q')] = f.sinItems ? f.estadoGestion : '';
    fila[col('W')] = f.registradoPor;
    salida.push(fila);
  });
  return salida;
};

// Ítems de la planilla con N° de línea desde `lineaInicial` (el N° de la
// primera fila libre donde se pegará): la Línea padre apunta a esos números.
export const filasPlanillaItems = (filas, lineaInicial = 1) => {
  const conItems = filas.filter((f) => !f.sinItems);
  const lineaPorId = new Map();
  conItems.forEach((f, i) => lineaPorId.set(`${f.clave}#${f.idItem}`, lineaInicial + i));
  return conItems.map((f, i) => {
    const fila = [];
    fila[col('A')] = lineaInicial + i;
    fila[col('G')] = f.estadoCarga;
    fila[col('H')] = f.clave;
    fila[col('I')] = f.tipoLinea;
    fila[col('J')] = f.idPadre ? (lineaPorId.get(`${f.clave}#${f.idPadre}`) ?? '') : '';
    fila[col('K')] = f.numCotizacion;
    fila[col('L')] = f.referencia;
    fila[col('M')] = f.cantidad;
    fila[col('N')] = f.numGuia;
    fila[col('P')] = f.lote;
    fila[col('Q')] = celdaFecha(f.vencimiento);
    // Precio del sistema, para conservar el total (no en las líneas sin cobro).
    fila[col('R')] = ['NORMAL', 'PAD PADRE'].includes(f.tipoLinea) ? f.precio : '';
    fila[col('AB')] = f.registradoPor;
    return fila;
  });
};

const ENCABEZADO_GESTIONES = (() => {
  const t = [];
  [['A', 'CLAVE (referencia, no pegar)'], ['B', 'Admisión'], ['C', 'Fecha'], ['D', 'Empresa'], ['E', 'Nombre paciente'],
    ['F', 'Total cotización'], ['G', 'Informe'], ['H', `Estado ${NO_PEGAR}`], ['I', 'Centro'], ['J', 'Atributo'], ['K', 'Lado'],
    ['L', 'Observación'], ['M', 'Convenio'], ['N', 'Previsión'], ['O', 'Médico'], ['P', 'Descripción'], ['Q', 'Estado sin ítems'],
    ['R', NO_PEGAR], ['S', NO_PEGAR], ['T', NO_PEGAR], ['U', NO_PEGAR], ['V', NO_PEGAR], ['W', 'Registrado por']]
    .forEach(([l, v]) => { t[col(l)] = v; });
  return t;
})();

const ENCABEZADO_ITEMS = (() => {
  const t = [];
  [['A', 'N° línea (referencia)'], ['B', NO_PEGAR], ['C', NO_PEGAR], ['D', NO_PEGAR], ['E', NO_PEGAR], ['F', NO_PEGAR],
    ['G', 'Estado carga'], ['H', 'CLAVE'], ['I', 'Tipo de línea'], ['J', 'Línea padre'], ['K', 'N° cotización'], ['L', 'Referencia'],
    ['M', 'Cantidad (ingresar)'], ['N', 'N° guía'], ['O', NO_PEGAR], ['P', 'Lote'], ['Q', 'Vencimiento'], ['R', 'Precio manual'],
    ['S', NO_PEGAR], ['T', NO_PEGAR], ['U', NO_PEGAR], ['V', NO_PEGAR], ['W', NO_PEGAR], ['X', NO_PEGAR], ['Y', NO_PEGAR],
    ['Z', NO_PEGAR], ['AA', NO_PEGAR], ['AB', 'Registrado por']]
    .forEach(([l, v]) => { t[col(l)] = v; });
  return t;
})();

export const INSTRUCCIONES = Object.freeze({
  gestiones: 'Pegue en la hoja Gestiones de la planilla, en la primera fila libre, con Pegado especial → Valores, en dos partes: B:G y I:Q (la columna H, Estado, es fórmula y está bloqueada). Después W (Registrado por).',
  items: 'Pegue en la hoja Ítems de la planilla con Pegado especial → Valores, en cuatro partes: G:N, P:R y AB (O y S..AA son fórmulas). Los N° de línea de la columna A son los de la planilla desde el N° indicado al descargar: pegue en esa misma fila para que la Línea padre calce.',
});

export const construirLibroExportacion = (filas, { lineaInicial = 1 } = {}) => {
  const libro = XLSX.utils.book_new();
  const tabla = [COLUMNAS_TABLA.map(([, t]) => t), ...filas.map((f) => COLUMNAS_TABLA.map(([k]) => (k === 'fecha' || k === 'vencimiento' ? celdaFecha(f[k]) : f[k])))];
  XLSX.utils.book_append_sheet(libro, hojaDesde(tabla, [13, 14, 11, 11, 26, 28, 14, 11, 15, 13, 22, 9, 11, 14, 12]), 'Datos');
  XLSX.utils.book_append_sheet(libro, hojaDesde([[INSTRUCCIONES.gestiones], ENCABEZADO_GESTIONES, ...filasPlanillaGestiones(filas)]), 'Para Gestiones');
  XLSX.utils.book_append_sheet(libro, hojaDesde([[INSTRUCCIONES.items], ENCABEZADO_ITEMS, ...filasPlanillaItems(filas, lineaInicial)]), 'Para Ítems');
  return libro;
};

export const descargarExportacion = (filas, { anio, mes, lineaInicial }) => {
  XLSX.writeFile(construirLibroExportacion(filas, { lineaInicial }), `datos_${anio}-${mes}.xlsx`);
};
