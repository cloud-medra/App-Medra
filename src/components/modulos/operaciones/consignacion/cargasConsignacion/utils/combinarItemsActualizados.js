// Al volver del detalle: reemplaza en `registros` las filas que vienen en
// `items` (las de la admisión, escuchadas en vivo por el detalle), por ruta
// del documento. Las que no están en la tabla (otro estado u otra página)
// se ignoran. Devuelve el mismo arreglo si no cambió nada.
export const combinarItemsActualizados = (registros, items) => {
  const porRuta = new Map((items || []).filter((it) => it?.ref?.path).map((it) => [it.ref.path, it]));
  if (porRuta.size === 0) return registros;
  let cambio = false;
  const nuevos = registros.map((r) => {
    const actualizado = r.ref?.path && porRuta.get(r.ref.path);
    if (!actualizado || actualizado === r) return r;
    cambio = true;
    return actualizado;
  });
  return cambio ? nuevos : registros;
};
