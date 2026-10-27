import { useLayoutEffect, useMemo, useState } from 'react';

// Ajuste de anchos de columna al contenedor (complemento de useColumnResize).
// Si la suma de los anchos (por defecto o guardados) no cabe en el espacio
// disponible, se achica cada columna en proporción a lo que puede ceder
// (ancho − mínimo), sin bajar de su mínimo. Solo cambia lo que se dibuja:
// los anchos guardados quedan igual y vuelven a verse si hay espacio. Si ni
// con los mínimos cabe, se usan los mínimos y queda la barra horizontal.
export const ajustarAnchos = (columnas, anchos, disponible) => {
  const ancho = (col) => anchos[col.key] ?? col.ancho;
  const total = columnas.reduce((s, col) => s + ancho(col), 0);
  if (!disponible || total <= disponible) return anchos;
  const cedible = (col) => Math.max(0, ancho(col) - (col.min ?? 0));
  const totalCedible = columnas.reduce((s, col) => s + cedible(col), 0);
  const exceso = total - disponible;
  if (totalCedible <= exceso) {
    return columnas.reduce((acc, col) => ({ ...acc, [col.key]: Math.min(ancho(col), col.min ?? ancho(col)) }), { ...anchos });
  }
  const factor = exceso / totalCedible;
  // Hacia abajo, para no pasarse por redondeo (el sobrante va al relleno).
  return columnas.reduce((acc, col) => ({ ...acc, [col.key]: Math.floor(ancho(col) - cedible(col) * factor) }), { ...anchos });
};

/**
 * Anchos a dibujar para una tabla dentro de `contenedor` (elemento con
 * scroll horizontal, guardado en estado con un callback ref): mide su ancho
 * con ResizeObserver y aplica ajustarAnchos. Devuelve { anchos, anchoTotal }.
 */
export const useAnchosAjustados = (columnas, anchos, contenedor) => {
  const [disponible, setDisponible] = useState(0);

  useLayoutEffect(() => {
    if (!contenedor) return undefined;
    const medir = () => setDisponible(contenedor.clientWidth);
    medir();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observador = new ResizeObserver(medir);
    observador.observe(contenedor);
    return () => observador.disconnect();
  }, [contenedor]);

  return useMemo(() => {
    const ajustados = ajustarAnchos(columnas, anchos, disponible);
    return { anchos: ajustados, anchoTotal: columnas.reduce((s, col) => s + (ajustados[col.key] ?? col.ancho), 0) };
  }, [columnas, anchos, disponible]);
};
