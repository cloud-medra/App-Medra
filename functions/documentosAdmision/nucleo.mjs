// Eliminar PDF de la pestaña Documentos de Gestión (Implantes y Hemodinamia):
// configuración por módulo, permiso y validación de la ruta. Sin Firebase,
// para probarlo sin emulador (documentosAdmision.test.js).
// Carpetas: las mismas que src/components/modulos/operaciones/shared/
// modulosGestion.js (carpetaDocumentos) y storage.rules.
import { puedeAccionEnPestana } from '../permisos/nucleo.mjs';

export const MODULOS_DOCUMENTOS = Object.freeze({
  implantes: {
    carpeta: 'implantes',
    rutaVista: '/implantes/gestionImplantes',
    rutaPestana: '/implantes/gestionImplantes/documentos',
    coleccionAuditoria: 'implantes_documentos_eliminados',
  },
  hemodinamia: {
    carpeta: 'hemodinamia',
    rutaVista: '/hemodinamia/gestionHemodinamia',
    rutaPestana: '/hemodinamia/gestionHemodinamia/documentos',
    coleccionAuditoria: 'hemodinamia_documentos_eliminados',
  },
});

export const SECCION = 'contenido';
export const ACCION = 'btn_eliminar_documento';

// Acción denegada por defecto (ACCIONES_DENEGADAS_POR_DEFECTO): el
// Desarrollador siempre; el resto, con la vista de Gestión y la acción
// marcada en su pestaña Documentos.
export const puedeEliminarDocumento = (perfil, modulo) => {
  const config = MODULOS_DOCUMENTOS[modulo];
  return Boolean(config)
    && puedeAccionEnPestana(perfil, modulo, config.rutaVista, config.rutaPestana, SECCION, ACCION);
};

// Misma limpieza del id que carpetaAdmision (documentosStorage.js).
const limpiarId = (idAdmision) => String(idAdmision ?? '').trim().replace(/\//g, '_');

// La ruta tiene que ser exactamente {carpeta}/{admisión}/documentos/{nombre}
// de ESA admisión: nada de subcarpetas, "..", otra admisión ni la papelera.
// Devuelve { config, id, nombre } o { error }.
export const validarSolicitud = ({ modulo, idAdmision, ruta } = {}) => {
  const config = MODULOS_DOCUMENTOS[modulo];
  if (!config) return { error: 'Módulo inválido.' };
  const id = limpiarId(idAdmision);
  if (!id) return { error: 'Falta el ID de admisión.' };
  if (typeof ruta !== 'string') return { error: 'Ruta de documento inválida.' };
  const prefijo = `${config.carpeta}/${id}/documentos/`;
  if (!ruta.startsWith(prefijo)) return { error: 'El documento no pertenece a esta admisión.' };
  const nombre = ruta.slice(prefijo.length);
  if (!nombre || nombre.includes('/') || nombre === '.' || nombre === '..') {
    return { error: 'Ruta de documento inválida.' };
  }
  return { config, id, nombre };
};

// Papelera: {carpeta}/{admisión}/eliminados/{fecha}_{nombre}. Fuera de
// .../documentos, así el listAll de la pestaña no la ve, y storage.rules no
// la abre a los clientes (cae en la regla final "if false"). La fecha va al
// inicio para que eliminar dos veces el mismo nombre no choque.
export const rutaPapelera = (config, id, nombre, fecha) =>
  `${config.carpeta}/${id}/eliminados/${fecha.toISOString().replace(/[:.]/g, '-')}_${nombre}`;
