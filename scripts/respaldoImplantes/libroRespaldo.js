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
  ESTADOS_GESTION, ESTADOS_CARGA, INFORMES, NOMBRES_LADO, SI_NO, LISTA_TIPOS_LINEA, CODIGO_SIN_OC,
  CAMPOS_EDITABLES_GESTION, camposEditablesItem, dimensionarCatalogos,
} from './datosRespaldo.js';

const FILA_AYUDA = 1;
const FILA_ENCABEZADO = 2;
const PRIMERA = 3;

const H = { G: 'Gestiones', I: 'Ítems', D: 'Documentos', R: 'Referencias', C: 'Catálogos', INS: 'Instrucciones' };
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
  { l: 'E', titulo: 'Nombre paciente', clase: 'opcional', ancho: 28, ayuda: 'En MAYÚSCULAS.' },
  { l: 'F', titulo: 'Total cotización', clase: 'opcional', ancho: 14, pesos: true, ayuda: 'Total que indica la cotización (se compara con la suma de los ítems).' },
  { l: 'G', titulo: 'Informe', clase: 'opcional', ancho: 12, campo: 'informe', original: 'AB', ayuda: 'Vacío = PENDIENTE.' },
  { l: 'H', titulo: 'Centro', clase: 'opcional', ancho: 16, ayuda: 'Vacío = PABELLON.' },
  { l: 'I', titulo: 'Atributo', clase: 'opcional', ancho: 12, ayuda: 'Vacío = IMPLANTES.' },
  { l: 'J', titulo: 'Lado', clase: 'opcional', ancho: 14, campo: 'lado', original: 'AC', ayuda: 'Vacío = No especificado.' },
  { l: 'K', titulo: 'Observación', clase: 'opcional', ancho: 30, campo: 'observacion', original: 'AD', ayuda: 'Nota libre. Si se usó una fibra, anótela aquí.' },
  { l: 'L', titulo: 'Convenio', clase: 'opcional', ancho: 16, ayuda: 'Opcional: al reimportar se completa desde Reporte Info.' },
  { l: 'M', titulo: 'Previsión', clase: 'opcional', ancho: 14, ayuda: 'Opcional (Isapre/Fonasa).' },
  { l: 'N', titulo: 'Médico', clase: 'opcional', ancho: 22, ayuda: 'Opcional (1° cirujano).' },
  { l: 'O', titulo: 'Descripción', clase: 'opcional', ancho: 30, ayuda: 'Opcional (descripción de la cirugía).' },
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
];

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

const COLUMNAS_DOCUMENTOS = [
  { l: 'A', titulo: 'N°', clase: 'formula', ancho: 6, ayuda: 'Fijo.' },
  { l: 'B', titulo: 'Admisión', clase: 'obligatorio', ancho: 12, texto: true, ayuda: 'N° de admisión, solo dígitos.' },
  { l: 'C', titulo: 'Nombre del archivo', clase: 'obligatorio', ancho: 40, ayuda: 'Tal como quedó guardado (ej. 102030 - JUAN PEREZ - OC.pdf).' },
  { l: 'D', titulo: 'Descripción / tipo', clase: 'opcional', ancho: 24, ayuda: 'Libre: cotización, OC, guía, informe…' },
  { l: 'E', titulo: 'Carpeta', clase: 'obligatorio', ancho: 40, ayuda: 'Dónde quedó guardado el archivo.' },
  { l: 'F', titulo: 'Fecha', clase: 'opcional', ancho: 12, fecha: true, ayuda: 'dd-mm-aaaa.' },
  { l: 'G', titulo: '¿Subido al sistema?', clase: 'opcional', ancho: 12, ayuda: 'SÍ / NO. Vacío = NO.' },
  { l: 'H', titulo: 'ORIGEN', clase: 'formula', ancho: 14, ayuda: 'Automático.' },
  { l: 'I', titulo: 'Registrado por', clase: 'obligatorio', ancho: 18, ayuda: 'Quién lo registró.' },
  { l: 'J', titulo: 'Alerta', clase: 'formula', ancho: 34, ayuda: 'Aviso si la admisión no está en Gestiones.' },
];

