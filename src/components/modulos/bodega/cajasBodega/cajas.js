import { faltanteCaja, idsOrdenadosCaja } from '../../../../../functions/bodega/nucleo.mjs';

// Productos de la caja en su orden manual (`orden`; los que no lo tienen,
// al final por nombre natural), con su faltante. Lo usan el detalle, el
// modal de edición, inventario, reposición y los exportes.
export const productosDeCaja = (caja) => {
  const productos = caja?.productos || {};
  return idsOrdenadosCaja(productos).map((productoId) => ({ productoId, ...productos[productoId], faltante: faltanteCaja(productos[productoId]) }));
};

// Copia de la lista con el elemento de `desde` movido a la posición `hasta`
// (fuera de rango o sin movimiento: la misma lista).
export const moverElemento = (lista, desde, hasta) => {
  if (desde === hasta || desde < 0 || hasta < 0 || desde >= lista.length || hasta >= lista.length) return lista;
  const copia = [...lista];
  const [elemento] = copia.splice(desde, 1);
  copia.splice(hasta, 0, elemento);
  return copia;
};

// Texto de los lotes usados en una línea repuesta: "L123 (2027-01-01) × 2".
export const textoLotes = (lotes = []) => lotes
  .map((l) => `${l.lote || 'S/L'}${l.vencimiento ? ` (${l.vencimiento})` : ''} × ${l.cantidad}`)
  .join(', ') || '—';

// La caja con el stock actual = lo contado en un inventario recién hecho
// (para abrir "Reponer" sin esperar a releerla).
export const cajaTrasInventario = (caja, lineas = []) => ({
  ...caja,
  productos: Object.fromEntries(Object.entries(caja?.productos || {}).map(([id, p]) => {
    const l = lineas.find((x) => x.productoId === id);
    return [id, l ? { ...p, stockActual: l.contado } : p];
  })),
});
