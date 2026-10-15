import { columnas } from './columnas.js';

// NOTA GENERAL DEL MÓDULO: ninguna de las 5 pantallas de administración usa
// `hasPermission`/`useGranularPermission` hoy (a diferencia de laboratorio y
// maestros). Todo lo de abajo es documentación de referencia para cuando se
// decida cablear la granularidad — no tiene efecto real en la app todavía.
export const administracionComponentMaps = {
  '/administracion/controlMensual': {
    label: 'Control y Cierre de Períodos (ControlMensual.jsx) — sin granularidad cableada aún',
    sections: {
      header: {
        label: 'Sección: Encabezado y Filtros',
        elements: {
          select_modulo_filtro: { label: 'Campo: Filtro por Módulo' },
          select_anio_filtro: { label: 'Campo: Filtro por Año' },
          btn_abrir_periodo: { label: 'Acción: Botón Abrir Período' },
        },
      },
      tabla_periodos: {
        label: 'Sección: Matriz de Períodos por Módulo/Mes',
        elements: {
          col_estado: { label: 'Columna: Estado (Abierto/Reabierto/Cerrado/Sin Iniciar)' },
          col_documentos: { label: 'Columna: Cantidad de Documentos' },
          col_monto: { label: 'Columna: Monto Total Imputado' },
          btn_abrir_mes: { label: 'Acción: Abrir mes para un módulo' },
          btn_cerrar_mes: { label: 'Acción: Cerrar mes para un módulo' },
          btn_reabrir_mes: { label: 'Acción: Reabrir mes (abre modal de motivo)' },
          btn_ver_historial: { label: 'Acción: Ver historial de reaperturas' },
          btn_cerrar_todos: { label: 'Acción: Cerrar todos los módulos del período' },
        },
      },
      panel_apertura_periodo: {
        label: 'Sección: Drawer de Apertura de Período',
        elements: {
          select_anio: { label: 'Campo: Año del Período' },
          select_mes: { label: 'Campo: Mes a Abrir' },
          selector_modulos: { label: 'Campo: Selección de Módulos Afectados' },
          btn_confirmar_apertura: { label: 'Acción: Confirmar Apertura' },
        },
      },
      modal_reapertura: {
        label: 'Sección: Modal de Reapertura',
        elements: {
          input_motivo: { label: 'Campo: Motivo de la Reapertura' },
          btn_confirmar_reapertura: { label: 'Acción: Confirmar Reapertura' },
        },
      },
      modal_historial: {
        label: 'Sección: Modal de Historial de Reaperturas (solo lectura)',
        elements: {},
      },
    },
  },

  '/administracion/ResumenPeriodoAbierto': {
    label: 'Resumen Ejecutivo del Período Activo (ResumenPeriodoAbierto.jsx) — solo lectura, sin granularidad cableada aún',
    sections: {
      header: {
        label: 'Sección: Encabezado del Período',
        elements: {},
      },
      kpis: {
        label: 'Sección: Tarjetas KPI',
        elements: {
          card_monto_total: { label: 'Tarjeta: Monto Total Imputado' },
          card_documentos: { label: 'Tarjeta: Documentos Imputados' },
          card_promedio: { label: 'Tarjeta: Monto Promedio por Documento' },
        },
      },
      tabla_desglose: {
        label: 'Sección: Desglose por Módulo',
        elements: {
          col_estado: { label: 'Columna: Estado del Módulo' },
          col_participacion: { label: 'Columna: Barra de Participación (%)' },
          col_documentos: { label: 'Columna: Documentos' },
          col_monto: { label: 'Columna: Monto Imputado' },
        },
      },
    },
  },

  '/administracion/notasAdmin': {
    label: 'Administrador de Notas (NotasAdmin.jsx) — sin granularidad cableada aún',
    sections: {
      formulario_nota: {
        label: 'Sección: Formulario de Nota',
        elements: {
          selector_tipo: { label: 'Campo: Tipo de Nota (Texto Libre / Checklist)' },
          input_titulo: { label: 'Campo: Título' },
          input_contenido: { label: 'Campo: Contenido (texto libre)' },
          items_checklist: { label: 'Campo: Elementos de la Lista (checklist)' },
          btn_publicar: { label: 'Acción: Publicar / Guardar Cambios' },
          btn_cancelar_edicion: { label: 'Acción: Cancelar Edición' },
        },
      },
      listado_notas: {
        label: 'Sección: Notas Publicadas',
        elements: {
          btn_mover: { label: 'Acción: Reordenar (Arriba/Abajo)' },
          btn_editar: { label: 'Acción: Editar Nota' },
          btn_eliminar: { label: 'Acción: Eliminar Nota' },
        },
      },
    },
  },

  // Dos pestañas asignables por separado: "Mis recordatorios" = el usuario
  // RECIBE los recordatorios que le asignen (campana del header); "Administrar
  // tareas" = crear/editar/desactivar/borrar y ver el historial. Esta última
  // no se marca sola al dar la vista (porDefecto: false, ver
  // permisosGranularesUtils.js). firestore.rules usa las mismas rutas.
  '/administracion/recordatorios': {
    label: 'Recordatorios (Recordatorios.jsx) — tareas recurrentes por usuario',
    sections: {},
    procesos: {
      '/administracion/recordatorios/mis': {
        label: 'Pestaña: Mis recordatorios — recibe los recordatorios asignados (campana del header)',
        sections: {},
      },
      '/administracion/recordatorios/administrar': {
        label: 'Pestaña: Administrar tareas — crear, editar, desactivar, borrar e historial',
        porDefecto: false,
        sections: {},
      },
    },
  },

  '/administracion/crearUsuario': {
    label: 'Asistente de Creación de Usuario (CrearUsuario.jsx) — sin granularidad cableada aún',
    sections: {
      paso1_datos_basicos: {
        label: 'Sección: Paso 1 — Datos Básicos',
        elements: {
          input_nombre_completo: { label: 'Campo: Nombre Completo' },
          input_nombre_usuario: { label: 'Campo: Nombre de Usuario' },
          input_email: { label: 'Campo: Correo' },
          select_rol: { label: 'Campo: Rol' },
          input_password: { label: 'Campo: Contraseña' },
          btn_guardar_continuar: { label: 'Acción: Guardar y Continuar' },
        },
      },
      paso2_modulos_permisos: {
        label: 'Sección: Paso 2 — Módulos y Permisos',
        elements: {
          selector_modulos_items: { label: 'Campo: Selección de Módulos/Ítems con Acceso' },
        },
      },
      paso3_configuracion_granular: {
        label: 'Sección: Paso 3 — Configuración Granular por Ítem',
        elements: {
          acordeon_items: { label: 'Bloque: Acordeón de Ítems Configurables' },
          btn_finalizar_item: { label: 'Acción: Finalizar Ítem' },
          btn_finalizar_creacion: { label: 'Acción: Finalizar Creación' },
        },
      },
    },
  },

  '/administracion/listadoUsuario': {
    label: 'Listado de Usuarios (ListadoUsuario.jsx) — sin granularidad cableada aún',
    sections: {
      header_filtros: {
        label: 'Sección: Filtros',
        elements: {
          input_buscar: { label: 'Campo: Búsqueda por nombre/usuario/correo' },
          select_rol: { label: 'Campo: Filtro por Rol' },
          select_estado: { label: 'Campo: Filtro por Estado (Activo/Inactivo)' },
        },
      },
      tabla_usuarios: {
        label: 'Sección: Tabla de Usuarios',
        elements: {
          col_nombre: { label: 'Columna: Nombre Completo' },
          col_usuario: { label: 'Columna: Nombre de Usuario' },
          col_email: { label: 'Columna: Email' },
          col_rol: { label: 'Columna: Rol' },
          col_modulos: { label: 'Columna: Módulos Asignados' },
          col_estado: { label: 'Columna: Estado' },
          btn_activar_inactivar: { label: 'Acción: Activar/Inactivar Usuario' },
          btn_editar_acceso: { label: 'Acción: Editar Acceso (abre la pantalla de edición)' },
          btn_continuar_creacion: { label: 'Acción: Continuar Creación Incompleta' },
          btn_cancelar_creacion: { label: 'Acción: Cancelar Creación Incompleta' },
          btn_desbloquear: { label: 'Acción: Desbloquear (bloqueo por intentos fallidos de login)' },
        },
      },
      drawer_edicion_permisos: {
        label: 'Sección: Edición de Usuario (EditarUsuario.jsx)',
        elements: {
          select_rol: { label: 'Campo: Rol' },
          selector_modulos_items: { label: 'Campo: Módulos e Ítems con Acceso' },
          configuracion_detallada: { label: 'Bloque: Configuración Detallada por Ítem' },
        },
      },
    },
  },

  // Plantillas de permisos por centro + rol. Solo la usan Administrador (con
  // este ítem) y Desarrollador: lo exigen la función guardarPlantillaCentroCosto
  // y las reglas de plantillas_permisos.
  '/administracion/permisosCentro': {
    label: 'Permisos por centro (PermisosPorCentro.jsx) — solo rol Administrador con este ítem, o Desarrollador',
    sections: {},
  },

  '/administracion/cargasConsolidado': {
    label: 'Cargas Consolidado (CargasConsolidado.jsx) — vista combinada de Consignación + Implantes',
    sections: {
      header: {
        label: 'Sección: Encabezado',
        elements: {},
      },
    },
    procesos: {
      '/administracion/cargasConsolidado/gestion': {
        label: 'Pestaña: Gestión — tabla combinada, doble clic abre el detalle nativo de cada origen',
        sections: {
          tabla_gestion: {
            label: 'Sección: Tabla de Gestión Combinada',
            elements: {
              col_origen: { label: 'Columna: Origen (Implantes/Consignación)' },
              action_abrir_detalle: { label: 'Operación: Abrir Detalle (doble clic)' },
            },
          },
        },
      },
      '/administracion/cargasConsolidado/imputadas': {
        label: 'Pestaña: Imputadas — implantes_imputadas + consignacion_imputadas combinadas',
        sections: {
          tabla_imputadas: {
            label: 'Sección: Tabla de Imputadas Combinadas',
            elements: {
              col_origen: { label: 'Columna: Origen (Implantes/Consignación)' },
            },
          },
        },
      },
      '/administracion/cargasConsolidado/solicitudes': {
        label: 'Pestaña: Solicitudes — candidatos a SOLICITADO de ambos módulos',
        sections: {
          tabla_solicitudes: {
            label: 'Sección: Tabla de Solicitudes Combinadas',
            elements: {
              col_origen: { label: 'Columna: Origen (Implantes/Consignación)' },
              checkbox_seleccionar_fila: { label: 'Campo: Seleccionar Fila' },
              checkbox_seleccionar_todos: { label: 'Campo: Seleccionar Todos' },
              btn_exportar_marcar_solicitado: { label: 'Acción: Exportar y Marcar Solicitado (ambos orígenes, cada uno a su colección de imputadas)' },
            },
          },
        },
      },
    },
  },
  '/administracion/gestionModulos': {
    label: 'Gestión de módulos (GestionModulos.jsx) — solo rol Desarrollador, no se asigna',
    sections: {},
  },

  '/administracion/estadisticas': {
    label: 'Estadísticas (Implantes, Consignación y Hemodinamia por período)',
    sections: {
      filtros: {
        label: 'Sección: Período y Módulos',
        elements: {
          select_periodo: { label: 'Campo: Elegir otro período' },
          opt_implantes: { label: 'Módulo: Implantes (también lo exigen las reglas de Firestore)' },
          opt_consignacion: { label: 'Módulo: Consignación (también lo exigen las reglas de Firestore)' },
          opt_hemodinamia: { label: 'Módulo: Hemodinamia (también lo exigen las reglas de Firestore)' },
        },
      },
      pestanas: {
        label: 'Sección: Pestañas',
        elements: {
          tab_medicos: { label: 'Pestaña: Médicos' },
          tab_cirugias: { label: 'Pestaña: Cirugías' },
          tab_empresas: { label: 'Pestaña: Empresas' },
          tab_codigos: { label: 'Pestaña: Códigos' },
        },
      },
      acciones: {
        label: 'Sección: Acciones',
        elements: {
          btn_exportar: { label: 'Acción: Exportar a Excel' },
          ver_montos: { label: 'Acción: Ver montos (tarjeta, columnas, Top 10, detalle y Excel; también lo exigen las reglas de Firestore)' },
          btn_recalcular: { label: 'Acción: Recalcular período cerrado (además exige rol Administrador)' },
        },
      },
      tabla: {
        label: 'Sección: Tabla por médico / cirugía / empresa',
        elements: columnas([
          ['actual', 'Período'],
          ['anterior', 'Período anterior'],
          ['diferencia', 'Diferencia'],
          ['variacion', 'Variación %'],
          ['participacion', '% del total'],
          ['monto', 'Monto del período'],
          ['montoAnterior', 'Monto período anterior'],
          ['montoDiferencia', 'Diferencia de monto'],
          ['montoVariacion', 'Variación % de monto'],
        ]),
      },
      tabla_codigos: {
        label: 'Sección: Tabla de códigos',
        elements: columnas([
          ['descripcion', 'Descripción'],
          ['cantidad', 'Cantidad usada'],
          ['cantidadAnterior', 'Cantidad período anterior'],
          ['diferencia', 'Diferencia de cantidad'],
          ['variacion', 'Variación % de cantidad'],
          ['admisiones', 'Admisiones'],
          ['precio', 'Precio unitario'],
          ['monto', 'Monto del período'],
          ['montoAnterior', 'Monto período anterior'],
          ['montoVariacion', 'Variación % de monto'],
        ]),
      },
      detalle: {
        label: 'Sección: Detalle (cruces)',
        elements: columnas([
          ['actual', 'Período'],
          ['anterior', 'Período anterior'],
          ['variacion', 'Variación %'],
          ['monto', 'Monto'],
          ['cantidad', 'Cantidad (códigos)'],
          ['precio', 'Precio unitario (códigos)'],
        ]),
      },
    },
  },
};
