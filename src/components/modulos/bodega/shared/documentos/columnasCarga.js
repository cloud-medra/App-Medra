import { useColumnasPermitidas } from '../../../../../hooks/useColumnasPermitidas';

// Columnas de las líneas de Carga inicial: referencia en vez de código
// maestro, más precio unitario y total (permiso col_<key> en la sección
// "lineas" de la vista). Ingreso e Inventario usan las de EditorLineasStock.
const PATH_CARGA = '/bodega/cargaInicialBodega';

export const COLUMNAS_CARGA = [
  { key: 'referencia', label: 'Referencia' },
  { key: 'producto', label: 'Producto', fija: true },
  { key: 'lote', label: 'Lote' },
  { key: 'vencimiento', label: 'Vencimiento' },
  { key: 'cantidad', label: 'Cantidad', alinear: 'text-right' },
  { key: 'precio', label: 'Precio unitario', alinear: 'text-right' },
  { key: 'total', label: 'Total', alinear: 'text-right' },
  { key: 'quitar', label: '', fija: true },
];

export const useColumnasCarga = () => useColumnasPermitidas(PATH_CARGA, 'lineas', COLUMNAS_CARGA);
