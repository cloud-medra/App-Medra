// Respaldo de contingencia de Implantes: arma el libro de Excel (exceljs) a
// partir de los datos ya preparados en datosRespaldo.js.
//
// Decisiones (aprobadas al diseñarlo):
//   - Se usa en Microsoft Excel (único probado; LibreOffice no se usa).
//     Fórmulas solo con INDICE/COINCIDIR, CONTAR.SI(.CONJUNTO), SUMAR.SI y
//     SI.ERROR, sin BUSCARX ni UNIRCADENAS: abren en cualquier Excel 2010+.
//     exceljs las escribe en inglés; Excel las muestra en su idioma.
//   - En las filas del sistema se pueden editar solo algunos campos
//     (`campo` en la columna; cuáles por fila en camposEditablesItem). El
//     valor original queda en columnas ocultas y MODIFICADO compara contra él.
//   - Fila 1 = ayuda, fila 2 = encabezados (con filtro), datos desde la 3.
//   - Las filas exportadas (SISTEMA) son una foto bloqueada: valores
//     guardados, sin fórmulas de catálogo. Las filas vacías traen fórmulas
//     y validaciones, y solo se desbloquean las columnas que se escriben.
//   - Las columnas auxiliares (ocultas) evitan repetir búsquedas: cada fila
//     busca su referencia en el catálogo UNA vez y las demás columnas leen
//     esa posición. Con ~3.000 referencias esto mantiene el recálculo rápido.
//   - Las fórmulas son perezosas: una fila vacía corta en el primer SI y no
//     recorre ningún rango.

import ExcelJS from 'exceljs';
import {
  ESTADOS_GESTION, ESTADOS_CARGA, INFORMES, NOMBRES_LADO, LISTA_TIPOS_LINEA, CODIGO_SIN_OC,
  CAMPOS_EDITABLES_GESTION, camposEditablesItem, dimensionarCatalogos, isoAFechaExcel,
  TIPOS_CODIGO, SEGMENTOS_CODIGO, CLASES_CODIGO,
} from './datosRespaldo.js';

const FILA_AYUDA = 1;
const FILA_ENCABEZADO = 2;
const PRIMERA = 3;

// Nombres de hoja: las macros (macros/MoverCargados.bas) usan los mismos.
export const H = {
  G: 'Gestiones', I: 'Ítems', CARG: 'Cargados',
  // Mismos nombres que las dos hojas del Excel de Solicitud de la app
  // (config.hojaSolicitud de modulosGestion.js y "Resumen"; lo comprueba el test).
  SOL: 'Solicitud Implantes', RES: 'Resumen',
  RI: 'Reporte Info', R: 'Códigos', E: 'Empresas',
  CEN: 'Centros', REC: 'Recargos', PREV: 'Previsiones', CONV: 'Convenios', C: 'Catálogos', INS: 'Instrucciones',
};
const ref = (hoja) => `'${hoja}'!`;

// Colores (ARGB).
const COLOR = {
  obligatorio: 'FFFFE699', // amarillo: se escribe y es obligatorio
  opcional: 'FFDDEBF7',    // azul: se escribe, opcional
  formula: 'FFD9D9D9',     // gris: automático, no se escribe
  sistema: 'FFF2F2F2',     // filas exportadas (solo lectura)
  ayuda: 'FFFAFAFA',
  error: 'FFFFC7CE',
  textoError: 'FF9C0006',
  ok: 'FF006100',
  okFondo: 'FFC6EFCE',
  editableSistema: 'FFFFFFFF', // celda editable de una fila del sistema
  cambiado: 'FFFFEB9C',        // valor distinto del original
  aviso: 'FFFCE4D6',           // naranja: revisar (no bloquea)
  manual: 'FF1F4E79',          // letra del dato escrito a mano
};

const relleno = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const BORDE = { style: 'thin', color: { argb: 'FFBFBFBF' } };
const BORDES = { top: BORDE, left: BORDE, bottom: BORDE, right: BORDE };
const FORMATO_FECHA = 'dd-mm-yyyy';
const FORMATO_PESOS = '#,##0';

// --- Definición de columnas -------------------------------------------------
// clase: 'obligatorio' | 'opcional' | 'formula'. oculta: columna auxiliar.

const COLUMNAS_GESTIONES = [
  { l: 'A', titulo: 'CLAVE', clase: 'formula', ancho: 34, ayuda: 'Automática: admisión|empresa|AAAA-MM-DD. Es la que se elige en Ítems.' },
  { l: 'B', titulo: 'Admisión', clase: 'obligatorio', ancho: 12, texto: true, ayuda: 'N° de admisión, solo dígitos.' },
  { l: 'C', titulo: 'Fecha', clase: 'obligatorio', ancho: 12, fecha: true, ayuda: 'Fecha de la cirugía (dd-mm-aaaa).' },
  { l: 'D', titulo: 'Empresa', clase: 'obligatorio', ancho: 26, ayuda: 'Proveedor, de la lista.' },
  { l: 'E', titulo: 'Nombre paciente', clase: 'opcional', ancho: 28, ayuda: 'Se completa desde Reporte Info al escribir la admisión. Se puede escribir encima.' },
  { l: 'F', titulo: 'Total cotización', clase: 'opcional', ancho: 14, pesos: true, ayuda: 'Total que indica la cotización (se compara con la suma de los ítems).' },
  { l: 'G', titulo: 'Informe', clase: 'opcional', ancho: 12, campo: 'informe', original: 'AB', ayuda: 'Vacío = PENDIENTE.' },
  { l: 'H', titulo: 'Centro', clase: 'opcional', ancho: 16, ayuda: 'Vacío = PABELLON.' },
  { l: 'I', titulo: 'Atributo', clase: 'opcional', ancho: 12, ayuda: 'Vacío = IMPLANTES.' },
  { l: 'J', titulo: 'Lado', clase: 'opcional', ancho: 14, campo: 'lado', original: 'AC', ayuda: 'Vacío = No especificado.' },
  { l: 'K', titulo: 'Observación', clase: 'opcional', ancho: 30, campo: 'observacion', original: 'AD', ayuda: 'Nota libre.' },
  { l: 'L', titulo: 'Convenio', clase: 'opcional', ancho: 16, ayuda: 'Desde Reporte Info. A mano: de la lista (avisa si no está).' },
  { l: 'M', titulo: 'Previsión', clase: 'opcional', ancho: 14, ayuda: 'Desde Reporte Info (Isapre). A mano: de la lista (avisa si no está).' },
  { l: 'N', titulo: 'Médico', clase: 'opcional', ancho: 22, ayuda: 'Desde Reporte Info (1° cirujano). Se puede escribir encima.' },
  { l: 'O', titulo: 'Descripción', clase: 'opcional', ancho: 30, ayuda: 'Desde Reporte Info. Se puede escribir encima.' },
  { l: 'P', titulo: 'Estado sin ítems', clase: 'opcional', ancho: 14, ayuda: 'Solo si la gestión no tiene ítems. Vacío = AGENDADO.' },
  { l: 'Q', titulo: 'Estado', clase: 'formula', ancho: 14, ayuda: 'Automático, misma regla del sistema.' },
  { l: 'R', titulo: 'N° ítems', clase: 'formula', ancho: 9, ayuda: 'Automático.' },
  { l: 'S', titulo: 'Suma ítems', clase: 'formula', ancho: 13, pesos: true, ayuda: 'Suma de Total ítem.' },
  { l: 'T', titulo: 'Diferencia', clase: 'formula', ancho: 13, pesos: true, ayuda: 'Total cotización − suma. En rojo si no cuadra.' },
  { l: 'U', titulo: 'Solicitud', clase: 'formula', ancho: 12, ayuda: 'Solo informativo (filas del sistema).' },
  { l: 'V', titulo: 'ORIGEN', clase: 'formula', ancho: 14, ayuda: 'SISTEMA = foto del sistema (no editar). CONTINGENCIA = registrado en la caída.' },
  { l: 'W', titulo: 'Registrado por', clase: 'obligatorio', ancho: 18, ayuda: 'Quién la registró.' },
  { l: 'X', titulo: 'ID sistema', clase: 'formula', ancho: 18, ayuda: 'Solo filas del sistema.' },
  { l: 'Y', titulo: 'aux: primer estado', clase: 'formula', oculta: true },
  { l: 'Z', titulo: 'aux: líneas sin código', clase: 'formula', oculta: true },
  // Después de las auxiliares (ocultas) para no mover sus letras; en
  // pantalla queda junto a ID sistema.
  { l: 'AA', titulo: 'MODIFICADO', clase: 'formula', ancho: 12, ayuda: 'Filas del sistema: SÍ si se cambió Informe, Lado u Observación.' },
  { l: 'AB', titulo: 'orig: Informe', clase: 'formula', oculta: true },
  { l: 'AC', titulo: 'orig: Lado', clase: 'formula', oculta: true },
  { l: 'AD', titulo: 'orig: Observación', clase: 'formula', oculta: true },
  { l: 'AE', titulo: 'Alerta', clase: 'formula', ancho: 34, ayuda: 'Admisión que no está en Reporte Info, o convenio/previsión fuera de su lista.' },
  // Lo que trae Reporte Info para la admisión (las celdas visibles E, L-O
  // las muestran con =AG…; escribir encima no toca estas, y la macro "Mover
  // cargados" usa estas para restaurar el autocompletado de una fila).
  { l: 'AF', titulo: 'aux: fila Reporte Info', clase: 'formula', oculta: true },
  { l: 'AG', titulo: 'RI: Paciente', clase: 'formula', oculta: true },
  { l: 'AH', titulo: 'RI: Convenio', clase: 'formula', oculta: true },
  { l: 'AI', titulo: 'RI: Previsión', clase: 'formula', oculta: true },
  { l: 'AJ', titulo: 'RI: 1° Cirujano', clase: 'formula', oculta: true },
  { l: 'AK', titulo: 'RI: Descripción', clase: 'formula', oculta: true },
];

// Celdas de Gestiones que se autocompletan desde Reporte Info → su auxiliar.
export const AUTOCOMPLETADO_GESTION = Object.freeze({ E: 'AG', L: 'AH', M: 'AI', N: 'AJ', O: 'AK' });

