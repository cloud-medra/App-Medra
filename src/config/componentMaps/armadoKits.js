import { columnas } from './columnas.js';

// Armado de Kits. Las acciones que escriben se validan además en las Cloud
// Functions (functions/armadoKits, puedeAccion).
export const armadoKitsComponentMaps = {
  '/armadoKits/flexibles': {
    label: 'Kits flexibles (Flexibles.jsx)',
    sections: {
      kits: {
        label: 'Sección: Listado de kits',
        elements: {
          btn_crear: { label: 'Acción: Crear kit (descuenta stock de Bodega)' },
          ...columnas([['referencia', 'Referencia'], ['insumos', 'Insumos'], ['unidades', 'Unidades'], ['fecha', 'Fecha de creación'], ['avisos', 'Avisos']]),
        },
      },
      kit: {
        label: 'Sección: Contenido del kit',
        elements: {
          btn_editar: { label: 'Acción: Editar contenido (mueve stock de Bodega)' },
          btn_eliminar: { label: 'Acción: Eliminar kit (devuelve el stock a Bodega)' },
          btn_completar_vencimiento: { label: 'Acción: Completar vencimiento de insumos sin fecha' },
          ...columnas([['referencia', 'Referencia'], ['nombre', 'Nombre'], ['lote', 'Lote'], ['vencimiento', 'Vencimiento'], ['cantidad', 'Cantidad'], ['marcas', 'Marcas']]),
        },
      },
    },
  },
};
