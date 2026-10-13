// Configuración por módulo de las pantallas de Gestión que comparten
// Implantes y Hemodinamia (Hemodinamia es igual a Implantes; solo cambia lo
// propio del módulo). Cada pantalla compartida recibe la clave del módulo
// ('implantes' | 'hemodinamia') y lee de aquí colecciones, carpetas de
// Storage, rutas de permisos, centro y atributo.
import { CENTRO_HEMODINAMIA } from '../hemodinamia/gestionHemodinamia/utils/constantesHemodinamia';

export const MODULOS_GESTION = Object.freeze({
  implantes: {
    clave: 'implantes',
    etiqueta: 'Implantes',
    // Firestore
    coleccionGestiones: 'implantes_gestiones',
    coleccionImputadas: 'implantes_imputadas',
    // Centro y atributo que se escriben en la imputada (Solicitud).
    centroDe: (gestion) => gestion.centro || 'PABELLON',
    atributoPorDefecto: 'IMPLANTES',
    // Excel de Solicitud
    tituloResumen: 'RESUMEN DE IMPLANTES IMPUTADOS',
    // Textos del drawer de Configuración (Exportar / Importación masiva).
    textoRegistros: 'implantes registrados',
    textoNuevosRegistros: 'nuevos implantes',
    hojaSolicitud: 'Solicitud Implantes',
    archivoSolicitud: 'solicitud_implantes',
    // Storage: PDF de cada admisión (pestaña Documentos y Carga masiva).
    carpetaDocumentos: 'implantes',
    // OC (Importar Detalles OC → Sincronizar OC): campos de ocImport/meta de
    // este módulo (versión ya sincronizada y OC cambiadas por aplicar).
    oc: { campoUltimaSync: 'ultimaSyncVersion', campoInvalidacionesPendientes: 'ocInvalidacionesPendientes' },
    // Respaldo de documentos (PDF cuya admisión no está en el módulo).
    coleccionRespaldo: 'implantes_respaldo_documentos',
    carpetaRespaldo: 'implantes_respaldo',
    // Rutas (menú y permisos granulares)
    rutas: {
      gestion: '/implantes/gestionImplantes',
      solicitud: '/implantes/solicitudImplantes',
      cargaMasivaDocumentos: '/implantes/cargaMasivaDocumentos',
      respaldo: '/implantes/respaldoDocumentos',
      sincronizacion: '/implantes/sincronizacionImputadas',
    },
  },
  hemodinamia: {
    clave: 'hemodinamia',
    etiqueta: 'Hemodinamia',
    coleccionGestiones: 'hemodinamia_gestiones',
    coleccionImputadas: 'hemodinamia_imputadas',
    // Todo lo de Hemodinamia tiene centro fijo.
    centroDe: () => CENTRO_HEMODINAMIA,
    atributoPorDefecto: 'HEMODINAMIA',
    tituloResumen: 'RESUMEN DE HEMODINAMIA IMPUTADA',
    textoRegistros: 'registros de Hemodinamia',
    textoNuevosRegistros: 'nuevos registros',
    hojaSolicitud: 'Solicitud Hemodinamia',
    archivoSolicitud: 'solicitud_hemodinamia',
    carpetaDocumentos: 'hemodinamia',
    oc: { campoUltimaSync: 'ultimaSyncVersionHemodinamia', campoInvalidacionesPendientes: 'ocInvalidacionesPendientesHemodinamia' },
    coleccionRespaldo: 'hemodinamia_respaldo_documentos',
    carpetaRespaldo: 'hemodinamia_respaldo',
    rutas: {
      gestion: '/hemodinamia/gestionHemodinamia',
      solicitud: '/hemodinamia/solicitudHemodinamia',
      cargaMasivaDocumentos: '/hemodinamia/cargaMasivaDocumentos',
      respaldo: '/hemodinamia/respaldoDocumentos',
      sincronizacion: '/hemodinamia/sincronizacionImputadas',
    },
  },
});

// Módulos cuyas gestiones reciben OC del índice de Importar Detalles OC.
export const MODULOS_CON_OC = Object.freeze(['implantes', 'hemodinamia']);

export const moduloGestion = (clave) => {
  const config = MODULOS_GESTION[clave];
  if (!config) throw new Error(`Módulo de gestión desconocido: ${clave}`);
  return config;
};

// Límites de documentId() para acotar un collectionGroup('detalles') a las
// gestiones del módulo: rutas COMPLETAS de 2 segmentos que cubren cualquier
// año de 4 dígitos ('implantes_gestiones/0000' a '…/9999\uf8ff'; \uf8ff es
// el tope habitual de un rango por prefijo en Firestore).
export const rangoGestiones = (config) => ({
  min: `${config.coleccionGestiones}/0000`,
  max: `${config.coleccionGestiones}/9999\uf8ff`,
});
