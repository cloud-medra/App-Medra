// Permisos granulares de Portal Proveedores. Es el único módulo que se le puede asignar
// a un usuario externo (MODULOS_PARA_EXTERNOS en functions/permisos/nucleo.mjs).
export const portalProveedoresComponentMaps = {
  '/portalProveedores/ordenesCompra': {
    label: 'Órdenes de Compra (OrdenesCompra.jsx) — solo consulta',
    sections: {
      tabla_registros: {
        label: 'Sección: Tabla de órdenes',
        elements: {
          col_paciente: { label: 'Columna: Nombre (solo internos)' },
          col_fecha_cx: { label: 'Columna: Fecha Cx' },
          col_proveedor: { label: 'Columna: Proveedor (solo internos)' },
          col_oc: { label: 'Columna: OC' },
          col_codigo: { label: 'Columna: Código' },
          col_descripcion: { label: 'Columna: Descripción' },
          col_cantidad: { label: 'Columna: Cantidad' },
          col_precio_u: { label: 'Columna: Precio unitario (solo internos)' },
          col_oc_monto: { label: 'Columna: Total ítems (solo internos)' },
          col_estado: { label: 'Columna: Estado' },
          col_numero_guia: { label: 'Columna: N° Guía' },
          col_numero_factura: { label: 'Columna: N° Factura' },
        },
      },
    },
  },
};
