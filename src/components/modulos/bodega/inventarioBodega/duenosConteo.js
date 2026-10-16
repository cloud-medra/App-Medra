import { normalizarLote } from '../../../../../functions/bodega/nucleo.mjs';

// Dueño de cada lote contado (lógica pura). El mismo producto + lote +
// vencimiento puede existir como stock propio y consignado (o de dos
// empresas): en ese caso hay que preguntar a quién corresponde lo contado.

const clave = (productoId, lote, vencimiento) => `${productoId}|${normalizarLote(lote)}|${vencimiento || ''}`;

// Líneas del inventario -> { [clave]: [{ propietarioId, propietarioNombre }] } (sin repetir dueño).
export const duenosPorLote = (lineasInventario = []) => lineasInventario.reduce((acc, l) => {
  const k = clave(l.productoId, l.lote, l.vencimiento);
  const lista = acc[k] || [];
  const propietarioId = l.propietarioId || null;
  if (!lista.some((d) => d.propietarioId === propietarioId)) lista.push({ propietarioId, propietarioNombre: propietarioId ? (l.propietarioNombre || '') : '' });
  acc[k] = lista;
  return acc;
}, {});

// Conteo (líneas del editor, con `key`) + elecciones { [key]: propietarioId|'' }
// -> { conteos (para registrarConteo), ambiguos: [{ linea, opciones, productoNombre }] }.
// Sin dueño conocido (lote que no estaba) = propio; con uno, ese; con
// varios, el elegido (o queda ambiguo).
export const resolverDuenos = (conteo, lineasInventario, elecciones = {}) => {
  const duenos = duenosPorLote(lineasInventario);
  const ambiguos = [];
  const conteos = conteo.map((l) => {
    const opciones = duenos[clave(l.productoId, l.lote, l.vencimiento)] || [];
    let propietarioId = opciones[0]?.propietarioId || null;
    if (opciones.length > 1) {
      if (l.key in elecciones) propietarioId = elecciones[l.key] || null;
      else ambiguos.push({ linea: l, opciones, productoNombre: lineasInventario.find((x) => x.productoId === l.productoId)?.productoNombre || '' });
    }
    return { productoId: l.productoId, lote: l.lote, vencimiento: l.vencimiento, propietarioId, cantidad: l.cantidad };
  });
  return { conteos, ambiguos };
};
