import { faltanteCaja } from '../../../../../functions/bodega/nucleo.mjs';

// Productos de la caja como lista ordenada por nombre, con su faltante.
export const productosDeCaja = (caja) => Object.entries(caja?.productos || {})
  .map(([productoId, p]) => ({ productoId, ...p, faltante: faltanteCaja(p) }))
  .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
