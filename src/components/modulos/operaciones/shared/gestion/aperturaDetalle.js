import { esPantallaEscritorio } from './fijarColumnas';

// Apertura del detalle de una gestión desde la tabla. En escritorio se abre
// con doble clic (un clic simple sirve para seleccionar y copiar texto). En
// pantallas táctiles el doble toque no es confiable (el navegador lo usa
// para hacer zoom), así que basta un toque: en pantallas menores a 768px
// (mismo corte que "Fijar columnas") o sin mouse ('hover: none', p. ej. una
// tablet). El ojo de la columna Acciones abre el detalle siempre.

export const SIN_HOVER = '(hover: none)';

export const abreDetalleConUnToque = () =>
  !esPantallaEscritorio() || (window.matchMedia?.(SIN_HOVER).matches ?? false);

// Un toque sobre un control de la fila (copiar, acciones) hace lo suyo y no
// abre el detalle.
export const esToqueEnControl = (target) =>
  !!target?.closest?.('button, a, input, select, textarea, label');
