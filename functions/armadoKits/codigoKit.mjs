// Código de barras de un kit (Code 128): "KIT" + ID + "V" + versión del
// contenido, por ejemplo KITF001V1. Lo usan la hoja del kit (PDF), Egreso (al
// escanear) y las Functions que vinculan códigos a productos, que lo rechazan.
//
// Solo letras y números: un guion u otro símbolo puede leerse distinto según
// la configuración de teclado del lector. El prefijo "KIT" no es un
// identificador GS1, así que la lectura de productos nunca lo toma como tal.
// La versión permite detectar una hoja impresa antes de editar el contenido.

export const PREFIJO_CODIGO_KIT = 'KIT';
const PATRON = /^KIT([A-Z]+\d+)V(\d+)$/;
const PREFIJO_SIMBOLOGIA = /^\][A-Za-z]\d/;

export const codigoBarrasKit = ({ codigo, version }) => `${PREFIJO_CODIGO_KIT}${codigo}V${Number(version) || 1}`;

// Lo leído -> { codigo: 'F001', version: 1 } o null si no es un código de kit.
// Admite lo que agrega el lector: espacios, Enter, caracteres de control,
// prefijo de simbología (]C0) y minúsculas (Bloq Mayús).
export const leerCodigoKit = (texto) => {
  const limpio = String(texto ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().replace(PREFIJO_SIMBOLOGIA, '').toUpperCase();
  const m = PATRON.exec(limpio);
  return m ? { codigo: m[1], version: Number(m[2]) } : null;
};

export const esCodigoKit = (texto) => leerCodigoKit(texto) !== null;
