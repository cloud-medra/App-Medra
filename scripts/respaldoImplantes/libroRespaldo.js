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
  NM: 'Nuevo mes',
  GUIAS: 'Guías',
  CONSIG: 'Consignación',
};
const ref = (hoja) => `'${hoja}'!`;

// --- Libro del mes ------------------------------------------------------------
// Un libro por mes (decisión del 23-11-2026): la plantilla base
// (respaldo_implantes.xlsm) no tiene mes y no deja registrar; la macro
// "Crear libro del mes" (hoja Nuevo mes) la copia como
// respaldo_implantes_AAAA-MM.xlsm, vacía las hojas de trabajo y escribe el
// año y el mes en estas celdas de Catálogos (bloqueadas). Las validaciones,
// la alerta de Gestiones y la macro "Mover cargados" leen de aquí. La macro
// usa las mismas celdas (LIBRO_ANIO, LIBRO_MES en ModContingencia.bas).
// Libro de trabajo (decisión del 25-11-2026): sin "respaldo" ni
// "contingencia" en ningún texto. Los libros del mes se llaman
// Implantes_AAAA-MM.xlsm (PREFIJO_LIBRO en ModContingencia.bas) y las filas
// en uso dicen ORIGEN = REGISTRADO (antes CONTINGENCIA).
export const PREFIJO_LIBRO = 'Implantes_';
export const ORIGEN_REGISTRADO = 'REGISTRADO';
export const CELDAS_LIBRO = Object.freeze({ meses: 'J', anio: 'K3', mes: 'L3', nombre: 'M3' });
const MESES_LIBRO = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
const L = {
  anio: `${ref(H.C)}$K$3`,
  mes: `${ref(H.C)}$L$3`,
  nombre: `${ref(H.C)}$M$3`,
  meses: `${ref(H.C)}$J$3:$J$14`,
};
const SIN_MES = `N(${L.anio})=0`;
export const nombreLibroMes = ({ anio, mes }) => `${MESES_LIBRO[mes - 1]} ${anio}`;
// Mensajes de las validaciones de Gestiones. La plantilla base trae los de
// "sin mes"; la macro los cambia al crear el libro (y el modo con datos del
// sistema los arma ya con su mes). Excel no permite un mensaje que dependa
// del valor escrito: el mes de la fecha rechazada lo dice la columna Alerta.
export const MENSAJES_LIBRO = Object.freeze({
  base: 'Esta es la plantilla base (sin mes): no permite registrar. Cree el libro del mes en la hoja "Nuevo mes" (botón "Crear libro del mes").',
  admision: 'Solo dígitos, sin puntos ni espacios.',
  fecha: (nombre) => `Este libro es de ${nombre}. Registra esta gestión en el libro del mes de su fecha (${PREFIJO_LIBRO}AAAA-MM.xlsm).`,
});

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
  textoAviso: 'FF7F4F00',
  manual: 'FF1F4E79',          // letra del dato escrito a mano
  vista: 'FFC6E0B4',           // verde: encabezado de la vista de carga (Ítems y Cargados)
};
// Borde que cierra la vista de carga (a la derecha de Estado carga).
const BORDE_VISTA = { style: 'medium', color: { argb: 'FF375623' } };

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
  { l: 'C', titulo: 'Fecha', clase: 'obligatorio', ancho: 12, fecha: true, ayuda: 'Fecha de la cirugía (dd-mm-aaaa). Solo del mes del libro.' },
  { l: 'D', titulo: 'Empresa', clase: 'obligatorio', ancho: 26, ayuda: 'Proveedor, de la lista.' },
  { l: 'E', titulo: 'Nombre paciente', clase: 'opcional', ancho: 28, ayuda: 'Se completa desde Reporte Info al escribir la admisión. Se puede escribir encima.' },
  { l: 'F', titulo: 'Total cotización', clase: 'opcional', ancho: 14, pesos: true, ayuda: 'Total que indica la cotización (se compara con la suma de los ítems; si no cuadra, en Ítems Total ítem y Venta quedan en naranja).' },
  { l: 'G', titulo: 'Informe', clase: 'opcional', ancho: 12, campo: 'informe', original: 'AB', ayuda: 'Vacío = PENDIENTE.' },
  // Estado junto a Informe, a la vista (decisión del 24-11-2026; antes era
  // la Q). Las columnas de N° ítems en adelante no se movieron. La macro usa
  // estas posiciones (G_ESTADO, G_AUTOCOMPLETADO, G_DESDE_CARGADOS).
  { l: 'H', titulo: 'Estado', clase: 'formula', ancho: 14, ayuda: 'Automático, según el estado de carga de sus líneas. La fila se colorea según el Estado.' },
  { l: 'I', titulo: 'Centro', clase: 'opcional', ancho: 16, ayuda: 'Vacío = PABELLON.' },
  { l: 'J', titulo: 'Atributo', clase: 'opcional', ancho: 14, ayuda: 'Segmento, de la lista (Catálogos): IMPLANTES, CONSIGNACION o HEMODINAMIA. Vacío = IMPLANTES. Solo CONSIGNACION trae guías en Ítems.' },
  { l: 'K', titulo: 'Lado', clase: 'opcional', ancho: 14, campo: 'lado', original: 'AC', ayuda: 'Vacío = No especificado.' },
  { l: 'L', titulo: 'Observación', clase: 'opcional', ancho: 30, campo: 'observacion', original: 'AD', ayuda: 'Nota libre.' },
  { l: 'M', titulo: 'Convenio', clase: 'opcional', ancho: 16, ayuda: 'Desde Reporte Info. A mano: de la lista (avisa si no está).' },
  { l: 'N', titulo: 'Previsión', clase: 'opcional', ancho: 14, ayuda: 'Desde Reporte Info (Isapre). A mano: de la lista (avisa si no está).' },
  { l: 'O', titulo: 'Médico', clase: 'opcional', ancho: 22, ayuda: 'Desde Reporte Info (1° cirujano). Se puede escribir encima.' },
  { l: 'P', titulo: 'Descripción', clase: 'opcional', ancho: 30, ayuda: 'Desde Reporte Info. Se puede escribir encima.' },
  { l: 'Q', titulo: 'Estado sin ítems', clase: 'opcional', ancho: 14, ayuda: 'Solo si la gestión no tiene ítems. Vacío = AGENDADO.' },
  { l: 'R', titulo: 'N° ítems', clase: 'formula', ancho: 9, ayuda: 'Automático.' },
  { l: 'S', titulo: 'Suma ítems', clase: 'formula', ancho: 13, pesos: true, ayuda: 'Suma de Total ítem.' },
  { l: 'T', titulo: 'Diferencia', clase: 'formula', ancho: 13, pesos: true, ayuda: 'Total cotización − suma. En rojo si no cuadra.' },
  { l: 'U', titulo: 'Solicitud', clase: 'formula', ancho: 12, ayuda: 'Solo informativo (filas importadas).' },
  { l: 'V', titulo: 'ORIGEN', clase: 'formula', ancho: 14, ayuda: 'Automático: REGISTRADO en las filas en uso.' },
  { l: 'W', titulo: 'Registrado por', clase: 'obligatorio', ancho: 18, ayuda: 'Quién la registró (lista de Catálogos, columna N).' },
  { l: 'X', titulo: 'ID externo', clase: 'formula', ancho: 18, ayuda: 'Solo filas importadas.' },
  { l: 'Y', titulo: 'aux: primer estado', clase: 'formula', oculta: true },
  { l: 'Z', titulo: 'aux: líneas sin código', clase: 'formula', oculta: true },
  // Después de las auxiliares (ocultas) para no mover sus letras; en
  // pantalla queda junto a ID sistema.
  { l: 'AA', titulo: 'MODIFICADO', clase: 'formula', ancho: 12, ayuda: 'Filas importadas: SÍ si se cambió Informe, Lado u Observación.' },
  { l: 'AB', titulo: 'orig: Informe', clase: 'formula', oculta: true },
  { l: 'AC', titulo: 'orig: Lado', clase: 'formula', oculta: true },
  { l: 'AD', titulo: 'orig: Observación', clase: 'formula', oculta: true },
  { l: 'AE', titulo: 'Alerta', clase: 'formula', ancho: 34, ayuda: 'Admisión que no está en Reporte Info, o convenio/previsión fuera de su lista.' },
  // Lo que trae Reporte Info para la admisión (las celdas visibles E, M-P
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
export const AUTOCOMPLETADO_GESTION = Object.freeze({ E: 'AG', M: 'AH', N: 'AI', O: 'AJ', P: 'AK' });

// Letra de Excel de una columna (1 = A, 27 = AA).
const letraColumna = (n) => (n > 26 ? letraColumna(Math.floor((n - 1) / 26)) : '') + String.fromCharCode(65 + ((n - 1) % 26));

// Ítems se define por clave (`k`) y la letra sale de la posición: el orden
// se puede cambiar aquí sin tocar las fórmulas, que usan I.<clave>. Las
// macros buscan las columnas por su título (fila 2), así que un título
// nuevo o cambiado también debe cambiarse en macros/ModContingencia.bas.
// Orden (decisión del 23-11-2026): primero la "vista de carga" (VISTA_CARGA,
// encabezado verde y congelada), lo que se revisa al cargar en el sistema;
// después la línea completa y las auxiliares.
const DEF_ITEMS = [
  { k: 'linea', titulo: 'N° línea', clase: 'formula', ancho: 8, ayuda: 'Fijo. Se usa en "Línea padre".' },
  { k: 'admision', titulo: 'Admisión', clase: 'formula', ancho: 11, texto: true, ayuda: 'Automática, de la CLAVE.' },
  { k: 'fecha', titulo: 'Fecha', clase: 'formula', ancho: 11, fecha: true, ayuda: 'Automática, de la CLAVE.' },
  { k: 'codigo', titulo: 'Código', clase: 'formula', ancho: 12, ayuda: 'Del catálogo. "No lleva OC" en CONTENIDO PAD, LOTE ADICIONAL y SIN CARGO.' },
  // La cantidad se escribe en "Cantidad (ingresar)", junto a Referencia
  // (decisión del 24-11-2026); aquí se muestra, como Admisión y Fecha.
  { k: 'cantidad', titulo: 'Cantidad', clase: 'formula', ancho: 9, ayuda: 'Automática: la de "Cantidad (ingresar)".' },
  { k: 'venta', titulo: 'Venta', clase: 'formula', ancho: 13, pesos: true, ayuda: 'Precio × veces costo × cantidad.' },
  // Decisión del 25-11-2026: el paciente a la vista, junto a la venta.
  { k: 'nombrePaciente', titulo: 'Nombre paciente', clase: 'formula', ancho: 24, ayuda: 'Automático: el Nombre paciente de la gestión (Gestiones) según la CLAVE.' },
  { k: 'estadoCarga', titulo: 'Estado carga', clase: 'opcional', ancho: 13, campo: 'estadoCarga', original: 'origEstadoCarga', ayuda: 'Vacío = PENDIENTE. Se cambia en NORMAL y PAD PADRE; CONTENIDO PAD dice CONTENIDO (automático).' },
  { k: 'clave', titulo: 'CLAVE', clase: 'obligatorio', ancho: 34, ayuda: 'Gestión a la que pertenece (lista de Gestiones).' },
  { k: 'tipoLinea', titulo: 'Tipo de línea', clase: 'obligatorio', ancho: 16, ayuda: 'NORMAL, PAD PADRE, CONTENIDO PAD, LOTE ADICIONAL o CONTENIDO GUÍA (lo pone la guía). En rojo si falta (vacío se toma como NORMAL).' },
  { k: 'padre', titulo: 'Línea padre', clase: 'opcional', ancho: 9, ayuda: 'Solo CONTENIDO PAD (N° del PAD PADRE) y LOTE ADICIONAL (N° de la línea NORMAL).' },
  { k: 'numCot', titulo: 'N° cotización', clase: 'obligatorio', ancho: 14, texto: true, ayuda: 'N° de la cotización del proveedor.' },
  { k: 'referencia', titulo: 'Referencia', clase: 'obligatorio', ancho: 24, texto: true, ayuda: 'De la lista (se puede escribir). Si no existe queda "Sin código".' },
  { k: 'cantidadIngreso', titulo: 'Cantidad (ingresar)', clase: 'obligatorio', ancho: 10, campo: 'cantidad', original: 'origCantidad', ayuda: 'Obligatoria. Mayor que 0. En una referencia con lotes: la cantidad TOTAL. Se ve también en Cantidad (E).' },
  { k: 'numGuia', titulo: 'N° guía', clase: 'opcional', ancho: 12, texto: true, ayuda: 'Consignación: lo escribe "Agregar a Ítems" (hoja Consignación).' },
  { k: 'codigoReal', titulo: 'Código real', clase: 'formula', ancho: 12, ayuda: 'Código del catálogo según la referencia, en TODAS las líneas (también CONTENIDO PAD, LOTE ADICIONAL y SIN CARGO).' },
  { k: 'lote', titulo: 'Lote', clase: 'obligatorio', ancho: 14, texto: true, campo: 'lote', original: 'origLote', ayuda: 'En rojo si falta: escriba el lote o "Sin lote". PAD PADRE: PAD (automático).' },
  { k: 'vencimiento', titulo: 'Vencimiento', clase: 'obligatorio', ancho: 12, fecha: true, campo: 'vencimiento', original: 'origVencimiento', ayuda: 'dd-mm-aaaa o "Sin fecha". En rojo si falta. PAD PADRE: PAD (automático).' },
  { k: 'precioManual', titulo: 'Precio manual', clase: 'opcional', ancho: 12, pesos: true, ayuda: 'Opcional: reemplaza el precio del catálogo (ej. referencia sin código).' },
  { k: 'precio', titulo: 'Precio unitario', clase: 'formula', ancho: 12, pesos: true, ayuda: 'Catálogo o precio manual.' },
  { k: 'empresaProducto', titulo: 'Empresa producto', clase: 'formula', ancho: 22, ayuda: 'En rojo si no coincide con la empresa de la gestión.' },
  { k: 'clase', titulo: 'Clase', clase: 'formula', ancho: 10, ayuda: 'Del catálogo.' },
  { k: 'tipo', titulo: 'Tipo', clase: 'formula', ancho: 12, ayuda: 'Del catálogo.' },
  { k: 'descriptor', titulo: 'Descriptor', clase: 'formula', ancho: 30, ayuda: 'Del catálogo.' },
  { k: 'veces', titulo: 'Veces costo', clase: 'formula', ancho: 8, ayuda: 'Según rango de recargo.' },
  { k: 'total', titulo: 'Total ítem', clase: 'formula', ancho: 13, pesos: true, ayuda: 'Precio × cantidad.' },
  { k: 'alerta', titulo: 'Alerta', clase: 'formula', ancho: 40, ayuda: 'Problemas de la fila. Debe quedar vacía.' },
  { k: 'origen', titulo: 'ORIGEN', clase: 'formula', ancho: 14, ayuda: 'Automático: REGISTRADO en las filas en uso.' },
  { k: 'registrado', titulo: 'Registrado por', clase: 'obligatorio', ancho: 18, ayuda: 'Quién la registró (lista de Catálogos, columna N).' },
  { k: 'idSistema', titulo: 'ID externo', clase: 'formula', ancho: 18, ayuda: 'Solo filas importadas.' },
  { k: 'tipoEf', titulo: 'aux: tipo', clase: 'formula', oculta: true },
  { k: 'estadoEf', titulo: 'aux: estado', clase: 'formula', oculta: true },
  { k: 'estadoNorm', titulo: 'aux: estado normalizado', clase: 'formula', oculta: true },
  { k: 'empresaGestion', titulo: 'aux: empresa gestión', clase: 'formula', oculta: true },
  { k: 'refBuscada', titulo: 'aux: referencia buscada', clase: 'formula', oculta: true },
  { k: 'filaCat', titulo: 'aux: fila catálogo', clase: 'formula', oculta: true },
  { k: 'ambigua', titulo: 'aux: ambigua', clase: 'formula', oculta: true },
  { k: 'filaPadre', titulo: 'aux: fila padre', clase: 'formula', oculta: true },
  { k: 'sinCodigo', titulo: 'aux: sin código', clase: 'formula', oculta: true },
  { k: 'tramo', titulo: 'aux: tramo recargo', clase: 'formula', oculta: true },
  { k: 'recargoOk', titulo: 'aux: recargo encontrado', clase: 'formula', oculta: true },
  { k: 'empresaNoCoincide', titulo: 'aux: empresa no coincide', clase: 'formula', oculta: true },
  // Después de las auxiliares (ocultas); en pantalla queda junto a ID sistema.
  { k: 'modificado', titulo: 'MODIFICADO', clase: 'formula', ancho: 12, ayuda: 'Filas importadas: SÍ si se cambió Cantidad (ingresar), Lote, Vencimiento o Estado carga.' },
  { k: 'origCantidad', titulo: 'orig: Cantidad', clase: 'formula', oculta: true },
  { k: 'origLote', titulo: 'orig: Lote', clase: 'formula', oculta: true, texto: true },
  { k: 'origVencimiento', titulo: 'orig: Vencimiento', clase: 'formula', oculta: true, fecha: true },
  { k: 'origEstadoCarga', titulo: 'orig: Estado carga', clase: 'formula', oculta: true },
  // Diferencia de la gestión (Gestiones T = Total cotización − suma de Total
  // ítem): pinta Total ítem y Venta de sus líneas cuando no cuadra
  // (decisión del 24-11-2026). Al final para no mover las demás letras.
  { k: 'difCotizacion', titulo: 'aux: diferencia cotización', clase: 'formula', oculta: true },
];
// Letra de cada columna de Ítems por clave (I.cantidad = 'E').
export const I = Object.freeze(Object.fromEntries(DEF_ITEMS.map((c, i) => [c.k, letraColumna(i + 1)])));
export const COLUMNAS_ITEMS = DEF_ITEMS.map((c) => ({ ...c, l: I[c.k], ...(c.original ? { original: I[c.original] } : {}) }));
// Columnas de la vista de carga (las primeras de Ítems y de Cargados).
export const VISTA_CARGA = Object.freeze(['N° línea', 'Admisión', 'Fecha', 'Código', 'Cantidad', 'Venta', 'Nombre paciente', 'Estado carga']);

