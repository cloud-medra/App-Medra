export const hemodinamiaComponentMaps = {
  // Mismo criterio que componentMaps/implantes.js: las 4 pestañas de la
  // vista de detalle (Detalles, Información, Cargas, Logs) son `procesos`
  // propios, cada una con su path independiente, chequeados por existencia
  // con hasAccesoProceso(path) en GestionesHemodinamiaDetalleView.jsx.
  '/hemodinamia/gestionHemodinamia': {
    label: 'Gestiones de Hemodinamia (GestionHemodinamia.jsx)',
    sections: {
      header: {
        label: 'Sección: Encabezado',
        elements: {
          btn_configuracion: { label: 'Acción: Sincronizar Vinculados / Configuración (Importar/Exportar)' },
        },
      },
      formulario_registro: {
        label: 'Sección: Formulario de Registro',
        elements: {
          input_id: { label: 'Campo: ID (Admisión)' },
          input_nombre: { label: 'Campo: Nombre' },
          input_fecha: { label: 'Campo: Fecha' },
          input_empresa: { label: 'Campo: Empresa' },
          select_informe: { label: 'Campo: Estado de Informe' },
          input_observacion: { label: 'Campo: Observación' },
          btn_registrar_actualizar: { label: 'Acción: Registrar/Actualizar' },
          btn_cancelar: { label: 'Acción: Cancelar Edición' },
        },
      },
      barra_busqueda: {
        label: 'Sección: Filtros y Búsqueda',
        elements: {
          input_buscar: { label: 'Campo: Búsqueda por ID/nombre/empresa' },
          select_anio: { label: 'Campo: Filtro por Año' },
          select_mes: { label: 'Campo: Filtro por Mes' },
          select_dia: { label: 'Campo: Filtro por Día' },
          filtro_estados: { label: 'Campo: Filtro por Estado(s)' },
          btn_limpiar_filtros: { label: 'Acción: Limpiar Filtros de Fecha' },
        },
      },
      tabla_datos: {
        label: 'Sección: Tabla de Gestiones',
        elements: {
          col_id: { label: 'Columna: ID' },
          col_nombre: { label: 'Columna: Nombre' },
          col_fecha: { label: 'Columna: Fecha' },
          col_empresa: { label: 'Columna: Empresa' },
          col_admision_nombre: { label: 'Columna: Admisión - Nombre' },
          col_centro: { label: 'Columna: Centro' },
          col_atributo: { label: 'Columna: Atributo' },
          col_estado: { label: 'Columna: Estado' },
          col_fecha_carga: { label: 'Columna: Fecha Carga' },
          col_costo: { label: 'Columna: Costo' },
          col_solicitud: { label: 'Columna: Solicitud' },
          col_periodo: { label: 'Columna: Período' },
          col_informe: { label: 'Columna: Informe' },
          col_convenio: { label: 'Columna: Convenio' },
          col_prevision: { label: 'Columna: Previsión' },
          col_medico: { label: 'Columna: Médico' },
          col_descripcion: { label: 'Columna: Descripción' },
          col_observacion: { label: 'Columna: Observación' },
          col_registrado_por: { label: 'Columna: Registrado Por' },
          action_copiar: { label: 'Operación: Copiar ID / Admisión-Nombre' },
          action_ver_detalle: { label: 'Operación: Ver Detalle Completo (pestañas)' },
          action_historial: { label: 'Operación: Ver Historial / Logs' },
          action_editar: { label: 'Operación: Editar' },
          action_eliminar: { label: 'Operación: Eliminar' },
        },
      },
      drawer_configuracion: {
        label: 'Sección: Drawer de Configuración (Importar/Exportar)',
        elements: {
          btn_exportar: { label: 'Acción: Exportar a Excel/CSV' },
          btn_descargar_plantilla: { label: 'Acción: Descargar Plantilla CSV' },
          input_archivo: { label: 'Campo: Selector de Archivo a Importar' },
          btn_importar: { label: 'Acción: Botón Cargar Registro (ejecutar importación)' },
        },
      },
      detalle_header: {
        label: 'Sección: Encabezado de la Vista de Detalle (compartido entre pestañas)',
        elements: {
          btn_volver: { label: 'Acción: Volver al Listado' },
          btn_guardar_todo: { label: 'Acción: Guardar Todo' },
        },
      },
    },
    procesos: {
      '/hemodinamia/gestionHemodinamia/detalles': {
        label: 'Pestaña: Detalles (Detallestab.jsx) — solo lectura',
        sections: {
          info_general: {
            label: 'Sección: Información General de la Admisión',
            elements: {},
          },
          bloques_empresa: {
            label: 'Sección: Bloques por Empresa/Fecha (tabla de ítems por cotización)',
            elements: {},
          },
        },
      },
      '/hemodinamia/gestionHemodinamia/informacion': {
        label: 'Pestaña: Información (Informaciontab.jsx)',
        sections: {
          formulario_paciente: {
            label: 'Sección: Información General del Paciente',
            elements: {
              input_id: { label: 'Campo: ID / N° Admisión' },
              input_nombre: { label: 'Campo: Nombre Completo del Paciente' },
              input_convenio: { label: 'Campo: Convenio' },
              input_prevision: { label: 'Campo: Previsión' },
              input_medico: { label: 'Campo: Médico Tratante' },
            },
          },
          formulario_bloque_activo: {
            label: 'Sección: Empresa y Fecha del Bloque Activo',
            elements: {
              select_empresa: { label: 'Campo: Empresa/Proveedor' },
              input_fecha: { label: 'Campo: Fecha Agenda' },
              input_costo: { label: 'Campo: Costo' },
            },
          },
          formulario_clasificacion: {
            label: 'Sección: Clasificación y Estado Operativo',
            elements: {
              select_estado_operativo: { label: 'Campo: Estado Operativo' },
              select_estado_informe: { label: 'Campo: Estado de Informe' },
              input_atributo: { label: 'Campo: Atributo' },
              select_centro: { label: 'Campo: Centro/Unidad' },
            },
          },
          formulario_observaciones: {
            label: 'Sección: Observaciones y Detalles Clínicos',
            elements: {
              input_descripcion: { label: 'Campo: Descripción / Nota Operatoria' },
              input_observacion: { label: 'Campo: Texto Libre / Notas Adicionales' },
            },
          },
        },
      },
      '/hemodinamia/gestionHemodinamia/cargas': {
        label: 'Pestaña: Cargas (Cargastab.jsx)',
        sections: {
          formulario_cotizacion: {
            label: 'Sección: Formulario de Nuevo Ítem de Cotización',
            elements: {
              input_num_cotizacion: { label: 'Campo: N° Cotización' },
              input_total_cotizacion: { label: 'Campo: Total Cotización' },
              input_referencia: { label: 'Campo: Referencia (autocompletado, segmento HEMODINAMIA)' },
              input_cantidad: { label: 'Campo: Cantidad' },
              input_lote: { label: 'Campo: Lote' },
              input_vencimiento: { label: 'Campo: Vencimiento' },
              btn_agregar_item: { label: 'Acción: Agregar Ítem' },
            },
          },
          tabla_cotizaciones: {
            label: 'Sección: Tabla de Cotizaciones e Ítems',
            elements: {
              action_editar_item: { label: 'Operación: Editar Ítem' },
              action_eliminar_item: { label: 'Operación: Eliminar Ítem' },
              action_eliminar_cotizacion: { label: 'Operación: Eliminar Cotización Completa' },
              formulario_contenido_pad: { label: 'Bloque: Agregar Contenido de PAD (referencia, cantidad, lote, vencimiento)' },
              accion_desbloquear_candado: { label: 'Operación: Desbloquear edición de un bloque ya imputado (candado)' },
            },
          },
        },
      },
      '/hemodinamia/gestionHemodinamia/documentos': {
        label: 'Pestaña: Documentos — PDF de la admisión en Storage (shared/documentosAdmision/DocumentosTab.jsx)',
        sections: {
          contenido: {
            label: 'Sección: Subida múltiple y listado de PDF (DP, RP, INF, COT)',
            elements: {},
          },
        },
      },
      '/hemodinamia/gestionHemodinamia/logs': {
        label: 'Pestaña: Logs — historial del bloque activo, solo lectura',
        sections: {
          historial_logs: {
            label: 'Sección: Historial de Logs',
            elements: {},
          },
        },
      },
    },
  },

  '/hemodinamia/cargaMasivaDocumentos': {
    label: 'Carga masiva de documentos (shared/cargaMasivaDocumentos) — PDF de varias admisiones, sin granularidad cableada aún',
    sections: {
      zona_carga: {
        label: 'Sección: Zona de carga (arrastrar/seleccionar PDF)',
        elements: {},
      },
      vista_previa: {
        label: 'Sección: Vista previa por admisión y subida',
        elements: {},
      },
    },
  },

  '/hemodinamia/solicitudHemodinamia': {
    label: 'Solicitud de Hemodinamia (SolicitudHemodinamia.jsx) — sin granularidad cableada aún',
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
          col_tipo_vinculado: { label: 'Columna: Tipo Vinculado' },
          col_fecha_registro: { label: 'Columna: Fecha de Registro' },
          col_fecha_carga: { label: 'Columna: Fecha de Carga' },
          col_num_cotizacion: { label: 'Columna: N° Cotización' },
          col_fecha_ingreso: { label: 'Columna: Fecha de Ingreso' },
          col_lote: { label: 'Columna: Lote' },
          col_vencimiento: { label: 'Columna: Vencimiento' },
        },
      },
    },
  },

  '/hemodinamia/resumenHemodinamia': {
    label: 'Resumen de Hemodinamia Imputada (ResumenHemodinamia.jsx) — solo lectura, sin granularidad cableada aún',
    sections: {
      header: {
        label: 'Sección: Encabezado',
        elements: {},
      },
      filtros: {
        label: 'Sección: Filtros',
        elements: {
          input_buscar: { label: 'Campo: Búsqueda' },
          select_anio: { label: 'Campo: Filtro por Año' },
          select_mes: { label: 'Campo: Filtro por Mes' },
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
          col_precio: { label: 'Columna: Precio' },
          col_total: { label: 'Columna: Total' },
          col_num_cotizacion: { label: 'Columna: N° Cotización' },
          col_venta: { label: 'Columna: Venta' },
          col_lote: { label: 'Columna: Lote' },
          col_vencimiento: { label: 'Columna: Vencimiento' },
          col_estado_carga: { label: 'Columna: Estado Carga' },
          col_periodo: { label: 'Columna: Período' },
        },
      },
    },
  },
};
