import { columnas } from './columnas.js';

// Columnas de la tabla de tránsitos (Tránsito y detalle de Tránsito por centro).
const COLUMNAS_TRANSITO = [
  ['codigo', 'Código maestro'], ['lote', 'Lote'], ['vencimiento', 'Vencimiento'], ['centro', 'Centro'],
  ['cantidad', 'Pendiente / salida'], ['fechaSalida', 'Fecha de salida'], ['dias', 'Días en tránsito'],
  ['usuario', 'Usuario'], ['solicitante', 'Destino / solicitante'], ['salida', 'N° salida'],
];

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
          btn_exportar: { label: 'Acción: Exportar listado a Excel/CSV' },
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
      kardex: {
        label: 'Sección: Ficha del producto · Kardex',
        elements: {
          btn_exportar: { label: 'Acción: Exportar kardex a Excel/CSV' },
          ...columnas([['lote', 'Lote'], ['vencimiento', 'Vencimiento'], ['centro', 'Centro'], ['saldoLote', 'Saldo del lote'], ['saldo', 'Saldo del producto'], ['documento', 'Documento'], ['usuario', 'Usuario'], ['observacion', 'ID / observación']]),
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

  '/bodega/ingresoBodega': {
    label: 'Ingreso por documento de Bodega (IngresoBodega.jsx)',
    sections: {
      documento: {
        label: 'Sección: Documento (guía/factura, proveedor, OC) y confirmación',
        elements: {
          btn_guardar_borrador: { label: 'Acción: Guardar borrador' },
          btn_confirmar: { label: 'Acción: Confirmar ingreso (suma stock)' },
          btn_eliminar_borrador: { label: 'Acción: Eliminar borrador' },
        },
      },
      lineas: {
        label: 'Sección: Líneas escaneadas',
        elements: {
          ...columnas([['codigo', 'Código maestro'], ['lote', 'Lote'], ['vencimiento', 'Vencimiento'], ['cantidad', 'Cantidad']]),
        },
      },
    },
  },

  '/bodega/cargaInicialBodega': {
    label: 'Carga inicial de stock de Bodega (CargaInicialBodega.jsx)',
    sections: {
      carga: {
        label: 'Sección: Carga inicial (sin guía ni factura)',
        elements: {
          btn_guardar_borrador: { label: 'Acción: Guardar borrador' },
          btn_confirmar: { label: 'Acción: Confirmar carga inicial (sensible)' },
          btn_eliminar_borrador: { label: 'Acción: Eliminar borrador' },
          btn_cerrar_carga: { label: 'Acción: Cerrar / reabrir la carga inicial para todos (sensible)' },
        },
      },
      lineas: {
        label: 'Sección: Líneas escaneadas',
        elements: {
          ...columnas([['codigo', 'Código maestro'], ['lote', 'Lote'], ['vencimiento', 'Vencimiento'], ['cantidad', 'Cantidad']]),
        },
      },
    },
  },

  '/bodega/egresoBodega': {
    label: 'Egreso: salida a tránsito por centro (EgresoBodega.jsx)',
    sections: {
      egreso: {
        label: 'Sección: Salida (producto, lote FEFO, cantidad, centro)',
        elements: {
          btn_confirmar: { label: 'Acción: Confirmar salida a tránsito' },
        },
      },
      lineas: {
        label: 'Sección: Líneas de la salida',
        elements: {
          ...columnas([['codigo', 'Código maestro'], ['lote', 'Lote'], ['vencimiento', 'Vencimiento'], ['centro', 'Centro'], ['cantidad', 'Cantidad']]),
        },
      },
    },
  },

  '/bodega/transitoBodega': {
    label: 'Tránsito: entregar, devolver o anotar (TransitoBodega.jsx)',
    sections: {
      listado: {
        label: 'Sección: Listado de lo que está en tránsito',
        elements: {
          ...columnas(COLUMNAS_TRANSITO),
        },
      },
      acciones: {
        label: 'Sección: Acciones sobre el tránsito',
        elements: {
          btn_entregar: { label: 'Acción: Entregar (usado; exige ID y observación)' },
          btn_devolver: { label: 'Acción: Devolver a stock (no usado)' },
          btn_nota: { label: 'Acción: Mantener en tránsito (nota de seguimiento)' },
        },
      },
    },
  },

  '/bodega/centrosBodega': {
    label: 'Tránsito por centro (CentrosBodega.jsx)',
    sections: {
      centros: {
        label: 'Sección: Centros con stock en tránsito',
        elements: {
          ...columnas([['productos', 'Productos distintos'], ['unidades', 'Unidades'], ['antiguo', 'Tránsito más antiguo (días)'], ['vencimiento', 'Próximo vencimiento']]),
        },
      },
      listado: {
        label: 'Sección: Detalle del centro',
        elements: {
          ...columnas(COLUMNAS_TRANSITO),
        },
      },
      exportar: {
        label: 'Sección: Exportar el tránsito de un centro',
        elements: {
          btn_exportar: { label: 'Acción: Exportar a Excel/PDF' },
        },
      },
      acciones: {
        label: 'Sección: Acciones sobre el tránsito del centro',
        elements: {
          btn_entregar: { label: 'Acción: Entregar (usado; exige ID y observación)' },
          btn_devolver: { label: 'Acción: Devolver a stock (no usado)' },
          btn_nota: { label: 'Acción: Mantener en tránsito (nota de seguimiento)' },
        },
      },
    },
  },

  '/bodega/consumoBodega': {
    label: 'Consumo por centro (ConsumoBodega.jsx) — solo lectura',
    sections: {
      reporte: {
        label: 'Sección: Reporte de entregas por centro y producto',
        elements: {
          btn_exportar: { label: 'Acción: Exportar a Excel' },
          ...columnas([['codigo', 'Código maestro'], ['entregas', 'Entregas'], ['unidades', 'Unidades']]),
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
