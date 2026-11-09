import { interpretarLectura, lecturaComoCodigoNormal } from '../../../../../functions/bodega/gs1.mjs';
import { normalizarClave, referenciaDeProducto } from '../../../../../functions/bodega/nucleo.mjs';

// Filas y búsqueda de Maestros → Códigos de barras. Lógica pura.

// Una fila por vínculo, con los datos del producto (de la copia en memoria).
export const filasDeVinculos = (vinculos, productos) => {
  const porId = Object.fromEntries(productos.map((p) => [p.id, p]));
  return vinculos.map((v) => {
    const p = porId[v.productoId];
    return { ...v, referencia: referenciaDeProducto(p), nombre: p?.nombre || '(producto no encontrado)', codigoMaestro: p?.codigoMaestro || '', codigo: v.codigoLeido || v.clave };
  }).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es') || a.clave.localeCompare(b.clave));
};

export const filtrarFilas = (filas, texto) => {
  const palabras = normalizarClave(texto).split(' ').filter(Boolean);
  if (!palabras.length) return filas;
  return filas.filter((f) => {
    const base = normalizarClave([f.referencia, f.nombre, f.codigoMaestro, f.clave, f.codigoLeido].join(' '));
    return palabras.every((w) => base.includes(w));
  });
};

// Lo escaneado -> { tipo: 'encontrado', fila } | { tipo: 'sinVincular', lectura }
// | { tipo: 'soloLote' } | null. Con la misma normalización que al vincular.
export const buscarPorLectura = (filas, texto) => {
  const lectura = interpretarLectura(texto);
  if (!lectura) return null;
  const porClave = (clave) => filas.find((f) => f.clave === clave);
  if (lectura.soloDatosLote) {
    const fila = lectura.gs1.ambiguo ? porClave(lecturaComoCodigoNormal(lectura).clave) : null;
    return fila ? { tipo: 'encontrado', fila } : { tipo: 'soloLote' };
  }
  const fila = porClave(lectura.clave);
  return fila ? { tipo: 'encontrado', fila } : { tipo: 'sinVincular', lectura };
};

export const referenciaVisible = (f) => f?.referencia || f?.codigoMaestro || '—';
