import { normalizarClave } from '../../../../../../functions/bodega/nucleo.mjs';

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

// Filtro por texto: producto, código, lote, centro, solicitante, usuario o N° salida.
export const filtrarTransitos = (transitos, texto) => {
  const palabras = normalizarClave(texto).split(' ').filter(Boolean);
  if (!palabras.length) return transitos;
  return transitos.filter((t) => {
    const base = normalizarClave([t.productoNombre, t.codigoMaestro, t.lote, t.centroNombre, t.solicitante, t.usuario?.nombre, t.salidaNumero].join(' '));
    return palabras.every((w) => base.includes(w));
  });
};

// Acciones a enviar desde el formulario del modal. `lineas`: [{ transito,
// cantidad, idEntrega, observacion }]; los vacíos por línea toman el común.
export const construirAcciones = (accion, lineas, comun) => lineas.map((l) => ({
  transitoId: l.transito.id,
  accion,
  cantidad: accion === 'NOTA' ? null : Number(l.cantidad),
  idEntrega: accion === 'ENTREGAR' ? (String(l.idEntrega || '').trim() || comun.idEntrega) : '',
  observacion: String(l.observacion || '').trim() || comun.observacion || '',
  nota: accion === 'NOTA' ? comun.nota : '',
}));
