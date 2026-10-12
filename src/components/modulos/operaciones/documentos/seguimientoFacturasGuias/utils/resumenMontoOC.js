// Total de oc_monto y cantidad de registros de las filas ya filtradas
// (todas, no solo la página visible). Los montos vacíos o no numéricos
// cuentan como 0 (nunca NaN).
//
// Si una misma OC aparece en varias filas con el MISMO oc_monto (p. ej. una
// fila por lote y el monto total de la OC repetido en cada una), la suma
// simple lo cuenta varias veces: se informa cuántas OC están en ese caso y
// cuánto daría contando cada una una sola vez, sin cambiar el total.
import { montoNumerico } from './columnasSeguimiento';

export const calcularResumenMontoOC = (filas) => {
  let total = 0;
  const grupos = new Map();
  filas.forEach((fila) => {
    const monto = montoNumerico(fila.oc_monto) ?? 0;
    total += monto;
    const oc = String(fila.oc ?? '').trim();
    if (!oc || monto === 0) return;
    const clave = `${oc}|${monto}`;
    const g = grupos.get(clave);
    if (g) g.filas += 1; else grupos.set(clave, { oc, monto, filas: 1 });
  });

  const repetidas = [...grupos.values()].filter((g) => g.filas > 1);
  const montoRepetido = repetidas.reduce((s, g) => s + g.monto * (g.filas - 1), 0);
  return {
    total,
    registros: filas.length,
    ocsRepetidas: repetidas.map(({ oc, monto, filas: n }) => ({ oc, monto, filas: n })),
    totalSinRepetir: total - montoRepetido
  };
};
