// NOTA GENERAL DEL MÓDULO: ninguna pantalla de consignación usa
// `hasPermission`/`useGranularPermission` hoy. Todo lo de abajo es
// documentación de referencia para cuando se decida cablear la
// granularidad — no tiene efecto real en la app todavía.
export const consignacionComponentMaps = {
  '/consignacion/ingresarGuiaDespacho': {
    label: 'Ingresar Guías de Despacho (IngresarGuiaDespacho.jsx) — sin granularidad cableada aún',
    sections: {
      header: {
        label: 'Sección: Encabezado',
        elements: {
          btn_limpiar_todo: { label: 'Acción: Limpiar Todo' },
        },
      },
      carga_archivos: {
        label: 'Sección: Carga de Archivos',
        elements: {
          dropzone_archivos: { label: 'Campo: Arrastrar/Seleccionar Archivos (PDF/foto)' },
          btn_foto: { label: 'Acción: Tomar Foto (cámara)' },
          btn_extraer_todo: { label: 'Acción: Extraer Todo (OCR)' },
          btn_guardar_todas: { label: 'Acción: Guardar Todas las Listas' },
        },
      },
      tabla_documentos: {
        label: 'Sección: Tabla de Documentos Cargados',
        elements: {
          col_nombre: { label: 'Columna: Nombre del Archivo' },
          col_descripcion: { label: 'Columna: Descripción (primer ítem)' },
          col_estado: { label: 'Columna: Estado (Pendiente/Leyendo/Listo/Guardado/Error)' },
          col_num_guia: { label: 'Columna: N° Guía' },
          col_num_documento: { label: 'Columna: N° Documento' },
          col_fecha_emision: { label: 'Columna: Fecha de Emisión' },
          col_items: { label: 'Columna: Cantidad de Ítems' },
          action_reintentar: { label: 'Operación: Reintentar Extracción' },
          action_ver_items: { label: 'Operación: Ver/Ocultar Ítems' },
          action_quitar: { label: 'Operación: Quitar Documento' },
        },
      },
      detalle_items: {
        label: 'Sección: Detalle de Ítems (expandible por documento)',
        elements: {
          input_codigo: { label: 'Campo: Código' },
          input_descripcion: { label: 'Campo: Descripción' },
          input_lote: { label: 'Campo: Lote' },
          input_vencimiento: { label: 'Campo: Vencimiento' },
          input_cantidad: { label: 'Campo: Cantidad' },
          checkbox_incluir: { label: 'Campo: Incluir Fila' },
          btn_agregar_fila: { label: 'Acción: Agregar Fila Manual' },
          action_eliminar_fila: { label: 'Operación: Eliminar Fila' },
          btn_guardar_documento: { label: 'Acción: Guardar Documento' },
        },
      },
    },
  },

  '/consignacion/listadoguiasconsignacion': {
    label: 'Guías de Consignación (Listadoguiasconsignacion.jsx) — sin granularidad cableada aún',
    sections: {
      header: {
        label: 'Sección: Encabezado',
        elements: {
          btn_recargar: { label: 'Acción: Recargar' },
        },
      },
      filtros: {
        label: 'Sección: Filtros',
        elements: {
          input_buscar: { label: 'Campo: Búsqueda por N° de guía/documento/código/lote' },
          select_mes: { label: 'Campo: Filtro por Mes' },
          select_anio: { label: 'Campo: Filtro por Año' },
        },
      },
      tabla_guias: {
        label: 'Sección: Tabla de Guías (agrupadas por documento)',
        elements: {
          col_num_guia: { label: 'Columna: N° Guía' },
          col_num_documento: { label: 'Columna: N° Documento' },
          col_descripcion: { label: 'Columna: Descripción' },
          col_fecha_emision: { label: 'Columna: Fecha Emisión' },
          col_num_productos: { label: 'Columna: N° Productos' },
          detalle_productos: { label: 'Bloque: Detalle de Productos (expandible: código, descripción, lote, vencimiento, cantidad)' },
        },
      },
    },
  },

  '/consignacion/registroConsignacion': {
    label: 'Registro de Consignación (RegistroConsignacion.jsx) — sin granularidad cableada aún',
    sections: {
      header: {
        label: 'Sección: Encabezado',
        elements: {
          btn_actualizar_lista: { label: 'Acción: Actualizar Lista' },
        },
      },
      formulario_registro: {
        label: 'Sección: Formulario de Registro',
        elements: {
          input_id: { label: 'Campo: ID (Admisión)' },
          input_nombre: { label: 'Campo: Nombre del Paciente' },
          input_medico: { label: 'Campo: Médico (autocompletado)' },
          input_fecha: { label: 'Campo: Fecha' },
          input_descripcion_referencia: { label: 'Campo: Descripción/Referencia (autocompletado desde Maestros)' },
          selector_tipo: { label: 'Campo: Tipo (Consignación/Cotización)' },
          input_cantidad: { label: 'Campo: Cantidad' },
          input_delivery: { label: 'Campo: Delivery' },
          btn_registrar_actualizar: { label: 'Acción: Registrar/Actualizar' },
          btn_limpiar_cancelar: { label: 'Acción: Limpiar/Cancelar' },
        },
      },
      filtros: {
        label: 'Sección: Filtros',
        elements: {
          input_buscar: { label: 'Campo: Búsqueda por ID/nombre/médico/referencia/orden' },
          select_anio: { label: 'Campo: Filtro por Año' },
          select_mes: { label: 'Campo: Filtro por Mes' },
          select_dia: { label: 'Campo: Filtro por Día' },
          select_despachado: { label: 'Campo: Filtro por Despachado (Pendiente/Recibido)' },
          select_estado: { label: 'Campo: Filtro por Estado' },
          btn_limpiar_filtros: { label: 'Acción: Limpiar Filtros' },
        },
      },
      tabla_registros: {
        label: 'Sección: Tabla de Registros',
        elements: {
          col_id: { label: 'Columna: ID (Admisión)' },
          col_nombre: { label: 'Columna: Nombre' },
          col_medico: { label: 'Columna: Médico' },
          col_fecha: { label: 'Columna: Fecha' },
          col_codigo: { label: 'Columna: Código' },
          col_descripcion: { label: 'Columna: Descripción' },
          col_cantidad: { label: 'Columna: Cantidad' },
          col_costo: { label: 'Columna: Costo' },
          col_estado: { label: 'Columna: Estado' },
          col_orden: { label: 'Columna: N° Orden (editable en línea si está vacía o es manual: solo números separados por coma; bloqueada si se sincronizó desde OC)' },
          col_guia: { label: 'Columna: N° Guía (editable en línea)' },
          col_despachado: { label: 'Columna: Despachado (Pendiente/Recibido — automático según N° de Guía)' },
          col_delivery: { label: 'Columna: Delivery' },
          col_referencia: { label: 'Columna: Referencia' },
          col_centro: { label: 'Columna: Centro' },
          col_atributo: { label: 'Columna: Atributo' },
          col_convenio: { label: 'Columna: Convenio' },
          col_prevision: { label: 'Columna: Previsión' },
          col_desc_pabellon: { label: 'Columna: Descripción Pabellón' },
          action_editar: { label: 'Operación: Editar Registro' },
          action_actualizar_vinculados: { label: 'Operación: Actualizar Vinculados (Previsión/Convenio/Desc. Pabellón desde Reportes)' },
          action_eliminar: { label: 'Operación: Eliminar Registro' },
        },
      },
      btn_cargar_mas: {
        label: 'Sección: Paginación',
        elements: {
          btn_cargar_mas: { label: 'Acción: Cargar Más Registros' },
        },
      },
    },
  },

  '/consignacion/cargaMasivaConsignacion': {
    label: 'Carga Masiva de Consignación (CargaMasivaConsignacion.jsx) — sin granularidad cableada aún',
    sections: {
      header: {
        label: 'Sección: Encabezado',
        elements: {
          selector_tipo: { label: 'Campo: Tipo de código (Consignación/Cotización)' },
          btn_agregar_filas: { label: 'Acción: Agregar Fila / 10 Filas' },
          btn_limpiar_todo: { label: 'Acción: Limpiar Todo' },
          btn_cargar: { label: 'Acción: Cargar (consulta Reportes Info y Maestro)' },
          btn_guardar: { label: 'Acción: Guardar filas OK (batch)' },
        },
      },
      grilla: {
        label: 'Sección: Grilla tipo Excel (pegado desde Excel)',
        elements: {
          col_admision: { label: 'Columna: Admisión' },
          col_paciente: { label: 'Columna: Paciente' },
          col_medico: { label: 'Columna: Médico' },
          col_fecha: { label: 'Columna: Fecha cirugía' },
          col_proveedor: { label: 'Columna: Proveedor (se valida contra el maestro)' },
          col_codigo: { label: 'Columna: Código interno' },
          col_cantidad: { label: 'Columna: Cantidad' },
          col_delivery: { label: 'Columna: Delivery' },
          col_estado: { label: 'Columna: Estado de la fila' },
          col_vinculados: { label: 'Columnas: Datos del Maestro y Datos Vinculados (solo lectura)' },
          action_eliminar_fila: { label: 'Operación: Eliminar Fila' },
        },
      },
    },
  },

  // Pantalla con 2 vistas: un listado (filtros + tabla, sin granularidad
  // cableada) y, al abrir un registro, una vista de detalle con 4 pestañas
  // internas controladas por estado de React (no son rutas propias) — se
  // declaran en `procesos`.
  //
  // Bug corregido (v2): la visibilidad de las 4 pestañas (Detalle,
  // Información, Delivery, Cargas) se movió de una sección "navegacion"
  // con checkbox maestro compartido a `procesos` — cada pestaña es su
  // propio path independiente, chequeado por existencia con
  // hasAccesoProceso(path) en CargasConsignacionDetalleView.jsx. Ver nota
  // en useGranularPermission.js.
  '/consignacion/cargasConsignacion': {
    label: 'Cargas de Consignación (CargasConsignacion.jsx) — listado + detalle multi-pestaña',
    sections: {
      header: {
        label: 'Sección: Encabezado del Listado',
        elements: {
          btn_actualizar_lista: { label: 'Acción: Actualizar Lista' },
          btn_sincronizar_oc: { label: 'Acción: Sincronizar OC (llena N° Orden desde Importar Detalles OC)' },
        },
      },
      filtros_listado: {
        label: 'Sección: Filtros del Listado',
        elements: {
          input_buscar: { label: 'Campo: Búsqueda por ID/nombre/médico/empresa/descripción/orden' },
          select_anio: { label: 'Campo: Filtro por Año' },
          select_mes: { label: 'Campo: Filtro por Mes' },
          select_dia: { label: 'Campo: Filtro por Día' },
          select_atributo: { label: 'Campo: Filtro por Atributo' },
          select_estado: { label: 'Campo: Filtro por Estado' },
          btn_limpiar_filtros: { label: 'Acción: Limpiar Filtros' },
        },
      },
      tabla_listado: {
        label: 'Sección: Tabla de Registros',
        elements: {
          col_id: { label: 'Columna: ID (Admisión)' },
          col_nombre: { label: 'Columna: Nombre' },
          col_fecha: { label: 'Columna: Fecha' },
          col_empresa: { label: 'Columna: Empresa' },
          col_orden: { label: 'Columna: Orden (candado si fue sincronizada desde OC)' },
          col_centro: { label: 'Columna: Centro' },
          col_atributo: { label: 'Columna: Atributo' },
          col_estado: { label: 'Columna: Estado (con indicador de color)' },
          col_costo: { label: 'Columna: Costo' },
          col_solicitud: { label: 'Columna: Solicitud' },
          col_convenio: { label: 'Columna: Convenio' },
          col_prevision: { label: 'Columna: Previsión' },
          col_medico: { label: 'Columna: Médico' },
          col_desc_pabellon: { label: 'Columna: Descripción Pabellón' },
          col_registrado_por: { label: 'Columna: Registrado Por' },
          action_ver_detalle: { label: 'Operación: Abrir Detalle (pestañas)' },
          action_actualizar_vinculados: { label: 'Operación: Actualizar Vinculados' },
          action_eliminar: { label: 'Operación: Eliminar Registro' },
        },
      },
      paginacion_listado: {
        label: 'Sección: Paginación del Listado',
        elements: {
          btn_cargar_mas: { label: 'Acción: Cargar Más Registros' },
        },
      },
      detalle_header: {
        label: 'Sección: Encabezado de la Vista de Detalle (compartido entre pestañas)',
        elements: {
          btn_volver: { label: 'Acción: Volver al Listado' },
          btn_guardar_cambios: { label: 'Acción: Guardar Cambios (Información/Delivery)' },
        },
      },
    },
    procesos: {
      '/consignacion/cargasConsignacion/detalle': {
        label: 'Pestaña: Detalle (DetalleTab.jsx) — solo lectura',
        sections: {
          info_general: {
            label: 'Sección: Información General de la Admisión',
            elements: {},
          },
          tabla_items: {
            label: 'Sección: Ítems Registrados',
            elements: {
              col_codigo: { label: 'Columna: Código' },
              col_referencia: { label: 'Columna: Referencia' },
              col_descripcion: { label: 'Columna: Descripción' },
              col_empresa: { label: 'Columna: Empresa' },
              col_cantidad: { label: 'Columna: Cantidad' },
              col_costo: { label: 'Columna: Costo' },
              col_total: { label: 'Columna: Total' },
              col_delivery: { label: 'Columna: Delivery' },
              col_atributo: { label: 'Columna: Atributo' },
              col_estado: { label: 'Columna: Estado' },
            },
          },
        },
      },
      '/consignacion/cargasConsignacion/informacion': {
        label: 'Pestaña: Información (InformacionTab.jsx)',
        sections: {
          formulario_informacion: {
            label: 'Sección: Formulario de Información General',
            elements: {
              input_nombre: { label: 'Campo: Nombre del Paciente' },
              input_medico: { label: 'Campo: Médico' },
              input_fecha: { label: 'Campo: Fecha' },
              input_empresa: { label: 'Campo: Empresa' },
              select_centro: { label: 'Campo: Centro/Unidad' },
              select_atributo: { label: 'Campo: Atributo' },
              input_costo: { label: 'Campo: Costo' },
              input_convenio: { label: 'Campo: Convenio' },
              input_prevision: { label: 'Campo: Previsión' },
              input_desc_pabellon: { label: 'Campo: Descripción Pabellón' },
            },
          },
        },
      },
      '/consignacion/cargasConsignacion/delivery': {
        label: 'Pestaña: Delivery (DeliveryTab.jsx)',
        sections: {
          busqueda_guia: {
            label: 'Sección: Búsqueda y Vínculo de Guía',
            elements: {
              btn_recargar_guia: { label: 'Acción: Recargar Búsqueda de Guía' },
              btn_vincular_guardar: { label: 'Acción: Vincular y Guardar' },
            },
          },
          tabla_productos_guia: {
            label: 'Sección: Tabla de Productos de la Guía Vinculada',
            elements: {},
          },
        },
      },
      '/consignacion/cargasConsignacion/cargas': {
        label: 'Pestaña: Cargas (CargasTab.jsx)',
        sections: {
          barra_pendientes: {
            label: 'Sección: Vínculos de Delivery Pendientes de Guardar',
            elements: {
              btn_guardar_pendientes: { label: 'Acción: Guardar Vinculaciones de Delivery' },
            },
          },
          info_general: {
            label: 'Sección: Información General de la Admisión',
            elements: {},
          },
          tabla_cargas: {
            label: 'Sección: Tabla de Cargas',
            elements: {
              checkbox_cargado: { label: 'Campo: Marcar como Cargado' },
              col_empresa: { label: 'Columna: Empresa (vinculada)' },
              col_cantidad: { label: 'Columna: Cantidad' },
              col_venta: { label: 'Columna: Venta (calculada por recargo)' },
              col_recargo: { label: 'Columna: Recargo (veces costo)' },
              col_estado: { label: 'Columna: Estado' },
            },
          },
          tabla_items_completa: {
            label: 'Sección: Ítems Registrados (con desglose de guía vinculada)',
            elements: {
              action_editar_item: { label: 'Operación: Editar Ítem (referencia, cantidad, lote, vencimiento)' },
              // Corrige un ítem ya SOLICITADO (exportado a
              // consignacion_imputadas), saltándose el candado — mismo
              // criterio que accion_desbloquear_candado en Implantes
              // (Cargastab.jsx / componentMaps/implantes.js).
              accion_desbloquear_candado: { label: 'Operación: Desbloquear edición de un ítem ya solicitado/imputado (candado)' },
            },
          },
        },
      },
      '/consignacion/cargasConsignacion/orden': {
        label: 'Pestaña: Orden — OC por empresa/fecha de la admisión y su PDF (solo ver/descargar)',
        sections: {
          empresas_fechas: {
            label: 'Sección: Empresas / Fechas',
            elements: {},
          },
        },
      },
      '/consignacion/cargasConsignacion/logs': {
        label: 'Pestaña: Logs — historial del registro activo (HistorialTab.jsx), solo lectura',
        sections: {
          historial_logs: {
            label: 'Sección: Historial de Logs',
            elements: {},
          },
        },
      },
    },
  },

  '/consignacion/solicitudModificacionesConsignacion': {
    label: 'Solicitudes de modificaciones de Consignación (shared/solicitudModificaciones/SolicitudModificaciones.jsx) — sin configuración propia hereda el acceso de Solicitud',
    sections: {
      acciones: {
        label: 'Sección: Pendientes',
        elements: {
          btn_exportar: { label: 'Acción: Descargar modificaciones' },
        },
      },
      historial: {
        label: 'Sección: Historial',
        elements: {
          btn_descargar_copia: { label: 'Acción: Descargar copia' },
        },
      },
    },
  },

  '/consignacion/solicitudConsignacion': {
    label: 'Solicitud de Consignación (SolicitudConsignacion.jsx) — sin granularidad cableada aún',
    sections: {
      header: {
        label: 'Sección: Encabezado',
        elements: {
          btn_actualizar: { label: 'Acción: Actualizar Lista' },
          btn_exportar_seleccionados: { label: 'Acción: Exportar Seleccionados' },
        },
      },
      tabla_solicitudes: {
        label: 'Sección: Tabla de Ítems Cargados Pendientes de Solicitar',
        elements: {
          checkbox_seleccionar_todos: { label: 'Campo: Seleccionar Todos' },
          checkbox_seleccionar_fila: { label: 'Campo: Seleccionar Fila' },
          col_admision: { label: 'Columna: Admisión' },
          col_paciente: { label: 'Columna: Paciente' },
          col_medico: { label: 'Columna: Médico' },
          col_fecha: { label: 'Columna: Fecha' },
          col_empresa: { label: 'Columna: Empresa' },
          col_codigo: { label: 'Columna: Código' },
          col_descripcion: { label: 'Columna: Descripción' },
          col_cantidad: { label: 'Columna: Cantidad' },
          col_precio: { label: 'Columna: Precio' },
          col_atributo: { label: 'Columna: Atributo' },
          col_fecha_registro: { label: 'Columna: Fecha de Registro' },
          col_fecha_carga: { label: 'Columna: Fecha de Carga' },
          col_num_guia: { label: 'Columna: N° Guía' },
          col_fecha_ingreso: { label: 'Columna: Fecha de Ingreso' },
          col_lote: { label: 'Columna: Lote' },
          col_vencimiento: { label: 'Columna: Vencimiento' },
        },
      },
    },
  },

  '/consignacion/resumenConsignacion': {
    label: 'Imputados de Consignación (ResumenConsignacion.jsx) — solo lectura, sin granularidad cableada aún',
    sections: {
      header: {
        label: 'Sección: Encabezado',
        elements: {},
      },
      filtros: {
        label: 'Sección: Filtros',
        elements: {
          input_buscar: { label: 'Campo: Búsqueda por ID/paciente/médico/empresa/código' },
          select_anio: { label: 'Campo: Filtro por Año' },
          select_mes: { label: 'Campo: Filtro por Mes' },
          select_atributo: { label: 'Campo: Filtro por Atributo' },
        },
      },
      tabla_resumen: {
        label: 'Sección: Tabla de Registros Imputados',
        elements: {
          col_id: { label: 'Columna: ID' },
          col_paciente: { label: 'Columna: Paciente' },
          col_medico: { label: 'Columna: Médico' },
          col_empresa: { label: 'Columna: Empresa' },
          col_fecha: { label: 'Columna: Fecha' },
          col_codigo: { label: 'Columna: Código' },
          col_descripcion: { label: 'Columna: Descripción' },
          col_cantidad: { label: 'Columna: Cantidad' },
          col_costo: { label: 'Columna: Costo' },
          col_recargo: { label: 'Columna: Recargo' },
          col_venta: { label: 'Columna: Venta' },
          col_lote: { label: 'Columna: Lote' },
          col_vencimiento: { label: 'Columna: Vencimiento' },
          col_num_guia: { label: 'Columna: N° Guía' },
          col_atributo: { label: 'Columna: Atributo' },
          col_periodo: { label: 'Columna: Período' },
        },
      },
    },
  },
};
