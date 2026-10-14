import { stockTotal, bajoMinimo, textoBusquedaProducto, normalizarClave } from '../../../../../functions/bodega/nucleo.mjs';

// Filtros del listado del Maestro (en memoria). `texto`: todas las palabras
// deben aparecer en nombre, código maestro, referencia, ubicación o códigos
// de barra.
export const filtrarProductos = (productos, { texto = '', categoriaId = '', estado = 'activos', conStock = false, soloBajoMinimo = false } = {}) => {
  const palabras = normalizarClave(texto).split(' ').filter(Boolean);
  return productos.filter((p) => {
    if (estado === 'activos' && p.activo === false) return false;
    if (estado === 'inactivos' && p.activo !== false) return false;
    if (categoriaId && p.categoriaId !== categoriaId) return false;
    if (conStock && stockTotal(p) <= 0) return false;
    if (soloBajoMinimo && !bajoMinimo(p)) return false;
    if (palabras.length) {
      const base = textoBusquedaProducto(p);
      if (!palabras.every((w) => base.includes(w))) return false;
    }
    return true;
  });
};