const COLUMNAS_ITEMS = [
  { l: 'A', titulo: 'N° línea', clase: 'formula', ancho: 8, ayuda: 'Fijo. Se usa en "Línea padre".' },
  { l: 'B', titulo: 'CLAVE', clase: 'obligatorio', ancho: 34, ayuda: 'Gestión a la que pertenece (lista de Gestiones).' },
  { l: 'C', titulo: 'Tipo de línea', clase: 'opcional', ancho: 16, ayuda: 'Vacío = NORMAL.' },
  { l: 'D', titulo: 'Línea padre', clase: 'opcional', ancho: 9, ayuda: 'Solo CONTENIDO PAD (N° del PAD PADRE) y LOTE ADICIONAL (N° de la línea NORMAL).' },
  { l: 'E', titulo: 'N° cotización', clase: 'obligatorio', ancho: 14, texto: true, ayuda: 'N° de la cotización del proveedor.' },
  { l: 'F', titulo: 'Referencia', clase: 'obligatorio', ancho: 24, texto: true, ayuda: 'De la lista (se puede escribir). Si no existe queda "Sin código".' },
  { l: 'G', titulo: 'Cantidad', clase: 'obligatorio', ancho: 9, campo: 'cantidad', original: 'AL', ayuda: 'Mayor que 0. En una referencia con lotes: la cantidad TOTAL.' },
  { l: 'H', titulo: 'Lote', clase: 'opcional', ancho: 14, texto: true, campo: 'lote', original: 'AM', ayuda: 'Vacío = Sin lote.' },
  { l: 'I', titulo: 'Vencimiento', clase: 'opcional', ancho: 12, fecha: true, campo: 'vencimiento', original: 'AN', ayuda: 'dd-mm-aaaa. Vacío = Sin fecha.' },
  { l: 'J', titulo: 'Estado carga', clase: 'opcional', ancho: 13, campo: 'estadoCarga', original: 'AO', ayuda: 'Vacío = PENDIENTE. En PAD no se usa.' },
  { l: 'K', titulo: 'Precio manual', clase: 'opcional', ancho: 12, pesos: true, ayuda: 'Opcional: reemplaza el precio del catálogo (ej. referencia sin código).' },
  { l: 'L', titulo: 'Código', clase: 'formula', ancho: 12, ayuda: 'Del catálogo.' },
  { l: 'M', titulo: 'Precio unitario', clase: 'formula', ancho: 12, pesos: true, ayuda: 'Catálogo o precio manual.' },
  { l: 'N', titulo: 'Empresa producto', clase: 'formula', ancho: 22, ayuda: 'En rojo si no coincide con la empresa de la gestión.' },
  { l: 'O', titulo: 'Clase', clase: 'formula', ancho: 10, ayuda: 'Del catálogo.' },
  { l: 'P', titulo: 'Tipo', clase: 'formula', ancho: 12, ayuda: 'Del catálogo.' },
  { l: 'Q', titulo: 'Descriptor', clase: 'formula', ancho: 30, ayuda: 'Del catálogo.' },
  { l: 'R', titulo: 'Veces costo', clase: 'formula', ancho: 8, ayuda: 'Según rango de recargo.' },
  { l: 'S', titulo: 'Total ítem', clase: 'formula', ancho: 13, pesos: true, ayuda: 'Precio × cantidad.' },
  { l: 'T', titulo: 'Venta', clase: 'formula', ancho: 13, pesos: true, ayuda: 'Precio × veces costo × cantidad.' },
  { l: 'U', titulo: 'Alerta', clase: 'formula', ancho: 40, ayuda: 'Problemas de la fila. Debe quedar vacía.' },
  { l: 'V', titulo: 'ORIGEN', clase: 'formula', ancho: 14, ayuda: 'SISTEMA o CONTINGENCIA.' },
  { l: 'W', titulo: 'Registrado por', clase: 'obligatorio', ancho: 18, ayuda: 'Quién la registró.' },
  { l: 'X', titulo: 'ID sistema', clase: 'formula', ancho: 18, ayuda: 'Solo filas del sistema.' },
  { l: 'Y', titulo: 'aux: tipo', clase: 'formula', oculta: true },
  { l: 'Z', titulo: 'aux: estado', clase: 'formula', oculta: true },
  { l: 'AA', titulo: 'aux: estado normalizado', clase: 'formula', oculta: true },
  { l: 'AB', titulo: 'aux: empresa gestión', clase: 'formula', oculta: true },
  { l: 'AC', titulo: 'aux: referencia buscada', clase: 'formula', oculta: true },
  { l: 'AD', titulo: 'aux: fila catálogo', clase: 'formula', oculta: true },
  { l: 'AE', titulo: 'aux: ambigua', clase: 'formula', oculta: true },
  { l: 'AF', titulo: 'aux: fila padre', clase: 'formula', oculta: true },
  { l: 'AG', titulo: 'aux: sin código', clase: 'formula', oculta: true },
  { l: 'AH', titulo: 'aux: tramo recargo', clase: 'formula', oculta: true },
  { l: 'AI', titulo: 'aux: recargo encontrado', clase: 'formula', oculta: true },
  { l: 'AJ', titulo: 'aux: empresa no coincide', clase: 'formula', oculta: true },
  { l: 'AK', titulo: 'MODIFICADO', clase: 'formula', ancho: 12, ayuda: 'Filas del sistema: SÍ si se cambió Cantidad, Lote, Vencimiento o Estado carga.' },
  { l: 'AL', titulo: 'orig: Cantidad', clase: 'formula', oculta: true },
  { l: 'AM', titulo: 'orig: Lote', clase: 'formula', oculta: true, texto: true },
  { l: 'AN', titulo: 'orig: Vencimiento', clase: 'formula', oculta: true, fecha: true },
  { l: 'AO', titulo: 'orig: Estado carga', clase: 'formula', oculta: true },
];

const COLUMNAS_REFERENCIAS = [
  { l: 'A', titulo: 'Clave búsqueda', ancho: 30, automatica: true },
  { l: 'B', titulo: 'CODIGO', ancho: 12, texto: true },
  { l: 'C', titulo: 'REFERENCIA', ancho: 24, texto: true },
  { l: 'D', titulo: 'DESCRIPTOR_EMPRESA', ancho: 30 },
  { l: 'E', titulo: 'EMPRESA', ancho: 24 },
  { l: 'F', titulo: 'TIPO', ancho: 12 },
  { l: 'G', titulo: 'SEGMENTO', ancho: 13 },
  { l: 'H', titulo: 'CLASE', ancho: 10 },
  { l: 'I', titulo: 'DESCRIPTOR_AUTO', ancho: 40 },
  { l: 'J', titulo: 'PRECIO_NETO', ancho: 12, pesos: true },
  { l: 'K', titulo: 'CX', ancho: 8 },
  { l: 'L', titulo: 'OBSERVACION', ancho: 20 },
  { l: 'M', titulo: 'REGISTRADO_POR', ancho: 18 },
  { l: 'N', titulo: 'ESTADO', ancho: 10 },
  { l: 'O', titulo: 'Referencia usable', ancho: 22, automatica: true },
  { l: 'P', titulo: 'Veces repetida', ancho: 9, automatica: true },
];
// Columna de cada dato en la hoja Códigos (para las fórmulas de Ítems). La
// referencia se busca en O (vacía si la fila está INACTIVA).
const REF = { clave: 'A', codigo: 'B', referencia: 'O', empresa: 'E', tipo: 'F', clase: 'H', descriptor: 'I', precio: 'J', repeticiones: 'P' };

// --- Utilidades de hoja -----------------------------------------------------

// `ayudaEnNota`: columnas cuya ayuda va como nota del encabezado en vez de
// la fila 1 (ahí van los botones de las macros).
const prepararHoja = (hoja, columnas, { conAyuda = true, congelarColumnas = 0, ayudaEnNota = [] } = {}) => {
  hoja.columns = columnas.map((c) => ({ key: c.l, width: c.ancho || 12, hidden: !!c.oculta }));
  const filaEnc = hoja.getRow(FILA_ENCABEZADO);
  const filaAyuda = hoja.getRow(FILA_AYUDA);
  columnas.forEach((c) => {
    const celda = filaEnc.getCell(c.l);
    celda.value = c.titulo;
    celda.font = { bold: true };
    celda.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    celda.fill = relleno(COLOR[c.clase] || COLOR.formula);
    celda.border = BORDES;
    if (ayudaEnNota.includes(c.l)) {
      if (c.ayuda) celda.note = c.ayuda;
    } else if (conAyuda) {
      const a = filaAyuda.getCell(c.l);
      a.value = c.ayuda || '';
      a.font = { italic: true, size: 9, color: { argb: 'FF595959' } };
      a.alignment = { vertical: 'top', wrapText: true };
      a.fill = relleno(COLOR.ayuda);
    }
  });
  filaEnc.height = 30;
  filaAyuda.height = conAyuda ? 48 : 18;
  hoja.views = [{ state: 'frozen', xSplit: congelarColumnas, ySplit: FILA_ENCABEZADO }];
  // El filtro llega hasta la última columna visible (puede haber ocultas en
  // medio, como las auxiliares antes de MODIFICADO).
  let ultimaVisible = 0;
  columnas.forEach((c, i) => { if (!c.oculta) ultimaVisible = i + 1; });
  hoja.autoFilter = { from: { row: FILA_ENCABEZADO, column: 1 }, to: { row: FILA_ENCABEZADO, column: ultimaVisible } };
};

// Formatos por columna en un rango de filas (texto, fecha, pesos) y bloqueo.
const formatearCelda = (celda, col, { bloqueada }) => {
  if (col.texto) celda.numFmt = '@';
  if (col.fecha) celda.numFmt = FORMATO_FECHA;
  if (col.pesos) celda.numFmt = FORMATO_PESOS;
  celda.protection = { locked: bloqueada };
};

// `editables` (solo filas del sistema): campos que esa fila deja cambiar.
// Esas celdas quedan desbloqueadas y en blanco (no grises) para que se note.
const escribirFila = (hoja, numeroFila, columnas, valores, { sistema, editables = [] }) => {
  const fila = hoja.getRow(numeroFila);
  columnas.forEach((col) => {
    const celda = fila.getCell(col.l);
    const v = valores[col.l];
    if (v !== undefined && v !== null && v !== '') celda.value = v;
    const editableEnSistema = sistema && col.campo && editables.includes(col.campo);
    formatearCelda(celda, col, { bloqueada: editableEnSistema ? false : (sistema || col.clase === 'formula') });
    if (sistema && !col.oculta) celda.fill = relleno(editableEnSistema ? COLOR.editableSistema : COLOR.sistema);
  });
};

// Valores originales (columnas ocultas) y MODIFICADO de una fila del sistema.
const camposDeCambio = (columnas, r, valoresSistema, colModificado) => {
  const conOriginal = columnas.filter((c) => c.original);
  const valores = Object.fromEntries(conOriginal.map((c) => [c.original, valoresSistema[c.l]]));
  const comparaciones = conOriginal.map((c) => `${c.l}${r}<>${c.original}${r}`).join(',');
  valores[colModificado] = f(`IF(OR(${comparaciones}),"SÍ","NO")`);
  return valores;
};

// Fondo ámbar en cada celda editable cuyo valor difiere del original, y
// MODIFICADO = SÍ en negrita.
const reglasCambio = (hoja, columnas, colOrigen, colModificado, desde, hasta) => {
  columnas.filter((c) => c.original).forEach((c) => hoja.addConditionalFormatting({
    ref: `${c.l}${desde}:${c.l}${hasta}`,
    rules: [{ type: 'expression', priority: 1, formulae: [`AND($${colOrigen}${desde}="SISTEMA",${c.l}${desde}<>$${c.original}${desde})`], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: COLOR.cambiado } } } }],
  }));
  hoja.addConditionalFormatting({
    ref: `${colModificado}${desde}:${colModificado}${hasta}`,
    rules: [{ type: 'expression', priority: 1, formulae: [`${colModificado}${desde}="SÍ"`], style: { font: { bold: true }, fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: COLOR.cambiado } } } }],
  });
};

const f = (formula) => ({ formula });

const validar = (hoja, rango, validacion) => hoja.dataValidations.add(rango, {
  allowBlank: true,
  showErrorMessage: true,
  errorStyle: 'stop',
  ...validacion,
});

const lista = (origen, extra = {}) => ({ type: 'list', formulae: [origen], ...extra });

const fechaValida = {
  type: 'date', operator: 'between',
  formulae: [new Date(Date.UTC(2020, 0, 1)), new Date(Date.UTC(2100, 11, 31))],
  errorTitle: 'Fecha', error: 'Escriba una fecha válida (dd-mm-aaaa).',
};

