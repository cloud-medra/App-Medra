// Agrupación del reporte de consumo (entregas). Lógica pura.

// entregas -> [{ centroId, centroNombre, unidades, productos: [{ productoId,
// productoNombre, codigoMaestro, unidades, entregas }] }], centros y
// productos ordenados por unidades (mayor primero).
export const agruparConsumo = (entregas) => {
  const centros = new Map();
  entregas.forEach((m) => {
    const c = centros.get(m.centroId) || { centroId: m.centroId, centroNombre: m.centroNombre || m.centroId, unidades: 0, productos: new Map() };
    const p = c.productos.get(m.productoId) || { productoId: m.productoId, productoNombre: m.productoNombre, codigoMaestro: m.codigoMaestro, unidades: 0, entregas: 0 };
    p.unidades += m.cantidad || 0;
    p.entregas += 1;
    c.unidades += m.cantidad || 0;
    c.productos.set(m.productoId, p);
    centros.set(m.centroId, c);
  });
  return [...centros.values()]
    .map((c) => ({ ...c, productos: [...c.productos.values()].sort((a, b) => b.unidades - a.unidades || a.productoNombre.localeCompare(b.productoNombre, 'es')) }))
    .sort((a, b) => b.unidades - a.unidades || a.centroNombre.localeCompare(b.centroNombre, 'es'));
};

export const primerDiaDelMes = (hoy) => `${hoy.slice(0, 8)}01`;
