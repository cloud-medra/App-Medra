// Bodega: lectura de códigos de barra (pistola en modo teclado o escritos a
// mano) y parseo GS1 (GS1-128 / GS1 DataMatrix / QR GS1).
//
// Lo usan la pantalla (para identificar el producto y autocompletar lote y
// vencimiento al instante) y las Cloud Functions (que recalculan la clave a
// partir de lo leído, sin confiar en la que mande el navegador). Sin
// dependencias.
//
// Identificadores de aplicación (AI) que se devuelven: (01) GTIN, (10) lote,
// (17) vencimiento AAMMDD, (11) fecha de producción y (21) serie. El resto se
// salta cuando su largo es conocido.
//
// Formatos aceptados:
//   - Con paréntesis: "(01)07612345678904(17)261231(10)ABC123"
//   - Crudo: "010761234567890417261231" + "10ABC123" con el separador FNC1
//     transmitido como GS (ASCII 29), con o sin prefijo de simbología
//     (]C1, ]d2, ]Q3, ]e0).
// Sin separador GS, un AI de largo variable (como el lote) se lee hasta el
// final: por eso lote y vencimiento quedan editables en pantalla.
//
// Segundo código del producto: algunos productos traen un código con el
// GTIN y otro solo con lote/vencimiento. Ese segundo código se reconoce como
// GS1 "sin GTIN" si viene con paréntesis, con prefijo de simbología o con
// separador GS; uno crudo sin nada de eso no se interpreta (un código
// interno numérico podría confundirse con AI).

export const GS = '\u001d';

// AI -> largo fijo del dato (sin contar el AI). Los que no están aquí se
// consideran de largo variable (hasta GS o fin).
const LARGO_FIJO = {
  '00': 18, '01': 14, '02': 14,
  '11': 6, '12': 6, '13': 6, '15': 6, '16': 6, '17': 6,
  '20': 2,
};
// AI de largo variable conocidos (2 dígitos) y de 4 dígitos (31xx-36xx,
// largo fijo 6).
const VARIABLES_2 = new Set(['10', '21', '22', '30', '37', '90', '91', '92', '93', '94', '95', '96', '97', '98', '99']);
const esAI4Medida = (ai4) => /^3[1-6]\d\d$/.test(ai4);

const PREFIJO_SIMBOLOGIA = /^\][A-Za-z]\d/;

// Dígito verificador GS1 (GTIN-8/12/13/14).
export const gtinValido = (gtin) => {
  if (!/^\d{8}$|^\d{12,14}$/.test(gtin || '')) return false;
  const digitos = gtin.split('').map(Number);
  const verificador = digitos.pop();
  const suma = digitos.reverse().reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (suma % 10)) % 10 === verificador;
};