// Valores automáticos por tipo de línea (decisión del 24-11-2026): el PAD
// PADRE lleva Lote y Vencimiento "PAD" (como lo guarda el sistema) y el
// CONTENIDO PAD, Estado carga "CONTENIDO". Son fórmulas en celdas que se
// escriben: la macro usa las mismas (FormulasDefectoItem en ModContingencia.bas).
export const VALOR_PAD = 'PAD';
export const ESTADO_CONTENIDO = 'CONTENIDO';
export const SIN_FECHA = 'Sin fecha';
// Línea de una guía de consignación (decisión del 24-11-2026): "No lleva OC",
// precio 0 y Estado carga CONTENIDO, sin línea padre. Solo existe en la
// contingencia (el sistema no tiene este tipo). La llena la macro TraerGuia.
export const TIPO_CONTENIDO_GUIA = 'CONTENIDO GUÍA';
// Segmento (Atributo de la gestión) que permite traer guías.
export const SEGMENTO_CONSIGNACION = 'CONSIGNACION';
const esContenido = (celdaTipo) => `OR(${celdaTipo}="CONTENIDO PAD",${celdaTipo}="${TIPO_CONTENIDO_GUIA}")`;
const valoresPorTipo = (c) => ({
  lote: f(`IF(${c.tipoLinea}="PAD PADRE","${VALOR_PAD}","")`),
  vencimiento: f(`IF(${c.tipoLinea}="PAD PADRE","${VALOR_PAD}","")`),
  estadoCarga: f(`IF(${esContenido(c.tipoLinea)},"${ESTADO_CONTENIDO}","")`),
});

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
// `vistaCarga`: cuántas columnas del inicio forman la vista de carga
// (encabezado verde y borde grueso al final).
const prepararHoja = (hoja, columnas, { conAyuda = true, congelarColumnas = 0, ayudaEnNota = [], vistaCarga = 0 } = {}) => {
  hoja.columns = columnas.map((c) => ({ key: c.l, width: c.ancho || 12, hidden: !!c.oculta }));
  const filaEnc = hoja.getRow(FILA_ENCABEZADO);
  const filaAyuda = hoja.getRow(FILA_AYUDA);
  columnas.forEach((c, i) => {
    const celda = filaEnc.getCell(c.l);
    celda.value = c.titulo;
    celda.font = { bold: true };
    celda.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    celda.fill = relleno(i < vistaCarga ? COLOR.vista : (COLOR[c.clase] || COLOR.formula));
    celda.border = i === vistaCarga - 1 ? { ...BORDES, right: BORDE_VISTA } : BORDES;
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
    rules: [{ type: 'expression', priority: 1, formulae: [`AND($${colOrigen}${desde}="${ORIGEN_REGISTRADO}",${l}${desde}="")`], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: COLOR.error } } } }],
  }));
};

// --- Hoja Catálogos -----------------------------------------------------------

// Listas fijas del sistema (bloqueadas).
const LISTAS_FIJAS = [
  { l: 'A', titulo: 'Estado gestión', valores: ESTADOS_GESTION, ancho: 16 },
  { l: 'B', titulo: 'Estado carga', valores: ESTADOS_CARGA, ancho: 14 },
  { l: 'C', titulo: 'Informe', valores: INFORMES, ancho: 12 },
  { l: 'D', titulo: 'Lado', valores: NOMBRES_LADO, ancho: 16 },
  { l: 'E', titulo: 'Tipo de línea', valores: [...LISTA_TIPOS_LINEA, TIPO_CONTENIDO_GUIA], ancho: 16 },
  // Listas de la hoja Códigos (las mismas del sistema).
  { l: 'F', titulo: 'Tipo (Códigos)', valores: TIPOS_CODIGO, ancho: 16 },
  { l: 'G', titulo: 'Segmento (Códigos)', valores: SEGMENTOS_CODIGO, ancho: 18 },
  { l: 'H', titulo: 'Clase (Códigos)', valores: CLASES_CODIGO, ancho: 14 },
  // Lista de Estado carga de una línea CONTENIDO PAD (ver ESTADO_CONTENIDO).
  { l: 'I', titulo: 'Estado contenido PAD', valores: [ESTADO_CONTENIDO], ancho: 14 },
];

const encabezado = (celda, titulo) => {
  celda.value = titulo;
  celda.font = { bold: true };
  celda.fill = relleno(COLOR.formula);
  celda.border = BORDES;
};

const COL_REGISTRADORES = 'N';
const FILAS_REGISTRADORES = 50;
// Avisa sin bloquear: con la lista vacía tampoco impide escribir.
const listaRegistradoPor = (rango) => lista(rango, { errorStyle: 'warning', errorTitle: 'Registrado por', error: 'No está en la lista de "Registrado por" (hoja Catálogos, columna N). ¿Usarlo igual?' });

const hojaCatalogos = (libro, libroMes) => {
  const hoja = libro.addWorksheet(H.C);
  const rangos = {};
  hoja.getCell('A1').value = 'Listas fijas (no modificar). La columna N (Registrado por) sí se escribe.';
  hoja.getCell('A1').font = { italic: true };
  LISTAS_FIJAS.forEach((b) => {
    hoja.getColumn(b.l).width = b.ancho;
    encabezado(hoja.getCell(`${b.l}${FILA_ENCABEZADO}`), b.titulo);
    b.valores.forEach((v, i) => { hoja.getCell(`${b.l}${PRIMERA + i}`).value = v; });
    rangos[b.l] = `${ref(H.C)}$${b.l}$${PRIMERA}:$${b.l}$${PRIMERA + b.valores.length - 1}`;
  });
  // Mes del libro (ver CELDAS_LIBRO). Vacío en la plantilla base.
  [['J', 'Meses', 12], ['K', 'Libro: año', 10], ['L', 'Libro: mes', 10], ['M', 'Libro', 18]].forEach(([l, titulo, ancho]) => {
    hoja.getColumn(l).width = ancho;
    encabezado(hoja.getCell(`${l}${FILA_ENCABEZADO}`), titulo);
  });
  MESES_LIBRO.forEach((m, i) => { hoja.getCell(`J${PRIMERA + i}`).value = m; });
  if (libroMes) {
    hoja.getCell('K3').value = libroMes.anio;
    hoja.getCell('L3').value = libroMes.mes;
  }
  hoja.getCell('M3').value = f('IF(N(K3)=0,"",INDEX($J$3:$J$14,L3)&" "&K3)');
  // Personas que registran (desplegable de "Registrado por" en Gestiones e
  // Ítems; decisión del 24-11-2026). Se escriben aquí: celdas desbloqueadas.
  hoja.getColumn(COL_REGISTRADORES).width = 24;
  encabezado(hoja.getCell(`${COL_REGISTRADORES}${FILA_ENCABEZADO}`), 'Registrado por');
  const ayudaReg = hoja.getCell(`${COL_REGISTRADORES}${FILA_AYUDA}`);
  ayudaReg.value = 'Escriba aquí quién registra (una persona por fila): es la lista de "Registrado por".';
  ayudaReg.font = { italic: true, size: 9 };
  ayudaReg.alignment = { wrapText: true, vertical: 'top' };
  hoja.getRow(FILA_AYUDA).height = 36;
  const ultimaRegistrador = PRIMERA + FILAS_REGISTRADORES - 1;
  for (let r = PRIMERA; r <= ultimaRegistrador; r += 1) {
    const celda = hoja.getCell(`${COL_REGISTRADORES}${r}`);
    celda.protection = { locked: false };
    celda.fill = relleno(COLOR.opcional);
    celda.border = BORDES;
  }
  rangos.registrado = `${ref(H.C)}$${COL_REGISTRADORES}$${PRIMERA}:$${COL_REGISTRADORES}$${ultimaRegistrador}`;

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
  const marca = MARCAS_CAMBIO[H.R];
  prepararHoja(hoja, [
    ...COLUMNAS_REFERENCIAS.map((c) => ({ ...c, clase: c.automatica ? 'formula' : 'opcional' })),
    ...columnasMarcas(marca, COLUMNAS_REFERENCIAS),
  ], { conAyuda: false, congelarColumnas: 3 });
  // A1: botón "Fijar catálogos como base" (macro FijarCatalogosBase); la
  // descripción va a su derecha.
  hoja.getRow(1).height = 30;
  hoja.getCell('B1').value = 'Catálogo de códigos. Pegue desde B3 (ver Instrucciones, "PEGAR LOS CATÁLOGOS"). Para agregar un código, escríbalo en la primera fila vacía; para corregir uno, escriba encima. CAMBIO marca lo NUEVO, MODIFICADO o BORRADO. A, O, P, CAMBIO y FECHA CAMBIO son automáticas; las INACTIVAS no se usan.';
  hoja.getCell('B1').font = { italic: true };
  hoja.getCell('B1').alignment = { vertical: 'middle' };
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
    escribirMarcas(fila, r, marca);
  }
  colorearMarcas(hoja, marca, ultima);
  const col = (l) => `${ref(H.R)}$${l}$${PRIMERA}:$${l}$${ultima}`;
  return { hoja, col };
};

// --- Marcas de cambio en catálogos ---------------------------------------------------
// Decisión del 23-11-2026: el libro del mes es el que manda; durante el mes
// se agregan o corrigen códigos, empresas, centros y recargos, y el libro
// del mes siguiente se crea desde él (copia). Para pasar después esos
// cambios al Maestro de la app, cada hoja marca sus filas:
//   - CAMBIO (fórmula): NUEVO, MODIFICADO o BORRADO, comparando cada celda
//     con su valor original (columnas ocultas "orig: …": lo que traía la
//     plantilla, o lo que había al usar el botón "Fijar catálogos como
//     base", macro FijarCatalogosBase;
//     una por dato, sin convertir a texto: así no depende del separador
//     decimal del equipo). Volver al valor original quita la marca.
//   - FECHA CAMBIO: la escribe la macro al editar la fila (evento
//     Workbook_SheetChange → RegistrarCambioCatalogo; MARCAS en
//     ModContingencia.bas). Sin macros habilitadas queda vacía.
// Las marcas y lo original viajan con la copia, así se mantienen de un mes
// al siguiente hasta regenerar la plantilla.
export const MARCAS_CAMBIO = Object.freeze({
  [H.R]: Object.freeze({ desde: 'B', hasta: 'N', cambio: 'Q', fecha: 'R', orig: 'S' }),
  [H.E]: Object.freeze({ desde: 'A', hasta: 'C', cambio: 'D', fecha: 'E', orig: 'F' }),
  [H.CEN]: Object.freeze({ desde: 'A', hasta: 'D', cambio: 'E', fecha: 'F', orig: 'G' }),
  [H.REC]: Object.freeze({ desde: 'A', hasta: 'E', cambio: 'F', fecha: 'G', orig: 'H' }),
});
const numeroColumna = (l) => [...l].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
const columnasDeMarca = (m) => {
  const datos = [];
  for (let n = numeroColumna(m.desde); n <= numeroColumna(m.hasta); n += 1) datos.push(letraColumna(n));
  return { datos, orig: datos.map((_, i) => letraColumna(numeroColumna(m.orig) + i)) };
};

// Columnas que agregan las marcas (para prepararHoja), a la derecha de los datos.
const columnasMarcas = (m, columnas) => {
  const { datos, orig } = columnasDeMarca(m);
  const titulo = (l) => columnas.find((c) => c.l === l)?.titulo || l;
  return [
    { l: m.cambio, titulo: 'CAMBIO', clase: 'formula', automatica: true, ancho: 12 },
    { l: m.fecha, titulo: 'FECHA CAMBIO', clase: 'formula', automatica: true, ancho: 12, fecha: true },
    ...datos.map((l, i) => ({ l: orig[i], titulo: `orig: ${titulo(l)}`, clase: 'formula', automatica: true, oculta: true })),
  ];
};

// Fila r: guarda lo original (lo que ya trae la fila) y la fórmula CAMBIO.
const escribirMarcas = (fila, r, m) => {
  const { datos, orig } = columnasDeMarca(m);
  datos.forEach((l, i) => {
    const v = fila.getCell(l).value;
    const o = fila.getCell(orig[i]);
    if (v !== undefined && v !== null && v !== '') o.value = v;
    o.protection = { locked: true };
  });
  const vacia = `COUNTA(${m.desde}${r}:${m.hasta}${r})=0`;
  const sinOriginal = `COUNTA(${orig[0]}${r}:${orig[orig.length - 1]}${r})=0`;
  const distinta = `OR(${datos.map((l, i) => `${l}${r}<>${orig[i]}${r}`).join(',')})`;
  fila.getCell(m.cambio).value = f(`IF(${vacia},IF(${sinOriginal},"","BORRADO"),IF(${sinOriginal},"NUEVO",IF(${distinta},"MODIFICADO","")))`);
  fila.getCell(m.cambio).protection = { locked: true };
  const fecha = fila.getCell(m.fecha);
  fecha.numFmt = FORMATO_FECHA;
  fecha.protection = { locked: true };
};

const colorearMarcas = (hoja, m, ultima) => hoja.addConditionalFormatting({
  ref: `${m.cambio}${PRIMERA}:${m.cambio}${ultima}`,
  rules: [
    { type: 'expression', priority: 1, formulae: [`${m.cambio}${PRIMERA}="NUEVO"`], style: { font: { bold: true, color: { argb: COLOR.ok } }, fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: COLOR.okFondo } } } },
    { type: 'expression', priority: 2, formulae: [`${m.cambio}${PRIMERA}="MODIFICADO"`], style: { font: { bold: true }, fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: COLOR.cambiado } } } },
    { type: 'expression', priority: 3, formulae: [`${m.cambio}${PRIMERA}="BORRADO"`], style: { font: { bold: true, color: { argb: COLOR.textoError } }, fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: COLOR.error } } } },
  ],
});

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
  const marca = MARCAS_CAMBIO[H.E];
  prepararHoja(hoja, [...COLUMNAS_EMPRESAS.map((c) => ({ ...c, clase: 'opcional' })), ...columnasMarcas(marca, COLUMNAS_EMPRESAS)], { conAyuda: false, congelarColumnas: 1 });
  hoja.getCell('A1').value = 'Empresas activas (desplegable de Gestiones). Para agregar una, escríbala en la primera fila vacía; CAMBIO marca lo NUEVO, MODIFICADO o BORRADO.';
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
    escribirMarcas(fila, r, marca);
  }
  colorearMarcas(hoja, marca, ultima);
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
  hoja.getCell('A1').value = 'Admisiones de Reporte Info: de aquí se autocompletan Nombre, Convenio, Previsión, Médico y Descripción en Gestiones. Para actualizarla, pegue un Reporte Info nuevo desde A3 (ver Instrucciones, "ACTUALIZAR REPORTE INFO"). H es automática.';
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
// Con marcas de cambio si la hoja está en MARCAS_CAMBIO (Recargos).
const hojaMaestro = (libro, nombreHoja, columnas, descripcion, filasDatos, totalFilas) => {
  const hoja = libro.addWorksheet(nombreHoja);
  const marca = MARCAS_CAMBIO[nombreHoja];
  prepararHoja(hoja, [...columnas.map((c) => ({ ...c, clase: 'opcional' })), ...(marca ? columnasMarcas(marca, columnas) : [])], { conAyuda: false, congelarColumnas: 1 });
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
    if (marca) escribirMarcas(fila, r, marca);
  }
  if (marca) colorearMarcas(hoja, marca, ultima);
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