// Admisión: solo dígitos (el texto "00123" vale; "12a", "1.5" o "1-2" no).
const soloDigitos = (celda) => ({
  type: 'custom',
  formulae: [`AND(ISNUMBER(--${celda}),ISERROR(SEARCH(".",${celda})),ISERROR(SEARCH(",",${celda})),ISERROR(SEARCH("e",${celda})),ISERROR(SEARCH("-",${celda})),ISERROR(SEARCH("+",${celda})),ISERROR(SEARCH(" ",${celda})))`],
  errorTitle: 'Admisión', error: 'Solo dígitos, sin puntos ni espacios.',
});

// Fondo rojo claro en un obligatorio vacío de una fila de contingencia.
const reglaObligatorio = (hoja, columnas, colOrigen, desde, hasta) => {
  columnas.forEach((l) => hoja.addConditionalFormatting({
    ref: `${l}${desde}:${l}${hasta}`,
    rules: [{ type: 'expression', priority: 1, formulae: [`AND($${colOrigen}${desde}="CONTINGENCIA",${l}${desde}="")`], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: COLOR.error } } } }],
  }));
};

// --- Hoja Catálogos -----------------------------------------------------------

// Listas fijas del sistema (bloqueadas).
const LISTAS_FIJAS = [
  { l: 'A', titulo: 'Estado gestión', valores: ESTADOS_GESTION, ancho: 16 },
  { l: 'B', titulo: 'Estado carga', valores: ESTADOS_CARGA, ancho: 14 },
  { l: 'C', titulo: 'Informe', valores: INFORMES, ancho: 12 },
  { l: 'D', titulo: 'Lado', valores: NOMBRES_LADO, ancho: 16 },
  { l: 'E', titulo: 'Tipo de línea', valores: LISTA_TIPOS_LINEA, ancho: 16 },
  // Listas de la hoja Códigos (las mismas del sistema).
  { l: 'F', titulo: 'Tipo (Códigos)', valores: TIPOS_CODIGO, ancho: 16 },
  { l: 'G', titulo: 'Segmento (Códigos)', valores: SEGMENTOS_CODIGO, ancho: 18 },
  { l: 'H', titulo: 'Clase (Códigos)', valores: CLASES_CODIGO, ancho: 14 },
];

const encabezado = (celda, titulo) => {
  celda.value = titulo;
  celda.font = { bold: true };
  celda.fill = relleno(COLOR.formula);
  celda.border = BORDES;
};

const hojaCatalogos = (libro) => {
  const hoja = libro.addWorksheet(H.C);
  const rangos = {};
  hoja.getCell('A1').value = 'Listas fijas del sistema (no modificar).';
  hoja.getCell('A1').font = { italic: true };
  LISTAS_FIJAS.forEach((b) => {
    hoja.getColumn(b.l).width = b.ancho;
    encabezado(hoja.getCell(`${b.l}${FILA_ENCABEZADO}`), b.titulo);
    b.valores.forEach((v, i) => { hoja.getCell(`${b.l}${PRIMERA + i}`).value = v; });
    rangos[b.l] = `${ref(H.C)}$${b.l}$${PRIMERA}:$${b.l}$${PRIMERA + b.valores.length - 1}`;
  });

  hoja.views = [{ state: 'frozen', ySplit: FILA_ENCABEZADO }];
  return { hoja, rangos };
};

// --- Hoja Códigos ------------------------------------------------------------------

// Campo de cada columna de datos (B a N) en los registros del catálogo.
const CAMPO_CODIGOS = {
  B: 'codigo', C: 'referencia', D: 'descriptorEmpresa', E: 'empresa', F: 'tipo', G: 'segmento', H: 'clase',
  I: 'descriptorAuto', J: 'precio', K: 'cx', L: 'observacion', M: 'registradoPor', N: 'estado',
};

const hojaCodigos = (libro, catalogo, totalFilas) => {
  const hoja = libro.addWorksheet(H.R);
  prepararHoja(hoja, COLUMNAS_REFERENCIAS.map((c) => ({ ...c, clase: c.automatica ? 'formula' : 'opcional' })), { conAyuda: false, congelarColumnas: 3 });
  hoja.getCell('A1').value = 'Maestro de Códigos. Se regenera con el script; también se puede pegar desde B3 el CSV completo de Maestros → Codigos → Con código → Exportar registros (las INACTIVAS no se usan). A, O y P son automáticas.';
  hoja.getCell('A1').font = { italic: true };
  const ultima = PRIMERA + totalFilas - 1;
  for (let r = PRIMERA; r <= ultima; r += 1) {
    const fila = hoja.getRow(r);
    const dato = catalogo.filas[r - PRIMERA];
    if (dato) {
      Object.entries(CAMPO_CODIGOS).forEach(([l, campo]) => {
        const v = l === 'N' ? (dato.estado || 'ACTIVO') : dato[campo];
        if (v !== undefined && v !== null && v !== '') fila.getCell(l).value = v;
      });
    }
    const usable = `AND(C${r}<>"",UPPER(TRIM(N${r}))<>"INACTIVO")`;
    fila.getCell('A').value = f(`IF(${usable},TRIM(C${r})&"|"&TRIM(E${r}),"")`);
    fila.getCell('O').value = f(`IF(${usable},TRIM(C${r}),"")`);
    fila.getCell('P').value = f(`IF(O${r}="","",COUNTIF($O$${PRIMERA}:$O$${ultima},O${r}))`);
    COLUMNAS_REFERENCIAS.forEach((c) => formatearCelda(fila.getCell(c.l), c, { bloqueada: !!c.automatica }));
  }
  const col = (l) => `${ref(H.R)}$${l}$${PRIMERA}:$${l}$${ultima}`;
  return { hoja, col };
};

// --- Hoja Empresas -----------------------------------------------------------------

// Mismas columnas que Maestros → Empresas → Exportar (NOMBRE, RUT, ESTADO).
// La columna NOMBRE alimenta el desplegable de Empresa en Gestiones.
const COLUMNAS_EMPRESAS = [
  { l: 'A', titulo: 'NOMBRE', ancho: 36 },
  { l: 'B', titulo: 'RUT', ancho: 14 },
  { l: 'C', titulo: 'ESTADO', ancho: 10 },
];

const hojaEmpresas = (libro, empresas, totalFilas) => {
  const hoja = libro.addWorksheet(H.E);
  prepararHoja(hoja, COLUMNAS_EMPRESAS.map((c) => ({ ...c, clase: 'opcional' })), { conAyuda: false, congelarColumnas: 1 });
  hoja.getCell('A1').value = 'Empresas activas (desplegable de Gestiones). Se regenera con el script; también se puede pegar desde A3 el archivo de Maestros → Empresas → Exportar (solo las ACTIVAS).';
  hoja.getCell('A1').font = { italic: true };
  const ultima = PRIMERA + totalFilas - 1;
  const registros = (empresas || []).map((e) => (typeof e === 'string' ? { nombre: e } : e));
  for (let r = PRIMERA; r <= ultima; r += 1) {
    const e = registros[r - PRIMERA];
    const fila = hoja.getRow(r);
    if (e) {
      fila.getCell('A').value = e.nombre;
      if (e.rut) fila.getCell('B').value = e.rut;
      fila.getCell('C').value = e.estado || 'ACTIVO';
    }
    COLUMNAS_EMPRESAS.forEach((c) => formatearCelda(fila.getCell(c.l), c, { bloqueada: false }));
  }
  return { nombres: `${ref(H.E)}$A$${PRIMERA}:$A$${ultima}` };
};

// --- Hoja Reporte Info --------------------------------------------------------------
// Una fila por admisión (la arma el script con reporteInfoDesdeFilas). Si se
// pegan a mano filas de la clínica (varias por admisión), la búsqueda toma
// la primera de cada admisión. H es la admisión como texto: Gestiones la
// busca así aunque la columna A se haya pegado como número.
const COLUMNAS_REPORTE_INFO = [
  { l: 'A', titulo: 'Admisión', ancho: 12, texto: true },
  { l: 'B', titulo: 'Fecha', ancho: 12, fecha: true },
  { l: 'C', titulo: 'Paciente', ancho: 30 },
  { l: 'D', titulo: 'Convenio', ancho: 22 },
  { l: 'E', titulo: 'Previsión (Isapre)', ancho: 18 },
  { l: 'F', titulo: '1° Cirujano', ancho: 24 },
  { l: 'G', titulo: 'Descripción', ancho: 44 },
  { l: 'H', titulo: 'Admisión (búsqueda)', ancho: 12, automatica: true },
];

const hojaReporteInfo = (libro, registros, totalFilas) => {
  const hoja = libro.addWorksheet(H.RI);
  prepararHoja(hoja, COLUMNAS_REPORTE_INFO.map((c) => ({ ...c, clase: c.automatica ? 'formula' : 'opcional' })), { conAyuda: false, congelarColumnas: 1 });
  hoja.getCell('A1').value = 'Admisiones de Reporte Info (una fila por admisión): de aquí se autocompletan Nombre, Convenio, Previsión, Médico y Descripción en Gestiones. Se regenera con el script (ver Instrucciones). H es automática.';
  hoja.getCell('A1').font = { italic: true };
  const ultima = PRIMERA + totalFilas - 1;
  for (let r = PRIMERA; r <= ultima; r += 1) {
    const fila = hoja.getRow(r);
    const d = registros[r - PRIMERA];
    if (d) {
      fila.getCell('A').value = d.admision;
      const fecha = isoAFechaExcel(d.fecha);
      if (fecha) fila.getCell('B').value = fecha;
      [['C', d.paciente], ['D', d.convenio], ['E', d.prevision], ['F', d.cirujano], ['G', d.descripcion]]
        .forEach(([l, v]) => { if (v) fila.getCell(l).value = v; });
    }
    fila.getCell('H').value = f(`IF(TRIM(A${r}&"")="","",TRIM(A${r}&""))`);
    COLUMNAS_REPORTE_INFO.forEach((c) => formatearCelda(fila.getCell(c.l), c, { bloqueada: !!c.automatica }));
  }
  return { col: (l) => `${ref(H.RI)}$${l}$${PRIMERA}:$${l}$${ultima}` };
};

// --- Hojas Centros y Recargos ---------------------------------------------------------
// Mismas columnas, en el mismo orden, que "Exportar a Excel / CSV" de
// Maestros → Centros y Maestros → Recargos (CentrosMaestros.jsx y
// RecargosMaestros.jsx): el archivo se pega desde A3. En Recargos, los rangos
// INACTIVOS no se usan y el orden no importa (la búsqueda es por desde-hasta).
const COLUMNAS_CENTROS = [
  { l: 'A', titulo: 'NOMBRE', ancho: 26 },
  { l: 'B', titulo: 'COMENTARIO', ancho: 24 },
  { l: 'C', titulo: 'ESTADO', ancho: 10 },
  { l: 'D', titulo: 'USAR_EN_GESTIONES', ancho: 12 },
];
const COLUMNAS_RECARGOS = [
  { l: 'A', titulo: 'DESDE', ancho: 14, pesos: true },
  { l: 'B', titulo: 'HASTA', ancho: 14, pesos: true },
  { l: 'C', titulo: 'VECES COSTO', ancho: 11 },
  { l: 'D', titulo: 'COMENTARIO', ancho: 20 },
  { l: 'E', titulo: 'ESTADO', ancho: 10 },
];

