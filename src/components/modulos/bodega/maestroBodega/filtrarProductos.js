import { stockTotal, bajoMinimo, textoBusquedaProducto, normalizarClave } from '../../../../../functions/bodega/nucleo.mjs';

// Filtros del listado del Maestro (en memoria). `texto`: todas las palabras
// deben aparecer en nombre, código maestro, referencia, ubicación o códigos
// de barra.
export const filtrarProductos = (productos, { texto = '', categoriaId = '', estado = 'activos', conStock = false, soloBajoMinimo = false } = {}) => {
  const palabras = normalizarClave(texto).split(' ').filter(Boolean);
  return productos.filter((p) => {
    if (estado === 'activos' && p.activo === false) return false;
    if (estado === 'inactivos' && p.activo !== false) return false;
    if (categoriaId && p.categoriaId !== categoriaId) return false;
    if (conStock && stockTotal(p) <= 0) return false;
    if (soloBajoMinimo && !bajoMinimo(p)) return false;
    if (palabras.length) {
      const base = textoBusquedaProducto(p);
      if (!palabras.every((w) => base.includes(w))) return false;
    }
    return true;
  });
};

const sumarDias = (iso, dias) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
};

// Hasta qué fecha leer lotes: vencidos = antes de hoy; próximos = hasta hoy + días.
export const rangoVencimiento = (modo, dias, hoy) => (modo === 'vencidos'
  ? { hasta: sumarDias(hoy, -1) }
  : { hasta: sumarDias(hoy, Number(dias) || 0) });

// Lotes leídos -> { [productoId]: { vencimiento (el más próximo), lotes } }
// según el modo (próximos: desde hoy en adelante).
export const vencimientoPorProducto = (lotes, modo, hoy) => lotes
  .filter((l) => l.vencimiento && (modo === 'vencidos' ? l.vencimiento < hoy : l.vencimiento >= hoy))
  .reduce((acc, l) => {
    const previo = acc[l.productoId];
    acc[l.productoId] = {
      vencimiento: previo && previo.vencimiento < l.vencimiento ? previo.vencimiento : l.vencimiento,
      lotes: (previo?.lotes || 0) + 1,
    };
    return acc;
  }, {});
