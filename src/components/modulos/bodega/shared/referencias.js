import { useMemo } from 'react';
import { leerCatalogo } from '../../../../stores/catalogosStore';
import { useCatalogo } from '../../../../hooks/useCatalogo';
import { referenciaProducto } from './documentos/lineasDocumento';

// Referencia (propia o del maestro clínico) de un producto por su id, desde
// la copia en memoria del maestro de Bodega (sin leer Firestore). Para
// exportaciones y registros que guardan solo el código (cajas, entregas…).
export const referenciaPorId = (productoId, productos = leerCatalogo('bodegaProductos') || []) =>
  referenciaProducto(productos.find((p) => p.id === productoId));

// Lo mismo para tablas: (productoId) => referencia, se actualiza con el maestro.
export const useReferenciaDe = () => {
  const { datos: productos } = useCatalogo('bodegaProductos');
  return useMemo(() => {
    const porId = Object.fromEntries(productos.map((p) => [p.id, p]));
    return (productoId) => referenciaProducto(porId[productoId]);
  }, [productos]);
};