// Hoja de un maestro pegable: datos desde la fila 3, celdas desbloqueadas.
const hojaMaestro = (libro, nombreHoja, columnas, descripcion, filasDatos, totalFilas) => {
  const hoja = libro.addWorksheet(nombreHoja);
  prepararHoja(hoja, columnas.map((c) => ({ ...c, clase: 'opcional' })), { conAyuda: false, congelarColumnas: 1 });
  hoja.getCell('A1').value = descripcion;
  hoja.getCell('A1').font = { italic: true };
  const ultima = PRIMERA + totalFilas - 1;
  for (let r = PRIMERA; r <= ultima; r += 1) {
    const fila = hoja.getRow(r);
    const d = filasDatos[r - PRIMERA];
    columnas.forEach((c) => {
      const celda = fila.getCell(c.l);
      if (d && d[c.l] !== undefined && d[c.l] !== null && d[c.l] !== '') celda.value = d[c.l];
      formatearCelda(celda, c, { bloqueada: false });
    });
  }
  // Rango absoluto: se usa en fórmulas que se repiten fila a fila.
  return (l) => `${ref(nombreHoja)}$${l}$${PRIMERA}:$${l}$${ultima}`;
};

// Centros y recargos llegan como texto/objetos simples (modo exportación,
// ya filtrados) o como registros leídos del archivo exportado.
const filasCentros = (centros) => (centros || []).map((c) => (typeof c === 'string' ? { nombre: c } : c))
  .map((c) => ({ A: c.nombre, B: c.comentario, C: c.estado || 'ACTIVO', D: c.usarEnGestiones || 'SI' }));
const filasRecargos = (recargos) => (recargos || [])
  .map((x) => ({ A: x.desde, B: x.hasta, C: x.vecesCosto, D: x.comentario, E: x.estado || 'ACTIVO' }));

// --- Hojas Previsiones y Convenios -------------------------------------------------
// Mismas columnas que Maestros → Previsiones / Convenios → Exportar.
const COLUMNAS_NOMBRES = [
  { l: 'A', titulo: 'NOMBRE', ancho: 34 },
  { l: 'B', titulo: 'COMENTARIO', ancho: 24 },
  { l: 'C', titulo: 'ESTADO', ancho: 10 },
];

const hojaNombres = (libro, nombreHoja, descripcion, registros, totalFilas) => {
  const hoja = libro.addWorksheet(nombreHoja);
  prepararHoja(hoja, COLUMNAS_NOMBRES.map((c) => ({ ...c, clase: 'opcional' })), { conAyuda: false, congelarColumnas: 1 });
  hoja.getCell('A1').value = descripcion;
  hoja.getCell('A1').font = { italic: true };
  const ultima = PRIMERA + totalFilas - 1;
  for (let r = PRIMERA; r <= ultima; r += 1) {
    const fila = hoja.getRow(r);
    const d = registros[r - PRIMERA];
    if (d) {
      fila.getCell('A').value = d.nombre;
      if (d.comentario) fila.getCell('B').value = d.comentario;
      fila.getCell('C').value = d.estado || 'ACTIVO';
    }
    COLUMNAS_NOMBRES.forEach((c) => formatearCelda(fila.getCell(c.l), c, { bloqueada: false }));
  }
  return `${ref(nombreHoja)}$A$${PRIMERA}:$A$${ultima}`;
};

// --- Hoja Cargados -----------------------------------------------------------------
// La llena la macro "Mover cargados" (macros/MoverCargados.bas) con VALORES:
// una fila por línea de ítem, con la cabecera de su gestión repetida, más
// lo calculado (código, precio, recargo, venta…) y los auxiliares que hacen
// falta para cargarla en el sistema o devolverla a pendientes. El orden de
// estas columnas es el que usa la macro: si cambia aquí, cambia allá.
export const COLUMNAS_CARGADOS = [
  { titulo: 'Movido el', ancho: 17, fechaHora: true },
  { titulo: 'Movido por', ancho: 16 },
  { titulo: 'CLAVE', ancho: 34 },
  { titulo: 'Admisión', ancho: 12, texto: true },
  { titulo: 'Fecha', ancho: 12, fecha: true },
  { titulo: 'Empresa', ancho: 24 },
  { titulo: 'Nombre paciente', ancho: 26 },
  { titulo: 'Total cotización', ancho: 13, pesos: true },
  { titulo: 'Informe', ancho: 11 },
  { titulo: 'Centro', ancho: 13 },
  { titulo: 'Atributo', ancho: 11 },
  { titulo: 'Lado', ancho: 12 },
  { titulo: 'Observación', ancho: 24 },
  { titulo: 'Convenio', ancho: 14 },
  { titulo: 'Previsión', ancho: 12 },
  { titulo: 'Médico', ancho: 18 },
  { titulo: 'Descripción', ancho: 24 },
  { titulo: 'Estado sin ítems', ancho: 10 },
  { titulo: 'Estado gestión', ancho: 12 },
  { titulo: 'Registrado por (gestión)', ancho: 16 },
  { titulo: 'N° línea (original)', ancho: 9 },
  { titulo: 'Tipo de línea', ancho: 14 },
  { titulo: 'Línea padre (original)', ancho: 9 },
  { titulo: 'N° cotización', ancho: 13, texto: true },
  { titulo: 'Referencia', ancho: 20, texto: true },
  { titulo: 'Cantidad', ancho: 9 },
  { titulo: 'Lote', ancho: 12, texto: true },
  { titulo: 'Vencimiento', ancho: 12, fecha: true },
  { titulo: 'Estado carga', ancho: 12 },
  { titulo: 'Precio manual', ancho: 12, pesos: true },
  { titulo: 'Código', ancho: 12, texto: true },
  { titulo: 'Precio unitario', ancho: 12, pesos: true },
  { titulo: 'Empresa producto', ancho: 22 },
  { titulo: 'Clase', ancho: 10 },
  { titulo: 'Tipo', ancho: 12 },
  { titulo: 'Descriptor', ancho: 28 },
  { titulo: 'Veces costo', ancho: 8 },
  { titulo: 'Total ítem', ancho: 12, pesos: true },
  { titulo: 'Venta', ancho: 12, pesos: true },
  { titulo: 'Sin código (1 = sí)', ancho: 8 },
  { titulo: 'Recargo encontrado (1 = sí)', ancho: 9 },
  { titulo: 'Alerta', ancho: 28 },
  { titulo: 'Registrado por (ítem)', ancho: 16 },
  { titulo: 'ORIGEN', ancho: 13 },
];

// --- Hojas Solicitud Implantes y Resumen --------------------------------------------
// Las mismas columnas, en el mismo orden y con los mismos valores que las dos
// hojas del Excel de Solicitud de la app (construirFilasExcelSolicitud en
// shared/solicitud/useSolicitudGestionesData.js): fechas como texto
// dd-mm-aaaa, cantidades y montos como número, vacíos como "P". Las llena
// la macro "Mover cargados" (acumulativo) y "Devolver a pendientes" quita
// las filas de la gestión por la CLAVE. Al final, FECHA MOVIMIENTO y CLAVE
// (decisión del 23-11-2026): las columnas de la app quedan idénticas para
// copiarlas tal cual. Encabezado en la fila 1 y datos desde la 2, como el
// archivo de la app. El orden lo usa la macro: si cambia aquí, cambia allá.
export const COLUMNAS_SOLICITUD = [
  { titulo: 'ID', ancho: 11, texto: true },
  { titulo: 'PACIENTE', ancho: 28 },
  { titulo: 'MEDICO', ancho: 24 },
  { titulo: 'FECHA', ancho: 11, texto: true },
  { titulo: 'EMPRESA', ancho: 24 },
  { titulo: 'CODIGO', ancho: 12, texto: true },
  { titulo: 'DESCRIPCION', ancho: 36 },
  { titulo: 'CANTIDAD', ancho: 10 },
  { titulo: 'PRECIO', ancho: 12 },
  { titulo: 'ATRIBUTO', ancho: 13 },
  { titulo: 'FECHA REGISTRO', ancho: 14, texto: true },
  { titulo: 'FECHA CARGA', ancho: 12, texto: true },
  { titulo: 'N° COTIZACION', ancho: 14, texto: true },
  { titulo: 'FECHA INGRESO', ancho: 13, texto: true },
  { titulo: 'LOTE', ancho: 12, texto: true },
  { titulo: 'VENCIMIENTO', ancho: 13, texto: true },
  { titulo: 'FECHA MOVIMIENTO', ancho: 16, fecha: true },
  { titulo: 'CLAVE', ancho: 34 },
];
export const COLUMNAS_RESUMEN = [
  { titulo: 'Ingreso', ancho: 11, texto: true },
  { titulo: 'Area', ancho: 14 },
  { titulo: 'Previsión', ancho: 16 },
  { titulo: 'Id', ancho: 11, texto: true },
  { titulo: 'Cód', ancho: 12, texto: true },
  { titulo: 'Cant', ancho: 7 },
  { titulo: 'Venta', ancho: 12 },
  { titulo: 'Médico', ancho: 24 },
  { titulo: 'Fecha', ancho: 11, texto: true },
  { titulo: 'Descripción', ancho: 36 },
  { titulo: 'Estado', ancho: 12 },
  { titulo: 'FECHA MOVIMIENTO', ancho: 16, fecha: true },
  { titulo: 'CLAVE', ancho: 34 },
];

const hojaSolicitud = (libro, nombre, columnas) => {
  const hoja = libro.addWorksheet(nombre);
  hoja.columns = columnas.map((c) => ({ width: c.ancho }));
  const enc = hoja.getRow(1);
  columnas.forEach((c, i) => {
    const celda = enc.getCell(i + 1);
    celda.value = c.titulo;
    celda.font = { bold: true };
    // Las dos agregadas (FECHA MOVIMIENTO y CLAVE) en gris: no son del archivo de la app.
    celda.fill = relleno(i >= columnas.length - 2 ? COLOR.formula : COLOR.opcional);
    celda.border = BORDES;
    // Formato de columna, que heredan las filas que escribe la macro: texto
    // para que "102030" y "23-11-2026" no se conviertan en número o fecha.
    const col = hoja.getColumn(i + 1);
    if (c.texto) col.numFmt = '@';
    if (c.fecha) col.numFmt = FORMATO_FECHA;
  });
  hoja.views = [{ state: 'frozen', ySplit: 1 }];
  hoja.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columnas.length } };
  return hoja;
};

const hojaCargados = (libro) => {
  const hoja = libro.addWorksheet(H.CARG);
  hoja.columns = COLUMNAS_CARGADOS.map((c) => ({ width: c.ancho }));
  const enc = hoja.getRow(FILA_ENCABEZADO);
  COLUMNAS_CARGADOS.forEach((c, i) => {
    const celda = enc.getCell(i + 1);
    celda.value = c.titulo;
    celda.font = { bold: true };
    celda.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    celda.fill = relleno(i < 20 ? COLOR.opcional : COLOR.formula);
    celda.border = BORDES;
    // Formato de columna: lo heredan las filas que escriba la macro.
    const col = hoja.getColumn(i + 1);
    if (c.fechaHora) col.numFmt = 'dd-mm-yyyy hh:mm';
    if (c.fecha) col.numFmt = FORMATO_FECHA;
    if (c.pesos) col.numFmt = FORMATO_PESOS;
    if (c.texto) col.numFmt = '@';
  });
  const ayuda = hoja.getCell('E1');
  ayuda.value = 'Gestiones ya CARGADO (una fila por línea, como valores). Las mueve el botón "Mover cargados" de Gestiones. Para devolver una: seleccione cualquier celda de sus filas y use "Devolver a pendientes".';
  ayuda.font = { italic: true, size: 9, color: { argb: 'FF595959' } };
  hoja.getRow(FILA_AYUDA).height = 30;
  enc.height = 42;
  hoja.views = [{ state: 'frozen', xSplit: 4, ySplit: FILA_ENCABEZADO }];
  hoja.autoFilter = { from: { row: FILA_ENCABEZADO, column: 1 }, to: { row: FILA_ENCABEZADO, column: COLUMNAS_CARGADOS.length } };
  return hoja;
};

