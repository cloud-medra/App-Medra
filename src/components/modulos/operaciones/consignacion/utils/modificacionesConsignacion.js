import { fotoItems, camposModificacionAlGuardar } from '../../shared/solicitudModificaciones/modificacionesSolicitud';

// =====================================================================
// Solicitudes de modificaciones de Consignación. Reutiliza la lógica de
// Implantes/Hemodinamia (shared/solicitudModificaciones): acá cada carga es
// su propio documento en consignacion_registros/.../detalles, así que el
// "bloque" es el registro y tiene un solo ítem. Sus campos se traducen a los
// nombres de la foto de Implantes (costo → precio, descripcion →
// descriptorAuto, atributo → tipoVinculado) para comparar y armar el Excel
// con el mismo código. Una carga solicitada no se elimina desde Cargas, por
// lo que en la práctica solo aparecen filas MODIFICADO.
// =====================================================================

export const RUTA_SOLICITUD_MODIFICACIONES_CONSIGNACION = '/consignacion/solicitudModificacionesConsignacion';

// El registro con los nombres de campo de un ítem de Implantes.
export const itemComparableConsignacion = (id, registro) => ({
  id,
  codigo: registro?.codigo || '',
  referencia: registro?.referencia || '',
  descriptorAuto: registro?.descripcion || '',
  cantidad: registro?.cantidad,
  precio: registro?.costo,
  venta: registro?.venta,
  lote: registro?.lote || '',
  vencimiento: registro?.vencimiento || '',
  tipoVinculado: registro?.atributo || '',
  // Va a la columna N° de guía del Excel (ver columnaNumeroExcel).
  numCotizacion: registro?.numeroGuiaVinculada ? String(registro.numeroGuiaVinculada) : '',
});

// Foto que se guarda en el registro al solicitarlo (itemsSolicitados).
export const fotoRegistroConsignacion = (id, registro) => fotoItems([itemComparableConsignacion(id, registro)]);

// Campos a guardar al editar un registro SOLICITADO (misma regla que el
// guardado de Implantes): sin foto previa (solicitado antes de este
// cambio), la base es el registro tal como estaba antes de editar.
export const camposModificacionConsignacion = (id, registroAntes, cambios) => camposModificacionAlGuardar({
  fotoGuardada: registroAntes?.itemsSolicitados,
  itemsAntes: [itemComparableConsignacion(id, registroAntes)],
  itemsDespues: [itemComparableConsignacion(id, { ...registroAntes, ...cambios })],
});

// Configuración de la pantalla compartida SolicitudModificaciones (los
// mismos campos que usa de MODULOS_GESTION en Implantes/Hemodinamia).
export const CONFIG_MODIFICACIONES_CONSIGNACION = Object.freeze({
  clave: 'consignacion',
  etiqueta: 'Consignación',
  coleccionGestiones: 'consignacion_registros',
  centroDe: (registro) => registro.centro || 'PABELLON',
  archivoSolicitud: 'solicitud_consignacion',
  columnaNumeroExcel: 'N GUIA',
  itemsDe: (id, registro) => [itemComparableConsignacion(id, registro)],
  rutas: { solicitudModificaciones: RUTA_SOLICITUD_MODIFICACIONES_CONSIGNACION },
});
