import { columnas } from './columnas.js';

// Reportes Info se monta en Documentos y en Implantes (ReportesInfo.jsx
// recibe la ruta del menú en `pathVista`): cada ruta tiene su entrada.
export const mapaReportesInfo = {
  label: 'Reportes Info (ReportesInfo.jsx)',
  sections: {
    cabecera_acciones: {
      label: 'Sección: Encabezado',
      elements: {
        btn_importar: { label: 'Acción: Importar reporte' },
        btn_exportar: { label: 'Acción: Exportar a Excel (lo filtrado, con "Gestión implante" y "Gestión consignación")' },
      },
    },
    tabla_registros: {
      label: 'Sección: Tabla de Registros',
      elements: columnas([
        ['fecha', 'Fecha'], ['admision', 'Admisión'], ['paciente', 'Paciente'], ['edad', 'Edad'],
        ['codArt', 'Cod.Art.'], ['descripcion', 'Descripción'], ['arancel', 'Arancel'],
        ['prevision', 'Previsión / Isapre'], ['cirujano', 'Cirujano'], ['cantidad', 'Cant.'], ['revisado', 'Revisado'],
        ['gestionImplante', 'Gestión implante (Pendiente / Gestionada / Cargada / Imputada)'],
        ['gestionConsignacion', 'Gestión consignación (Pendiente / Gestionada / Cargada / Imputada)'],
      ]),
    },
    filas_ocultas: {
      label: 'Sección: Descripciones ocultas',
      elements: {
        switch_mostrarOcultas: { label: 'Acción: Switch "Mostrar ocultas" (ver las filas con descripción oculta)' },
        action_ocultarDescripcion: { label: 'Acción: "Ocultar esta descripción" en la fila (solo en este módulo)' },
      },
    },
  },
};

// Importar Detalles OC, Seguimiento de Facturas y Guías e Ingreso de Órdenes
// también se montan en Implantes (prop `pathVista`), igual que Reportes Info.
export const mapaImportarDetallesOC = {
  label: 'Importar Detalles OC (ImportarDetallesOC.jsx) — sin granularidad cableada aún',
  sections: {
    cabecera_acciones: {
      label: 'Sección: Encabezado',
      elements: {
        btn_importar: { label: 'Acción: Importar Excel' },
      },
    },
    barra_filtros: {
      label: 'Sección: Filtros (Año/Mes en cascada + búsqueda Admisión/Paciente + búsqueda OC/Factura/Guía)',
      elements: {},
    },
    tabla_registros: {
      label: 'Sección: Tabla de Registros Importados (documentos_sistema, filtrada por período, paginada de 50 en 50)',
      elements: {
        btn_eliminar_filas: { label: 'Acción: Seleccionar y eliminar filas (además exige rol Administrador)' },
      },
    },
  },
};

export const mapaSeguimientoFacturasGuias = {
  label: 'Seguimiento de Facturas y Guías (SeguimientoFacturasGuias.jsx) — sin granularidad cableada aún',
  sections: {
    selector_tipo: {
      label: 'Sección: Selector inicial (Facturas / Guías / Resumen Mensual)',
      elements: {},
    },
    barra_filtros: {
      label: 'Sección: Filtros (Año obligatorio + Mes/Empresa opcionales en cascada, sin preselección) + búsqueda y Exportar Excel',
      elements: {},
    },
    tabla_registros: {
      label: 'Sección: Tabla — ESTADO="Pendiente factura" o NUMERO_FACTURA vacío/"0" (Facturas) o NUMERO_GUIA vacío/"0" (Guías), paginada de 50 en 50, con TOTAL de Monto OC y registros filtrados',
      elements: {},
    },
    resumen_mensual: {
      label: 'Sección: Resumen Mensual — Año (por defecto el actual) + tabla de 12 meses Total/Facturado/Pendiente y % con fila de totales; botón "Recalcular" solo para administradores',
      elements: {},
    },
  },
};

export const mapaIngresoOrdenes = {
  label: 'Ingreso de Órdenes (IngresoOrdenes.jsx) — cubre también "Ingreso de Documentos" vía sus pestañas Informe/Órdenes — sin granularidad cableada aún',
  sections: {
    barra_filtros: {
      label: 'Sección: Filtros (Año obligatorio + Mes/Empresa opcionales en cascada, sin preselección)',
      elements: {},
    },
    tabla_registros: {
      label: 'Sección: Tabla agrupada por ADMISION+EMPRESA+FECHA_CX, paginada de 50 en 50',
      elements: {},
    },
  },
};

export const documentosComponentMaps = {
  // '/documentos/reportesInfo': { label: '...', sections: { ... } },

  '/documentos/importarDetallesOC': mapaImportarDetallesOC,

  '/documentos/seguimientoFacturasGuias': mapaSeguimientoFacturasGuias,

  '/documentos/ingresoOrdenes': mapaIngresoOrdenes,

  '/documentos/reportesInfo': mapaReportesInfo,

  // Archivo digital: carpetas y archivos (ArchivoDigital.jsx). Las acciones
  // también se validan en firestore.rules y storage.rules.
  '/documentos/archivoDigital': {
    label: 'Archivo digital (ArchivoDigital.jsx)',
    sections: {
      carpetas: {
        label: 'Sección: Carpetas',
        elements: {
          btn_crear: { label: 'Acción: Crear carpeta' },
          btn_renombrar: { label: 'Operación: Renombrar carpeta' },
          btn_mover: { label: 'Operación: Mover carpeta' },
          btn_eliminar: { label: 'Operación: Eliminar carpeta con su contenido (a la papelera)' },
        },
      },
      archivos: {
        label: 'Sección: Archivos',
        elements: {
          btn_subir: { label: 'Acción: Subir archivos' },
          btn_ver: { label: 'Operación: Ver (vista previa)' },
          btn_descargar: { label: 'Operación: Descargar' },
          btn_renombrar: { label: 'Operación: Renombrar archivo' },
          btn_mover: { label: 'Operación: Mover archivo' },
          btn_eliminar: { label: 'Operación: Eliminar archivo (a la papelera)' },
        },
      },
      buscador: {
        label: 'Sección: Buscador',
        elements: {
          input_busqueda: { label: 'Campo: Buscar archivos y carpetas' },
        },
      },
      tabla: {
        label: 'Sección: Lista de carpetas y archivos',
        elements: columnas([
          ['nombre', 'Nombre'], ['tamano', 'Tamaño'], ['subidoEl', 'Fecha de subida'],
          ['subidoPor', 'Subido por'], ['acciones', 'Acciones'],
        ]),
      },
      papelera: {
        label: 'Sección: Papelera',
        elements: {
          btn_restaurar: { label: 'Operación: Restaurar' },
          btn_eliminar_definitivo: { label: 'Operación: Eliminar definitivamente (borra los archivos)' },
        },
      },
    },
  },
};