// --- Hoja Guías ---------------------------------------------------------------------
// Detalle de las guías de despacho de consignación (decisión del 24-11-2026),
// una fila por línea de guía. Se pegan desde A3 (el Excel que descargará
// Consignación → Ingreso de guías). La macro TraerGuia lee estas columnas por
// posición (GU_* en ModContingencia.bas).
export const COLUMNAS_GUIAS = [
  { l: 'A', titulo: 'N° guía', ancho: 12, texto: true },
  { l: 'B', titulo: 'Referencia', ancho: 22, texto: true },
  { l: 'C', titulo: 'Código', ancho: 14, texto: true },
  { l: 'D', titulo: 'Delivery', ancho: 14, texto: true },
  { l: 'E', titulo: 'Cantidad', ancho: 9 },
  { l: 'F', titulo: 'Lote', ancho: 16, texto: true },
  { l: 'G', titulo: 'Vencimiento', ancho: 12, fecha: true },
  { l: 'H', titulo: 'Descripción', ancho: 40 },
];

// Sin fila por fila (serán muchas): el formato y el desbloqueo van por
// columna, que Excel aplica a toda celda nueva de la columna.
const hojaGuias = (libro) => {
  const hoja = libro.addWorksheet(H.GUIAS);
  prepararHoja(hoja, COLUMNAS_GUIAS.map((c) => ({ ...c, clase: 'opcional' })), { conAyuda: false, congelarColumnas: 1 });
  hoja.getCell('A1').value = 'Guías de consignación: pegue desde A3 el detalle (N° guía, Referencia, Código, Delivery, Cantidad, Lote, Vencimiento, Descripción). La hoja Consignación busca aquí el Delivery ("Vincular guías").';
  hoja.getCell('A1').font = { italic: true };
  COLUMNAS_GUIAS.forEach((c) => {
    const col = hoja.getColumn(c.l);
    if (c.texto) col.numFmt = '@';
    if (c.fecha) col.numFmt = FORMATO_FECHA;
    col.protection = { locked: false };
  });
  hoja.autoFilter = { from: { row: FILA_ENCABEZADO, column: 1 }, to: { row: FILAS_FILTRO, column: COLUMNAS_GUIAS.length } };
  // Ayuda y encabezados quedan bloqueados.
  [FILA_AYUDA, FILA_ENCABEZADO].forEach((n) => COLUMNAS_GUIAS.forEach((c) => { hoja.getCell(`${c.l}${n}`).protection = { locked: true }; }));
  return hoja;
};

// --- Hoja Consignación ----------------------------------------------------------------
// Registro de consignación por cargar (decisión del 25-11-2026): se pegan
// desde A3 las columnas C a J del registro de consignación (Admisión, Paciente,
// Médico, Fecha CX, Empresa, Código, Cantidad, Delivery). "Vincular guías"
// (macro VincularConsignacion) escribe I..N y agrega debajo de cada fila el
// contenido de su guía; "Agregar a Ítems" (AgregarConsignacion) lo pasa a
// Gestiones e Ítems y lo borra de aquí. La macro lee por posición
// (CO_COLUMNAS en ModContingencia.bas).
export const COLUMNAS_CONSIGNACION = [
  { l: 'A', titulo: 'Admisión', ancho: 11, texto: true, pega: true },
  { l: 'B', titulo: 'Paciente', ancho: 26, pega: true },
  { l: 'C', titulo: 'Médico', ancho: 24, pega: true },
  { l: 'D', titulo: 'Fecha CX', ancho: 11, fecha: true, pega: true },
  { l: 'E', titulo: 'Empresa', ancho: 28, pega: true },
  { l: 'F', titulo: 'Código', ancho: 11, texto: true, pega: true },
  { l: 'G', titulo: 'Cantidad', ancho: 9, pega: true },
  { l: 'H', titulo: 'Delivery', ancho: 13, texto: true, pega: true },
  { l: 'I', titulo: 'Tipo de línea', ancho: 15 },
  { l: 'J', titulo: 'Referencia', ancho: 22 },
  { l: 'K', titulo: 'Lote', ancho: 14 },
  { l: 'L', titulo: 'Vencimiento', ancho: 12, fecha: true },
  { l: 'M', titulo: 'N° guía', ancho: 11 },
  { l: 'N', titulo: 'Estado', ancho: 44 },
];

const hojaConsignacion = (libro) => {
  const hoja = libro.addWorksheet(H.CONSIG);
  prepararHoja(hoja, COLUMNAS_CONSIGNACION.map((c) => ({ ...c, clase: c.pega ? 'opcional' : 'formula' })), { conAyuda: false, congelarColumnas: 1 });
  // A1 y C1: botones "Vincular guías" y "Agregar a Ítems"; la ayuda, a la derecha.
  hoja.getRow(1).height = 30;
  const ayuda = hoja.getCell('E1');
  ayuda.value = 'Pegue desde A3 las columnas C a J del registro de consignación (Pegar valores). "Vincular guías" busca la referencia del Código y el contenido de la guía del Delivery (hoja Guías); "Agregar a Ítems" lo pasa a Gestiones e Ítems y lo borra de aquí.';
  ayuda.font = { italic: true, size: 9, color: { argb: 'FF595959' } };
  ayuda.alignment = { wrapText: true, vertical: 'middle' };
  hoja.mergeCells('E1:N1');
  COLUMNAS_CONSIGNACION.forEach((c) => {
    const col = hoja.getColumn(c.l);
    if (c.texto) col.numFmt = '@';
    if (c.fecha) col.numFmt = FORMATO_FECHA;
    // Se pegan A..H; I..N las escribe la macro.
    col.protection = { locked: !c.pega };
  });
  hoja.autoFilter = { from: { row: FILA_ENCABEZADO, column: 1 }, to: { row: FILAS_FILTRO, column: COLUMNAS_CONSIGNACION.length } };
  [FILA_AYUDA, FILA_ENCABEZADO].forEach((n) => COLUMNAS_CONSIGNACION.forEach((c) => { hoja.getCell(`${c.l}${n}`).protection = { locked: true }; }));
  return hoja;
};

// Textos de los botones (Instrucciones y ayuda de Cargados). Exportados para
// actualizar con ellos un libro que ya tiene datos.
export const TEXTOS_MACROS = Object.freeze({
  mover: "\"Mover cargados\" (hoja Ítems, arriba a la izquierda): busca las gestiones con Estado = CARGADO (todas sus líneas CARGADO, CONTENIDO o SIN CARGO) y fecha del mes del libro (las de otro mes no se mueven y lo avisa), le dice cuántas gestiones e ítems va a mover (y cuántos ítems tienen alerta), le pide su nombre y que confirme. Copia las líneas a la hoja Cargados como valores (ORIGEN = CARGADO), con fecha/hora y su nombre, y limpia esas filas en Ítems. La gestión se queda en Gestiones con Estado FINALIZADO (fila verde). Además guarda, junto a este libro, un Excel Solicitud_Implantes_AAAA-MM-DD_HHMM.xlsx solo con las hojas Solicitud Implantes y Resumen de lo que se movió (valores, sin fórmulas ni macros).",
  devolver: "\"Devolver a pendientes\" (hoja Cargados, arriba a la izquierda): pide la CLAVE de la gestión (por defecto, la de la fila seleccionada en Cargados), confirma y devuelve todas sus líneas a filas libres de Ítems (con N° de línea nuevos; la Línea padre se ajusta sola), las quita de Cargados, Solicitud Implantes y Resumen. La gestión sigue en su fila de Gestiones y vuelve a calcular su Estado.",
  cargados: "Líneas ya CARGADO (una fila por línea, como valores; la gestión sigue en Gestiones como FINALIZADO). Las mueve el botón \"Mover cargados\" de Ítems. Para devolver una gestión: botón \"Devolver a pendientes\" y escriba o confirme su CLAVE. En verde, la vista de carga.",
});

// --- Hoja Cargados -----------------------------------------------------------------
// La llena la macro "Mover cargados" (macros/MoverCargados.bas) con VALORES:
// una fila por línea de ítem, con la cabecera de su gestión repetida, más
// lo calculado (código, precio, recargo, venta…) y los auxiliares que hacen
// falta para cargarla en el sistema o devolverla a pendientes. La macro lee
// y escribe cada columna por su TÍTULO (fila 2), así que el orden se puede
// cambiar aquí; un título nuevo o cambiado debe cambiarse también en
// macros/ModContingencia.bas (C_DESDE_ITEMS, G_DESDE_CARGADOS). Mismo orden
// que Ítems: primero la vista de carga (`vista`), después la gestión
// (`gestion`) y el resto de la línea.
export const COLUMNAS_CARGADOS = [
  { titulo: 'N° línea (original)', ancho: 9, vista: true },
  { titulo: 'Admisión', ancho: 11, texto: true, vista: true },
  { titulo: 'Fecha', ancho: 11, fecha: true, vista: true },
  { titulo: 'Código', ancho: 12, texto: true, vista: true },
  { titulo: 'Cantidad', ancho: 9, vista: true },
  { titulo: 'Venta', ancho: 12, pesos: true, vista: true },
  { titulo: 'Estado carga', ancho: 12, vista: true },
  { titulo: 'Movido el', ancho: 17, fechaHora: true, gestion: true },
  { titulo: 'Movido por', ancho: 16, gestion: true },
  { titulo: 'CLAVE', ancho: 34, gestion: true },
  { titulo: 'Empresa', ancho: 24, gestion: true },
  { titulo: 'Nombre paciente', ancho: 26, gestion: true },
  { titulo: 'Total cotización', ancho: 13, pesos: true, gestion: true },
  { titulo: 'Informe', ancho: 11, gestion: true },
  { titulo: 'Centro', ancho: 13, gestion: true },
  { titulo: 'Atributo', ancho: 11, gestion: true },
  { titulo: 'Lado', ancho: 12, gestion: true },
  { titulo: 'Observación', ancho: 24, gestion: true },
  { titulo: 'Convenio', ancho: 14, gestion: true },
  { titulo: 'Previsión', ancho: 12, gestion: true },
  { titulo: 'Médico', ancho: 18, gestion: true },
  { titulo: 'Descripción', ancho: 24, gestion: true },
  { titulo: 'Estado sin ítems', ancho: 10, gestion: true },
  { titulo: 'Estado gestión', ancho: 12, gestion: true },
  { titulo: 'Registrado por (gestión)', ancho: 16, gestion: true },
  { titulo: 'Tipo de línea', ancho: 14 },
  { titulo: 'Línea padre (original)', ancho: 9 },
  { titulo: 'N° cotización', ancho: 13, texto: true },
  { titulo: 'N° guía', ancho: 12, texto: true },
  { titulo: 'Referencia', ancho: 20, texto: true },
  { titulo: 'Código real', ancho: 12, texto: true },
  { titulo: 'Lote', ancho: 12, texto: true },
  { titulo: 'Vencimiento', ancho: 12, fecha: true },
  { titulo: 'Precio manual', ancho: 12, pesos: true },
  { titulo: 'Precio unitario', ancho: 12, pesos: true },
  { titulo: 'Empresa producto', ancho: 22 },
  { titulo: 'Clase', ancho: 10 },
  { titulo: 'Tipo', ancho: 12 },
  { titulo: 'Descriptor', ancho: 28 },
  { titulo: 'Veces costo', ancho: 8 },
  { titulo: 'Total ítem', ancho: 12, pesos: true },
  { titulo: 'Sin código (1 = sí)', ancho: 8 },
  { titulo: 'Recargo encontrado (1 = sí)', ancho: 9 },
  { titulo: 'Alerta', ancho: 28 },
  { titulo: 'Registrado por (ítem)', ancho: 16 },
  { titulo: 'ORIGEN', ancho: 13 },
];

export const LETRA_CLAVE_CARGADOS = letraColumna(COLUMNAS_CARGADOS.findIndex((c) => c.titulo === 'CLAVE') + 1);

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
  // El filtro cubre las filas que agrega la macro: con la hoja protegida
  // Excel no puede ampliarlo solo (decisión del 25-11-2026).
  hoja.autoFilter = { from: { row: 1, column: 1 }, to: { row: FILAS_FILTRO, column: columnas.length } };
  return hoja;
};

// Colores de Estado carga (decisión del 24-11-2026): verde lo que cuenta
// como cargado, rojo PENDIENTE, naranja lo que hay que revisar.
const reglasEstadoCarga = (celda) => [
  { type: 'expression', priority: 3, formulae: [`OR(${celda}="CARGADO",${celda}="${ESTADO_CONTENIDO}",${celda}="PAD",${celda}="SIN CARGO")`], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: COLOR.okFondo } }, font: { bold: true, color: { argb: COLOR.ok } } } },
  { type: 'expression', priority: 4, formulae: [`${celda}="PENDIENTE"`], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: COLOR.error } }, font: { bold: true, color: { argb: COLOR.textoError } } } },
  { type: 'expression', priority: 5, formulae: [`OR(${celda}="REVISAR",${celda}="S/COTIZACION")`], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: COLOR.aviso } }, font: { bold: true, color: { argb: COLOR.textoAviso } } } },
];
// Filas de Cargados con colores en Estado carga (las agrega la macro).
const FILAS_COLOR_CARGADOS = 10000;
// Hasta qué fila llega el filtro de las hojas que llenan las macros o se
// pegan (Cargados, Solicitud Implantes, Resumen, Guías).
export const FILAS_FILTRO = 20000;

const hojaCargados = (libro) => {
  const hoja = libro.addWorksheet(H.CARG);
  hoja.columns = COLUMNAS_CARGADOS.map((c) => ({ width: c.ancho }));
  const enc = hoja.getRow(FILA_ENCABEZADO);
  const nVista = COLUMNAS_CARGADOS.filter((c) => c.vista).length;
  COLUMNAS_CARGADOS.forEach((c, i) => {
    const celda = enc.getCell(i + 1);
    celda.value = c.titulo;
    celda.font = { bold: true };
    celda.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    celda.fill = relleno(c.vista ? COLOR.vista : (c.gestion ? COLOR.opcional : COLOR.formula));
    celda.border = i === nVista - 1 ? { ...BORDES, right: BORDE_VISTA } : BORDES;
    // Formato de columna: lo heredan las filas que escriba la macro.
    const col = hoja.getColumn(i + 1);
    if (c.fechaHora) col.numFmt = 'dd-mm-yyyy hh:mm';
    if (c.fecha) col.numFmt = FORMATO_FECHA;
    if (c.pesos) col.numFmt = FORMATO_PESOS;
    if (c.texto) col.numFmt = '@';
  });
  // Después de la vista de carga (congelada): A1 lleva el botón.
  const ayuda = hoja.getCell(1, nVista + 1);
  ayuda.value = TEXTOS_MACROS.cargados;
  ayuda.font = { italic: true, size: 9, color: { argb: 'FF595959' } };
  hoja.getRow(FILA_AYUDA).height = 30;
  enc.height = 42;
  hoja.views = [{ state: 'frozen', xSplit: nVista, ySplit: FILA_ENCABEZADO }];
  hoja.autoFilter = { from: { row: FILA_ENCABEZADO, column: 1 }, to: { row: FILAS_FILTRO, column: COLUMNAS_CARGADOS.length } };
  const lEstado = letraColumna(COLUMNAS_CARGADOS.findIndex((c) => c.titulo === 'Estado carga') + 1);
  hoja.addConditionalFormatting({ ref: `${lEstado}${PRIMERA}:${lEstado}${PRIMERA + FILAS_COLOR_CARGADOS - 1}`, rules: reglasEstadoCarga(`${lEstado}${PRIMERA}`) });
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
  V: f(`IF(B${r}&C${r}&D${r}="","","${ORIGEN_REGISTRADO}")`),
  ...formulasEstadoGestion(r, x),
  // Autocompletado desde Reporte Info: la admisión se busca como texto (la
  // columna H de Reporte Info la convierte), igual que el sistema busca la
  // admisión en Reporte Info y toma su primer registro.
  AF: f(`IF(TRIM(B${r})="","",IFERROR(MATCH(TRIM(B${r}),${x.riBusqueda},0),""))`),
  ...Object.fromEntries(Object.entries(RI_COLUMNA).map(([aux, colRI]) => [aux, f(`IF(AF${r}="","",INDEX(${x.ri(colRI)},AF${r})&"")`)])),
  ...Object.fromEntries(Object.entries(AUTOCOMPLETADO_GESTION).map(([visible, aux]) => [visible, f(`${aux}${r}`)])),
  // Lo pegado se salta la validación: la alerta avisa el mes del libro.
  AE: f(`IF(B${r}&C${r}&D${r}="","",IF(${SIN_MES},"Plantilla base: no registre aquí (cree el libro del mes) · ","")`
    + `&IF(${fueraDelMes(`C${r}`)},"Fecha fuera del mes del libro (es de "&INDEX(${L.meses},MONTH(C${r}))&" "&YEAR(C${r})&") · ","")`
    + `&IF(AND(TRIM(B${r})<>"",AF${r}=""),"Admisión no está en Reporte Info · ","")`
    + `&IF(${fueraDeLista(`M${r}`, x.convenios)},"Convenio fuera de la lista · ","")`
    + `&IF(${fueraDeLista(`N${r}`, x.previsiones)},"Previsión fuera de la lista · ",""))`),
});

