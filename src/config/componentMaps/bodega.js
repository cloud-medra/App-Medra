import { columnas } from './columnas.js';

// Bodega (módulo nuevo, independiente de Inventario). Las acciones que
// escriben se validan además en las Cloud Functions (functions/bodega,
// puedeAccion). btn_inactivar y btn_desvincular son sensibles: denegadas
// por defecto (ACCIONES_DENEGADAS_POR_DEFECTO).
export const bodegaComponentMaps = {
  '/bodega/maestroBodega': {
    label: 'Maestro de productos de Bodega (MaestroBodega.jsx)',
    sections: {
      listado: {
        label: 'Sección: Listado de productos (buscador, escaneo, filtros, stock)',
        elements: {
          btn_actualizar: { label: 'Acción: Actualizar listado' },
          ...columnas([
            ['codigo', 'Código maestro'], ['categoria', 'Categoría'], ['unidad', 'Unidad'], ['ubicacion', 'Ubicación'],
            ['loteVencimiento', 'Maneja lote / vencimiento'], ['disponible', 'Disponible Bodega General'],
            ['transito', 'En tránsito (con desglose por centro)'], ['total', 'Total'], ['minimo', 'Stock mínimo'],
          ]),
        },
      },
      productos: {
        label: 'Sección: Productos',
        elements: {
          btn_crear: { label: 'Acción: Crear producto (también desde el escaneo)' },
          btn_editar: { label: 'Acción: Editar producto' },
          btn_inactivar: { label: 'Acción: Activar / inactivar producto (sensible)' },
        },
      },
      ficha_lotes: {
        label: 'Sección: Ficha del producto · Lotes con stock',
        elements: {
          ...columnas([['vencimiento', 'Vencimiento'], ['disponible', 'Disponible'], ['transito', 'En tránsito'], ['centros', 'En centros']]),
        },
      },
      codigos: {
        label: 'Sección: Códigos de barra vinculados',
        elements: {
          btn_vincular: { label: 'Acción: Vincular código de barra a un producto' },
          btn_desvincular: { label: 'Acción: Quitar o reasignar un código de barra (sensible)' },
        },
      },
    },
  },

  '/bodega/catalogosBodega': {
    label: 'Categorías y unidades de Bodega (CatalogosBodega.jsx)',
    sections: {
      catalogos: {
        label: 'Sección: Categorías y unidades de medida',
        elements: {
          btn_guardar: { label: 'Acción: Crear, editar, activar o inactivar' },
        },
      },
    },
  },
};