// De la B a la M, las mismas columnas y en el mismo orden que "Exportar
// registros" de Códigos Maestros → Con código (useImportExportConCodigo.js):
// el CSV se pega tal cual en B3. A y N son automáticas (bloqueadas: si el
// CSV trae más columnas de las esperadas, Excel no deja pegar encima).
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
  { l: 'N', titulo: 'Veces repetida', ancho: 9, automatica: true },
];
// Columna de cada dato en Referencias (para las fórmulas de Ítems).
const REF = { clave: 'A', codigo: 'B', referencia: 'C', empresa: 'E', tipo: 'F', clase: 'H', descriptor: 'I', precio: 'J', repeticiones: 'N' };

// --- Utilidades de hoja -----------------------------------------------------

const prepararHoja = (hoja, columnas, { conAyuda = true, congelarColumnas = 0 } = {}) => {
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
    if (conAyuda) {
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
  { l: 'F', titulo: 'SÍ / NO', valores: SI_NO, ancho: 8 },
];

// Maestros que se pegan desde el sistema: cada bloque tiene las mismas
// columnas, en el mismo orden, que "Exportar a Excel / CSV" de su pantalla
// (EmpresasMaestros, CentrosMaestros y RecargosMaestros .jsx), así se pega
// el archivo exportado desde la primera columna del bloque.
const MAESTROS_CATALOGO = [
  {
    id: 'empresas', titulo: 'EMPRESAS — pegar en H3 (Maestros → Empresas → Exportar)', columnas: [
      { l: 'H', titulo: 'NOMBRE', ancho: 30 }, { l: 'I', titulo: 'RUT', ancho: 14 }, { l: 'J', titulo: 'ESTADO', ancho: 10 },
    ],
  },
  {
    id: 'centros', titulo: 'CENTROS — pegar en L3 (Maestros → Centros → Exportar)', columnas: [
      { l: 'L', titulo: 'NOMBRE', ancho: 22 }, { l: 'M', titulo: 'COMENTARIO', ancho: 20 }, { l: 'N', titulo: 'ESTADO', ancho: 10 }, { l: 'O', titulo: 'USAR_EN_GESTIONES', ancho: 12 },
    ],
  },
  {
    id: 'recargos', titulo: 'RANGOS DE RECARGO — pegar en Q3 (Maestros → Recargos → Exportar)', columnas: [
      { l: 'Q', titulo: 'DESDE', ancho: 12, pesos: true }, { l: 'R', titulo: 'HASTA', ancho: 12, pesos: true }, { l: 'S', titulo: 'VECES COSTO', ancho: 10 },
      { l: 'T', titulo: 'COMENTARIO', ancho: 16 }, { l: 'U', titulo: 'ESTADO', ancho: 10 },
    ],
  },
];

// Filas de los maestros en el modo exportación (ya filtrados: todos activos).
const valoresMaestro = (datos) => ({
  empresas: datos.empresas.map((nombre) => ({ H: nombre, J: 'ACTIVO' })),
  centros: datos.centros.map((nombre) => ({ L: nombre, N: 'ACTIVO', O: 'SI' })),
  recargos: datos.recargos.map((r) => ({ Q: r.desde, R: r.hasta, S: r.vecesCosto, U: 'ACTIVO' })),
});

const encabezado = (celda, titulo) => {
  celda.value = titulo;
  celda.font = { bold: true };
  celda.fill = relleno(COLOR.formula);
  celda.border = BORDES;
};

const hojaCatalogos = (libro, datos, filas) => {
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

  const valores = valoresMaestro(datos);
  MAESTROS_CATALOGO.forEach((m) => {
    const ultima = PRIMERA + filas[m.id] - 1;
    const titulo = hoja.getCell(`${m.columnas[0].l}1`);
    titulo.value = m.titulo;
    titulo.font = { bold: true, color: { argb: 'FF1F4E79' } };
    m.columnas.forEach((c) => {
      hoja.getColumn(c.l).width = c.ancho;
      encabezado(hoja.getCell(`${c.l}${FILA_ENCABEZADO}`), c.titulo);
      for (let r = PRIMERA; r <= ultima; r += 1) {
        const celda = hoja.getCell(`${c.l}${r}`);
        const v = valores[m.id][r - PRIMERA]?.[c.l];
        if (v !== undefined) celda.value = v;
        if (c.pesos) celda.numFmt = FORMATO_PESOS;
        celda.protection = { locked: false };
      }
      rangos[c.l] = `${ref(H.C)}$${c.l}$${PRIMERA}:$${c.l}$${ultima}`;
    });
  });
  hoja.views = [{ state: 'frozen', ySplit: FILA_ENCABEZADO }];
  return { hoja, rangos };
};

// --- Hoja Referencias -------------------------------------------------------------

const hojaReferencias = (libro, catalogo, totalFilas) => {
  const hoja = libro.addWorksheet(H.R);
  prepararHoja(hoja, COLUMNAS_REFERENCIAS.map((c) => ({ ...c, clase: c.automatica ? 'formula' : 'opcional' })), { conAyuda: false, congelarColumnas: 3 });
  hoja.getCell('A1').value = 'Maestro de Códigos: pegar desde B3 el CSV de Códigos Maestros → Con código → Exportar registros (ver Instrucciones). A y N son automáticas.';
  hoja.getCell('A1').font = { italic: true };
  const ultima = PRIMERA + totalFilas - 1;
  for (let r = PRIMERA; r <= ultima; r += 1) {
    const fila = hoja.getRow(r);
    const dato = catalogo.filas[r - PRIMERA];
    if (dato) {
      fila.getCell('B').value = dato.codigo;
      fila.getCell('C').value = dato.referencia;
      fila.getCell('E').value = dato.empresa;
      fila.getCell('F').value = dato.tipo;
      fila.getCell('G').value = dato.segmento;
      fila.getCell('H').value = dato.clase;
      fila.getCell('I').value = dato.descriptorAuto;
      fila.getCell('J').value = dato.precio;
    }
    fila.getCell('A').value = f(`IF(C${r}="","",TRIM(C${r})&"|"&TRIM(E${r}))`);
    fila.getCell('N').value = f(`IF(C${r}="","",COUNTIF($C$${PRIMERA}:$C$${ultima},C${r}))`);
    COLUMNAS_REFERENCIAS.forEach((c) => formatearCelda(fila.getCell(c.l), c, { bloqueada: !!c.automatica }));
  }
  const col = (l) => `${ref(H.R)}$${l}$${PRIMERA}:$${l}$${ultima}`;
  return { hoja, col };
};

// --- Hoja Gestiones --------------------------------------------------------------

const formulasGestion = (r, x) => ({
  A: f(`IF(OR(B${r}="",C${r}="",D${r}=""),"",IFERROR(TRIM(B${r})&"|"&TRIM(D${r})&"|"&YEAR(C${r})&"-"&TEXT(MONTH(C${r}),"00")&"-"&TEXT(DAY(C${r}),"00"),"FECHA INVÁLIDA"))`),
  V: f(`IF(B${r}&C${r}&D${r}&E${r}="","","CONTINGENCIA")`),
  ...formulasEstadoGestion(r, x),
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

// Encabezado: la plantilla vacía (catálogos por pegar) o la exportación del
// sistema (con datos y catálogos ya cargados).
const encabezadoInstrucciones = (d) => (d.plantilla ? [
  ['RESPALDO DE CONTINGENCIA — IMPLANTES (PLANTILLA)', 'titulo'],
  [`Plantilla generada: ${d.generadoEl}. Filas preparadas: ${d.tamano.gestionesLibres} gestiones, ${d.tamano.itemsLibres} ítems y ${d.tamano.documentosLibres} documentos; hasta ${d.filasCatalogos.referencias} referencias.`],
  ['Catálogos actualizados al (escriba la fecha cada vez que los pegue) →', 'fecha'],
  [''],
  ['PARA QUÉ SIRVE', 'seccion'],
  ['Si el sistema no está disponible, registre aquí las gestiones y sus ítems. Cuando vuelva, lo registrado se carga en el sistema (ORIGEN = CONTINGENCIA).'],
  ['Antes de usarla hay que pegar los catálogos (ver "CÓMO LLENAR LOS CATÁLOGOS" al final). Hágalo con el sistema funcionando, guarde la plantilla con los catálogos y repítalo cuando cambien precios o referencias.'],
] : [
  ['RESPALDO DE CONTINGENCIA — IMPLANTES', 'titulo'],
  [`Generado: ${d.generadoEl} (hora de Chile)`],
  [`Período abierto: ${d.periodoTexto}. Gestiones exportadas: mes ${d.mesExportado}.`],
  [`Catálogo de referencias actualizado al: ${d.generadoEl} (${d.catalogo.resumen.usables} referencias; sin ${d.catalogo.resumen.inactivas} inactivas ni ${d.catalogo.resumen.fibras} fibras reutilizables).`],
  [`Filas exportadas: ${d.filasGestiones.length} gestiones y ${d.filasItems.length} ítems. Filas libres: ${d.tamano.gestionesLibres} gestiones, ${d.tamano.itemsLibres} ítems y ${d.tamano.documentosLibres} documentos.`],
  [''],
  ['PARA QUÉ SIRVE', 'seccion'],
  ['Si el sistema no está disponible, registre aquí las gestiones y sus ítems. Cuando vuelva, este archivo se reimporta: solo se cargan las filas con ORIGEN = CONTINGENCIA.'],
  ['Las filas grises con ORIGEN = SISTEMA son una foto del sistema al generar el archivo: sirven de consulta y solo se pueden cambiar sus celdas blancas (ver "Cambios en lo que ya estaba en el sistema").'],
]);

// Cómo pegar cada catálogo desde las exportaciones de la app (solo plantilla).
const COMO_LLENAR_CATALOGOS = [
  ['CÓMO LLENAR LOS CATÁLOGOS (con el sistema funcionando)', 'seccion'],
  ['Pegue siempre con "Pegar valores" (Ctrl+Alt+V → Valores). Copie los datos SIN la fila de encabezados y compruebe que las columnas del archivo exportado son las mismas, en el mismo orden, que los encabezados de la fila 2 donde pega.'],
  ['1. REFERENCIAS (hoja Referencias, celda B3). En el sistema: Maestros → Codigos → pestaña "Con código" → botón "Importar / Exportar" → "Exportar registros". Antes de exportar, si la tabla deja filtrar por Estado, deje solo ACTIVO. Se descarga un CSV: ábralo con doble clic, copie desde A2 hasta la última fila y pegue en Referencias!B3.'],
  ['   El CSV trae solo las columnas que el usuario puede ver: debe traer las 12 (CODIGO … REGISTRADO_POR). Si falta alguna, expórtelo con un usuario que las vea todas (si no, Excel no deja pegar o las columnas quedan corridas).'],
  ['   Borre después las filas de fibras reutilizables (no se usan en la contingencia). Las referencias "Sin código" no hace falta pegarlas: en la contingencia quedan como "Sin código", igual que en el sistema.'],
  ['2. EMPRESAS (hoja Catálogos, celda H3). Maestros → Empresas → botón de configuración (Importar/Exportar) → "Exportar a Excel / CSV". En el archivo, filtre ESTADO = ACTIVO, copie NOMBRE, RUT y ESTADO (sin encabezado) y pegue en Catálogos!H3.'],
  ['3. CENTROS (hoja Catálogos, celda L3). Maestros → Centros → configuración → "Exportar a Excel / CSV". Filtre ESTADO = ACTIVO y USAR_EN_GESTIONES = SI, copie las 4 columnas y pegue en Catálogos!L3.'],
  ['4. RANGOS DE RECARGO (hoja Catálogos, celda Q3). Maestros → Recargos → configuración → "Exportar a Excel / CSV". Copie las 5 columnas (DESDE, HASTA, VECES COSTO, COMENTARIO, ESTADO) y pegue en Catálogos!Q3. Los INACTIVOS se ignoran solos y el orden no importa.'],
  ['5. Escriba la fecha en "Catálogos actualizados al" (arriba), guarde y póngale contraseña: Archivo → Información → Proteger libro → Cifrar con contraseña.'],
  ['Para reemplazar un catálogo: seleccione las celdas pegadas antes (sin los encabezados), presione Supr y pegue el nuevo.'],
];

const textoInstrucciones = (d) => [
  ...encabezadoInstrucciones(d),
  [''],
  ['COLORES DE LOS ENCABEZADOS', 'seccion'],
  ['Amarillo: obligatorio. Azul: opcional. Gris: automático (no se escribe). Una celda obligatoria vacía en una fila nueva se pinta de rojo.'],
  [''],
  ['HOJA GESTIONES (una fila por admisión + empresa + fecha)', 'seccion'],
  ['1. Escriba Admisión (solo dígitos), Fecha (dd-mm-aaaa) y elija la Empresa. La CLAVE se arma sola: admisión|empresa|AAAA-MM-DD.'],
  ['2. Complete Registrado por (su nombre) y, si los tiene, Nombre, Total cotización y los demás datos.'],
  ['3. La misma admisión con otra empresa u otra fecha es otra fila. Una CLAVE repetida se pinta de rojo: no la duplique.'],
  ['4. Estado se calcula solo: con alguna línea sin código = INCOMPLETO; si todas las líneas tienen el mismo estado de carga, ese estado (PAD y SIN CARGO cuentan como CARGADO); si se mezclan, INCOMPLETO. Sin ítems: el "Estado sin ítems" (vacío = AGENDADO).'],
  ['5. Diferencia en rojo: la suma de los ítems no cuadra con el total de la cotización.'],
  [''],
  ['HOJA ÍTEMS (una fila por línea)', 'seccion'],
  ['1. Elija la CLAVE de la gestión (lista). Primero debe existir la gestión en la hoja Gestiones.'],
  ['2. Escriba N° cotización, Referencia y Cantidad. Código, precio, empresa, clase, tipo, veces costo, total y venta se llenan solos desde el catálogo.'],
  ['3. Una referencia que no está en el catálogo se puede escribir igual (Excel avisa): queda "Sin código" y la gestión INCOMPLETO, como en el sistema. Si conoce el precio, escríbalo en Precio manual.'],
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
    ['Algunas líneas no dejan cambiar todo, igual que en el sistema: en PAD y en líneas sin código no se cambia el Estado carga; en el PAD PADRE no se cambian Lote ni Vencimiento; en una fibra no se cambian Lote, Vencimiento ni Cantidad.'],
    ['La celda cambiada se pinta ámbar y la columna MODIFICADO pasa a SÍ. Para deshacer un cambio, vuelva a escribir el valor original. Al reimportar se aplican solo las filas con MODIFICADO = SÍ; las gestiones que ya estaban SOLICITADAS no se tocan y quedan en el informe para hacerlas a mano.'],
  ]),
  [''],
  ['FIBRAS REUTILIZABLES', 'seccion'],
  ['Las fibras no están en el catálogo (exigen elegir la fibra física FIB-xxxx). Si usa una, anote en Observación de la gestión: FIBRA, referencia, código FIB y lote. Se carga en el sistema al volver.'],
  [''],
  ['HOJA DOCUMENTOS', 'seccion'],
  ['Registre cada PDF guardado durante la caída: admisión, nombre del archivo y carpeta. Al volver se suben con Carga masiva de documentos y se marca "¿Subido al sistema?" = SÍ.'],
  [''],
  ['QUÉ NO HACER', 'seccion'],
  [`No cambie los N° de línea.${d.plantilla ? '' : ' No borre filas del sistema.'} No haga la Solicitud ni la imputación durante la caída: se hacen en el sistema después de cargar lo registrado.`],
  ['No ordene las hojas (están protegidas para no romper fórmulas); use los filtros.'],
  [''],
  ['PROGRAMA', 'seccion'],
  ['Ábralo con Microsoft Excel: es el único probado. Pide la contraseña al abrir.'],
  [''],
  ['SEGURIDAD', 'seccion'],
  ['Una vez usado contiene datos de pacientes: con contraseña siempre. No lo envíe por correo ni WhatsApp, no lo deje en Descargas ni en el escritorio y no lo imprima. Al terminar la contingencia y cargar lo registrado, borre las copias locales.'],
  ...(d.plantilla ? [[''], ...COMO_LLENAR_CATALOGOS] : []),
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
      // Celda para que el equipo anote cuándo pegó los catálogos.
      c.font = { bold: true };
      const fecha = hoja.getCell(`B${i + 1}`);
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
 *   tamano: { gestionesLibres, itemsLibres, documentosLibres }
 *   plantilla: true en la plantilla vacía (catálogos por pegar)
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
  const ultimaDocumento = PRIMERA + tamano.documentosLibres - 1;

  hojaInstrucciones(libro, datos);
  const hG = libro.addWorksheet(H.G);
  const hI = libro.addWorksheet(H.I);
  const hD = libro.addWorksheet(H.D);
  const { col: rCol } = hojaReferencias(libro, datos.catalogo, datos.filasCatalogos.referencias);
  const { rangos: cat } = hojaCatalogos(libro, datos, datos.filasCatalogos);

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
    recargo: { desde: cat.Q, hasta: cat.R, veces: cat.S, estado: cat.U },
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
  validar(hG, rg('D'), lista(cat.H, { errorTitle: 'Empresa', error: 'Elija una empresa de la lista.' }));
  validar(hG, rg('F'), { type: 'decimal', operator: 'greaterThanOrEqual', formulae: [0], error: 'Monto mayor o igual a 0.' });
  validar(hG, rg('G'), lista(cat.C));
  validar(hG, rg('H'), lista(cat.L));
  validar(hG, rg('J'), lista(cat.D));
  validar(hG, rg('P'), lista(cat.A));
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

  // Ítems
  prepararHoja(hI, COLUMNAS_ITEMS, { congelarColumnas: 2 });
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
  validar(hI, ri('F'), lista(rCol(REF.referencia), { errorStyle: 'warning', errorTitle: 'Referencia', error: 'No está en el catálogo: quedará "Sin código". ¿Continuar?' }));
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

  // Documentos
  prepararHoja(hD, COLUMNAS_DOCUMENTOS, { congelarColumnas: 2 });
  const gB = enHoja(H.G, 'B', ultimaGestion);
  for (let r = PRIMERA; r <= ultimaDocumento; r += 1) {
    escribirFila(hD, r, COLUMNAS_DOCUMENTOS, {
      A: r - PRIMERA + 1,
      H: f(`IF(B${r}&C${r}&E${r}="","","CONTINGENCIA")`),
      J: f(`IF(B${r}="","",IF(COUNTIF(${gB},B${r})=0,"Admisión no está en Gestiones",""))`),
    }, { sistema: false });
  }
  const rd = (l) => `${l}${PRIMERA}:${l}${ultimaDocumento}`;
  validar(hD, rd('B'), soloDigitos(`B${PRIMERA}`));
  validar(hD, rd('F'), fechaValida);
  validar(hD, rd('G'), lista(cat.F));
  reglaObligatorio(hD, ['B', 'C', 'E', 'I'], 'H', PRIMERA, ultimaDocumento);

  // Protección sin contraseña: evita escribir en lo automático por error;
  // se puede quitar en Revisar → Desproteger hoja si hiciera falta.
  for (const hoja of [hG, hI, hD]) await hoja.protect('', OPCIONES_PROTECCION);
  for (const nombre of [H.R, H.C, H.INS]) await libro.getWorksheet(nombre).protect('', { selectLockedCells: true, selectUnlockedCells: true, autoFilter: true });

  return { libro, filas: { ultimaGestion, ultimaItem, ultimaDocumento } };
};