// Color de la fila de Gestiones según su Estado (fondos claros).
export const ESTADO_FINALIZADO = 'FINALIZADO';
export const COLORES_ESTADO_GESTION = Object.freeze([
  [['CARGADO', ESTADO_FINALIZADO], 'FFE2EFDA'],     // verde claro
  [['AGENDADO'], 'FFDDEBF7'],                        // azul claro
  [['PENDIENTE'], 'FFFFF2CC'],                       // amarillo claro
  [['INCOMPLETO', 'REVISAR', 'S/COTIZACION'], 'FFFCE4D6'], // naranja claro: hay que revisar
]);

// Fecha escrita que no es del mes del libro (en la base, ninguna lo es).
const fueraDelMes = (celda) => `AND(ISNUMBER(${celda}),${celda}<>"",OR(${SIN_MES},YEAR(${celda})<>${L.anio},MONTH(${celda})<>${L.mes}))`;

// Estado, conteos y diferencia: iguales para filas del sistema y nuevas
// (a una gestión del sistema se le pueden agregar ítems en la caída).
// Estado FINALIZADO (decisión del 24-11-2026): la gestión no tiene ítems en
// Ítems pero sí líneas en Cargados ("Mover cargados" ya no la saca de
// Gestiones). Si después se le agregan ítems, vuelve a la regla normal.
const formulasEstadoGestion = (r, x) => ({
  R: f(`IF(A${r}="","",COUNTIF(${x.iB},A${r}))`),
  Y: f(`IF(N(R${r})=0,"",INDEX(${x.iAA},MATCH(A${r},${x.iB},0)))`),
  Z: f(`IF(N(R${r})=0,0,COUNTIFS(${x.iB},A${r},${x.iAG},1))`),
  H: f(`IF(A${r}="","",IF(N(R${r})=0,IF(COUNTIF(${x.cargadosClave},A${r})>0,"${ESTADO_FINALIZADO}",IF(Q${r}="","AGENDADO",Q${r})),IF(Z${r}>0,"INCOMPLETO",IF(COUNTIFS(${x.iB},A${r},${x.iAA},Y${r})=R${r},Y${r},"INCOMPLETO"))))`),
  S: f(`IF(A${r}="","",SUMIF(${x.iB},A${r},${x.iS}))`),
  T: f(`IF(OR(A${r}="",F${r}=""),"",F${r}-S${r})`),
});

const valoresGestionSistema = (g) => ({
  A: g.clave, B: g.admision, C: g.fecha, D: g.empresa, E: g.nombre, F: g.totalCotizacion,
  G: g.informe, I: g.centro, J: g.atributo, K: g.lado, L: g.observacion,
  M: g.convenio, N: g.prevision, O: g.medico, P: g.descripcion,
  Q: g.estado, U: g.solicitud, V: 'SISTEMA', W: g.registradoPor, X: g.idSistema,
});

// --- Hoja Ítems ------------------------------------------------------------------

// Columnas comunes a todas las filas (también las del sistema): tipo,
// estado, empresa de la gestión, padre, alerta.
// Valores por clave de Ítems → por letra (para escribirFila).
const porLetra = (valores) => Object.fromEntries(Object.entries(valores).map(([k, v]) => {
  if (!I[k]) throw new Error(`Ítems no tiene la columna "${k}".`);
  return [I[k], v];
}));

// Columnas comunes a todas las filas (también las del sistema): tipo,
// estado, empresa de la gestión, padre, admisión y fecha, alerta.
// `c.<clave>` = celda de esa columna en la fila r.
const formulasItemComunes = (r, x) => {
  const c = Object.fromEntries(Object.entries(I).map(([k, l]) => [k, `${l}${r}`]));
  const enLineas = (k) => `$${I[k]}$${PRIMERA}:$${I[k]}$${x.ultimaItem}`;
  const esHija = `OR(${c.tipoEf}="CONTENIDO PAD",${c.tipoEf}="LOTE ADICIONAL")`;
  const padreInvalido = `IF(${esHija},IF(${c.filaPadre}="",TRUE,OR(INDEX(${enLineas('clave')},${c.filaPadre})<>${c.clave},INDEX(${enLineas('tipoEf')},${c.filaPadre})<>IF(${c.tipoEf}="CONTENIDO PAD","PAD PADRE","NORMAL"))),${c.padre}<>"")`;
  // La CLAVE es admisión|empresa|AAAA-MM-DD (fórmula de Gestiones!A).
  const fechaClave = `RIGHT(${c.clave},10)`;
  return porLetra({
    // Cantidad (vista de carga) = la escrita en "Cantidad (ingresar)".
    cantidad: f(`IF(${c.cantidadIngreso}="","",${c.cantidadIngreso})`),
    tipoEf: f(`IF(${c.clave}&${c.tipoLinea}&${c.numCot}&${c.referencia}&${c.cantidadIngreso}="","",IF(${c.tipoLinea}="","NORMAL",${c.tipoLinea}))`),
    // Estado carga (decisión del 24-11-2026): se cambia en NORMAL, PAD PADRE
    // (y LOTE ADICIONAL); el CONTENIDO PAD es siempre CONTENIDO y cuenta como
    // cargado. "PAD" queda por las filas del sistema que lo traen.
    estadoEf: f(`IF(${c.tipoEf}="","",IF(${esContenido(c.tipoEf)},"${ESTADO_CONTENIDO}",IF(${c.estadoCarga}="","PENDIENTE",${c.estadoCarga})))`),
    estadoNorm: f(`IF(${c.estadoEf}="","",IF(OR(${c.estadoEf}="CARGADO",${c.estadoEf}="PAD",${c.estadoEf}="${ESTADO_CONTENIDO}",${c.estadoEf}="SIN CARGO"),"CARGADO",${c.estadoEf}))`),
    empresaGestion: f(`IF(${c.clave}="","",IFERROR(INDEX(${x.gD},MATCH(${c.clave},${x.gA},0)),""))`),
    nombrePaciente: f(`IF(${c.clave}="","",IFERROR(INDEX(${x.gE},MATCH(${c.clave},${x.gA},0))&"",""))`),
    // Vacía si la gestión no tiene Total cotización (Gestiones T vacía).
    difCotizacion: f(`IF(OR(${c.tipoEf}="",${c.empresaGestion}=""),"",IFERROR(INDEX(${x.gT},MATCH(${c.clave},${x.gA},0))*1,""))`),
    filaPadre: f(`IF(${c.padre}="","",IFERROR(MATCH(${c.padre},${enLineas('linea')},0),""))`),
    empresaNoCoincide: f(`IF(AND(OR(${c.tipoEf}="NORMAL",${c.tipoEf}="PAD PADRE"),${c.sinCodigo}=0,${c.empresaProducto}<>"",${c.empresaGestion}<>""),IF(UPPER(TRIM(${c.empresaProducto}))<>UPPER(TRIM(${c.empresaGestion})),1,0),0)`),
    admision: f(`IF(${c.clave}="","",IFERROR(LEFT(${c.clave},FIND("|",${c.clave})-1),""))`),
    fecha: f(`IF(${c.clave}="","",IFERROR(DATE(LEFT(${fechaClave},4),MID(${fechaClave},6,2),RIGHT(${fechaClave},2)),""))`),
    alerta: f(`IF(${c.tipoEf}="","",`
      + `IF(${c.clave}="","Falta CLAVE · ",IF(COUNTIF(${x.gA},${c.clave})=0,"CLAVE no existe · ",""))`
      + `&IF(${c.numCot}="","Falta N° cotización · ","")`
      + `&IF(${c.referencia}="","Falta referencia · ","")`
      + `&IF(N(${c.cantidad})<=0,"Cantidad inválida · ","")`
      // Una ambigua tampoco tiene código: se avisa solo como ambigua.
      + `&IF(AND(${c.sinCodigo}=1,${c.ambigua}=0),"Sin código · ","")`
      + `&IF(${c.ambigua}=1,"Referencia ambigua: revise la empresa · ","")`
      + `&IF(${c.empresaNoCoincide}=1,"Empresa no coincide · ","")`
      + `&IF(AND(${c.sinCodigo}=0,${c.recargoOk}=0),"Sin rango de recargo · ","")`
      + `&IF(${padreInvalido},"Línea padre inválida · ","")`
      + `&IF(AND(${c.tipoEf}="${TIPO_CONTENIDO_GUIA}",${c.empresaGestion}<>""),IF(IFERROR(INDEX(${x.gJ},MATCH(${c.clave},${x.gA},0))&"","")<>"${SEGMENTO_CONSIGNACION}","Guía en gestión que no es de CONSIGNACION · ",""),"")`
      // Lote o vencimiento escrito antes de cambiar la línea a PAD PADRE.
      + `&IF(AND(${c.tipoEf}="PAD PADRE",OR(AND(${c.lote}<>"",${c.lote}<>"${VALOR_PAD}"),AND(${c.vencimiento}<>"",${c.vencimiento}<>"${VALOR_PAD}"))),"PAD PADRE: Lote y Vencimiento deben ser PAD · ","")`
      + `&IF(AND(${c.tipoEf}="LOTE ADICIONAL",${c.filaPadre}<>""),IF(SUMIFS(${enLineas('cantidad')},${enLineas('padre')},${c.padre},${enLineas('tipoEf')},"LOTE ADICIONAL")>INDEX(${enLineas('cantidad')},${c.filaPadre}),"Lotes superan la cantidad · ",""),"")`
      + ')'),
  });
};

// Columnas del catálogo y montos (solo filas nuevas: las del sistema llevan
// lo guardado).
const formulasItemNuevas = (r, x) => {
  const c = Object.fromEntries(Object.entries(I).map(([k, l]) => [k, `${l}${r}`]));
  const sinCobro = `OR(${c.tipoEf}="CONTENIDO PAD",${c.tipoEf}="${TIPO_CONTENIDO_GUIA}",${c.tipoEf}="LOTE ADICIONAL",${c.estadoEf}="SIN CARGO")`;
  const delCatalogo = (l) => `IF(OR(${c.tipoEf}="",${c.filaCat}=""),"",INDEX(${x.rCol(l)},${c.filaCat})&"")`;
  return {
    ...formulasItemComunes(r, x),
    ...porLetra({
      // Referencia con ~ * ? escapados (COINCIDIR los toma como comodines).
      refBuscada: f(`SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(TRIM(${c.referencia}),"~","~~"),"*","~*"),"?","~?")`),
      // Fila en el catálogo: referencia + empresa de la gestión; si no hay,
      // la referencia sola cuando es única.
      filaCat: f(`IF(${c.referencia}="","",IFERROR(MATCH(${c.refBuscada}&"|"&TRIM(${c.empresaGestion}),${x.rCol(REF.clave)},0),IFERROR(IF(INDEX(${x.rCol(REF.repeticiones)},MATCH(${c.refBuscada},${x.rCol(REF.referencia)},0))=1,MATCH(${c.refBuscada},${x.rCol(REF.referencia)},0),""),"")))`),
      ambigua: f(`IF(AND(${c.referencia}<>"",${c.filaCat}=""),IF(ISNUMBER(MATCH(${c.refBuscada},${x.rCol(REF.referencia)},0)),1,0),0)`),
      sinCodigo: f(`IF(AND(OR(${c.tipoEf}="NORMAL",${c.tipoEf}="PAD PADRE"),${c.estadoEf}<>"SIN CARGO",${c.codigo}=""),1,0)`),
      // Rangos de recargo que contienen el precio (sin los INACTIVOS). Con
      // CONTAR.SI.CONJUNTO no importa el orden en que se peguen los rangos.
      tramo: f(`IF(OR(${c.tipoEf}="",${c.precio}=""),"",COUNTIFS(${x.recargo.desde},"<="&${c.precio},${x.recargo.hasta},">="&${c.precio},${x.recargo.estado},"<>INACTIVO"))`),
      recargoOk: f(`IF(${c.tipoEf}="",1,IF(${sinCobro},1,IF(N(${c.tramo})>=1,1,0)))`),
      codigo: f(`IF(${c.tipoEf}="","",IF(${sinCobro},"${CODIGO_SIN_OC}",IF(${c.filaCat}="","",INDEX(${x.rCol(REF.codigo)},${c.filaCat})&"")))`),
      // Código del catálogo en toda línea, también en las que no se cobran
      // (decisión del 23-11-2026): Código sigue con "No lleva OC".
      codigoReal: f(delCatalogo(REF.codigo)),
      // El precio puede venir como texto si se pegó desde un CSV: *1 lo convierte.
      precio: f(`IF(${c.tipoEf}="","",IF(${sinCobro},0,IF(${c.precioManual}<>"",${c.precioManual},IF(${c.filaCat}="",0,IFERROR(INDEX(${x.rCol(REF.precio)},${c.filaCat})*1,0)))))`),
      empresaProducto: f(delCatalogo(REF.empresa)),
      clase: f(delCatalogo(REF.clase)),
      tipo: f(delCatalogo(REF.tipo)),
      descriptor: f(delCatalogo(REF.descriptor)),
      veces: f(`IF(${c.tipoEf}="","",IF(${sinCobro},1,IF(N(${c.tramo})>=1,SUMIFS(${x.recargo.veces},${x.recargo.desde},"<="&${c.precio},${x.recargo.hasta},">="&${c.precio},${x.recargo.estado},"<>INACTIVO")/${c.tramo},1)))`),
      total: f(`IF(${c.tipoEf}="","",${c.precio}*N(${c.cantidad}))`),
      venta: f(`IF(${c.tipoEf}="","",${c.precio}*${c.veces}*N(${c.cantidad}))`),
      origen: f(`IF(${c.tipoEf}="","","${ORIGEN_REGISTRADO}")`),
      // Valores automáticos según el tipo de línea (se puede escribir encima
      // donde corresponde; las macros vuelven a poner estas fórmulas al
      // limpiar o devolver una fila: ver FormulasDefectoItem en la macro).
      ...valoresPorTipo(c),
    }),
  };
};

const valoresItemSistema = (it) => porLetra({
  linea: it.linea, clave: it.clave, tipoLinea: it.tipo, padre: it.lineaPadre, numCot: it.numCotizacion, referencia: it.referencia,
  cantidadIngreso: it.cantidad, lote: it.lote, vencimiento: it.vencimiento, estadoCarga: it.estadoCarga,
  codigo: it.codigo, codigoReal: it.codigoReal ?? (it.codigo === CODIGO_SIN_OC ? '' : it.codigo),
  precio: it.precio, empresaProducto: it.empresaVinculada, clase: it.clase, tipo: it.tipoVinculado, descriptor: it.descriptorAuto,
  veces: it.vecesCosto, origen: 'SISTEMA', idSistema: it.idSistema,
  // Auxiliares con lo guardado (no se recalculan contra el catálogo de hoy).
  refBuscada: '', filaCat: '', ambigua: 0, sinCodigo: it.sinCodigo ? 1 : 0, tramo: '', recargoOk: it.recargoEncontrado || it.sinCodigo ? 1 : 0,
});

