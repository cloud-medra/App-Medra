import { useColumnasPermitidas } from '../../../../../hooks/useColumnasPermitidas';

// Columnas de las líneas de Ingreso por documento: las de siempre más
// precio unitario (costo de entrada del costo promedio, precargado con el
// precio neto) y total (permiso col_<key> en la sección "lineas" de la vista).
const PATH_INGRESO = '/bodega/ingresoBodega';

export const COLUMNAS_INGRESO = [
  { key: 'referencia', label: 'Referencia', ancho: 130, min: 60 },
  { key: 'producto', label: 'Producto', fija: true, ancho: 260, min: 110 },
  { key: 'lote', label: 'Lote', ancho: 110, min: 55 },
  { key: 'vencimiento', label: 'Vencimiento', ancho: 130, min: 80 },
  { key: 'cantidad', label: 'Cantidad', alinear: 'text-right', ancho: 95, min: 70 },
  { key: 'precio', label: 'Precio unitario', alinear: 'text-right', ancho: 125, min: 90 },
  { key: 'total', label: 'Total', alinear: 'text-right', ancho: 110, min: 70 },
  { key: 'quitar', label: '', fija: true, ancho: 40, min: 34 },
];

export const useColumnasIngreso = () => useColumnasPermitidas(PATH_INGRESO, 'lineas', COLUMNAS_INGRESO);
