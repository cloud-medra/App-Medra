// Valorización del stock en el listado del Maestro (lógica pura).
//   Precio neto: la copia del maestro clínico guardada en el producto
//   (maestroCodigo.precioNeto), la misma que usan Carga inicial e
//   Inventario. null si no tiene.
//   Total $: precio neto × disponible en la Bodega General (0 sin precio).

export const precioNetoProducto = (p) => {
  const n = Number(p?.maestroCodigo?.precioNeto);
  return Number.isFinite(n) && n > 0 ? n : null;
};

export const totalValorizado = (p) => (precioNetoProducto(p) || 0) * (Number(p?.disponible) || 0);

export const totalValorizadoLista = (productos = []) => productos.reduce((n, p) => n + totalValorizado(p), 0);