// --- Instrucciones ---------------------------------------------------------------

// Origen de los catálogos cargados por el script (plantilla).
const lineaCatalogo = (nombre, o) => {
  if (!o) return `${nombre}: vacío (se puede pegar a mano; ver "PEGAR LOS CATÁLOGOS").`;
  // Cargado desde un archivo que no es la exportación oficial de la app.
  if (o.provisional) return `${nombre}: ${o.cargadas} cargados de forma PROVISIONAL. Deben reemplazarse por el archivo oficial (ver "PEGAR LOS CATÁLOGOS").`;
  return `${nombre}: ${o.cargadas} cargadas del archivo ${o.archivo}${o.fecha ? ` (exportado el ${o.fecha})` : ''}${o.detalle ? `; ${o.detalle}` : ''}.`;
};

// Encabezado: la plantilla (catálogos del archivo exportado) o la
// exportación del sistema (con datos y catálogos de Firestore).
const encabezadoInstrucciones = (d) => (d.plantilla ? [
  ['RESPALDO DE CONTINGENCIA — IMPLANTES (PLANTILLA)', 'titulo'],
  ['', 'libro'],
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
  ['', 'libro'],
  [`Generado: ${d.generadoEl} (hora de Chile)`],
  [`Período abierto: ${d.periodoTexto}. Gestiones exportadas: mes ${d.mesExportado}.`],
  [`Catálogo de referencias actualizado al: ${d.generadoEl} (${d.catalogo.resumen.usables} referencias; sin ${d.catalogo.resumen.inactivas} inactivas).`],
  [`Filas exportadas: ${d.filasGestiones.length} gestiones y ${d.filasItems.length} ítems. Filas libres: ${d.tamano.gestionesLibres} gestiones y ${d.tamano.itemsLibres} ítems.`],
  [''],
  ['PARA QUÉ SIRVE', 'seccion'],
  ['Si el sistema no está disponible, registre aquí las gestiones y sus ítems. Cuando vuelva, este archivo se reimporta: solo se cargan las filas con ORIGEN = CONTINGENCIA.'],
  ['Las filas grises con ORIGEN = SISTEMA son una foto del sistema al generar el archivo: sirven de consulta y solo se pueden cambiar sus celdas blancas (ver "Cambios en lo que ya estaba en el sistema").'],
]);

const LIBRO_DEL_MES = [
  ['CÓMO SE TRABAJA MES A MES', 'seccion'],
  ['Hay un libro por mes, respaldo_implantes_AAAA-MM.xlsm, todos en la misma carpeta. El libro del mes es el que manda: ahí se registran las gestiones y ahí se agregan o corrigen los catálogos.'],
  ['1. La primera vez, en la plantilla base (respaldo_implantes.xlsm): pegue los catálogos (ver "PEGAR LOS CATÁLOGOS"), presione "Fijar catálogos como base" y guarde. Después, hoja "Nuevo mes" → escriba el Año y el Mes (1 a 12) → botón "Crear libro del mes": se crea y se abre el libro de ese mes con los catálogos pegados. La plantilla base no permite registrar gestiones.'],
  ['2. Durante el mes trabaje en ese libro: registre las gestiones y, si hace falta, agregue o corrija códigos, empresas, recargos, centros, previsiones o convenios en sus hojas, y pegue un Reporte Info nuevo cuando quede desactualizado (ver más abajo).'],
  ['3. A fin de mes, desde el libro actual, cree el libro del mes siguiente: hoja "Nuevo mes" → Año y Mes siguientes → "Crear libro del mes". El libro nuevo trae los catálogos tal como quedaron (con todos los cambios del mes y sus marcas) e Instrucciones, con Gestiones, Ítems, Cargados, Solicitud Implantes y Resumen vacías.'],
  ['4. Las gestiones no se traspasan: las pendientes se terminan en el libro de su mes. Si ya existe el libro del mes que pidió, no se sobrescribe y lo avisa.'],
  ['5. Cada libro solo acepta gestiones con fecha de su mes (no importa la fecha de hoy: en noviembre se puede abrir el libro de octubre y registrar octubre). Al escribir otra fecha Excel la rechaza. Si se pega, la Fecha se pinta de rojo, la Alerta dice "Fecha fuera del mes del libro" (con el mes que corresponde) y "Mover cargados" no mueve esa gestión.'],
  ['El mes del libro se ve aquí arriba, en el nombre del archivo y en la fila 1 de Gestiones. Todos los libros tienen las mismas columnas.'],
  [''],
  ['AGREGAR O CORREGIR CATÁLOGOS (en el libro del mes)', 'seccion'],
  ['Códigos, Empresas, Centros, Recargos, Previsiones y Convenios se pueden editar con las hojas protegidas: para agregar, escriba en la primera fila vacía (las filas siguientes ya están preparadas); para corregir, escriba encima. No inserte ni borre filas (está bloqueado): para quitar un dato, borre el contenido de sus celdas o márquelo INACTIVO en ESTADO.'],
  ['Las búsquedas, los desplegables y las alertas reconocen solas las filas nuevas: una referencia agregada en Códigos ya se encuentra en Ítems (código, precio, recargo y venta), y una empresa agregada aparece en el desplegable de Gestiones.'],
  ['En Códigos, Empresas, Centros y Recargos la columna CAMBIO marca cada fila NUEVO (verde), MODIFICADO (ámbar) o BORRADO (rojo) respecto de lo original (lo que había al usar "Fijar catálogos como base"), y FECHA CAMBIO guarda el día del último cambio (solo con las macros habilitadas). Si vuelve a escribir el valor original, la marca se quita. Las marcas pasan al libro del mes siguiente.'],
  ['Para actualizar el sistema: filtre CAMBIO (NUEVO, MODIFICADO, BORRADO) y haga esos cambios en el Maestro de la app (Maestros → Codigos, Empresas, Centros o Recargos). Después presione "Fijar catálogos como base" en el libro del mes para reiniciar las marcas.'],
  [''],
  ['ACTUALIZAR REPORTE INFO (en el libro del mes)', 'seccion'],
  ['Reporte Info trae las admisiones con que se armó el libro y con el tiempo queda desactualizado: si una admisión nueva no se autocompleta (Alerta "Admisión no está en Reporte Info"), pegue un Reporte Info más reciente.'],
  ['1. Abra el Excel de Reporte Info de la clínica (el que se importa en Documentos → Reportes Info). También sirve el botón "Exportar" de Reportes Info del sistema, pero no trae Convenio.'],
  ['2. En la hoja Reporte Info seleccione desde A3 hasta la última fila con datos en las columnas A a G y presione Supr.'],
  ['3. Copie del archivo, sin encabezados, columna por columna y en este orden, y pegue con "Pegar valores" (Ctrl+Alt+V → Valores) desde la fila 3: Admisión → A, Fecha → B, Paciente → C, Convenio → D, Isapre → E ("Previsión (Isapre)"), 1° Cirujano → F, Descripción → G.'],
  ['4. Puede pegar todas las filas del archivo, aunque una admisión aparezca varias veces: se usa la primera de cada admisión. Hay al menos 10.000 filas preparadas (hasta donde llega la fórmula de la columna H); si el archivo trae más, pegue las más recientes.'],
  ['5. Las gestiones ya registradas no cambian: el autocompletado se aplica al escribir una admisión.'],
];

const MACROS_Y_BOTONES = [
  ['HABILITAR LAS MACROS (para los botones)', 'seccion'],
  ['El archivo es .xlsm (con macros). Sin macros todo lo demás funciona igual (fórmulas, listas y alertas); solo los botones no.'],
  ['1. Al abrirlo aparece una barra amarilla "ADVERTENCIA DE SEGURIDAD: Las macros se han deshabilitado": haga clic en "Habilitar contenido".'],
  ['2. Si en cambio aparece una barra roja "RIESGO DE SEGURIDAD: Microsoft ha bloqueado la ejecución de macros…" (archivo que llegó por correo, descarga o internet): cierre Excel, haga clic derecho en el archivo → Propiedades → pestaña General → marque "Desbloquear" → Aceptar, y vuelva a abrirlo.'],
  ['3. Si el archivo está en una carpeta de red y Excel lo sigue bloqueando: Archivo → Opciones → Centro de confianza → Configuración del Centro de confianza → Ubicaciones de confianza → "Agregar nueva ubicación" con esa carpeta (marque "Las subcarpetas de esta ubicación también son de confianza").'],
  [''],
  ['BOTONES', 'seccion'],
  [TEXTOS_MACROS.mover],
  [TEXTOS_MACROS.devolver],
  ['"Crear libro del mes" (hoja Nuevo mes): ver CÓMO SE TRABAJA MES A MES.'],
  ['Después de usar un botón, guarde el archivo (Ctrl+G). Los botones no se pueden deshacer con Ctrl+Z: para revertir, use el botón contrario.'],
  [''],
  ['HOJAS SOLICITUD IMPLANTES Y RESUMEN', 'seccion'],
  ['Son las mismas dos hojas del Excel que descarga el sistema al hacer la Solicitud: mismas columnas, mismo orden y mismos valores (fechas como texto dd-mm-aaaa). Cada vez que se presiona "Mover cargados" se agregan al final las líneas de las gestiones movidas; nunca se borra lo anterior. FECHA INGRESO, Ingreso y FECHA REGISTRO llevan la fecha del movimiento.'],
  ['Al final tienen dos columnas que no están en el archivo del sistema: FECHA MOVIMIENTO (el día en que se movió) y CLAVE (la gestión). Para copiar al sistema, use las columnas anteriores. "Devolver a pendientes" quita de estas hojas las filas de esa gestión.'],
  ['No son la Solicitud: no marcan nada como SOLICITADO ni imputan. La Solicitud se hace en el sistema cuando vuelva.'],
  [''],
  ['HOJA CARGADOS', 'seccion'],
  ['Una fila por línea de ítem, con los datos de su gestión repetidos: es lo que hay que ingresar al sistema cuando vuelva (cabecera de la gestión, cada línea con su código, código real, precio, recargo, total y venta, y quién lo registró y movió). Empieza con la misma vista de carga que Ítems (en verde). Está protegida para no modificarla por error; use los filtros para verla por gestión.'],
];

// Cómo actualizar los catálogos (solo plantilla).
const ACTUALIZAR_CATALOGOS = [
  ['PEGAR LOS CATÁLOGOS', 'seccion'],
  ['Se pegan a mano, con las hojas protegidas: las celdas de datos están desbloqueadas y las fórmulas, validaciones y protección no se dañan. Pegue SIN la fila de encabezados, desde la celda indicada, con las columnas en este orden (el de la fila 2 de cada hoja):'],
  ['• Códigos → celda B3: CODIGO, REFERENCIA, DESCRIPTOR_EMPRESA, EMPRESA, TIPO, SEGMENTO, CLASE, DESCRIPTOR_AUTO, PRECIO_NETO, CX, OBSERVACION, REGISTRADO_POR, ESTADO (13 columnas; el CSV de Maestros → Codigos → "Con código" → "Exportar registros" viene así: copie desde A2 hasta ESTADO). La columna A es automática: no pegue en ella.'],
  ['• Empresas → celda A3: NOMBRE, RUT, ESTADO (Maestros → Empresas → Exportar; solo las ACTIVAS).'],
  ['• Centros → celda A3: NOMBRE, COMENTARIO, ESTADO, USAR_EN_GESTIONES (Maestros → Centros → Exportar; solo ACTIVOS con USAR_EN_GESTIONES = SI).'],
  ['• Recargos → celda A3: DESDE, HASTA, VECES COSTO, COMENTARIO, ESTADO (Maestros → Recargos → Exportar; el orden de las filas no importa y los INACTIVOS se ignoran).'],
  ['• Previsiones → celda A3: NOMBRE, COMENTARIO, ESTADO. • Convenios → celda A3: NOMBRE, COMENTARIO, ESTADO (Maestros → Previsiones / Convenios → Exportar; solo los ACTIVOS).'],
  ['• Reporte Info → celda A3: Admisión, Fecha, Paciente, Convenio, Previsión (la columna "Isapre" del archivo), 1° Cirujano, Descripción (7 columnas; ver "ACTUALIZAR REPORTE INFO"). La columna H es automática.'],
  ['Use "Pegar valores" (Ctrl+Alt+V → Valores): conserva los formatos de la hoja (texto, fechas, montos). El pegado normal (Ctrl+V) también funciona y no borra los desplegables. No pegue en columnas grises ni inserte filas (está bloqueado). Para reemplazar un catálogo: seleccione los datos anteriores (sin encabezados), Supr, y pegue el nuevo.'],
  ['Códigos con ceros a la izquierda (ej. 000123): Excel los convierte en número al abrir un CSV con doble clic. Si los hay, abra el CSV con Datos → Desde texto/CSV y marque la columna CODIGO como Texto antes de copiar.'],
  ['En Códigos, EMPRESA tiene la lista de la hoja Empresas, y TIPO, SEGMENTO y CLASE las listas del sistema (hoja Catálogos): un valor que no está en su lista se pinta de rojo. Revíselo en el sistema.'],
  ['Después de pegar: presione "Fijar catálogos como base" (hoja Códigos, arriba a la izquierda), escriba la fecha en "Catálogos actualizados al" (arriba) y guarde.'],
  [''],
  ['FIJAR CATÁLOGOS COMO BASE (botón en la hoja Códigos)', 'seccion'],
  ['Toma lo que hay ahora en Códigos, Empresas, Centros y Recargos como valores originales y deja vacías todas las marcas CAMBIO y FECHA CAMBIO. Pide confirmación antes ("Se reiniciarán todas las marcas de cambio. ¿Continuar?").'],
  ['Úselo después de pegar los catálogos por primera vez, y cada vez que haya pasado los cambios marcados al Maestro de la app. Desde ahí, solo lo que cambie después queda marcado.'],
  [''],
  ['La plantilla base la regenera el encargado con el script (docs/respaldo-contingencia-implantes.md): sale con los catálogos vacíos, para pegarlos. Una plantilla regenerada no trae los cambios hechos en los libros del mes.'],
];

