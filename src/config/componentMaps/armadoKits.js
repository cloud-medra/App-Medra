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
          ...columnas([['referencia', 'Referencia'], ['insumos', 'Insumos'], ['unidades', 'Unidades'], ['fecha', 'Fecha de creación'], ['estado', 'Estado'], ['avisos', 'Avisos']]),
        },
      },
      kit: {
        label: 'Sección: Contenido del kit',
        elements: {
          btn_editar: { label: 'Acción: Editar contenido (mueve stock de Bodega)' },
          btn_eliminar: { label: 'Acción: Eliminar kit (devuelve el stock a Bodega)' },
          btn_completar_vencimiento: { label: 'Acción: Completar vencimiento de insumos sin fecha' },
          btn_registrar_reposicion: { label: 'Acción: Registrar reposición del centro (entra stock nuevo a Bodega)' },
          btn_rearmar: { label: 'Acción: Rearmar (kit nuevo del mismo modelo; exige también Crear kit)' },
          ...columnas([['componente', 'Componente'], ['referencia', 'Referencia'], ['nombre', 'Nombre'], ['lote', 'Lote'], ['vencimiento', 'Vencimiento'], ['cantidad', 'Cantidad'], ['usado', 'Usado'], ['devuelto', 'Devuelto'], ['repuesto', 'Repuesto'], ['marcas', 'Marcas']]),
        },
      },
    },
  },
  '/armadoKits/configuracionFlexibles': {
    label: 'Configuración de los kits flexibles: receta y modelos (ConfiguracionFlexibles.jsx)',
    sections: {
      configuracion: {
        label: 'Sección: Componentes, referencias permitidas y modelos',
        elements: {
          btn_guardar: { label: 'Acción: Guardar la configuración (no cambia los kits ya armados)' },
        },
      },
    },
  },
};
