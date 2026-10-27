// Reporte Info → "Descripciones ocultas" (Maestro maestros_descripciones_reporte):
// núcleo compartido por las Cloud Functions, el script de relleno y el
// frontend (importación y pantalla). Cada fila de Reporte Info lleva campos
// calculados para que la pantalla consulte solo las visibles de su módulo:
//   descripcionNorm            descripción normalizada (clave del Maestro)
//   admisionClave              número de admisión como texto ('' si no hay)
//   ocultaImplantes            oculta en Implantes (salvo admisión con gestión)
//   ocultaDocumentos           oculta en Documentos
//   descripcionOcultaImplantes la descripción está oculta en Implantes (para
//                              avisar cuando la fila se muestra por la gestión)
import { normalizarDescripcion } from '../bodymap/nucleo.mjs';

export { normalizarDescripcion };
export const COLECCION_DESCRIPCIONES = 'maestros_descripciones_reporte';
export const RAIZ_REPORTE = 'documentos_reportesInfo';
export const SIN_DESCRIPCION = 'SIN DESCRIPCION';
export const CAMPOS_FILA = ['descripcionNorm', 'admisionClave', 'ocultaImplantes', 'ocultaDocumentos', 'descripcionOcultaImplantes'];
// Campo de la consulta de Reporte Info según el módulo.
export const CAMPO_OCULTA = { implantes: 'ocultaImplantes', documentos: 'ocultaDocumentos' };

// Mayúsculas, sin tildes ni espacios extra; vacía → "SIN DESCRIPCION".
export const descripcionNormDe = (texto) => normalizarDescripcion(texto) || SIN_DESCRIPCION;
// Id del documento del Maestro (sin "/").
export const idDescripcionReporte = (texto) => encodeURIComponent(descripcionNormDe(texto));
export const admisionClaveDe = (valor) => {
  const s = String(valor ?? '').trim();
  return /^\d+$/.test(s) && Number(s) > 0 ? String(Number(s)) : '';
};

// Campos de una fila. `entrada`: datos del Maestro de su descripción (o
// null: visible); `gestionada`: su admisión tiene gestión en Implantes (en
// ese caso no se oculta en Implantes).
export const camposFila = (fila, entrada, gestionada) => {
  const ocultaEnImplantes = entrada?.ocultaImplantes === true;
  return {
    descripcionNorm: descripcionNormDe(fila?.['Descripción']),
    admisionClave: admisionClaveDe(fila?.['Admisión']),
    ocultaImplantes: ocultaEnImplantes && !gestionada,
    ocultaDocumentos: entrada?.ocultaDocumentos === true,
    descripcionOcultaImplantes: ocultaEnImplantes,
  };
};
export const camposIguales = (fila, campos) => CAMPOS_FILA.every((k) => fila?.[k] === campos[k]);
export const esFilaReporte = (ruta) => String(ruta).startsWith(`${RAIZ_REPORTE}/`);

// Estado de revisión de una entrada del Maestro (pantalla Descripciones
// ocultas y, más adelante, notificaciones):
//   'pendiente' nueva sin revisar: el trigger la creó con `pendienteDesde`
//               y nadie la tocó después (sin `actualizadoEl`, que escribe
//               cualquier cambio desde la app: switch, "Marcar como
//               revisada" u "Ocultar esta descripción" de Reporte Info).
//   'oculta'    revisada y oculta en Implantes o en Documentos.
//   'visible'   revisada y visible en los dos.
// Las entradas anteriores a este campo (sin `pendienteDesde`) cuentan como
// revisadas con su estado de siempre: no hubo migración. A las revisadas,
// notificacionesPendientes les quita `pendienteDesde` (para que su consulta
// no crezca): quedan igual que las anteriores al campo.
export const ESTADOS_DESCRIPCION = ['pendiente', 'visible', 'oculta'];
export const esPendiente = (e) => Boolean(e?.pendienteDesde) && !e?.actualizadoEl;
export const estadoDescripcion = (e) => {
  if (esPendiente(e)) return 'pendiente';
  return e?.ocultaImplantes === true || e?.ocultaDocumentos === true ? 'oculta' : 'visible';
};