// Manual del libro de trabajo (decisión del 25-11-2026: el libro es la
// herramienta de trabajo, sin textos de respaldo ni contingencia). Lo usa la
// plantilla y se exporta para reemplazar Instrucciones en un libro con datos.
// `conOrigen`: líneas con la fecha de generación y el origen de los
// catálogos (solo al generar la plantilla).
export const instruccionesLibro = (d = {}, { conOrigen = true } = {}) => [
  ['IMPLANTES — LIBRO DE TRABAJO', 'titulo'],
  ['', 'libro'],
  ...(conOrigen ? [
    [`Plantilla generada: ${d.generadoEl}. Filas preparadas: ${d.tamano?.gestionesLibres} gestiones y ${d.tamano?.itemsLibres} ítems.`],
  ] : []),
  ['Catálogos actualizados al →', 'fecha'],
  ...(conOrigen ? [
    [lineaCatalogo('Reporte Info', d.origenCatalogos?.reporteInfo)],
    [lineaCatalogo('Códigos', d.origenCatalogos?.codigos)],
    [lineaCatalogo('Empresas', d.origenCatalogos?.empresas)],
    [lineaCatalogo('Centros', d.origenCatalogos?.centros)],
    [lineaCatalogo('Rangos de recargo', d.origenCatalogos?.recargos)],
    [lineaCatalogo('Previsiones', d.origenCatalogos?.previsiones)],
    [lineaCatalogo('Convenios', d.origenCatalogos?.convenios)],
  ] : []),
  [''],
  ['CÓMO SE TRABAJA MES A MES', 'seccion'],
  [`Hay un libro por mes, ${PREFIJO_LIBRO}AAAA-MM.xlsm, todos en la misma carpeta. En el libro del mes se registran las gestiones y se agregan o corrigen los catálogos.`],
  ['1. A fin de mes, desde el libro actual: hoja "Nuevo mes" → escriba el Año y el Mes (1 a 12) → botón "Crear libro del mes". Se crea y se abre el libro de ese mes con los catálogos tal como quedaron (con sus cambios y marcas). Gestiones, Ítems, Cargados, Solicitud Implantes y Resumen quedan vacías.'],
  ['2. Las gestiones no se traspasan: las pendientes se terminan en el libro de su mes. Si el libro de ese mes ya existe, no se sobrescribe.'],
  ['3. Cada libro solo acepta gestiones con fecha de su mes (no importa la fecha de hoy). Al escribir otra fecha Excel la rechaza; si se pega, la Fecha se pinta de rojo, la Alerta dice "Fecha fuera del mes del libro" y "Mover cargados" no mueve esa gestión.'],
  ['El mes del libro se ve aquí arriba, en el nombre del archivo y en la fila 1 de Gestiones.'],
  [''],
  ['COLORES', 'seccion'],
  ['Encabezados: amarillo obligatorio, azul opcional, gris automático (no se escribe). Una celda obligatoria vacía en una fila en uso se pinta de rojo.'],
  ['Verde (Ítems y Cargados): la vista de carga, las primeras columnas, fijas al desplazarse: N° línea, Admisión, Fecha, Código, Cantidad, Venta, Nombre paciente y Estado carga. Ahí se escribe solo Estado carga; lo demás sale de la CLAVE y de la línea.'],
  ['Filas de Gestiones según su Estado: verde CARGADO o FINALIZADO, azul AGENDADO, amarillo PENDIENTE, naranja INCOMPLETO, REVISAR o S/COTIZACION.'],
  [''],
  ['HOJA GESTIONES (una fila por admisión + empresa + fecha)', 'seccion'],
  ['1. Escriba Admisión (solo dígitos), Fecha (dd-mm-aaaa, del mes del libro) y elija la Empresa (lista de la hoja Empresas). La CLAVE se arma sola: admisión|empresa|AAAA-MM-DD.'],
  ['   Al escribir la admisión, Nombre, Convenio, Previsión, Médico y Descripción se completan solos desde la hoja Reporte Info (la Previsión es la columna "Isapre").'],
  ['   Si la admisión no está en Reporte Info, la Admisión se pinta naranja y la Alerta dice "Admisión no está en Reporte Info": escriba esos datos a mano. Convenio y Previsión tienen lista; si escribe un valor que no está, Excel pregunta y la Alerta lo avisa, pero se puede usar.'],
  ['   También se puede escribir encima de un dato autocompletado: queda en letra azul cursiva y solo cambia esa celda. Para volver al dato de Reporte Info, copie la misma celda de una fila de abajo y péguela.'],
  ['2. Complete Registrado por (de la lista; los nombres se agregan en la hoja Catálogos, columna N), el Atributo (IMPLANTES, CONSIGNACION o HEMODINAMIA) y, si los tiene, Total cotización y los demás datos.'],
  ['3. La misma admisión con otra empresa u otra fecha es otra fila. Una CLAVE repetida se pinta de rojo: no la duplique.'],
  ['4. Estado se calcula solo: con alguna línea sin código = INCOMPLETO; si todas las líneas tienen el mismo estado de carga, ese estado (CONTENIDO y SIN CARGO cuentan como CARGADO); si se mezclan, INCOMPLETO. Sin ítems: el "Estado sin ítems" (vacío = AGENDADO). Cuando sus líneas ya están en Cargados: FINALIZADO.'],
  ['5. Diferencia en rojo: la suma de los ítems no cuadra con el Total cotización.'],
  [''],
  ['HOJA ÍTEMS (una fila por línea)', 'seccion'],
  ['1. Elija la CLAVE de la gestión (lista). Primero debe existir la gestión en la hoja Gestiones. Admisión, Fecha y Nombre paciente se llenan solos con ella.'],
  ['2. Escriba N° cotización, Referencia y la cantidad en "Cantidad (ingresar)" (la columna Cantidad de la vista de carga la muestra sola). Al escribir la referencia se completan desde la hoja Códigos el código, precio, empresa, clase, tipo y descriptor, y se calculan veces costo (hoja Recargos), total y venta. Si la referencia existe para varias empresas, se usa la de la empresa de la gestión.'],
  ['   Código y Código real: Código es el que va en la Solicitud ("No lleva OC" en CONTENIDO PAD, CONTENIDO GUÍA, LOTE ADICIONAL y SIN CARGO). Código real es siempre el del catálogo según la referencia.'],
  ['3. Una referencia que no está en Códigos se puede escribir igual (Excel avisa): queda "Sin código" y la gestión INCOMPLETO. Si conoce el precio, escríbalo en Precio manual.'],
  ['4. Tipos de línea (obligatorio):'],
  ['   NORMAL: una referencia común.'],
  ['   PAD PADRE: la referencia del PAD (clase PAD). Lote y Vencimiento dicen PAD solos. Su Estado carga se cambia como en una línea NORMAL.'],
  ['   CONTENIDO PAD: cada producto dentro del PAD. En "Línea padre" ponga el N° de línea del PAD PADRE. No se cobra (código "No lleva OC", precio 0). Estado carga dice CONTENIDO solo y cuenta como cargado.'],
  ['   LOTE ADICIONAL: cuando una referencia viene en varios lotes. La línea NORMAL lleva la cantidad TOTAL y su lote; cada LOTE ADICIONAL indica cuántas unidades son de otro lote, con "Línea padre" = N° de la línea NORMAL. La suma de los lotes adicionales no puede superar la cantidad total.'],
  ['   CONTENIDO GUÍA: líneas de una guía de consignación (ver abajo).'],
  ['   Ejemplo PAD: línea 120 PAD PADRE "PAD-RODILLA"; líneas 121 y 122 CONTENIDO PAD con Línea padre 120.'],
  ['5. Lote: el lote o "Sin lote". Vencimiento: una fecha (dd-mm-aaaa) o "Sin fecha". Tipo de línea, Lote y Vencimiento se pintan de rojo si faltan.'],
  ['6. Colores: Estado carga en verde (CARGADO, CONTENIDO, SIN CARGO), rojo (PENDIENTE o vacío) y naranja (REVISAR, S/COTIZACION). Total ítem y Venta en naranja: la suma de la gestión no coincide con su Total cotización; revise precios y cantidades.'],
  ['7. Consignación: las líneas de consignación se cargan desde la hoja Consignación (ver HOJA CONSIGNACIÓN): llegan como una línea NORMAL (la que cobra) y su contenido como CONTENIDO GUÍA, con su N° guía. La columna N° guía de Ítems solo la escribe "Agregar a Ítems".'],
  ['8. La columna Alerta debe quedar vacía. Avisos: Falta CLAVE / CLAVE no existe · Falta N° cotización · Falta referencia · Cantidad inválida · Sin código · Referencia ambigua · Empresa no coincide · Sin rango de recargo · Línea padre inválida · Lotes superan la cantidad · PAD PADRE: Lote y Vencimiento deben ser PAD · Guía en gestión que no es de CONSIGNACION.'],
  [''],
  ['HOJA CONSIGNACIÓN (registro de consignación por cargar)', 'seccion'],
  ['1. Pegue en la hoja Guías el detalle de las guías (si no están).'],
  ['2. En la hoja Consignación, pegue desde A3 (Pegar valores) las columnas C a J del registro de consignación: Admisión, Paciente, Médico, Fecha CX, Empresa, Código, Cantidad, Delivery.'],
  ['3. Botón "Vincular guías": busca la Referencia de cada Código en la hoja Códigos y, con el Delivery, las líneas de su guía en la hoja Guías. Debajo de cada fila agrega el contenido de la guía (CONTENIDO GUÍA, en gris) con su referencia, cantidad, lote y vencimiento. La línea de la guía que es el mismo producto de la fila no se repite: su lote y vencimiento pasan a la fila. La columna Estado dice cuántas líneas trajo, o si falta el Código o el Delivery. Se puede presionar de nuevo después de corregir algo.'],
  ['4. Botón "Agregar a Ítems": pasa cada fila (línea NORMAL que cobra) y su contenido a Ítems. Si la gestión (Admisión + Empresa + Fecha CX) no existe, la crea en Gestiones con Atributo CONSIGNACION (Nombre y Médico desde Reporte Info, o los pegados). Lo agregado se borra de la hoja; lo que no se pudo agregar queda con el motivo en Estado (fecha de otro mes, empresa que no está en Empresas, código sin referencia, Delivery cuya guía aún no está en Guías, sin filas libres).'],
  ['5. Después complete en Ítems N° cotización y Registrado por, y en Gestiones lo que falte (Registrado por, Total cotización).'],
  [''],
  ['BOTONES', 'seccion'],
  [TEXTOS_MACROS.mover],
  [TEXTOS_MACROS.devolver],
  ['"Crear libro del mes" (hoja Nuevo mes): ver CÓMO SE TRABAJA MES A MES.'],
  ['Después de usar un botón, guarde el archivo (Ctrl+G). Los botones no se pueden deshacer con Ctrl+Z: para revertir, use el botón contrario.'],
  [''],
  ['HOJAS SOLICITUD IMPLANTES Y RESUMEN', 'seccion'],
  ['Cada vez que se presiona "Mover cargados" se agregan al final las líneas movidas (fechas como texto dd-mm-aaaa); nunca se borra lo anterior. FECHA INGRESO, Ingreso y FECHA REGISTRO llevan la fecha del movimiento. Al final van FECHA MOVIMIENTO y CLAVE. "Devolver a pendientes" quita las filas de esa gestión.'],
  [''],
  ['HOJA CARGADOS', 'seccion'],
  ['Una fila por línea movida, con los datos de su gestión repetidos: cada línea con su código, código real, precio, recargo, total y venta, y quién la registró y la movió. Empieza con la misma vista de carga que Ítems (en verde).'],
  [''],
  ['FILTROS', 'seccion'],
  ['Todas las tablas tienen filtros en la fila de títulos y se pueden usar con las hojas bloqueadas: flecha del título → elegir valores o "Filtros de texto". Para quitar un filtro: flecha → "Borrar filtro". No se puede ordenar (rompería las fórmulas).'],
  [''],
  ['AGREGAR O CORREGIR CATÁLOGOS', 'seccion'],
  ['Códigos, Empresas, Centros, Recargos, Previsiones, Convenios y Guías se editan con las hojas protegidas: para agregar, escriba en la primera fila vacía; para corregir, escriba encima. No inserte ni borre filas (está bloqueado): para quitar un dato, borre el contenido de sus celdas o márquelo INACTIVO en ESTADO.'],
  ['Las búsquedas, los desplegables y las alertas reconocen solas las filas nuevas.'],
  ['En Códigos, Empresas, Centros y Recargos la columna CAMBIO marca cada fila NUEVO (verde), MODIFICADO (ámbar) o BORRADO (rojo) respecto de lo original, y FECHA CAMBIO guarda el día del último cambio (con las macros habilitadas). Si vuelve a escribir el valor original, la marca se quita.'],
  [''],
  ['PEGAR LOS CATÁLOGOS', 'seccion'],
  ['Pegue SIN la fila de encabezados, desde la celda indicada, con "Pegar valores" (Ctrl+Alt+V → Valores) y las columnas en el orden de la fila 2 de cada hoja:'],
  ['• Códigos → celda B3: CODIGO, REFERENCIA, DESCRIPTOR_EMPRESA, EMPRESA, TIPO, SEGMENTO, CLASE, DESCRIPTOR_AUTO, PRECIO_NETO, CX, OBSERVACION, REGISTRADO_POR, ESTADO (13 columnas). La columna A es automática.'],
  ['• Empresas → A3: NOMBRE, RUT, ESTADO. • Centros → A3: NOMBRE, COMENTARIO, ESTADO, USAR_EN_GESTIONES. • Recargos → A3: DESDE, HASTA, VECES COSTO, COMENTARIO, ESTADO. • Previsiones y Convenios → A3: NOMBRE, COMENTARIO, ESTADO.'],
  ['• Guías → A3: N° guía, Referencia, Código, Delivery, Cantidad, Lote, Vencimiento, Descripción. • Consignación → A3: columnas C a J del registro de consignación.'],
  ['Para reemplazar un catálogo: seleccione los datos anteriores (sin encabezados), Supr, y pegue el nuevo. Códigos con ceros a la izquierda (ej. 000123): abra el CSV con Datos → Desde texto/CSV y marque CODIGO como Texto antes de copiar.'],
  ['En Códigos, EMPRESA tiene la lista de la hoja Empresas, y TIPO, SEGMENTO y CLASE las listas de la hoja Catálogos: un valor que no está en su lista se pinta de rojo.'],
  ['Después de pegar: presione "Fijar catálogos como base" (hoja Códigos, arriba a la izquierda), escriba la fecha en "Catálogos actualizados al" (arriba) y guarde.'],
  ['"Fijar catálogos como base" toma lo que hay en Códigos, Empresas, Centros y Recargos como valores originales y deja vacías las marcas CAMBIO y FECHA CAMBIO. Pide confirmación antes.'],
  [''],
  ['ACTUALIZAR REPORTE INFO', 'seccion'],
  ['Si una admisión nueva no se autocompleta (Alerta "Admisión no está en Reporte Info"), pegue un Reporte Info más reciente:'],
  ['1. Abra el Excel de Reporte Info de la clínica.'],
  ['2. En la hoja Reporte Info seleccione desde A3 hasta la última fila con datos en las columnas A a G y presione Supr.'],
  ['3. Copie del archivo, sin encabezados, columna por columna y en este orden, y pegue con "Pegar valores" desde la fila 3: Admisión → A, Fecha → B, Paciente → C, Convenio → D, Isapre → E, 1° Cirujano → F, Descripción → G.'],
  ['4. Puede pegar todas las filas, aunque una admisión aparezca varias veces: se usa la primera. Hay 10.000 filas preparadas; si el archivo trae más, pegue las más recientes. Las gestiones ya registradas no cambian.'],
  [''],
  ['HABILITAR LAS MACROS (para los botones)', 'seccion'],
  ['El archivo es .xlsm (con macros). Sin macros todo lo demás funciona igual (fórmulas, listas, alertas y filtros); solo los botones no.'],
  ['1. Al abrirlo aparece una barra amarilla "ADVERTENCIA DE SEGURIDAD: Las macros se han deshabilitado": haga clic en "Habilitar contenido".'],
  ['2. Si aparece una barra roja "RIESGO DE SEGURIDAD: Microsoft ha bloqueado la ejecución de macros…": cierre Excel, clic derecho en el archivo → Propiedades → pestaña General → marque "Desbloquear" → Aceptar, y vuelva a abrirlo.'],
  [''],
  ['QUÉ NO HACER', 'seccion'],
  ['No cambie los N° de línea. No ordene las hojas; use los filtros.'],
  ['Las hojas están protegidas con contraseña y las fórmulas están ocultas: al seleccionar una celda calculada se ve solo el resultado. Se escribe solo en las celdas que no son grises; los filtros, los desplegables y los botones funcionan igual.'],
  [''],
  ['BLOQUEAR EL CÓDIGO DE LAS MACROS', 'seccion'],
  ['Las macros guardan la contraseña de las hojas. Para que no se vea con Alt+F11, bloquee el proyecto VBA una vez:'],
  ['   1. Abra el libro y presione Alt+F11. En el Explorador de proyectos (Ctrl+R si no se ve), clic derecho en "VBAProject (nombre del libro)" → "Propiedades de VBAProject...".'],
  ['   2. Pestaña "Protección": marque "Bloquear proyecto para visualización" y escriba la contraseña de las hojas en "Contraseña" y en "Confirmar contraseña". Aceptar.'],
  ['   3. Cierre el editor, guarde (Ctrl+G) y cierre Excel. El bloqueo se aplica al volver a abrir. Los libros que se creen desde este con "Crear libro del mes" lo heredan.'],
  [''],
  ['SEGURIDAD', 'seccion'],
  ['Contiene datos de pacientes: póngale contraseña (Archivo → Información → Proteger libro → Cifrar con contraseña). No lo envíe por correo ni WhatsApp y no lo imprima. Ábralo con Microsoft Excel.'],
];

