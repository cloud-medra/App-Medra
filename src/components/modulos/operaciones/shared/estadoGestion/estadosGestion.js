// Mapa central estado operativo de una gestión de Implantes -> colores.
// Lo usan EstadoBadge (columna Estado, Detalle, formulario, historial), el
// punto de la primera columna de la tabla y el filtro de estados, para que
// el mismo estado tenga el mismo color en toda la pantalla. Solo
// presentación: los valores de estado no cambian.
//
// Clases escritas completas (no armadas con variables) para que Tailwind
// las detecte. Texto -800 sobre fondo -50 y -300 sobre fondo -950/40
// (modo oscuro) superan el contraste 4.5:1 de WCAG AA.

const COLORES = {
  azul: {
    badge: 'bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800',
    punto: 'bg-blue-500'
  },
  ambar: {
    badge: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800',
    punto: 'bg-amber-500'
  },
  naranja: {
    badge: 'bg-orange-50 text-orange-800 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-800',
    punto: 'bg-orange-500'
  },
  violeta: {
    badge: 'bg-purple-50 text-purple-800 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800',
    punto: 'bg-purple-500'
  },
  rojo: {
    badge: 'bg-red-50 text-red-800 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800',
    punto: 'bg-red-500'
  },
  verde: {
    badge: 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800',
    punto: 'bg-emerald-500'
  },
  gris: {
    badge: 'bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600',
    punto: 'bg-gray-400'
  }
};

export const COLOR_POR_ESTADO = {
  AGENDADO: 'azul',
  AGENDANDO: 'azul',
  PENDIENTE: 'ambar',
  REVISAR: 'naranja',
  'S/COTIZACION': 'violeta',
  'SIN COTIZACION': 'violeta',
  INCOMPLETO: 'rojo',
  CARGADO: 'verde'
};

export const normalizarEstadoGestion = (estado) => String(estado ?? '').toUpperCase().trim();

// Colores de un estado ({ badge, punto }); gris si no está en el mapa.
export const coloresEstadoGestion = (estado) =>
  COLORES[COLOR_POR_ESTADO[normalizarEstadoGestion(estado)]] || COLORES.gris;
