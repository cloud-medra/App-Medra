import { mapaCodigos, mapaOrdenes, mapaXml } from './gestionesCompartidas.js';
import { construirProcesosControl } from './controlProcesos.js';

export const vacunatorioComponentMaps = {
  '/vacunatorio/empresasVacunatorio': {
    label: 'Registro de Vacunatorio (EmpresasVacunatorio.jsx)',
    sections: {
      formulario_registro: {
        label: 'Sección: Formulario de Registro',
        elements: {
          input_nombre: { label: 'Campo: Nombre Vacunatorio' },
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
          col_rut: { label: 'Columna: RUT (incluye botón copiar)' },
          col_estado: { label: 'Columna: Estado' },
          col_registrador: { label: 'Columna: Registrado Por' },
          col_fecha: { label: 'Columna: Fecha Registro' },
          action_log: { label: 'Operación: Ver Historial (Logs)' },
          action_editar: { label: 'Operación: Editar' },
          action_eliminar: { label: 'Operación: Eliminar' },
        },
      },
    },
  },

  '/vacunatorio/codigoVacunatorio': mapaCodigos('Vacunatorio'),
  '/vacunatorio/ordenVacunatorio': mapaOrdenes('Vacunatorio'),
  '/vacunatorio/xmlDocVacunatorio': mapaXml('Vacunatorio'),

  // Orquestador "Control de Procesos": cada una de las 8 pestañas es un
  // `proceso` con sus propias secciones (ver controlProcesos.js). En el menú
  // cada pestaña es un ítem propio, pero se siguen asignando acá
  // (config/pestanasControlProcesos.js).
  '/vacunatorio/archivosControlVacunatorio': {
    label: 'Control de Procesos de Documentos (ArchivosControlVacunatorio.jsx) — permisos por pestaña',
    sections: {},
    procesos: construirProcesosControl('/vacunatorio/archivosControlVacunatorio'),
  },
};