// Instrucciones de un libro con filas importadas (modo con datos).
const textoInstruccionesImportado = (d) => [
  ...encabezadoInstrucciones(d),
  [''],
  ...LIBRO_DEL_MES,
  [''],
  ['COLORES DE LOS ENCABEZADOS', 'seccion'],
  ['Amarillo: obligatorio. Azul: opcional. Gris: automático (no se escribe). Una celda obligatoria vacía en una fila nueva se pinta de rojo.'],
  ['Verde (Ítems y Cargados): la vista de carga, las primeras columnas, fijas al desplazarse: N° línea, Admisión, Fecha, Código, Cantidad, Venta, Nombre paciente y Estado carga. Es lo que se revisa al cargar en el sistema. Ahí se escribe solo Estado carga; Admisión y Fecha salen de la CLAVE y Cantidad de "Cantidad (ingresar)" (junto a Referencia), donde se escribe.'],
  [''],
  ['HOJA GESTIONES (una fila por admisión + empresa + fecha)', 'seccion'],
  ['1. Escriba Admisión (solo dígitos), Fecha (dd-mm-aaaa, del mes del libro) y elija la Empresa (lista de la hoja Empresas). La CLAVE se arma sola: admisión|empresa|AAAA-MM-DD.'],
  ['   Al escribir la admisión, Nombre, Convenio, Previsión, Médico y Descripción se completan solos desde la hoja Reporte Info, como en el sistema (la Previsión es la columna "Isapre" de Reporte Info).'],
  ['   Si la admisión no está en Reporte Info, la Admisión se pinta naranja y la columna Alerta dice "Admisión no está en Reporte Info": escriba esos datos a mano. Convenio y Previsión tienen lista; si escribe un valor que no está, Excel pregunta y Alerta lo avisa, pero se puede usar.'],
  ['   También se puede escribir encima de un dato autocompletado: queda en letra azul cursiva y solo cambia esa celda (las demás filas siguen autocompletando). Para volver al dato de Reporte Info, copie la misma celda de una fila de abajo y péguela.'],
  ['2. Complete Registrado por (su nombre, de la lista: los nombres se agregan en la hoja Catálogos, columna N) y, si los tiene, Nombre, Total cotización y los demás datos.'],
  ['3. La misma admisión con otra empresa u otra fecha es otra fila. Una CLAVE repetida se pinta de rojo: no la duplique.'],
  ['4. Estado se calcula solo: con alguna línea sin código = INCOMPLETO; si todas las líneas tienen el mismo estado de carga, ese estado (CONTENIDO y SIN CARGO cuentan como CARGADO); si se mezclan, INCOMPLETO. Sin ítems: el "Estado sin ítems" (vacío = AGENDADO).'],
  ['5. Diferencia en rojo: la suma de los ítems no cuadra con el total de la cotización.'],
  [''],
  ['HOJA ÍTEMS (una fila por línea)', 'seccion'],
  ['1. Elija la CLAVE de la gestión (lista, a la derecha de la vista de carga). Primero debe existir la gestión en la hoja Gestiones. Admisión y Fecha de la vista de carga se llenan solas con ella.'],
  ['2. Escriba N° cotización, Referencia y la cantidad en "Cantidad (ingresar)" (a la derecha de Referencia; la columna Cantidad de la vista de carga la muestra sola). Igual que en el sistema, al escribir la referencia se completan desde la hoja Códigos el código, precio, empresa, clase, tipo y descriptor, y se calculan veces costo (según la hoja Recargos), total y venta. Si la referencia existe para varias empresas, se usa la de la empresa de la gestión.'],
  ['   Código y Código real: Código es el que va en la Solicitud ("No lleva OC" en CONTENIDO PAD, LOTE ADICIONAL y SIN CARGO, como en el sistema). Código real es siempre el del catálogo según la referencia, también en esas líneas.'],
  ['3. Una referencia que no está en Códigos se puede escribir igual (Excel avisa): queda "Sin código" y la gestión INCOMPLETO, como en el sistema. Si conoce el precio, escríbalo en Precio manual.'],
  ['4. Tipos de línea:'],
  ['   NORMAL (o vacío): una referencia común.'],
  ['   PAD PADRE: la referencia del PAD (clase PAD). Lote y Vencimiento dicen PAD solos (no se escriben). Su Estado carga sí se cambia (PENDIENTE, CARGADO…), como en una línea NORMAL.'],
  ['   CONTENIDO PAD: cada producto dentro del PAD. En "Línea padre" ponga el N° de línea del PAD PADRE. No se cobra (código "No lleva OC", precio 0). Estado carga dice CONTENIDO solo (no se cambia) y cuenta como cargado.'],
  ['   LOTE ADICIONAL: cuando una referencia viene en varios lotes. La línea NORMAL lleva la cantidad TOTAL y su lote; cada LOTE ADICIONAL indica cuántas unidades son de otro lote, con "Línea padre" = N° de la línea NORMAL. No se cobra de nuevo; la suma de los lotes adicionales no puede superar la cantidad total.'],
  ['   Ejemplo PAD: línea 120 PAD PADRE "PAD-RODILLA"; líneas 121 y 122 CONTENIDO PAD con Línea padre 120.'],
  ['   Colores: Estado carga en verde (CARGADO, CONTENIDO, SIN CARGO), rojo (PENDIENTE o vacío) y naranja (REVISAR, S/COTIZACION). Total ítem y Venta en naranja: la suma de Total ítem de la gestión no coincide con su Total cotización (la diferencia está en Gestiones, columna Diferencia): revise precios y cantidades.'],
  ['   Vencimiento: una fecha (dd-mm-aaaa) o "Sin fecha" si el producto no la trae.'],
  ['   GUÍAS DE CONSIGNACIÓN: pegue el detalle de las guías en la hoja Guías y las líneas del registro de consignación en la hoja Consignación; sus botones "Vincular guías" y "Agregar a Ítems" las pasan a Ítems con el contenido de la guía (CONTENIDO GUÍA).'],
  ['5. La columna Alerta debe quedar vacía. Avisos: Falta CLAVE / CLAVE no existe · Falta N° cotización · Falta referencia · Cantidad inválida · Sin código · Referencia ambigua (la referencia existe para varias empresas y ninguna es la de la gestión) · Empresa no coincide · Sin rango de recargo · Línea padre inválida · Lotes superan la cantidad · PAD PADRE: Lote y Vencimiento deben ser PAD (se escribió un lote o fecha antes de elegir PAD PADRE: bórrelos y copie la celda de una fila vacía de abajo para que vuelva a decir PAD).'],
  ...(d.plantilla ? [
    ['6. Si el ítem es de una gestión que ya estaba en el sistema, regístrela igual en la hoja Gestiones (misma admisión, empresa y fecha) y cargue aquí solo lo nuevo.'],
  ] : [
    ['6. Se pueden agregar ítems a una gestión exportada del sistema eligiendo su CLAVE.'],
    [''],
    ['CAMBIOS EN LO QUE YA ESTABA EN EL SISTEMA (filas grises)', 'seccion'],
    ['En las filas del sistema solo se pueden cambiar las celdas blancas: en Gestiones, Informe, Lado y Observación; en Ítems, Estado carga, Lote, Vencimiento y Cantidad (ingresar). Lo demás está bloqueado.'],
    ['Algunas líneas no dejan cambiar todo, igual que en el sistema: en CONTENIDO PAD y en líneas sin código no se cambia el Estado carga; en el PAD PADRE no se cambian Lote ni Vencimiento.'],
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

const textoInstrucciones = (d) => (d.plantilla ? instruccionesLibro(d) : textoInstruccionesImportado(d));

const hojaInstrucciones = (libro, datos) => {
  const hoja = libro.addWorksheet(H.INS);
  hoja.getColumn('A').width = 150;
  hoja.getColumn('B').width = 16;
  textoInstrucciones(datos).forEach(([t, estilo], i) => {
    const c = hoja.getCell(`A${i + 1}`);
    c.value = t;
    c.alignment = { wrapText: true, vertical: 'top' };
    if (estilo === 'titulo') c.font = { bold: true, size: 14 };
    // Mes del libro (lo escribe la macro "Crear libro del mes" en Catálogos).
    if (estilo === 'libro') {
      c.value = f(`IF(${SIN_MES},"PLANTILLA BASE (sin mes): no se registra aquí. Cree el libro del mes en la hoja ""${H.NM}"".","LIBRO "&${L.nombre}&": solo acepta gestiones con fecha de ese mes.")`);
      c.font = { bold: true, size: 12, color: { argb: COLOR.manual } };
    }
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

// --- Hoja Nuevo mes ----------------------------------------------------------------
// Año (B5) y mes (B6) del libro a crear; el botón "Crear libro del mes"
// (macro CrearLibroDelMes, en A9) usa estas celdas (NM_ANIO y NM_MES en
// ModContingencia.bas).
export const CELDAS_NUEVO_MES = Object.freeze({ anio: 'B5', mes: 'B6' });
// Textos de la hoja (A11 en adelante). Exportados para actualizar un libro con datos.
export const TEXTOS_NUEVO_MES = Object.freeze([
  `Crea en la misma carpeta de este archivo el libro ${PREFIJO_LIBRO}AAAA-MM.xlsm, copia de este (con sus macros y protección), y lo abre.`,
  'El libro nuevo trae los catálogos de este libro tal como están ahora (Códigos, Empresas, Centros, Recargos, Previsiones, Convenios, Reporte Info, Guías y Catálogos) e Instrucciones; Gestiones, Ítems, Cargados, Solicitud Implantes y Resumen quedan vacías.',
  'No se traspasan gestiones: las pendientes se quedan en el libro de su mes. Si el libro de ese mes ya existe, no se sobrescribe.',
  'A fin de mes, cree desde el libro actual el libro del mes siguiente: trae los catálogos tal como quedaron, con los cambios del mes y sus marcas. Cada libro solo acepta gestiones con fecha de su mes.',
]);

const hojaNuevoMes = (libro) => {
  const hoja = libro.addWorksheet(H.NM);
  hoja.getColumn('A').width = 26;
  hoja.getColumn('B').width = 44;
  hoja.getColumn('C').width = 16;
  const titulo = hoja.getCell('A1');
  titulo.value = 'CREAR LIBRO DEL MES';
  titulo.font = { bold: true, size: 14 };
  const fila = (r, etiqueta, valor) => {
    const a = hoja.getCell(`A${r}`);
    a.value = etiqueta;
    a.font = { bold: true };
    a.alignment = { horizontal: 'right' };
    if (valor !== undefined) hoja.getCell(`B${r}`).value = valor;
  };
  fila(3, 'Este libro:', f(`IF(${SIN_MES},"PLANTILLA BASE (sin mes)","LIBRO "&${L.nombre})`));
  hoja.getCell('B3').font = { bold: true };
  fila(5, 'Año del libro nuevo:');
  fila(6, 'Mes (1 a 12):');
  hoja.getCell('C6').value = f(`IF(AND(ISNUMBER(B6),B6>=1,B6<=12),INDEX(${L.meses},B6),"")`);
  fila(7, 'Archivo que se creará:', f(`IF(AND(ISNUMBER(B5),ISNUMBER(B6),B6>=1,B6<=12),"${PREFIJO_LIBRO}"&B5&"-"&TEXT(B6,"00")&".xlsm","")`));
  ['B5', 'B6'].forEach((c) => {
    const celda = hoja.getCell(c);
    celda.fill = relleno(COLOR.obligatorio);
    celda.border = BORDES;
    celda.alignment = { horizontal: 'left' };
    celda.protection = { locked: false };
  });
  validar(hoja, 'B5', { type: 'whole', operator: 'between', formulae: [2020, 2100], errorTitle: 'Año', error: 'Escriba un año entre 2020 y 2100.' });
  validar(hoja, 'B6', { type: 'whole', operator: 'between', formulae: [1, 12], errorTitle: 'Mes', error: 'Escriba un mes entre 1 y 12.' });
  // A9: botón "Crear libro del mes" (lo crea la macro InstalarBotones).
  hoja.getRow(9).height = 30;
  [
    ...TEXTOS_NUEVO_MES,
  ].forEach((texto, i) => {
    const c = hoja.getCell(`A${11 + i}`);
    c.value = texto;
    c.alignment = { wrapText: true, vertical: 'top' };
    hoja.mergeCells(`A${11 + i}:C${11 + i}`);
    hoja.getRow(11 + i).height = 32;
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
  libro.creator = 'Implantes';
  libro.created = new Date();
  // Recalcular todo al abrir: el archivo se guarda sin
  // resultados de fórmulas.
  libro.calcProperties.fullCalcOnLoad = true;

  const { filasGestiones, filasItems, tamano } = datos;
  const ultimaGestion = PRIMERA + filasGestiones.length + tamano.gestionesLibres - 1;
  const ultimaItem = PRIMERA + filasItems.length + tamano.itemsLibres - 1;

  // Orden de las hojas: primero las de trabajo; Instrucciones y Nuevo mes al
  // final (decisión del 24-11-2026), después de Catálogos.
  const hG = libro.addWorksheet(H.G);
  const hI = libro.addWorksheet(H.I);
  const hC = hojaCargados(libro);
  const hSol = hojaSolicitud(libro, H.SOL, COLUMNAS_SOLICITUD);
  const hRes = hojaSolicitud(libro, H.RES, COLUMNAS_RESUMEN);
  hojaGuias(libro);
  hojaConsignacion(libro);
  const { col: riCol } = hojaReporteInfo(libro, datos.reporteInfo || [], datos.filasCatalogos.reporteInfo);
  const { col: rCol } = hojaCodigos(libro, datos.catalogo, datos.filasCatalogos.referencias);
  const { nombres: empresasNombres } = hojaEmpresas(libro, datos.empresas, datos.filasCatalogos.empresas);
  const centros = hojaMaestro(libro, H.CEN, COLUMNAS_CENTROS,
    'Centros activos que se usan en Gestiones (desplegable de Centro). Escriba en la primera fila vacía o pegue desde A3 (solo ACTIVOS con USAR_EN_GESTIONES = SI). CAMBIO marca lo NUEVO, MODIFICADO o BORRADO.',
    filasCentros(datos.centros), datos.filasCatalogos.centros);
  const recargos = hojaMaestro(libro, H.REC, COLUMNAS_RECARGOS,
    'Rangos de recargo (veces costo según el precio). Para agregar un rango, escríbalo en la primera fila vacía; para corregirlo, escriba encima. CAMBIO marca lo NUEVO, MODIFICADO o BORRADO. Los INACTIVOS no se usan y el orden no importa.',
    filasRecargos(datos.recargos), datos.filasCatalogos.recargos);
  const previsiones = hojaNombres(libro, H.PREV, 'Previsiones activas (desplegable de Previsión en Gestiones, solo avisa si el valor no está). Escriba en la primera fila vacía o pegue desde A3 NOMBRE, COMENTARIO y ESTADO (solo ACTIVAS).',
    datos.previsiones || [], datos.filasCatalogos.previsiones);
  const convenios = hojaNombres(libro, H.CONV, 'Convenios activos (desplegable de Convenio en Gestiones, solo avisa si el valor no está). Escriba en la primera fila vacía o pegue desde A3 NOMBRE, COMENTARIO y ESTADO (solo ACTIVOS).',
    datos.convenios || [], datos.filasCatalogos.convenios);
  const { rangos: cat } = hojaCatalogos(libro, datos.libroMes);
  hojaInstrucciones(libro, datos);
  const hNM = hojaNuevoMes(libro);

  const enHoja = (hoja, l, ultima) => `${ref(hoja)}$${l}$${PRIMERA}:$${l}$${ultima}`;
  const x = {
    ultimaItem,
    gA: enHoja(H.G, 'A', ultimaGestion),
    gD: enHoja(H.G, 'D', ultimaGestion),
    gE: enHoja(H.G, 'E', ultimaGestion),
    gT: enHoja(H.G, 'T', ultimaGestion),
    gJ: enHoja(H.G, 'J', ultimaGestion),
    // Columna CLAVE de Cargados, entera (la hoja crece con cada movimiento).
    cargadosClave: `${ref(H.CARG)}$${LETRA_CLAVE_CARGADOS}:$${LETRA_CLAVE_CARGADOS}`,
    iB: enHoja(H.I, I.clave, ultimaItem),
    iS: enHoja(H.I, I.total, ultimaItem),
    iAA: enHoja(H.I, I.estadoNorm, ultimaItem),
    iAG: enHoja(H.I, I.sinCodigo, ultimaItem),
    rCol,
    recargo: { desde: recargos('A'), hasta: recargos('B'), veces: recargos('C'), estado: recargos('E') },
    ri: riCol,
    riBusqueda: riCol('H'),
    previsiones,
    convenios,
  };

  // Gestiones
  // A1:D1: el mes del libro ("LIBRO NOVIEMBRE 2026"); la ayuda de esas
  // columnas va como nota del encabezado.
  prepararHoja(hG, COLUMNAS_GESTIONES, { congelarColumnas: 2, ayudaEnNota: ['A', 'B', 'C', 'D'] });
  hG.mergeCells('A1:D1');
  const rotulo = hG.getCell('A1');
  rotulo.value = f(`IF(${SIN_MES},"PLANTILLA BASE (sin mes): no se registra aquí. Cree el libro del mes en la hoja ""${H.NM}"".","LIBRO "&${L.nombre})`);
  rotulo.font = { bold: true, size: 14, color: { argb: COLOR.ok } };
  rotulo.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
  hG.addConditionalFormatting({
    ref: 'A1:D1',
    rules: [{ type: 'expression', priority: 1, formulae: [SIN_MES], style: { font: { bold: true, color: { argb: COLOR.textoError } }, fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: COLOR.error } } } }],
  });
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
  // Admisión y Fecha exigen el mes del libro: en la plantilla base no se
  // puede escribir ninguna, y sin ellas no hay CLAVE para Ítems. La fecha
  // solo acepta días del mes del libro (no depende de la fecha de hoy).
  const { libroMes } = datos;
  const digitos = soloDigitos(`B${PRIMERA}`);
  validar(hG, rg('B'), {
    ...digitos,
    formulae: [`AND(NOT(${SIN_MES}),${digitos.formulae[0]})`],
    // Sin "Omitir blancos": con esa opción Excel no valida si la fórmula
    // mira una celda vacía (el mes del libro, vacío en la plantilla base).
    allowBlank: false,
    errorTitle: libroMes ? 'Admisión' : 'Plantilla base',
    error: libroMes ? MENSAJES_LIBRO.admision : MENSAJES_LIBRO.base,
  });
  validar(hG, rg('C'), {
    type: 'custom',
    allowBlank: false,
    formulae: [`AND(NOT(${SIN_MES}),ISNUMBER(C${PRIMERA}),YEAR(C${PRIMERA})=${L.anio},MONTH(C${PRIMERA})=${L.mes})`],
    errorTitle: libroMes ? 'Fecha' : 'Plantilla base',
    error: libroMes ? MENSAJES_LIBRO.fecha(nombreLibroMes(libroMes)) : MENSAJES_LIBRO.base,
  });
  validar(hG, rg('D'), lista(empresasNombres, { errorTitle: 'Empresa', error: 'Elija una empresa de la lista (hoja Empresas).' }));
  validar(hG, rg('F'), { type: 'decimal', operator: 'greaterThanOrEqual', formulae: [0], error: 'Monto mayor o igual a 0.' });
  validar(hG, rg('G'), lista(cat.C));
  validar(hG, rg('I'), lista(centros('A')));
  validar(hG, rg('J'), lista(cat.G, { errorTitle: 'Atributo', error: 'Elija un segmento de la lista (hoja Catálogos).' }));
  validar(hG, rg('K'), lista(cat.D));
  validar(hG, rg('Q'), lista(cat.A));
  validar(hG, rg('W'), listaRegistradoPor(cat.registrado));
  // A mano: avisa (no bloquea) si el valor no está en la lista.
  validar(hG, rg('M'), lista(convenios, { errorStyle: 'warning', errorTitle: 'Convenio', error: 'No está en la lista de Convenios. ¿Usarlo igual?' }));
  validar(hG, rg('N'), lista(previsiones, { errorStyle: 'warning', errorTitle: 'Previsión', error: 'No está en la lista de Previsiones. ¿Usarla igual?' }));
  hG.addConditionalFormatting({
    ref: rg('A'),
    rules: [{ type: 'expression', priority: 1, formulae: [`AND(A${PRIMERA}<>"",OR(A${PRIMERA}="FECHA INVÁLIDA",COUNTIF($A$${PRIMERA}:$A$${ultimaGestion},A${PRIMERA})>1))`], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: COLOR.error } }, font: { color: { argb: COLOR.textoError } } } }],
  });
  hG.addConditionalFormatting({
    ref: rg('T'),
    rules: [{ type: 'expression', priority: 1, formulae: [`AND(ISNUMBER(T${PRIMERA}),ROUND(T${PRIMERA},0)<>0)`], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: COLOR.error } }, font: { color: { argb: COLOR.textoError } } } }],
  });
  hG.addConditionalFormatting({
    ref: rg('H'),
    rules: [
      { type: 'expression', priority: 1, formulae: [`H${PRIMERA}="INCOMPLETO"`], style: { font: { bold: true, color: { argb: COLOR.textoError } } } },
      { type: 'expression', priority: 2, formulae: [`OR(H${PRIMERA}="CARGADO",H${PRIMERA}="${ESTADO_FINALIZADO}")`], style: { font: { bold: true, color: { argb: COLOR.ok } } } },
    ],
  });
  // 2. Fila entera (columnas visibles A:AE) con color según el Estado
  // (decisión del 24-11-2026). Prioridad baja: los avisos de cada celda
  // (obligatorio vacío, diferencia, alerta…) se siguen viendo encima.
  hG.addConditionalFormatting({
    ref: `A${PRIMERA}:AE${ultimaGestion}`,
    rules: COLORES_ESTADO_GESTION.map(([estados, argb], i) => ({
      type: 'expression', priority: 20 + i,
      formulae: [`OR(${estados.map((e) => `$H${PRIMERA}="${e}"`).join(',')})`],
      style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb } } },
    })),
  });
  reglaObligatorio(hG, ['B', 'C', 'D', 'W'], 'V', PRIMERA, ultimaGestion);
  reglasCambio(hG, COLUMNAS_GESTIONES, 'V', 'AA', PRIMERA, ultimaGestion);
  // Admisión que no está en Reporte Info: naranja. Dato escrito a mano
  // (distinto de lo que trae Reporte Info): letra azul en cursiva.
  hG.addConditionalFormatting({
    ref: rg('B'),
    rules: [{ type: 'expression', priority: 2, formulae: [`AND($V${PRIMERA}="${ORIGEN_REGISTRADO}",TRIM($B${PRIMERA})<>"",$AF${PRIMERA}="")`], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: COLOR.aviso } } } }],
  });
  Object.entries(AUTOCOMPLETADO_GESTION).forEach(([l, aux]) => hG.addConditionalFormatting({
    ref: rg(l),
    rules: [{ type: 'expression', priority: 2, formulae: [`AND($V${PRIMERA}="${ORIGEN_REGISTRADO}",${l}${PRIMERA}<>"",${l}${PRIMERA}&""<>${aux}${PRIMERA})`], style: { font: { italic: true, color: { argb: COLOR.manual } } } }],
  }));
  const alertaRoja = `OR(ISNUMBER(SEARCH("Fecha fuera",AE${PRIMERA})),ISNUMBER(SEARCH("Plantilla base",AE${PRIMERA})))`;
  hG.addConditionalFormatting({
    ref: rg('AE'),
    rules: [
      // Rojo: fecha fuera del mes o plantilla base (no se puede cargar así).
      // Las dos reglas no se superponen: Excel puede igualar sus prioridades.
      { type: 'expression', priority: 1, formulae: [alertaRoja], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: COLOR.error } }, font: { bold: true, color: { argb: COLOR.textoError } } } },
      { type: 'expression', priority: 2, formulae: [`AND(AE${PRIMERA}<>"",NOT(${alertaRoja}))`], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: COLOR.aviso } }, font: { bold: true, color: { argb: 'FF7F4F00' } } } },
    ],
  });
  hG.addConditionalFormatting({
    ref: rg('C'),
    rules: [{ type: 'expression', priority: 1, formulae: [fueraDelMes(`C${PRIMERA}`)], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: COLOR.error } }, font: { bold: true, color: { argb: COLOR.textoError } } } }],
  });

  // Ítems
  // A1:D1 quedan para el botón "Mover cargados": su ayuda va como nota.
  // Congelada hasta Estado carga (la vista de carga).
  prepararHoja(hI, COLUMNAS_ITEMS, {
    congelarColumnas: VISTA_CARGA.length, vistaCarga: VISTA_CARGA.length,
    ayudaEnNota: [I.linea, I.admision, I.fecha, I.codigo],
  });
  filasItems.forEach((it, i) => {
    const r = PRIMERA + i;
    const valores = valoresItemSistema(it);
    const c = (k) => `${I[k]}${r}`;
    escribirFila(hI, r, COLUMNAS_ITEMS, {
      ...valores,
      ...formulasItemComunes(r, x),
      // Totales con el precio y veces costo guardados: siguen a la cantidad
      // y a SIN CARGO si se editan en la caída (el importador los recalcula).
      ...porLetra({
        total: f(`IF(${c('estadoCarga')}="SIN CARGO",0,${c('precio')}*N(${c('cantidad')}))`),
        venta: f(`IF(${c('estadoCarga')}="SIN CARGO",0,${c('precio')}*${c('veces')}*N(${c('cantidad')}))`),
      }),
      ...camposDeCambio(COLUMNAS_ITEMS, r, valores, I.modificado),
    }, { sistema: true, editables: camposEditablesItem(it) });
  });
  let linea = datos.ultimaLinea || filasItems.length;
  for (let r = PRIMERA + filasItems.length; r <= ultimaItem; r += 1) {
    linea += 1;
    escribirFila(hI, r, COLUMNAS_ITEMS, { [I.linea]: linea, ...formulasItemNuevas(r, x) }, { sistema: false });
  }
  const ri = (k) => `${I[k]}${PRIMERA}:${I[k]}${ultimaItem}`;
  validar(hI, ri('clave'), lista(x.gA, { errorTitle: 'CLAVE', error: 'Elija una CLAVE existente en la hoja Gestiones.' }));
  validar(hI, ri('tipoLinea'), lista(cat.E));
  validar(hI, ri('padre'), { type: 'whole', operator: 'greaterThanOrEqual', formulae: [1], error: 'N° de línea de la línea padre.' });
  validar(hI, ri('referencia'), lista(rCol(REF.referencia), { errorStyle: 'warning', errorTitle: 'Referencia', error: 'No está en Códigos: quedará "Sin código". ¿Continuar?' }));
  validar(hI, ri('cantidadIngreso'), { type: 'decimal', operator: 'greaterThan', formulae: [0], error: 'Cantidad mayor que 0.' });
  // PAD PADRE: Lote y Vencimiento son "PAD" (automático), no se escriben.
  // CONTENIDO PAD: Estado carga es CONTENIDO (su lista solo trae ese valor).
  const tipoFila = `$${I.tipoLinea}${PRIMERA}`;
  const noPadPadre = `${tipoFila}<>"PAD PADRE"`;
  const msjPadPadre = 'En un PAD PADRE el Lote y el Vencimiento son PAD (automático).';
  validar(hI, ri('lote'), { type: 'custom', formulae: [noPadPadre], errorTitle: 'PAD PADRE', error: msjPadPadre });
  const [desde, hasta] = fechaValida.formulae.map((d) => `DATE(${d.getUTCFullYear()},${d.getUTCMonth() + 1},${d.getUTCDate()})`);
  const venc = `${I.vencimiento}${PRIMERA}`;
  validar(hI, ri('vencimiento'), {
    type: 'custom',
    // Una fecha o el texto "Sin fecha" (decisión del 24-11-2026).
    formulae: [`AND(${noPadPadre},OR(${venc}="${SIN_FECHA}",AND(ISNUMBER(${venc}),${venc}>=${desde},${venc}<=${hasta})))`],
    errorTitle: 'Vencimiento', error: `Escriba una fecha válida (dd-mm-aaaa) o "${SIN_FECHA}". ${msjPadPadre}`,
  });
  validar(hI, ri('estadoCarga'), lista(`IF(${esContenido(tipoFila)},${cat.I},${cat.B})`, { errorTitle: 'Estado carga', error: 'Elija de la lista. En CONTENIDO PAD y CONTENIDO GUÍA el estado es CONTENIDO (automático).' }));
  validar(hI, ri('precioManual'), { type: 'decimal', operator: 'greaterThanOrEqual', formulae: [0], error: 'Monto mayor o igual a 0.' });
  hI.addConditionalFormatting({
    ref: ri('empresaProducto'),
    rules: [{ type: 'expression', priority: 1, formulae: [`$${I.empresaNoCoincide}${PRIMERA}=1`], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: COLOR.error } }, font: { color: { argb: COLOR.textoError } } } }],
  });
  hI.addConditionalFormatting({
    ref: ri('alerta'),
    rules: [{ type: 'expression', priority: 1, formulae: [`${I.alerta}${PRIMERA}<>""`], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: COLOR.error } }, font: { bold: true, color: { argb: COLOR.textoError } } } }],
  });
  // Tipo de línea, Lote y Vencimiento también (decisión del 24-11-2026): se
  // escriben siempre (NORMAL, "Sin lote", "Sin fecha"); en el PAD PADRE
  // Lote y Vencimiento ya traen PAD.
  reglaObligatorio(hI, ['clave', 'tipoLinea', 'numCot', 'referencia', 'cantidadIngreso', 'lote', 'vencimiento', 'registrado'].map((k) => I[k]), I.origen, PRIMERA, ultimaItem);
  // Estado carga en colores, según el estado efectivo (vacío = PENDIENTE).
  hI.addConditionalFormatting({ ref: ri('estadoCarga'), rules: reglasEstadoCarga(`$${I.estadoEf}${PRIMERA}`) });
  // Total ítem y Venta en naranja si la suma de la gestión no cuadra con su
  // Total cotización (la diferencia está en Gestiones, columna Diferencia).
  const noCuadra = `AND(ISNUMBER($${I.difCotizacion}${PRIMERA}),ROUND($${I.difCotizacion}${PRIMERA},0)<>0)`;
  ['total', 'venta'].forEach((k) => hI.addConditionalFormatting({
    ref: ri(k),
    rules: [{ type: 'expression', priority: 2, formulae: [noCuadra], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: COLOR.aviso } }, font: { bold: true, color: { argb: COLOR.textoAviso } } } }],
  }));
  validar(hI, ri('registrado'), listaRegistradoPor(cat.registrado));
  reglasCambio(hI, COLUMNAS_ITEMS, I.origen, I.modificado, PRIMERA, ultimaItem);

  // Códigos: EMPRESA con la lista de Empresas; TIPO, SEGMENTO y CLASE con
  // las del sistema. Pegar el export borra la validación, así que además un
  // valor fuera de su lista se pinta de rojo (formato condicional, que sí
  // sobrevive al pegado de valores). Con la lista vacía no se marca nada.
  const hR = libro.getWorksheet(H.R);
  const ultimaCodigo = PRIMERA + datos.filasCatalogos.referencias - 1;
  const rr = (l) => `${l}${PRIMERA}:${l}${ultimaCodigo}`;
  [['E', empresasNombres, 'Empresa', 'No está en la hoja Empresas.'], ['F', cat.F, 'Tipo', 'No es un tipo de la lista.'],
    ['G', cat.G, 'Segmento', 'No es un segmento de la lista.'], ['H', cat.H, 'Clase', 'No es una clase de la lista.']].forEach(([l, listaRango, titulo, error]) => {
    validar(hR, rr(l), lista(listaRango, { errorStyle: 'warning', errorTitle: titulo, error: `${error} ¿Usarlo igual?` }));
    hR.addConditionalFormatting({
      ref: rr(l),
      rules: [{ type: 'expression', priority: 1, formulae: [fueraDeLista(`${l}${PRIMERA}`, listaRango)], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: COLOR.error } }, font: { bold: true, color: { argb: COLOR.textoError } } } }],
    });
  });

  // Fórmulas ocultas (decisión del 23-11-2026): toda celda con fórmula queda
  // "Oculta", así con la hoja protegida la barra muestra solo el resultado.
  // Las que ya estaban bloqueadas siguen bloqueadas; las del autocompletado
  // de Gestiones (E, M-P) siguen desbloqueadas para escribir encima.
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
  await hNM.protect(clave, { selectLockedCells: true, selectUnlockedCells: true });
  // Mismas opciones con que vuelven a proteger las macros (Proteger en
  // ModContingencia.bas), que editan Catálogos y las hojas con marcas.
  for (const nombre of [H.GUIAS, H.CONSIG, H.RI, H.R, H.E, H.CEN, H.REC, H.PREV, H.CONV, H.C, H.INS]) {
    await libro.getWorksheet(nombre).protect(clave, { selectLockedCells: true, selectUnlockedCells: true, autoFilter: true, formatColumns: true, formatRows: true });
  }

  return { libro, filas: { ultimaGestion, ultimaItem } };
};
