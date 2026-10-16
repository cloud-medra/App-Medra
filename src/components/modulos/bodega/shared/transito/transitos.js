import { normalizarClave } from '../../../../../../functions/bodega/nucleo.mjs';
import { referenciaProducto } from '../documentos/lineasDocumento';

// Utilidades puras de la vista de tránsitos.

const MS_DIA = 24 * 60 * 60 * 1000;
const aFecha = (ts) => (ts?.toDate ? ts.toDate() : ts instanceof Date ? ts : null);

// Días completos desde la salida (0 = hoy).
export const diasEnTransito = (fechaSalida, ahora = new Date()) => {
  const f = aFecha(fechaSalida);
  return f ? Math.max(0, Math.floor((ahora.getTime() - f.getTime()) / MS_DIA)) : null;
};

export const fechaHora = (ts) => {
  const f = aFecha(ts);
  return f ? f.toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' }) : '';
};

// Agrega a cada tránsito la referencia de su producto (propia o del
// maestro clínico), tomada del maestro de productos en memoria: el registro
// de tránsito no la guarda.
export const conReferencia = (transitos, productosPorId) => transitos.map((t) => ({ ...t, referencia: referenciaProducto(productosPorId[t.productoId]) }));

// Filtro por texto: producto, referencia, código, lote, centro, solicitante, usuario o N° salida.
export const filtrarTransitos = (transitos, texto) => {
  const palabras = normalizarClave(texto).split(' ').filter(Boolean);
  if (!palabras.length) return transitos;
  return transitos.filter((t) => {
    const base = normalizarClave([t.productoNombre, t.referencia, t.codigoMaestro, t.lote, t.centroNombre, t.solicitante, t.usuario?.nombre, t.salidaNumero].join(' '));
    return palabras.every((w) => base.includes(w));
  });
};

// Cuánto se puede mover de un tránsito con la acción: lo pendiente en
// tránsito o, al entregar/devolver desde el centro, lo dejado ahí.
export const disponibleParaAccion = (transito, accion, desde = 'TRANSITO') => (
  accion !== 'DEJAR_EN_CENTRO' && desde === 'CENTRO' ? Number(transito.enCentro) || 0 : Number(transito.pendiente) || 0
);

// "Desde" sugerido al abrir Entregar/Devolver: tránsito si alguno tiene
// pendiente; si no, lo dejado en el centro.
export const desdeSugerido = (transitos) => (transitos.some((t) => (Number(t.pendiente) || 0) > 0) ? 'TRANSITO' : 'CENTRO');

// Acciones a enviar desde el formulario del modal. `lineas`: [{ transito,
// cantidad, idEntrega, observacion }]; los vacíos por línea toman el común.
// `desde` (ENTREGAR/DEVOLVER): 'TRANSITO' o 'CENTRO'.
export const construirAcciones = (accion, lineas, comun, desde = 'TRANSITO') => lineas.map((l) => ({
  transitoId: l.transito.id,
  accion,
  ...(accion === 'ENTREGAR' || accion === 'DEVOLVER' ? { desde } : {}),
  cantidad: accion === 'NOTA' ? null : Number(l.cantidad),
  idEntrega: accion === 'ENTREGAR' ? (String(l.idEntrega || '').trim() || comun.idEntrega) : '',
  observacion: String(l.observacion || '').trim() || comun.observacion || '',
  nota: accion === 'NOTA' ? comun.nota : '',
}));
