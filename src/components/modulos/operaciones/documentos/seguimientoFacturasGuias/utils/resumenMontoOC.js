// Total de oc_monto y cantidad de registros de las filas ya filtradas
// (todas, no solo la página visible). Los montos vacíos o no numéricos
// cuentan como 0 (nunca NaN). oc_monto es el monto de CADA línea
// (precio_u × cantidad), así que el total es la suma simple: una misma OC
// con varios códigos del mismo monto es correcta y se suma completa.
//
// Solo se avisa de duplicados reales: filas con la misma OC, código, lote,
// admisión, fecha Cx y monto (una fila importada dos veces). El total no
// cambia; se informa cuánto daría sin esas copias.
import { montoNumerico, formatearFechaCelda } from './columnasSeguimiento';

const texto = (v) => String(v ?? '').trim();

export const calcularResumenMontoOC = (filas) => {
  let total = 0;
  const grupos = new Map();
  filas.forEach((fila) => {
    const monto = montoNumerico(fila.oc_monto) ?? 0;
    total += monto;
    const datos = {
      oc: texto(fila.oc),
      codigo: texto(fila.codigo),
      lote: texto(fila.lote),
      admision: texto(fila.admision),
      fecha: formatearFechaCelda(fila.fecha_cx),
      monto
    };
    const clave = JSON.stringify(Object.values(datos));
    const g = grupos.get(clave);
    if (g) g.filas += 1; else grupos.set(clave, { ...datos, filas: 1 });
  });

  const duplicados = [...grupos.values()].filter((g) => g.filas > 1);
  const montoDuplicado = duplicados.reduce((s, g) => s + g.monto * (g.filas - 1), 0);
  return {
    total,
    registros: filas.length,
    duplicados,
    filasDuplicadas: duplicados.reduce((s, g) => s + g.filas - 1, 0),
    totalSinDuplicados: total - montoDuplicado
  };
};
