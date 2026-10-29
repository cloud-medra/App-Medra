import { columnas } from './columnas.js';

// Columnas de la tabla de tránsitos (Tránsito y detalle de Tránsito por centro).
const COLUMNAS_TRANSITO = [
  ['referencia', 'Referencia'], ['lote', 'Lote'], ['vencimiento', 'Vencimiento'], ['centro', 'Centro'],
  ['cantidad', 'Pendiente / salida'], ['enCentro', 'Dejado en centro'], ['fechaSalida', 'Fecha de salida'], ['dias', 'Días en tránsito'],
  ['usuario', 'Usuario'], ['solicitante', 'Destino / solicitante'], ['salida', 'N° salida'],
];

// Acciones sobre el tránsito (Tránsito y Tránsito por centro).
const ACCIONES_TRANSITO = {
  btn_entregar: { label: 'Acción: Entregar (usado; exige N° de admisión y observación), desde tránsito o desde lo dejado en el centro' },
  btn_devolver: { label: 'Acción: Devolver a stock (no usado), desde tránsito o desde lo dejado en el centro' },
  btn_nota: { label: 'Acción: Mantener en tránsito (nota de seguimiento)' },
  btn_dejar_centro: { label: 'Acción: Dejar en centro (no usado; sigue siendo stock, queda en el centro)' },
};

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
            ['referencia', 'Referencia'], ['categoria', 'Categoría'], ['unidad', 'Unidad'], ['ubicacion', 'Ubicación'],
            ['loteVencimiento', 'Maneja lote / vencimiento'], ['disponible', 'Disponible Bodega General'],
            ['transito', 'En tránsito (con desglose por centro)'], ['enCentro', 'Dejado en centros (con desglose)'], ['total', 'Stock total (unidades)'],
            ['precio', 'Precio neto'], ['valor', 'Total $ (precio neto × disponible B.G.)'], ['minimo', 'Stock mínimo'],
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
          ...columnas([['vencimiento', 'Vencimiento'], ['propietario', 'Dueño (propio / consignado)'], ['disponible', 'Disponible'], ['transito', 'En tránsito'], ['centros', 'En centros'], ['enCentro', 'Dejado en centros']]),
        },
      },
      kardex: {
        label: 'Sección: Ficha del producto · Kardex',
        elements: {
          btn_exportar: { label: 'Acción: Exportar kardex a Excel/CSV' },
          ...columnas([['lote', 'Lote'], ['vencimiento', 'Vencimiento'], ['propietario', 'Dueño (propio / consignado)'], ['centro', 'Centro'], ['saldoLote', 'Saldo del lote'], ['saldo', 'Saldo del producto'], ['documento', 'Documento'], ['usuario', 'Usuario'], ['observacion', 'N° de admisión / observación']]),
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
          ...columnas([['referencia', 'Referencia'], ['lote', 'Lote'], ['vencimiento', 'Vencimiento'], ['cantidad', 'Cantidad'], ['precio', 'Precio unitario'], ['total', 'Total línea']]),
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
          ...columnas([['referencia', 'Referencia'], ['lote', 'Lote'], ['vencimiento', 'Vencimiento'], ['cantidad', 'Cantidad'], ['precio', 'Precio unitario'], ['total', 'Total línea']]),
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
          ...columnas([['referencia', 'Referencia'], ['lote', 'Lote'], ['vencimiento', 'Vencimiento'], ['centro', 'Centro'], ['cantidad', 'Cantidad']]),
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
        elements: ACCIONES_TRANSITO,
      },
    },
  },

  '/bodega/centrosBodega': {
    label: 'Tránsito por centro (CentrosBodega.jsx)',
    sections: {
      centros: {
        label: 'Sección: Centros con stock en tránsito',
        elements: {
          ...columnas([['productos', 'Productos distintos'], ['unidades', 'Unidades'], ['enCentro', 'Dejado en centro'], ['antiguo', 'Tránsito más antiguo (días)'], ['vencimiento', 'Próximo vencimiento']]),
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
        elements: ACCIONES_TRANSITO,
      },
    },
  },

  '/bodega/inventarioBodega': {
    label: 'Inventario físico y ajuste (InventarioBodega.jsx)',
    sections: {
      inventario: {
        label: 'Sección: Inventario (iniciar, contar, cerrar)',
        elements: {
          btn_iniciar: { label: 'Acción: Iniciar inventario (bloquea movimientos del alcance)' },
          btn_contar: { label: 'Acción: Registrar y corregir conteos' },
          btn_cerrar: { label: 'Acción: Cerrar con ajuste de stock (sensible)' },
          btn_anular: { label: 'Acción: Anular inventario abierto (sensible)' },
          btn_exportar: { label: 'Acción: Exportar comparación a Excel/PDF' },
        },
      },
      lineas: {
        label: 'Sección: Conteo por escaneo',
        elements: {
          ...columnas([['referencia', 'Referencia'], ['lote', 'Lote'], ['vencimiento', 'Vencimiento'], ['cantidad', 'Cantidad']]),
        },
      },
      comparacion: {
        label: 'Sección: Comparación teórico / contado',
        elements: {
          ...columnas([['referencia', 'Referencia'], ['lote', 'Lote'], ['vencimiento', 'Vencimiento'], ['teorico', 'Stock teórico'], ['diferencia', 'Diferencia'], ['valor', 'Valor de la diferencia'], ['contadoPor', 'Contado por']]),
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
          ...columnas([['referencia', 'Referencia'], ['entregas', 'Entregas'], ['unidades', 'Unidades']]),
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

  '/bodega/cajasBodega': {
    label: 'Cajas / kits con stock objetivo (CajasBodega.jsx)',
    sections: {
      cajas: {
        label: 'Sección: Listado y mantenedor de cajas',
        elements: {
          btn_guardar: { label: 'Acción: Crear, editar, duplicar o desactivar cajas y sus productos / stock objetivo, y ordenar sus productos' },
          ...columnas([['productos', 'Productos'], ['completitud', '% completitud'], ['faltante', 'Unidades faltantes'], ['ultimoInventario', 'Último inventario']]),
        },
      },
      caja: {
        label: 'Sección: Contenido de la caja, inventario, reposición e historial',
        elements: {
          btn_inventario: { label: 'Acción: Hacer inventario de la caja' },
          btn_reponer: { label: 'Acción: Reponer desde la Bodega General (descuenta stock)' },
          btn_exportar: { label: 'Acción: Exportar a Excel/PDF (contenido, inventario, reposición)' },
          ...columnas([['referencia', 'Referencia'], ['objetivo', 'Stock objetivo'], ['actual', 'Stock actual'], ['faltante', 'Faltante']]),
        },
      },
    },
  },

  '/bodega/consignacionesBodega': {
    label: 'Stock consignado por empresa (ConsignacionesBodega.jsx)',
    sections: {
      empresas: {
        label: 'Sección: Empresas consignantes (totales)',
        elements: {
          btn_actualizar: { label: 'Acción: Actualizar' },
          ...columnas([
            ['lineas', 'Líneas'], ['consignada', 'Debo tener'], ['actual', 'En bodega'], ['transito', 'En tránsito'],
            ['enCentro', 'En otro centro'], ['faltante', 'Faltante'], ['porVencer', 'Por vencer'],
          ]),
        },
      },
      consignacion: {
        label: 'Sección: Detalle por empresa (debo tener / tengo)',
        elements: {
          btn_guardar: { label: 'Acción: Registrar o editar la consignación (productos, lote, vencimiento y cantidad consignada)' },
          btn_exportar: { label: 'Acción: Exportar a Excel' },
          ...columnas([
            ['referencia', 'Referencia'], ['lote', 'Lote'], ['vencimiento', 'Vencimiento'], ['consignada', 'Cantidad consignada (debo tener)'],
            ['actual', 'Stock actual (en bodega)'], ['transito', 'En tránsito'], ['enCentro', 'En otro centro'], ['diferencia', 'Diferencia'],
          ]),
        },
      },
    },
  },
};
