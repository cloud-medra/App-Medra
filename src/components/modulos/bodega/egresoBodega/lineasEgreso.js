// Líneas de una salida en pantalla: { key, productoId, productoNombre,
// loteId, lote, vencimiento, propietarioNombre, cantidad, centroId,
// centroNombre }. Lógica pura.

// Agrega; si ya hay una del mismo lote y centro, suma. { lineas, sumada }.
export const agregarLineaEgreso = (lineas, { producto, lote, cantidad, centro }) => {
  const i = lineas.findIndex((l) => l.loteId === lote.id && l.centroId === centro.id);
  if (i >= 0) {
    const copia = [...lineas];
    copia[i] = { ...copia[i], cantidad: copia[i].cantidad + cantidad };
    return { lineas: copia, sumada: true };
  }
  return {
    sumada: false,
    lineas: [...lineas, {
      key: `${lote.id}|${centro.id}`,
      productoId: producto.id, productoNombre: producto.nombre,
      loteId: lote.id, lote: lote.lote || '', vencimiento: lote.vencimiento || '', propietarioNombre: lote.propietarioNombre || '',
      cantidad, centroId: centro.id, centroNombre: centro.nombre,
    }],
  };
};

// { [loteId]: cantidad ya agregada a la lista } (para no pasarse del stock).
export const reservadoPorLote = (lineas) => lineas.reduce((acc, l) => ({ ...acc, [l.loteId]: (acc[l.loteId] || 0) + l.cantidad }), {});

// [{ centroId, nombre, lineas, unidades }] ordenado por nombre.
export const resumenPorCentro = (lineas) => Object.values(lineas.reduce((acc, l) => {
  const r = acc[l.centroId] || { centroId: l.centroId, nombre: l.centroNombre, lineas: 0, unidades: 0 };
  acc[l.centroId] = { ...r, lineas: r.lineas + 1, unidades: r.unidades + l.cantidad };
  return acc;
}, {})).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
