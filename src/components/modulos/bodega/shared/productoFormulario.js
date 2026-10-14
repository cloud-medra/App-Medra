// Valores del formulario de producto (FormProducto).

export const PRODUCTO_VACIO = Object.freeze({
  nombre: '', codigoMaestro: '', referencia: '', ubicacion: '', unidadId: '', categoriaId: '',
  manejaLote: true, manejaVencimiento: true, stockMinimo: '', activo: true, maestroCodigoId: '', maestroCodigo: null,
});

// Producto guardado -> valores del formulario.
export const productoAFormulario = (p) => ({
  ...PRODUCTO_VACIO,
  ...p,
  categoriaId: p?.categoriaId || '',
  maestroCodigoId: p?.maestroCodigoId || '',
  stockMinimo: p?.stockMinimo ?? '',
});
