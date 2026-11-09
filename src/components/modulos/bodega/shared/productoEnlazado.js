import { referenciaDeProducto } from '../../../../../functions/bodega/nucleo.mjs';

// Ítem del maestro clínico que ya tiene producto en Bodega (admite uno solo).
// Lógica pura.

// { [maestroCodigoId]: producto } desde la copia en memoria del maestro de
// Bodega, sin lecturas. `idActual`: el producto que se edita no cuenta.
export const maestrosConProducto = (productos = [], idActual = null) => new Map(
  productos.filter((p) => p.maestroCodigoId && p.id !== idActual).map((p) => [p.maestroCodigoId, p]),
);

// Mismos datos que entrega el servidor en su error.
export const datosProductoEnlazado = (p) => ({
  productoId: p.id, referencia: referenciaDeProducto(p), codigoMaestro: p.codigoMaestro || '', nombre: p.nombre || '', activo: p.activo !== false,
});

export const etiquetaProductoEnlazado = (a) => a?.referencia || a?.codigoMaestro || a?.nombre || '';

// El error de la Function -> datos para el aviso; null si es otro error.
export const avisoDesdeError = (error, extras = {}) => (
  error?.details?.motivo === 'maestro-con-producto' ? { ...error.details, mensaje: error.message, ...extras } : null
);

// Qué ofrece el aviso: 'AGREGAR' (hay código y permiso de vincular), 'ABRIR'
// (no hay código escaneado) o null. Sin producto identificado, o inactivo con
// un código (no se le puede vincular), solo informa.
export const accionAvisoMaestro = ({ aviso, codigo, puedeVincular }) => {
  if (!aviso?.productoId) return null;
  if (!codigo) return 'ABRIR';
  return puedeVincular && aviso.activo !== false ? 'AGREGAR' : null;
};
