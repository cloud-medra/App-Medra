import { mapaCodigos, mapaOrdenes, mapaXml } from './gestionesCompartidas.js';
import { construirProcesosControl } from './controlProcesos.js';

export const laboratorioComponentMaps = {
  '/laboratorio/empresasLaboratorio': {
    label: 'Registro de Laboratorios (EmpresasLaboratorio.jsx)',
    sections: {
      header: {
        label: 'Sección: Encabezado',
        elements: {
          btn_configuracion: { label: 'Acción: Botón Configuración (Importar/Exportar)' },
        },
      },
      formulario_registro: {
        label: 'Sección: Formulario de Registro',
        elements: {
          input_nombre: { label: 'Campo: Nombre de Laboratorio' },
          input_rut: { label: 'Campo: RUT' },
          select_estado: { label: 'Campo: Selector de Estado (al editar)' },
          btn_registrar: { label: 'Acción: Botón Registrar' },
          btn_actualizar: { label: 'Acción: Botón Actualizar' },
        },
      },
      barra_busqueda: {
        label: 'Sección: Filtro y Búsqueda',
        elements: {
          input_buscar: { label: 'Barra de Búsqueda de Texto' },
        },
      },
      tabla_datos: {
        label: 'Sección: Tabla de Resultados',
        elements: {
          col_nombre: { label: 'Columna: Nombre' },
          col_rut: { label: 'Columna: RUT' },
          btn_copiar_rut: { label: 'Acción: Copiar RUT' },
          col_estado: { label: 'Columna: Estado' },
          col_registrador: { label: 'Columna: Registrado Por' },
          col_fecha: { label: 'Columna: Fecha Registro' },
          action_log: { label: 'Operación: Ver Historial (Logs)' },
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
    },
  },

  '/laboratorio/codigoLaboratorio': mapaCodigos('Laboratorio'),
  '/laboratorio/ordenLaboratorio': mapaOrdenes('Laboratorio'),
  '/laboratorio/xmlDocLaboratorio': mapaXml('Laboratorio'),

  // Orquestador "Control de Procesos": cada una de las 8 pestañas es un
  // `proceso` con sus propias secciones (ver controlProcesos.js). En el menú
  // cada pestaña es un ítem propio, pero se siguen asignando acá
  // (config/pestanasControlProcesos.js).
  '/laboratorio/archivosControlLaboratorio': {
    label: 'Control de Procesos de Documentos (ArchivosControlLaboratorio.jsx) — permisos por pestaña',
    sections: {},
    procesos: construirProcesosControl('/laboratorio/archivosControlLaboratorio'),
  },
};