// 'AAMMDD' -> 'AAAA-MM-DD'. Día 00 = último día del mes.
export const fechaGS1aISO = (aammdd) => {
  if (!/^\d{6}$/.test(aammdd || '')) return '';
  const anio = 2000 + Number(aammdd.slice(0, 2));
  const mes = Number(aammdd.slice(2, 4));
  let dia = Number(aammdd.slice(4, 6));
  if (mes < 1 || mes > 12) return '';
  const ultimoDia = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  if (dia === 0) dia = ultimoDia;
  if (dia > ultimoDia) return '';
  return `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
};

const parsearConParentesis = (texto) => {
  const ais = {};
  const re = /\((\d{2,4})\)([^(]*)/g;
  let m;
  let consumido = '';
  while ((m = re.exec(texto)) !== null) {
    ais[m[1]] = m[2].split(GS).join('').trim();
    consumido += m[0];
  }
  return consumido.length === texto.length && Object.keys(ais).length > 0 ? ais : null;
};

const parsearCrudo = (texto) => {
  const ais = {};
  let i = 0;
  while (i < texto.length) {
    if (texto[i] === GS) { i += 1; continue; }
    const ai2 = texto.slice(i, i + 2);
    const ai4 = texto.slice(i, i + 4);
    let ai;
    let largo = null;
    if (LARGO_FIJO[ai2] !== undefined) { ai = ai2; largo = LARGO_FIJO[ai2]; }
    else if (esAI4Medida(ai4)) { ai = ai4; largo = 6; }
    else if (VARIABLES_2.has(ai2)) { ai = ai2; }
    else return null; // AI desconocido: no se puede seguir con seguridad
    const inicio = i + ai.length;
    let fin;
    if (largo !== null) {
      fin = inicio + largo;
      if (fin > texto.length) return null;
    } else {
      const sep = texto.indexOf(GS, inicio);
      fin = sep === -1 ? texto.length : sep;
    }
    ais[ai] = texto.slice(inicio, fin);
    i = fin;
  }
  return Object.keys(ais).length > 0 ? ais : null;
};

const VACIO = Object.freeze({ esGS1: false, gtin: '', lote: '', vencimiento: '', fabricacion: '', serie: '', ais: {} });

// Texto leído -> { esGS1, gtin, lote, vencimiento, fabricacion, serie, ais }.
// Es GS1 si trae un (01) con dígito verificador válido, o si sin (01) trae
// lote/vencimiento/serie en un formato inequívoco (ver arriba). Un (01) con
// dígito verificador inválido no es GS1 (se usa el código completo).
export const parsearGS1 = (valor) => {
  const original = String(valor ?? '').trim();
  if (!original) return VACIO;
  const conPrefijo = PREFIJO_SIMBOLOGIA.test(original);
  const texto = original.replace(PREFIJO_SIMBOLOGIA, '');
  const conParentesis = texto.startsWith('(');

  const ais = conParentesis ? parsearConParentesis(texto) : parsearCrudo(texto);
  if (!ais) return VACIO;

  const resultado = {
    esGS1: true,
    gtin: '',
    lote: String(ais['10'] || '').trim(),
    vencimiento: fechaGS1aISO(ais['17']),
    fabricacion: fechaGS1aISO(ais['11']),
    serie: String(ais['21'] || '').trim(),
    ais,
  };
  if (ais['01'] !== undefined) {
    if (!gtinValido(ais['01'])) return VACIO;
    return { ...resultado, gtin: ais['01'] };
  }
  const inequivoco = conParentesis || conPrefijo || texto.includes(GS);
  const traeDatosLote = Boolean(resultado.lote || resultado.vencimiento || resultado.serie);
  return inequivoco && traeDatosLote ? resultado : VACIO;
};

// Texto del campo -> código limpio: sin espacios ni saltos alrededor y sin
// caracteres de control salvo GS (separador FNC1 de GS1).
const CONTROL_SIN_GS = /[\u0000-\u001c\u001e\u001f\u007f]/g;
export const normalizarCodigoLeido = (texto) => String(texto ?? '').replace(CONTROL_SIN_GS, '').trim();

export const MAX_CODIGO_LEIDO = 300;

// Lectura -> { codigo, clave, gs1, soloDatosLote } o null si está vacía.
//   codigo: lo leído (limpio), para mostrar.
//   clave:  lo que se vincula al producto. En GS1 es el GTIN (el resto del
//           código cambia con cada lote/vencimiento); si no, el código.
//   soloDatosLote: GS1 sin GTIN (segundo código: solo lote/vencimiento);
//           no identifica producto, clave vacía.
export const interpretarLectura = (texto) => {
  const codigo = normalizarCodigoLeido(texto);
  if (!codigo) return null;
  const gs1 = parsearGS1(codigo);
  const soloDatosLote = gs1.esGS1 && !gs1.gtin;
  const clave = gs1.gtin || (soloDatosLote ? '' : codigo.split(GS).join(''));
  return { codigo, clave, gs1, soloDatosLote };
};

// Clave del código -> id de documento válido en Firestore (no admite "/",
// ni "." / ".." solos, ni el patrón __x__). Mismo criterio que el
// inventario anterior, así los ids de los vínculos migrados coinciden.
export const idVinculo = (clave) => {
  const texto = String(clave ?? '').trim();
  if (!texto) return '';
  const codificado = encodeURIComponent(texto).replace(/\./g, '%2E');
  return /^__.*__$/.test(codificado) ? `cb_${codificado}` : codificado;
};
