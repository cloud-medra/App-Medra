import { interpretarLectura } from '../../../../../../functions/bodega/gs1.mjs';
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
  if (lectura.soloDatosLote) return { tipo: 'datosLote', lectura };
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

// Teclas que cierran una lectura de la pistola. Algunas se configuran con
// Tab como sufijo; se acepta también para no perder el foco al leer.
export const esTeclaFinEscaneo = (evento) =>
  evento?.key === 'Enter' || evento?.key === 'NumpadEnter' || evento?.key === 'Tab';
