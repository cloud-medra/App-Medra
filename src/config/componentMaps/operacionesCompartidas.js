import { columnas } from './columnas.js';

// Pantallas compartidas por Implantes y Hemodinamia (mismo código en
// src/components/modulos/operaciones/shared y mismas claves de
// hasPermission en ambos módulos). `nombre` solo cambia el texto de los
// labels; la ruta la pone cada módulo.

export const mapaRespaldoDocumentos = (nombre) => ({
  label: `Respaldo de documentos de ${nombre} (shared/respaldoDocumentos)`,
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
});