// --- Hoja Gestiones --------------------------------------------------------------

// Columna de Reporte Info de cada dato que se autocompleta.
const RI_COLUMNA = { AG: 'C', AH: 'D', AI: 'E', AJ: 'F', AK: 'G' };

// Lista (Previsiones/Convenios) con al menos un nombre: si la lista está
// vacía no se avisa "fuera de la lista".
const fueraDeLista = (celda, lista) => `AND(${celda}<>"",COUNTIF(${lista},"?*")>0,COUNTIF(${lista},${celda})=0)`;

const formulasGestion = (r, x) => ({
  A: f(`IF(OR(B${r}="",C${r}="",D${r}=""),"",IFERROR(TRIM(B${r})&"|"&TRIM(D${r})&"|"&YEAR(C${r})&"-"&TEXT(MONTH(C${r}),"00")&"-"&TEXT(DAY(C${r}),"00"),"FECHA INVÁLIDA"))`),
  // B&C&D (no E): Nombre se autocompleta y no indica que la fila se usó.
  V: f(`IF(B${r}&C${r}&D${r}="","","CONTINGENCIA")`),
  ...formulasEstadoGestion(r, x),
  // Autocompletado desde Reporte Info: la admisión se busca como texto (la
  // columna H de Reporte Info la convierte), igual que el sistema busca la
  // admisión en Reporte Info y toma su primer registro.
  AF: f(`IF(TRIM(B${r})="","",IFERROR(MATCH(TRIM(B${r}),${x.riBusqueda},0),""))`),
  ...Object.fromEntries(Object.entries(RI_COLUMNA).map(([aux, colRI]) => [aux, f(`IF(AF${r}="","",INDEX(${x.ri(colRI)},AF${r})&"")`)])),
  ...Object.fromEntries(Object.entries(AUTOCOMPLETADO_GESTION).map(([visible, aux]) => [visible, f(`${aux}${r}`)])),
  AE: f(`IF(TRIM(B${r})="","",IF(AF${r}="","Admisión no está en Reporte Info · ","")`
    + `&IF(${fueraDeLista(`L${r}`, x.convenios)},"Convenio fuera de la lista · ","")`
    + `&IF(${fueraDeLista(`M${r}`, x.previsiones)},"Previsión fuera de la lista · ",""))`),
});

// Estado, conteos y diferencia: iguales para filas del sistema y nuevas
// (a una gestión del sistema se le pueden agregar ítems en la caída).
const formulasEstadoGestion = (r, x) => ({
  R: f(`IF(A${r}="","",COUNTIF(${x.iB},A${r}))`),
  Y: f(`IF(N(R${r})=0,"",INDEX(${x.iAA},MATCH(A${r},${x.iB},0)))`),
  Z: f(`IF(N(R${r})=0,0,COUNTIFS(${x.iB},A${r},${x.iAG},1))`),
  Q: f(`IF(A${r}="","",IF(N(R${r})=0,IF(P${r}="","AGENDADO",P${r}),IF(Z${r}>0,"INCOMPLETO",IF(COUNTIFS(${x.iB},A${r},${x.iAA},Y${r})=R${r},Y${r},"INCOMPLETO"))))`),
  S: f(`IF(A${r}="","",SUMIF(${x.iB},A${r},${x.iS}))`),
  T: f(`IF(OR(A${r}="",F${r}=""),"",F${r}-S${r})`),
});

const valoresGestionSistema = (g) => ({
  A: g.clave, B: g.admision, C: g.fecha, D: g.empresa, E: g.nombre, F: g.totalCotizacion,
  G: g.informe, H: g.centro, I: g.atributo, J: g.lado, K: g.observacion,
  L: g.convenio, M: g.prevision, N: g.medico, O: g.descripcion,
  P: g.estado, U: g.solicitud, V: 'SISTEMA', W: g.registradoPor, X: g.idSistema,
});

// --- Hoja Ítems ------------------------------------------------------------------

// Columnas comunes a todas las filas (también las del sistema): tipo,
// estado, empresa de la gestión, padre, alerta.
const formulasItemComunes = (r, x) => {
  const enLineas = (l) => `$${l}$${PRIMERA}:$${l}$${x.ultimaItem}`;
  const esHija = `OR(Y${r}="CONTENIDO PAD",Y${r}="LOTE ADICIONAL")`;
  const padreInvalido = `IF(${esHija},IF(AF${r}="",TRUE,OR(INDEX(${enLineas('B')},AF${r})<>B${r},INDEX(${enLineas('Y')},AF${r})<>IF(Y${r}="CONTENIDO PAD","PAD PADRE","NORMAL"))),D${r}<>"")`;
  return {
    Y: f(`IF(B${r}&C${r}&E${r}&F${r}&G${r}="","",IF(C${r}="","NORMAL",C${r}))`),
    Z: f(`IF(Y${r}="","",IF(OR(Y${r}="PAD PADRE",Y${r}="CONTENIDO PAD"),"PAD",IF(J${r}="","PENDIENTE",J${r})))`),
    AA: f(`IF(Z${r}="","",IF(OR(Z${r}="CARGADO",Z${r}="PAD",Z${r}="SIN CARGO"),"CARGADO",Z${r}))`),
    AB: f(`IF(B${r}="","",IFERROR(INDEX(${x.gD},MATCH(B${r},${x.gA},0)),""))`),
    AF: f(`IF(D${r}="","",IFERROR(MATCH(D${r},${enLineas('A')},0),""))`),
    AJ: f(`IF(AND(OR(Y${r}="NORMAL",Y${r}="PAD PADRE"),AG${r}=0,N${r}<>"",AB${r}<>""),IF(UPPER(TRIM(N${r}))<>UPPER(TRIM(AB${r})),1,0),0)`),
    U: f(`IF(Y${r}="","",`
      + `IF(B${r}="","Falta CLAVE · ",IF(COUNTIF(${x.gA},B${r})=0,"CLAVE no existe · ",""))`
      + `&IF(E${r}="","Falta N° cotización · ","")`
      + `&IF(F${r}="","Falta referencia · ","")`
      + `&IF(N(G${r})<=0,"Cantidad inválida · ","")`
      // Una ambigua tampoco tiene código: se avisa solo como ambigua.
      + `&IF(AND(AG${r}=1,AE${r}=0),"Sin código · ","")`
      + `&IF(AE${r}=1,"Referencia ambigua: revise la empresa · ","")`
      + `&IF(AJ${r}=1,"Empresa no coincide · ","")`
      + `&IF(AND(AG${r}=0,AI${r}=0),"Sin rango de recargo · ","")`
      + `&IF(${padreInvalido},"Línea padre inválida · ","")`
      + `&IF(AND(Y${r}="LOTE ADICIONAL",AF${r}<>""),IF(SUMIFS(${enLineas('G')},${enLineas('D')},D${r},${enLineas('Y')},"LOTE ADICIONAL")>INDEX(${enLineas('G')},AF${r}),"Lotes superan la cantidad · ",""),"")`
      + ')'),
  };
};

// Columnas del catálogo y montos (solo filas nuevas: las del sistema llevan
// lo guardado).
const formulasItemNuevas = (r, x) => {
  const sinCobro = `OR(Y${r}="CONTENIDO PAD",Y${r}="LOTE ADICIONAL",Z${r}="SIN CARGO")`;
  const delCatalogo = (l) => `IF(OR(Y${r}="",AD${r}=""),"",INDEX(${x.rCol(l)},AD${r})&"")`;
  return {
    ...formulasItemComunes(r, x),
    // Referencia con ~ * ? escapados (COINCIDIR los toma como comodines).
    AC: f(`SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(TRIM(F${r}),"~","~~"),"*","~*"),"?","~?")`),
    // Fila en el catálogo: referencia + empresa de la gestión; si no hay,
    // la referencia sola cuando es única.
    AD: f(`IF(F${r}="","",IFERROR(MATCH(AC${r}&"|"&TRIM(AB${r}),${x.rCol(REF.clave)},0),IFERROR(IF(INDEX(${x.rCol(REF.repeticiones)},MATCH(AC${r},${x.rCol(REF.referencia)},0))=1,MATCH(AC${r},${x.rCol(REF.referencia)},0),""),"")))`),
    AE: f(`IF(AND(F${r}<>"",AD${r}=""),IF(ISNUMBER(MATCH(AC${r},${x.rCol(REF.referencia)},0)),1,0),0)`),
    AG: f(`IF(AND(OR(Y${r}="NORMAL",Y${r}="PAD PADRE"),Z${r}<>"SIN CARGO",L${r}=""),1,0)`),
    // Rangos de recargo que contienen el precio (sin los INACTIVOS). Con
    // CONTAR.SI.CONJUNTO no importa el orden en que se peguen los rangos.
    AH: f(`IF(OR(Y${r}="",M${r}=""),"",COUNTIFS(${x.recargo.desde},"<="&M${r},${x.recargo.hasta},">="&M${r},${x.recargo.estado},"<>INACTIVO"))`),
    AI: f(`IF(Y${r}="",1,IF(${sinCobro},1,IF(N(AH${r})>=1,1,0)))`),
    L: f(`IF(Y${r}="","",IF(${sinCobro},"${CODIGO_SIN_OC}",IF(AD${r}="","",INDEX(${x.rCol(REF.codigo)},AD${r})&"")))`),
    // El precio puede venir como texto si se pegó desde un CSV: *1 lo convierte.
    M: f(`IF(Y${r}="","",IF(${sinCobro},0,IF(K${r}<>"",K${r},IF(AD${r}="",0,IFERROR(INDEX(${x.rCol(REF.precio)},AD${r})*1,0)))))`),
    N: f(delCatalogo(REF.empresa)),
    O: f(delCatalogo(REF.clase)),
    P: f(delCatalogo(REF.tipo)),
    Q: f(delCatalogo(REF.descriptor)),
    R: f(`IF(Y${r}="","",IF(${sinCobro},1,IF(N(AH${r})>=1,SUMIFS(${x.recargo.veces},${x.recargo.desde},"<="&M${r},${x.recargo.hasta},">="&M${r},${x.recargo.estado},"<>INACTIVO")/AH${r},1)))`),
    S: f(`IF(Y${r}="","",M${r}*G${r})`),
    T: f(`IF(Y${r}="","",M${r}*R${r}*G${r})`),
    V: f(`IF(Y${r}="","","CONTINGENCIA")`),
  };
};

const valoresItemSistema = (it) => ({
  A: it.linea, B: it.clave, C: it.tipo, D: it.lineaPadre, E: it.numCotizacion, F: it.referencia,
  G: it.cantidad, H: it.lote, I: it.vencimiento, J: it.estadoCarga,
  L: it.codigo, M: it.precio, N: it.empresaVinculada, O: it.clase, P: it.tipoVinculado, Q: it.descriptorAuto,
  R: it.vecesCosto, V: 'SISTEMA', X: it.idSistema,
  // Auxiliares con lo guardado (no se recalculan contra el catálogo de hoy).
  AC: '', AD: '', AE: 0, AG: it.sinCodigo ? 1 : 0, AH: '', AI: it.recargoEncontrado || it.sinCodigo ? 1 : 0,
});

// --- Instrucciones ---------------------------------------------------------------

