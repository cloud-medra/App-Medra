// Actualizan en memoria una lista ya leída con lo que devuelve una acción,
// para no volver a leer la colección completa después de cada cambio.

// Reemplaza (mezclando campos) los elementos con el mismo id y agrega al
// final los que no estaban.
export const mezclarPorId = (lista, cambios) => {
  const porId = new Map(cambios.map((c) => [c.id, c]));
  const resultado = lista.map((x) => (porId.has(x.id) ? { ...x, ...porId.get(x.id) } : x));
  const existentes = new Set(lista.map((x) => x.id));
  return [...resultado, ...cambios.filter((c) => !existentes.has(c.id))];
};

// Tránsitos abiertos tras entregar / devolver / anotar: aplica los nuevos
// saldos y quita los que quedaron cerrados (la lista es solo de abiertos).
export const aplicarResultadoTransitos = (transitos, cambios = []) => {
  const porId = new Map(cambios.map((c) => [c.id, c]));
  return transitos
    .map((t) => (porId.has(t.id) ? { ...t, ...porId.get(t.id) } : t))
    .filter((t) => t.estado !== 'CERRADO');
};

// Lotes con vencimiento hasta `hasta` ('AAAA-MM-DD') de una lectura previa
// que cubría un rango mayor.
export const lotesHasta = (lotes, hasta) => lotes.filter((l) => l.vencimiento && l.vencimiento <= hasta);

// Pone `documento` primero en la lista (reemplazando el anterior con su id)
// y la deja en `max` elementos.
export const ponerPrimero = (lista, documento, max = Infinity) =>
  [documento, ...lista.filter((d) => d.id !== documento.id)].slice(0, max);
