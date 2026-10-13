import { columnas } from './columnas.js';
import { mapaReportesInfo } from './documentos.js';
import { maestrosComponentMaps } from './maestros.js';

// Implantes → Códigos: la misma pantalla que Maestros → Códigos
// (CodigosMaestros.jsx, colección maestros_codigos) con su propio ítem de
// menú y sus propios permisos granulares. Se deriva del mapa de Maestros
// (mismas secciones, acciones, columnas y pestañas) cambiando las rutas,
// así ambos quedan siempre iguales pero se asignan por separado.
const reubicarMapa = (config, de, a, label) => ({
  ...config,
  label,
  procesos: Object.fromEntries(Object.entries(config.procesos || {}).map(([ruta, proceso]) => [ruta.replace(de, a), proceso])),
});

export const implantesComponentMaps = {
  '/implantes/codigosImplantes': reubicarMapa(
    maestrosComponentMaps['/maestros/codigosMaestros'],
    '/maestros/codigosMaestros',
    '/implantes/codigosImplantes',
    'Códigos (Implantes) — misma pantalla y datos que Maestros → Códigos, con permisos propios',
  ),

  // Bug corregido (v2): la visibilidad de las pestañas de la vista de
  // detalle (Detalles, Información, Cargas, Orden, Documentos, Logs) se movió de una sección
  // "navegacion" con un checkbox maestro compartido (que podía apagar las
  // 4 de golpe, o no aparecer en el editor para usuarios ya asignados
  // antes de que existiera) a `procesos` — cada pestaña es su propio path
  // independiente, chequeado por existencia con hasAccesoProceso(path) en
  // GestionesImplantesDetalleView.jsx. Ver nota en useGranularPermission.js.
  '/implantes/gestionImplantes': {
    label: 'Gestiones de Implante (GestionImplantes.jsx)',
    sections: {
      header: {
        label: 'Sección: Encabezado',
        elements: {
          // Un solo permiso ("btn_configuracion") controla ambos botones:
          // Sincronizar Vinculados y Abrir Configuración (Importar/Exportar).
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
          input_buscar: { label: 'Campo: Búsqueda por ID/nombre/empresa/orden' },
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
          col_orden: { label: 'Columna: Orden (OC de la fila, separadas por coma)' },
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
          btn_marcar_oc_pendiente: { label: 'Acción: Marcar OC pendiente en un rango (además exige rol Administrador)' },
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
      '/implantes/gestionImplantes/detalles': {
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
      '/implantes/gestionImplantes/informacion': {
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
              select_lado: { label: 'Campo: Lado (Derecho / Izquierdo / Bilateral) — para el Bodymap' },
              input_observacion: { label: 'Campo: Texto Libre / Notas Adicionales' },
            },
          },
        },
      },
      '/implantes/gestionImplantes/cargas': {
        label: 'Pestaña: Cargas (Cargastab.jsx)',
        sections: {
          formulario_cotizacion: {
            label: 'Sección: Formulario de Nuevo Ítem de Cotización',
            elements: {
              input_num_cotizacion: { label: 'Campo: N° Cotización' },
              input_total_cotizacion: { label: 'Campo: Total Cotización' },
              input_referencia: { label: 'Campo: Referencia (autocompletado)' },
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
      '/implantes/gestionImplantes/orden': {
        label: 'Pestaña: Orden — Empresas / Fechas de la admisión',
        sections: {
          empresas_fechas: {
            label: 'Sección: Empresas / Fechas',
            elements: {},
          },
        },
      },
      '/implantes/gestionImplantes/documentos': {
        label: 'Pestaña: Documentos — PDF de la admisión en Storage (shared/documentosAdmision/DocumentosTab.jsx)',
        sections: {
          contenido: {
            label: 'Sección: Subida múltiple y listado de PDF (DP, RP, INF, COT)',
            elements: {},
          },
        },
      },
      '/implantes/gestionImplantes/logs': {
        label: 'Pestaña: Logs — historial del bloque activo, solo lectura',
        sections: {
          historial_logs: {
            label: 'Sección: Historial de Logs',
            elements: {},
          },
        },
      },
      '/implantes/gestionImplantes/bodymap': {
        label: 'Pestaña: Bodymap (BodymapTab.jsx) — zona del cuerpo según la descripción, solo lectura',
        sections: {
          mapa_cuerpo: {
            label: 'Sección: Cuerpo completo y detalle de la zona',
            elements: {},
          },
        },
      },
    },
  },

  '/implantes/cargaMasivaDocumentos': {
    label: 'Carga masiva de documentos (CargaMasivaDocumentos.jsx) — PDF de varias admisiones, sin granularidad cableada aún',
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

  '/implantes/solicitudImplantes': {
    label: 'Solicitud de Implantes (SolicitudImplantes.jsx) — sin granularidad cableada aún',
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

  '/implantes/resumenImplantes': {
    label: 'Resumen de Implantes Imputados (ResumenImplantes.jsx) — solo lectura, sin granularidad cableada aún',
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

  '/implantes/sincronizacionImputadas': {
    label: 'Sincronización de Imputadas (SincronizacionImputadas.jsx) — compara y corrige implantes_gestiones vs. implantes_imputadas',
    sections: {
      busqueda: {
        label: 'Sección: Búsqueda por Admisión',
        elements: {
          input_admisiones: { label: 'Campo: N° de Admisión(es) a comparar' },
          btn_buscar: { label: 'Acción: Buscar y Comparar' },
        },
      },
      acciones: {
        label: 'Sección: Acciones sobre el Diff',
        elements: {
          // Corrige un bloque ya imputado, saltándose el flujo normal de
          // edición + candado de Cargas — por eso va con permiso propio,
          // pensado para quedar restringido a los mismos usuarios que ya
          // pueden desbloquear el candado en Cargas (accion_desbloquear_candado).
          btn_aplicar_correccion: { label: 'Acción: Aplicar Corrección (re-sincroniza un bloque puntual)' },
        },
      },
    },
  },

  '/implantes/reportesInfo': mapaReportesInfo,

  // Respaldo de documentos: PDF cuyo ID / N° de Admisión no coincide con
  // ninguna gestión (RespaldoDocumentos.jsx). Las acciones también se validan
  // en firestore.rules y storage.rules.
  '/implantes/respaldoDocumentos': {
    label: 'Respaldo de documentos (RespaldoDocumentos.jsx)',
    sections: {
      acciones: {
        label: 'Sección: Acciones',
        elements: {
          btn_subir: { label: 'Acción: Subir documentos al respaldo (también "Enviar a respaldo" desde Gestión y Carga masiva)' },
        },
      },
      filtros: {
        label: 'Sección: Búsqueda y filtros',
        elements: {
          input_busqueda: { label: 'Campo: Buscar por ID o nombre' },
          select_tipo: { label: 'Campo: Filtro por tipo de documento' },
        },
      },
      tabla_documentos: {
        label: 'Sección: Tabla de documentos',
        elements: {
          btn_ver: { label: 'Operación: Ver documento' },
          btn_descargar: { label: 'Operación: Descargar' },
          btn_eliminar: { label: 'Operación: Eliminar (envía a la papelera)' },
          ...columnas([
            ['idAdmision', 'ID / N° Admisión'], ['nombre', 'Nombre'], ['tipo', 'Tipo'], ['fecha', 'Fecha'],
            ['subidoPor', 'Subido por'], ['subidoEl', 'Fecha de subida'], ['acciones', 'Acciones'],
          ]),
        },
      },
      papelera: {
        label: 'Sección: Papelera',
        elements: {
          btn_restaurar: { label: 'Operación: Restaurar' },
          btn_eliminar_definitivo: { label: 'Operación: Eliminar definitivamente (borra el PDF)' },
        },
      },
    },
  },
};