// Origen de los catálogos cargados por el script (plantilla).
const lineaCatalogo = (nombre, o) => {
  if (!o) return `${nombre}: vacío (se puede pegar a mano; ver "ACTUALIZAR LOS CATÁLOGOS").`;
  // Cargado desde un archivo que no es la exportación oficial de la app.
  if (o.provisional) return `${nombre}: ${o.cargadas} cargados de forma PROVISIONAL. Deben reemplazarse por la exportación oficial de la app (ver "ACTUALIZAR LOS CATÁLOGOS").`;
  return `${nombre}: ${o.cargadas} cargadas del archivo ${o.archivo}${o.fecha ? ` (exportado el ${o.fecha})` : ''}${o.detalle ? `; ${o.detalle}` : ''}.`;
};

// Encabezado: la plantilla (catálogos del archivo exportado) o la
// exportación del sistema (con datos y catálogos de Firestore).
const encabezadoInstrucciones = (d) => (d.plantilla ? [
  ['RESPALDO DE CONTINGENCIA — IMPLANTES (PLANTILLA)', 'titulo'],
  [`Plantilla generada: ${d.generadoEl}. Filas preparadas: ${d.tamano.gestionesLibres} gestiones y ${d.tamano.itemsLibres} ítems.`],
  ['Catálogos actualizados al →', 'fecha'],
  [lineaCatalogo('Reporte Info', d.origenCatalogos?.reporteInfo)],
  [lineaCatalogo('Códigos', d.origenCatalogos?.codigos)],
  [lineaCatalogo('Empresas', d.origenCatalogos?.empresas)],
  [lineaCatalogo('Centros', d.origenCatalogos?.centros)],
  [lineaCatalogo('Rangos de recargo', d.origenCatalogos?.recargos)],
  [lineaCatalogo('Previsiones', d.origenCatalogos?.previsiones)],
  [lineaCatalogo('Convenios', d.origenCatalogos?.convenios)],
  [''],
  ['PARA QUÉ SIRVE', 'seccion'],
  ['Si el sistema no está disponible, registre aquí las gestiones y sus ítems. Cuando vuelva, lo registrado se carga en el sistema (ORIGEN = CONTINGENCIA).'],
] : [
  ['RESPALDO DE CONTINGENCIA — IMPLANTES', 'titulo'],
  [`Generado: ${d.generadoEl} (hora de Chile)`],
  [`Período abierto: ${d.periodoTexto}. Gestiones exportadas: mes ${d.mesExportado}.`],
  [`Catálogo de referencias actualizado al: ${d.generadoEl} (${d.catalogo.resumen.usables} referencias; sin ${d.catalogo.resumen.inactivas} inactivas).`],
  [`Filas exportadas: ${d.filasGestiones.length} gestiones y ${d.filasItems.length} ítems. Filas libres: ${d.tamano.gestionesLibres} gestiones y ${d.tamano.itemsLibres} ítems.`],
  [''],
  ['PARA QUÉ SIRVE', 'seccion'],
  ['Si el sistema no está disponible, registre aquí las gestiones y sus ítems. Cuando vuelva, este archivo se reimporta: solo se cargan las filas con ORIGEN = CONTINGENCIA.'],
  ['Las filas grises con ORIGEN = SISTEMA son una foto del sistema al generar el archivo: sirven de consulta y solo se pueden cambiar sus celdas blancas (ver "Cambios en lo que ya estaba en el sistema").'],
]);

const MACROS_Y_BOTONES = [
  ['HABILITAR LAS MACROS (para los botones)', 'seccion'],
  ['El archivo es .xlsm (con macros). Sin macros todo lo demás funciona igual (fórmulas, listas y alertas); solo los botones no.'],
  ['1. Al abrirlo aparece una barra amarilla "ADVERTENCIA DE SEGURIDAD: Las macros se han deshabilitado": haga clic en "Habilitar contenido".'],
  ['2. Si en cambio aparece una barra roja "RIESGO DE SEGURIDAD: Microsoft ha bloqueado la ejecución de macros…" (archivo que llegó por correo, descarga o internet): cierre Excel, haga clic derecho en el archivo → Propiedades → pestaña General → marque "Desbloquear" → Aceptar, y vuelva a abrirlo.'],
  ['3. Si el archivo está en una carpeta de red y Excel lo sigue bloqueando: Archivo → Opciones → Centro de confianza → Configuración del Centro de confianza → Ubicaciones de confianza → "Agregar nueva ubicación" con esa carpeta (marque "Las subcarpetas de esta ubicación también son de confianza").'],
  [''],
  ['BOTONES', 'seccion'],
  ['"Mover cargados" (hoja Ítems, arriba a la izquierda): busca las gestiones de contingencia con Estado = CARGADO (todas sus líneas CARGADO, PAD o SIN CARGO), le dice cuántas gestiones e ítems va a mover (y cuántos ítems tienen alerta), le pide su nombre y que confirme. Las copia a la hoja Cargados como valores, con fecha/hora y su nombre, y limpia esas filas en Gestiones e Ítems: las fórmulas quedan listas para volver a usarlas.'],
  ['"Devolver a pendientes" (hoja Cargados, arriba a la izquierda): seleccione cualquier celda de una fila de la gestión que quiere devolver y presione el botón. Confirma y la vuelve a filas libres de Gestiones e Ítems (con N° de línea nuevos; la Línea padre se ajusta sola) y la quita de Cargados. No se puede si en Gestiones ya hay una gestión con la misma CLAVE.'],
  ['Después de usar un botón, guarde el archivo (Ctrl+G). Los botones no se pueden deshacer con Ctrl+Z: para revertir, use el botón contrario.'],
  [''],
  ['HOJAS SOLICITUD IMPLANTES Y RESUMEN', 'seccion'],
  ['Son las mismas dos hojas del Excel que descarga el sistema al hacer la Solicitud: mismas columnas, mismo orden y mismos valores (fechas como texto dd-mm-aaaa). Cada vez que se presiona "Mover cargados" se agregan al final las líneas de las gestiones movidas; nunca se borra lo anterior. FECHA INGRESO, Ingreso y FECHA REGISTRO llevan la fecha del movimiento.'],
  ['Al final tienen dos columnas que no están en el archivo del sistema: FECHA MOVIMIENTO (el día en que se movió) y CLAVE (la gestión). Para copiar al sistema, use las columnas anteriores. "Devolver a pendientes" quita de estas hojas las filas de esa gestión.'],
  ['No son la Solicitud: no marcan nada como SOLICITADO ni imputan. La Solicitud se hace en el sistema cuando vuelva.'],
  [''],
  ['HOJA CARGADOS', 'seccion'],
  ['Una fila por línea de ítem, con los datos de su gestión repetidos: es lo que hay que ingresar al sistema cuando vuelva (cabecera de la gestión, cada línea con su código, precio, recargo, total y venta, y quién lo registró y movió). Está protegida para no modificarla por error; use los filtros para verla por gestión.'],
];

// Cómo actualizar los catálogos (solo plantilla).
const ACTUALIZAR_CATALOGOS = [
  ['ACTUALIZAR LOS CATÁLOGOS (con el sistema funcionando)', 'seccion'],
  ['REPORTE INFO: el archivo es el Excel de la clínica que se importa en el sistema (Documentos → Reportes Info → Importar). El botón "Exportar" de Reportes Info no trae Convenio: sirve, pero Convenio queda vacío. Para pegarlo a mano en la hoja Reporte Info (desde A3, una fila por admisión), copie columna por columna: Admisión, Fecha, Paciente, Convenio, Isapre (en "Previsión (Isapre)"), 1° Cirujano y Descripción.'],
  ['PREVISIONES y CONVENIOS (hojas Previsiones y Convenios, celda A3): Maestros → Previsiones (o Convenios) → botón de configuración → "Exportar a Excel / CSV". Filtre ESTADO = ACTIVO y copie NOMBRE, COMENTARIO y ESTADO.'],
  ['Lo normal es que el encargado regenere la plantilla con los archivos nuevos (ver docs/respaldo-contingencia-implantes.md, "Regenerar con archivos nuevos"). Si hay que hacerlo a mano en esta planilla:'],
  ['Pegue siempre con "Pegar valores" (Ctrl+Alt+V → Valores), SIN la fila de encabezados, y compruebe que las columnas del archivo son las mismas y en el mismo orden que la fila 2 donde pega. Para reemplazar un catálogo: seleccione los datos anteriores (sin encabezados), Supr, y pegue el nuevo.'],
  ['En la hoja Códigos, EMPRESA tiene la lista de la hoja Empresas, y TIPO, SEGMENTO y CLASE las listas del sistema (hoja Catálogos). Como pegar borra los desplegables, un valor que no está en su lista se pinta de rojo igual: revíselo en el sistema.'],
  ['1. CÓDIGOS (hoja Códigos, celda B3): Maestros → Codigos → pestaña "Con código" → "Importar / Exportar" → "Exportar registros". Abra el CSV, copie desde A2 hasta la última fila y última columna (CODIGO … ESTADO) y pegue en Códigos!B3. Las INACTIVAS se ignoran solas. El CSV trae solo las columnas que el usuario puede ver: debe traer las 13.'],
  ['2. EMPRESAS (hoja Empresas, celda A3): Maestros → Empresas → botón de configuración (Importar/Exportar) → "Exportar a Excel / CSV". En el archivo, filtre ESTADO = ACTIVO y copie NOMBRE, RUT y ESTADO.'],
  ['3. CENTROS (hoja Centros, celda A3): Maestros → Centros → configuración → "Exportar a Excel / CSV". Filtre ESTADO = ACTIVO y USAR_EN_GESTIONES = SI y copie las 4 columnas.'],
  ['4. RECARGOS (hoja Recargos, celda A3): Maestros → Recargos → configuración → "Exportar a Excel / CSV". Copie las 5 columnas (DESDE, HASTA, VECES COSTO, COMENTARIO, ESTADO); los INACTIVOS se ignoran solos y el orden no importa.'],
  ['5. Escriba la fecha en "Catálogos actualizados al" (arriba) y guarde.'],
];

