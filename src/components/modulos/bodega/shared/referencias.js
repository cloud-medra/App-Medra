import { leerCatalogo } from '../../../../stores/catalogosStore';
import { referenciaProducto } from './documentos/lineasDocumento';

// Referencia (propia o del maestro clínico) de un producto por su id, desde
// la copia en memoria del maestro de Bodega (sin leer Firestore). Para
// exportaciones y registros que guardan solo el código (cajas, entregas…).
export const referenciaPorId = (productoId, productos = leerCatalogo('bodegaProductos') || []) =>
  referenciaProducto(productos.find((p) => p.id === productoId));
