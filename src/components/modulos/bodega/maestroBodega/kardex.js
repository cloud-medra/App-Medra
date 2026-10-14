import { TIPOS_MOVIMIENTO, TIPOS_DOCUMENTO_INGRESO } from '../../../../../functions/bodega/nucleo.mjs';

// Utilidades puras del kardex.

const ms = (ts) => (ts?.toMillis ? ts.toMillis() : ts instanceof Date ? ts.getTime() : 0);

// Más reciente primero; dentro de la misma transacción (misma fecha), el
// último aplicado primero.
export const ordenarKardex = (movimientos) => [...movimientos].sort((a, b) => ms(b.fecha) - ms(a.fecha) || (b.orden || 0) - (a.orden || 0));

// Efecto sobre el disponible de la Bodega General: 1 suma, -1 resta, 0 no
// lo toca (entrega: sale del tránsito).
export const signoMovimiento = (tipo) => {
  const def = TIPOS_MOVIMIENTO[tipo];
  if (!def) return 0;
  return def.disponible !== 0 ? def.disponible : 0;
};

export const referenciaMovimiento = (m) => {
  const r = m.documentoRef || {};
  if (r.tipo === 'INGRESO') return `${TIPOS_DOCUMENTO_INGRESO[r.tipoDocumento] || 'Doc.'} ${r.numero || ''} · ${r.proveedorNombre || ''}`.trim();
  if (r.tipo === 'CARGA_INICIAL') return 'Carga inicial';
  if (r.tipo === 'SALIDA') return `Salida N° ${r.numero}`;
  if (r.tipo === 'INVENTARIO') return `Inventario ${r.nombre || ''}`.trim();
  return '';
};