const textoInstrucciones = (d) => [
  ...encabezadoInstrucciones(d),
  [''],
  ['COLORES DE LOS ENCABEZADOS', 'seccion'],
  ['Amarillo: obligatorio. Azul: opcional. Gris: automático (no se escribe). Una celda obligatoria vacía en una fila nueva se pinta de rojo.'],
  [''],
  ['HOJA GESTIONES (una fila por admisión + empresa + fecha)', 'seccion'],
  ['1. Escriba Admisión (solo dígitos), Fecha (dd-mm-aaaa) y elija la Empresa (lista de la hoja Empresas). La CLAVE se arma sola: admisión|empresa|AAAA-MM-DD.'],
  ['   Al escribir la admisión, Nombre, Convenio, Previsión, Médico y Descripción se completan solos desde la hoja Reporte Info, como en el sistema (la Previsión es la columna "Isapre" de Reporte Info).'],
  ['   Si la admisión no está en Reporte Info, la Admisión se pinta naranja y la columna Alerta dice "Admisión no está en Reporte Info": escriba esos datos a mano. Convenio y Previsión tienen lista; si escribe un valor que no está, Excel pregunta y Alerta lo avisa, pero se puede usar.'],
  ['   También se puede escribir encima de un dato autocompletado: queda en letra azul cursiva y solo cambia esa celda (las demás filas siguen autocompletando). Para volver al dato de Reporte Info, copie la misma celda de una fila de abajo y péguela.'],
  ['2. Complete Registrado por (su nombre) y, si los tiene, Nombre, Total cotización y los demás datos.'],
  ['3. La misma admisión con otra empresa u otra fecha es otra fila. Una CLAVE repetida se pinta de rojo: no la duplique.'],
  ['4. Estado se calcula solo: con alguna línea sin código = INCOMPLETO; si todas las líneas tienen el mismo estado de carga, ese estado (PAD y SIN CARGO cuentan como CARGADO); si se mezclan, INCOMPLETO. Sin ítems: el "Estado sin ítems" (vacío = AGENDADO).'],
  ['5. Diferencia en rojo: la suma de los ítems no cuadra con el total de la cotización.'],
  [''],
  ['HOJA ÍTEMS (una fila por línea)', 'seccion'],
  ['1. Elija la CLAVE de la gestión (lista). Primero debe existir la gestión en la hoja Gestiones.'],
  ['2. Escriba N° cotización, Referencia y Cantidad. Igual que en el sistema, al escribir la referencia se completan desde la hoja Códigos el código, precio, empresa, clase, tipo y descriptor, y se calculan veces costo (según la hoja Recargos), total y venta. Si la referencia existe para varias empresas, se usa la de la empresa de la gestión.'],
  ['3. Una referencia que no está en Códigos se puede escribir igual (Excel avisa): queda "Sin código" y la gestión INCOMPLETO, como en el sistema. Si conoce el precio, escríbalo en Precio manual.'],
  ['4. Tipos de línea:'],
  ['   NORMAL (o vacío): una referencia común.'],
  ['   PAD PADRE: la referencia del PAD (clase PAD). Lote y vencimiento no se usan.'],
  ['   CONTENIDO PAD: cada producto dentro del PAD. En "Línea padre" ponga el N° de línea del PAD PADRE. No se cobra (código "No lleva OC", precio 0).'],
  ['   LOTE ADICIONAL: cuando una referencia viene en varios lotes. La línea NORMAL lleva la cantidad TOTAL y su lote; cada LOTE ADICIONAL indica cuántas unidades son de otro lote, con "Línea padre" = N° de la línea NORMAL. No se cobra de nuevo; la suma de los lotes adicionales no puede superar la cantidad total.'],
  ['   Ejemplo PAD: línea 120 PAD PADRE "PAD-RODILLA"; líneas 121 y 122 CONTENIDO PAD con Línea padre 120.'],
  ['5. La columna Alerta debe quedar vacía. Avisos: Falta CLAVE / CLAVE no existe · Falta N° cotización · Falta referencia · Cantidad inválida · Sin código · Referencia ambigua (la referencia existe para varias empresas y ninguna es la de la gestión) · Empresa no coincide · Sin rango de recargo · Línea padre inválida · Lotes superan la cantidad.'],
  ...(d.plantilla ? [
    ['6. Si el ítem es de una gestión que ya estaba en el sistema, regístrela igual en la hoja Gestiones (misma admisión, empresa y fecha) y cargue aquí solo lo nuevo.'],
  ] : [
    ['6. Se pueden agregar ítems a una gestión exportada del sistema eligiendo su CLAVE.'],
    [''],
    ['CAMBIOS EN LO QUE YA ESTABA EN EL SISTEMA (filas grises)', 'seccion'],
    ['En las filas del sistema solo se pueden cambiar las celdas blancas: en Gestiones, Informe, Lado y Observación; en Ítems, Estado carga, Lote, Vencimiento y Cantidad. Lo demás está bloqueado.'],
    ['Algunas líneas no dejan cambiar todo, igual que en el sistema: en PAD y en líneas sin código no se cambia el Estado carga; en el PAD PADRE no se cambian Lote ni Vencimiento.'],
    ['La celda cambiada se pinta ámbar y la columna MODIFICADO pasa a SÍ. Para deshacer un cambio, vuelva a escribir el valor original. Al reimportar se aplican solo las filas con MODIFICADO = SÍ; las gestiones que ya estaban SOLICITADAS no se tocan y quedan en el informe para hacerlas a mano.'],
  ]),
  [''],
  ...MACROS_Y_BOTONES,
  [''],
  ['QUÉ NO HACER', 'seccion'],
  [`No cambie los N° de línea.${d.plantilla ? '' : ' No borre filas del sistema.'} No haga la Solicitud ni la imputación durante la caída: se hacen en el sistema después de cargar lo registrado.`],
  ['No ordene las hojas (están protegidas para no romper fórmulas); use los filtros.'],
  ['Las hojas están protegidas con contraseña y las fórmulas están ocultas: al seleccionar una celda calculada se ve solo el resultado. Se escribe solo en las celdas que no son grises; los filtros, los desplegables y los botones funcionan igual.'],
  [''],
  ['MANTENCIÓN (solo el encargado, después de cada regeneración): bloquear el código de las macros', 'seccion'],
  ['Las macros guardan la contraseña de las hojas. Para que no se vea con Alt+F11, después de regenerar el archivo bloquee el proyecto VBA (Excel no permite hacerlo automáticamente):'],
  ["   1. Abra respaldo_implantes.xlsm en Excel (no hace falta habilitar las macros) y presione Alt+F11."],
  ["   2. En el Explorador de proyectos (Ctrl+R si no se ve), haga clic derecho en \"VBAProject (respaldo_implantes.xlsm)\" → \"Propiedades de VBAProject...\"."],
  ["   3. Pestaña \"Protección\": marque \"Bloquear proyecto para visualización\" y escriba la contraseña de las hojas (variable RESPALDO_IMPLANTES_CLAVE_HOJAS) en \"Contraseña\" y en \"Confirmar contraseña\". Aceptar."],
  ["   4. Cierre el editor, guarde (Ctrl+G) y cierre Excel. El bloqueo se aplica al volver a abrir."],
  ["   5. Compruebe: abra el archivo, Alt+F11 y doble clic en \"VBAProject\": debe pedir contraseña."],
  [''],
  ['PROGRAMA', 'seccion'],
  ['Ábralo con Microsoft Excel: es el único probado.'],
  [''],
  ['SEGURIDAD', 'seccion'],
  ['Una vez usado contiene datos de pacientes: póngale contraseña (Archivo → Información → Proteger libro → Cifrar con contraseña). No lo envíe por correo ni WhatsApp, no lo deje en Descargas ni en el escritorio y no lo imprima. Al terminar la contingencia y cargar lo registrado, borre las copias locales.'],
  ...(d.plantilla ? [[''], ...ACTUALIZAR_CATALOGOS] : []),
];

const hojaInstrucciones = (libro, datos) => {
  const hoja = libro.addWorksheet(H.INS);
  hoja.getColumn('A').width = 150;
  hoja.getColumn('B').width = 16;
  textoInstrucciones(datos).forEach(([t, estilo], i) => {
    const c = hoja.getCell(`A${i + 1}`);
    c.value = t;
    c.alignment = { wrapText: true, vertical: 'top' };
    if (estilo === 'titulo') c.font = { bold: true, size: 14 };
    if (estilo === 'seccion') { c.font = { bold: true }; c.fill = relleno(COLOR.opcional); }
    if (estilo === 'fecha') {
      // Fecha de los catálogos: la del archivo exportado; editable si se
      // pegan a mano.
      c.font = { bold: true };
      c.alignment = { horizontal: 'right' };
      const fecha = hoja.getCell(`B${i + 1}`);
      if (datos.fechaCatalogos) fecha.value = datos.fechaCatalogos;
      fecha.numFmt = FORMATO_FECHA;
      fecha.fill = relleno(COLOR.obligatorio);
      fecha.border = BORDES;
      fecha.protection = { locked: false };
    }
  });
  return hoja;
};

// --- Libro --------------------------------------------------------------------------

const OPCIONES_PROTECCION = {
  selectLockedCells: true, selectUnlockedCells: true, autoFilter: true,
  formatColumns: true, formatRows: true, sort: false, insertRows: false, deleteRows: false,
};

/**
 * datos: {
 *   generadoEl, periodoTexto, mesExportado,
 *   filasGestiones, filasItems, ultimaLinea,     (filasDesdeGestiones)
 *   catalogo, empresas, centros, recargos,      (catálogos)
 *   tamano: { gestionesLibres, itemsLibres }
 *   claveHojas: contraseña de protección de las hojas (variable de entorno)
 *   plantilla: true en la plantilla (sin datos del sistema)
 *   origenCatalogos, fechaCatalogos: de dónde salieron (plantilla)
 * }
 */
