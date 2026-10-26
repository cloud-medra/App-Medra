// Vista de acceso rápido de un módulo (todas sus pantallas como tarjetas).
// Se abre al presionar el nombre del módulo en el sidebar o en el header.
//
// En el Dashboard la vista activa es un texto: para esta vista es
// `modulo:<entrada>` (entrada = módulo o grupo del sidebar, ver
// config/gruposMenu.jsx). En la URL va como `?modulo=<entrada>`, con su propia
// entrada en el historial: así funciona el botón atrás del navegador y se
// puede recargar la página sin perderla.

const PREFIJO = 'modulo:';
export const PARAM_MODULO = 'modulo';

export const vistaDeModulo = (entrada) => `${PREFIJO}${entrada}`;

// Entrada del módulo si `vista` es la de acceso rápido; si no, null.
export const entradaDeVista = (vista) =>
  (typeof vista === 'string' && vista.startsWith(PREFIJO) ? vista.slice(PREFIJO.length) || null : null);

export const leerModuloDeURL = () => {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get(PARAM_MODULO) || null;
};

// URL actual con `?modulo=` puesto (entrada) o quitado (null); conserva el
// resto de los parámetros (p. ej. los de Reporte Info).
export const urlConModulo = (entrada) => {
  const url = new URL(window.location.href);
  if (entrada) url.searchParams.set(PARAM_MODULO, entrada);
  else url.searchParams.delete(PARAM_MODULO);
  return `${url.pathname}${url.search}${url.hash}`;
};
