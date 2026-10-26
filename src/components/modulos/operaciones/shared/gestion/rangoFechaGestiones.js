// Filtro de rango de fecha de Gestión (Implantes y Hemodinamia). Compara
// el campo `fecha` ('YYYY-MM-DD') de la gestión contra "hoy" en hora de
// Chile: el día cambia a medianoche de America/Santiago, no en UTC.

export const ZONA_CHILE = 'America/Santiago';

// Fecha 'YYYY-MM-DD' de `fecha` (por defecto ahora) en hora de Chile.
export const fechaISOEnChile = (fecha = new Date()) => {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: ZONA_CHILE, year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(fecha)
      .map(({ type, value }) => [type, value])
  );
  return `${partes.year}-${partes.month}-${partes.day}`;
};

// Orden de los botones. El primero es el predeterminado.
export const RANGOS_FECHA = [
  { id: 'hastaAyer', label: 'Hasta ayer', title: 'Solo filas con fecha anterior a hoy' },
  { id: 'hastaHoy', label: 'Hasta hoy', title: 'Solo filas con fecha de hoy o anterior (oculta fechas futuras)' },
  { id: 'soloHoy', label: 'Solo hoy', title: 'Solo filas con fecha de hoy' },
  { id: 'desdeManana', label: 'Desde mañana', title: 'Solo filas con fecha posterior a hoy' },
  { id: 'todos', label: 'Todos los días', title: 'Muestra todas las fechas, incluidas las futuras y las filas sin fecha' }
];

export const RANGO_FECHA_PREDETERMINADO = 'hastaAyer';

// "YYYY-MM-DD" se compara igual como texto que como fecha. Las filas sin
// fecha solo aparecen en "Todos los días" (como antes con "Hasta hoy").
export const coincideRangoFecha = (fecha, rango, hoyISO) => {
  if (rango === 'todos') return true;
  if (!fecha || !String(fecha).includes('-')) return false;
  const dia = String(fecha).slice(0, 10);
  switch (rango) {
    case 'hastaAyer': return dia < hoyISO;
    case 'hastaHoy': return dia <= hoyISO;
    case 'soloHoy': return dia === hoyISO;
    case 'desdeManana': return dia > hoyISO;
    default: return true;
  }
};