export const construirLibro = async (datosEntrada) => {
  const datos = {
    ...datosEntrada,
    filasCatalogos: dimensionarCatalogos({
      referencias: datosEntrada.catalogo.filas.length,
      empresas: datosEntrada.empresas.length,
      centros: datosEntrada.centros.length,
      recargos: datosEntrada.recargos.length,
      reporteInfo: (datosEntrada.reporteInfo || []).length,
      previsiones: (datosEntrada.previsiones || []).length,
      convenios: (datosEntrada.convenios || []).length,
    }),
  };
  const libro = new ExcelJS.Workbook();
  libro.creator = 'Medra — respaldo de contingencia';
  libro.created = new Date();
  // Recalcular todo al abrir: el archivo se guarda sin
  // resultados de fórmulas.
  libro.calcProperties.fullCalcOnLoad = true;

  const { filasGestiones, filasItems, tamano } = datos;
  const ultimaGestion = PRIMERA + filasGestiones.length + tamano.gestionesLibres - 1;
  const ultimaItem = PRIMERA + filasItems.length + tamano.itemsLibres - 1;

  hojaInstrucciones(libro, datos);
  const hG = libro.addWorksheet(H.G);
  const hI = libro.addWorksheet(H.I);
  const hC = hojaCargados(libro);
  const hSol = hojaSolicitud(libro, H.SOL, COLUMNAS_SOLICITUD);
  const hRes = hojaSolicitud(libro, H.RES, COLUMNAS_RESUMEN);
  const { col: riCol } = hojaReporteInfo(libro, datos.reporteInfo || [], datos.filasCatalogos.reporteInfo);
  const { col: rCol } = hojaCodigos(libro, datos.catalogo, datos.filasCatalogos.referencias);
  const { nombres: empresasNombres } = hojaEmpresas(libro, datos.empresas, datos.filasCatalogos.empresas);
  const centros = hojaMaestro(libro, H.CEN, COLUMNAS_CENTROS,
    'Centros activos que se usan en Gestiones (desplegable de Centro). Se regenera con el script; también se puede pegar desde A3 el archivo de Maestros → Centros → Exportar (solo ACTIVOS con USAR_EN_GESTIONES = SI).',
    filasCentros(datos.centros), datos.filasCatalogos.centros);
  const recargos = hojaMaestro(libro, H.REC, COLUMNAS_RECARGOS,
    'Rangos de recargo (veces costo según el precio). Se regenera con el script; también se puede pegar desde A3 el archivo de Maestros → Recargos → Exportar. Los INACTIVOS no se usan y el orden no importa.',
    filasRecargos(datos.recargos), datos.filasCatalogos.recargos);
  const previsiones = hojaNombres(libro, H.PREV, 'Previsiones activas (desplegable de Previsión en Gestiones, solo avisa si el valor no está). Se regenera con el script; también se puede pegar desde A3 el archivo de Maestros → Previsiones → Exportar (solo ACTIVAS).',
    datos.previsiones || [], datos.filasCatalogos.previsiones);
  const convenios = hojaNombres(libro, H.CONV, 'Convenios activos (desplegable de Convenio en Gestiones, solo avisa si el valor no está). Se regenera con el script; también se puede pegar desde A3 el archivo de Maestros → Convenios → Exportar (solo ACTIVOS).',
    datos.convenios || [], datos.filasCatalogos.convenios);
  const { rangos: cat } = hojaCatalogos(libro);

  const enHoja = (hoja, l, ultima) => `${ref(hoja)}$${l}$${PRIMERA}:$${l}$${ultima}`;
  const x = {
    ultimaItem,
    gA: enHoja(H.G, 'A', ultimaGestion),
    gD: enHoja(H.G, 'D', ultimaGestion),
    iB: enHoja(H.I, 'B', ultimaItem),
    iS: enHoja(H.I, 'S', ultimaItem),
    iAA: enHoja(H.I, 'AA', ultimaItem),
    iAG: enHoja(H.I, 'AG', ultimaItem),
    rCol,
    recargo: { desde: recargos('A'), hasta: recargos('B'), veces: recargos('C'), estado: recargos('E') },
    ri: riCol,
    riBusqueda: riCol('H'),
    previsiones,
    convenios,
  };

  // Gestiones
  prepararHoja(hG, COLUMNAS_GESTIONES, { congelarColumnas: 2 });
  filasGestiones.forEach((g, i) => {
    const r = PRIMERA + i;
    const valores = valoresGestionSistema(g);
    escribirFila(hG, r, COLUMNAS_GESTIONES, {
      ...valores, ...formulasEstadoGestion(r, x), ...camposDeCambio(COLUMNAS_GESTIONES, r, valores, 'AA'),
    }, { sistema: true, editables: CAMPOS_EDITABLES_GESTION });
  });
  for (let r = PRIMERA + filasGestiones.length; r <= ultimaGestion; r += 1) {
    escribirFila(hG, r, COLUMNAS_GESTIONES, formulasGestion(r, x), { sistema: false });
  }
  const rg = (l) => `${l}${PRIMERA}:${l}${ultimaGestion}`;
  validar(hG, rg('B'), soloDigitos(`B${PRIMERA}`));
  validar(hG, rg('C'), fechaValida);
  validar(hG, rg('D'), lista(empresasNombres, { errorTitle: 'Empresa', error: 'Elija una empresa de la lista (hoja Empresas).' }));
  validar(hG, rg('F'), { type: 'decimal', operator: 'greaterThanOrEqual', formulae: [0], error: 'Monto mayor o igual a 0.' });
  validar(hG, rg('G'), lista(cat.C));
  validar(hG, rg('H'), lista(centros('A')));
  validar(hG, rg('J'), lista(cat.D));
  validar(hG, rg('P'), lista(cat.A));
  // A mano: avisa (no bloquea) si el valor no está en la lista.
  validar(hG, rg('L'), lista(convenios, { errorStyle: 'warning', errorTitle: 'Convenio', error: 'No está en la lista de Convenios. ¿Usarlo igual?' }));
  validar(hG, rg('M'), lista(previsiones, { errorStyle: 'warning', errorTitle: 'Previsión', error: 'No está en la lista de Previsiones. ¿Usarla igual?' }));
  hG.addConditionalFormatting({
    ref: rg('A'),
    rules: [{ type: 'expression', priority: 1, formulae: [`AND(A${PRIMERA}<>"",OR(A${PRIMERA}="FECHA INVÁLIDA",COUNTIF($A$${PRIMERA}:$A$${ultimaGestion},A${PRIMERA})>1))`], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: COLOR.error } }, font: { color: { argb: COLOR.textoError } } } }],
  });
  hG.addConditionalFormatting({
    ref: rg('T'),
    rules: [{ type: 'expression', priority: 1, formulae: [`AND(ISNUMBER(T${PRIMERA}),ROUND(T${PRIMERA},0)<>0)`], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: COLOR.error } }, font: { color: { argb: COLOR.textoError } } } }],
  });
  hG.addConditionalFormatting({
    ref: rg('Q'),
    rules: [
      { type: 'expression', priority: 1, formulae: [`Q${PRIMERA}="INCOMPLETO"`], style: { font: { bold: true, color: { argb: COLOR.textoError } } } },
      { type: 'expression', priority: 2, formulae: [`Q${PRIMERA}="CARGADO"`], style: { font: { bold: true, color: { argb: COLOR.ok } } } },
    ],
  });
  reglaObligatorio(hG, ['B', 'C', 'D', 'W'], 'V', PRIMERA, ultimaGestion);
  reglasCambio(hG, COLUMNAS_GESTIONES, 'V', 'AA', PRIMERA, ultimaGestion);
  // Admisión que no está en Reporte Info: naranja. Dato escrito a mano
  // (distinto de lo que trae Reporte Info): letra azul en cursiva.
  hG.addConditionalFormatting({
    ref: rg('B'),
    rules: [{ type: 'expression', priority: 2, formulae: [`AND($V${PRIMERA}="CONTINGENCIA",TRIM($B${PRIMERA})<>"",$AF${PRIMERA}="")`], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: COLOR.aviso } } } }],
  });
  Object.entries(AUTOCOMPLETADO_GESTION).forEach(([l, aux]) => hG.addConditionalFormatting({
    ref: rg(l),
    rules: [{ type: 'expression', priority: 2, formulae: [`AND($V${PRIMERA}="CONTINGENCIA",${l}${PRIMERA}<>"",${l}${PRIMERA}&""<>${aux}${PRIMERA})`], style: { font: { italic: true, color: { argb: COLOR.manual } } } }],
  }));
  hG.addConditionalFormatting({
    ref: rg('AE'),
    rules: [{ type: 'expression', priority: 1, formulae: [`AE${PRIMERA}<>""`], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: COLOR.aviso } }, font: { bold: true, color: { argb: 'FF7F4F00' } } } }],
  });

  // Ítems
  // A1:B1 quedan para el botón "Mover cargados": su ayuda va como nota.
  prepararHoja(hI, COLUMNAS_ITEMS, { congelarColumnas: 2, ayudaEnNota: ['A', 'B'] });
  filasItems.forEach((it, i) => {
    const r = PRIMERA + i;
    const valores = valoresItemSistema(it);
    escribirFila(hI, r, COLUMNAS_ITEMS, {
      ...valores,
      ...formulasItemComunes(r, x),
      // Totales con el precio y veces costo guardados: siguen a la cantidad
      // y a SIN CARGO si se editan en la caída (el importador los recalcula).
      S: f(`IF(J${r}="SIN CARGO",0,M${r}*G${r})`),
      T: f(`IF(J${r}="SIN CARGO",0,M${r}*R${r}*G${r})`),
      ...camposDeCambio(COLUMNAS_ITEMS, r, valores, 'AK'),
    }, { sistema: true, editables: camposEditablesItem(it) });
  });
  let linea = datos.ultimaLinea || filasItems.length;
  for (let r = PRIMERA + filasItems.length; r <= ultimaItem; r += 1) {
    linea += 1;
    escribirFila(hI, r, COLUMNAS_ITEMS, { A: linea, ...formulasItemNuevas(r, x) }, { sistema: false });
  }
  const ri = (l) => `${l}${PRIMERA}:${l}${ultimaItem}`;
  validar(hI, ri('B'), lista(x.gA, { errorTitle: 'CLAVE', error: 'Elija una CLAVE existente en la hoja Gestiones.' }));
  validar(hI, ri('C'), lista(cat.E));
  validar(hI, ri('D'), { type: 'whole', operator: 'greaterThanOrEqual', formulae: [1], error: 'N° de línea de la línea padre.' });
  validar(hI, ri('F'), lista(rCol(REF.referencia), { errorStyle: 'warning', errorTitle: 'Referencia', error: 'No está en Códigos: quedará "Sin código". ¿Continuar?' }));
  validar(hI, ri('G'), { type: 'decimal', operator: 'greaterThan', formulae: [0], error: 'Cantidad mayor que 0.' });
  validar(hI, ri('I'), fechaValida);
  validar(hI, ri('J'), lista(cat.B));
  validar(hI, ri('K'), { type: 'decimal', operator: 'greaterThanOrEqual', formulae: [0], error: 'Monto mayor o igual a 0.' });
  hI.addConditionalFormatting({
    ref: ri('N'),
    rules: [{ type: 'expression', priority: 1, formulae: [`$AJ${PRIMERA}=1`], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: COLOR.error } }, font: { color: { argb: COLOR.textoError } } } }],
  });
  hI.addConditionalFormatting({
    ref: ri('U'),
    rules: [{ type: 'expression', priority: 1, formulae: [`U${PRIMERA}<>""`], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: COLOR.error } }, font: { bold: true, color: { argb: COLOR.textoError } } } }],
  });
  reglaObligatorio(hI, ['B', 'E', 'F', 'G', 'W'], 'V', PRIMERA, ultimaItem);
  reglasCambio(hI, COLUMNAS_ITEMS, 'V', 'AK', PRIMERA, ultimaItem);

  // Códigos: EMPRESA con la lista de Empresas; TIPO, SEGMENTO y CLASE con
  // las del sistema. Pegar el export borra la validación, así que además un
  // valor fuera de su lista se pinta de rojo (formato condicional, que sí
  // sobrevive al pegado de valores). Con la lista vacía no se marca nada.
  const hR = libro.getWorksheet(H.R);
  const ultimaCodigo = PRIMERA + datos.filasCatalogos.referencias - 1;
  const rr = (l) => `${l}${PRIMERA}:${l}${ultimaCodigo}`;
  [['E', empresasNombres, 'Empresa', 'No está en la hoja Empresas.'], ['F', cat.F, 'Tipo', 'No es un tipo del sistema.'],
    ['G', cat.G, 'Segmento', 'No es un segmento del sistema.'], ['H', cat.H, 'Clase', 'No es una clase del sistema.']].forEach(([l, listaRango, titulo, error]) => {
    validar(hR, rr(l), lista(listaRango, { errorStyle: 'warning', errorTitle: titulo, error: `${error} ¿Usarlo igual?` }));
    hR.addConditionalFormatting({
      ref: rr(l),
      rules: [{ type: 'expression', priority: 1, formulae: [fueraDeLista(`${l}${PRIMERA}`, listaRango)], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: COLOR.error } }, font: { bold: true, color: { argb: COLOR.textoError } } } }],
    });
  });

  // Fórmulas ocultas (decisión del 23-11-2026): toda celda con fórmula queda
  // "Oculta", así con la hoja protegida la barra muestra solo el resultado.
  // Las que ya estaban bloqueadas siguen bloqueadas; las del autocompletado
  // de Gestiones (E, L-O) siguen desbloqueadas para escribir encima.
  libro.worksheets.forEach((hoja) => hoja.eachRow({ includeEmpty: false }, (fila) => fila.eachCell({ includeEmpty: false }, (celda) => {
    if (celda.formula) celda.protection = { locked: celda.protection?.locked ?? true, hidden: true };
  })));

  // Protección con contraseña (datos.claveHojas, de una variable de
  // entorno; en el archivo queda solo su hash). Las macros la quitan y la
  // vuelven a poner con las mismas opciones (la contraseña se inserta en el
  // módulo VBA al armar el .xlsm).
  const clave = datos.claveHojas || '';
  for (const hoja of [hG, hI]) await hoja.protect(clave, OPCIONES_PROTECCION);
  for (const hoja of [hC, hSol, hRes]) await hoja.protect(clave, { selectLockedCells: true, selectUnlockedCells: true, autoFilter: true, formatColumns: true, formatRows: true });
  for (const nombre of [H.RI, H.R, H.E, H.CEN, H.REC, H.PREV, H.CONV, H.C, H.INS]) await libro.getWorksheet(nombre).protect(clave, { selectLockedCells: true, selectUnlockedCells: true, autoFilter: true });

  return { libro, filas: { ultimaGestion, ultimaItem } };
};
