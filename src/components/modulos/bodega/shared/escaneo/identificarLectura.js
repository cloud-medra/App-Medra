import { interpretarLectura, lecturaComoCodigoNormal } from '../../../../../../functions/bodega/gs1.mjs';
import { leerVinculo, obtenerProducto } from '../bodegaApi';

// Qué es lo que se acaba de escanear (o escribir y confirmar con Enter):
//   { tipo: 'datosLote', lectura }   GS1 sin GTIN: solo lote/vencimiento
//                                    (segundo código del producto en curso)
//   { tipo: 'producto', producto, lectura }  código vinculado a un producto
//   { tipo: 'sinVincular', lectura } código no vinculado (o vinculado a un
//                                    producto que ya no existe)
//   null                             lectura vacía
// `lectura` = interpretarLectura (codigo, clave, gs1 con lote/vencimiento).
// Lee directo de Firestore (1 lectura: el vínculo) y el producto de la copia
// en memoria del maestro.
export const identificarLectura = async (texto, { leer = leerVinculo, producto = obtenerProducto } = {}) => {
  const lectura = interpretarLectura(texto);
  if (!lectura) return null;
  if (lectura.soloDatosLote) {
    // Segundo código crudo (17 + 10 sin prefijo ni GS): si ese texto está
    // vinculado a un producto, es un código normal y gana el vínculo.
    if (!lectura.gs1.ambiguo) return { tipo: 'datosLote', lectura };
    const normal = lecturaComoCodigoNormal(lectura);
    const vinculoNormal = await leer(normal.clave);
    const productoNormal = vinculoNormal?.productoId ? await producto(vinculoNormal.productoId) : null;
    return productoNormal ? { tipo: 'producto', producto: productoNormal, lectura: normal } : { tipo: 'datosLote', lectura };
  }
  const vinculo = await leer(lectura.clave);
  if (!vinculo?.productoId) return { tipo: 'sinVincular', lectura };
  const encontrado = await producto(vinculo.productoId);
  return encontrado ? { tipo: 'producto', producto: encontrado, lectura } : { tipo: 'sinVincular', lectura };
};

// Lote y vencimiento que trae una lectura (para autocompletar).
export const datosLoteDeLectura = (lectura) => ({
  lote: lectura?.gs1?.lote || '',
  vencimiento: lectura?.gs1?.vencimiento || '',
});

// Texto escaneado dentro de un campo (Lote, buscador del modal "Código sin
// vincular"…): si es GS1 con lote o vencimiento, los datos para rellenar
// { lote, vencimiento, codigoLote, lectura } en vez de dejar el código
// completo como texto. null si no lo es (texto escrito a mano).
export const datosLoteEnTexto = (texto) => {
  const lectura = interpretarLectura(texto);
  if (!lectura?.gs1?.esGS1) return null;
  const datos = datosLoteDeLectura(lectura);
  if (!datos.lote && !datos.vencimiento) return null;
  return { ...datos, codigoLote: lectura.soloDatosLote ? lectura.codigo : '', lectura };
};

// ---- Segundo código antes que el producto ----
// Si se escanea primero el código de lote/vencimiento, queda "en espera"
// y se aplica al producto que se escanee a continuación (vence a los 2
// minutos para no aplicarlo a un producto que no corresponde).
export const VIGENCIA_DATOS_LOTE_MS = 2 * 60 * 1000;

// Lectura 'datosLote' -> datos en espera { lote, vencimiento, codigoLote, en }.
export const datosLoteEnEspera = (lectura, ahora = Date.now()) => ({ ...datosLoteDeLectura(lectura), codigoLote: lectura?.codigo || '', en: ahora });

// Lote/vencimiento para el producto recién escaneado: los de su propio
// código (todo en uno) o, si no trae, los que estaban en espera y siguen
// vigentes. { lote, vencimiento, codigoLote, usoEspera }.
export const combinarDatosLote = (lecturaProducto, espera, ahora = Date.now()) => {
  const propios = datosLoteDeLectura(lecturaProducto);
  if (propios.lote || propios.vencimiento) return { ...propios, codigoLote: '', usoEspera: false };
  const vigente = espera && ahora - espera.en <= VIGENCIA_DATOS_LOTE_MS ? espera : null;
  return vigente
    ? { lote: vigente.lote, vencimiento: vigente.vencimiento, codigoLote: vigente.codigoLote, usoEspera: true }
    : { lote: '', vencimiento: '', codigoLote: '', usoEspera: false };
};

// Lotes de un producto para elegir al escanear solo el GTIN: uno por lote
// + vencimiento (suma el stock de distintos dueños), FEFO.
export const opcionesLote = (lotes = []) => {
  const porClave = new Map();
  lotes.forEach((l) => {
    const clave = `${l.lote || ''}|${l.vencimiento || ''}`;
    const previo = porClave.get(clave) || { lote: l.lote || '', vencimiento: l.vencimiento || '', disponible: 0 };
    porClave.set(clave, { ...previo, disponible: previo.disponible + (Number(l.disponible) || 0) });
  });
  return [...porClave.values()].sort((a, b) => (a.vencimiento || '9999-99-99').localeCompare(b.vencimiento || '9999-99-99') || a.lote.localeCompare(b.lote));
};

// Teclas que cierran una lectura de la pistola. Algunas se configuran con
// Tab como sufijo; se acepta también para no perder el foco al leer.
export const esTeclaFinEscaneo = (evento) =>
  evento?.key === 'Enter' || evento?.key === 'NumpadEnter' || evento?.key === 'Tab';
