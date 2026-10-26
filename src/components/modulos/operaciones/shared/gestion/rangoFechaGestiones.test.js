import { describe, it, expect } from 'vitest';
import { fechaISOEnChile, coincideRangoFecha, RANGOS_FECHA, RANGO_FECHA_PREDETERMINADO } from './rangoFechaGestiones';

describe('fechaISOEnChile', () => {
  it('corta el día a medianoche de Chile, no en UTC (horario de verano, UTC-3)', () => {
    expect(fechaISOEnChile(new Date('2026-10-27T02:30:00Z'))).toBe('2026-10-26'); // 23:30 en Chile
    expect(fechaISOEnChile(new Date('2026-10-27T03:30:00Z'))).toBe('2026-10-27'); // 00:30 en Chile
  });

  it('también en horario de invierno (UTC-4)', () => {
    expect(fechaISOEnChile(new Date('2026-06-15T03:30:00Z'))).toBe('2026-06-14'); // 23:30 en Chile
    expect(fechaISOEnChile(new Date('2026-06-15T04:30:00Z'))).toBe('2026-06-15'); // 00:30 en Chile
  });
});

describe('coincideRangoFecha', () => {
  const HOY = '2026-10-26';
  const casos = { ayer: '2026-10-25', hoy: HOY, manana: '2026-10-27', sinFecha: '' };
  const visibles = (rango) => Object.keys(casos).filter((k) => coincideRangoFecha(casos[k], rango, HOY));

  it('aplica cada rango', () => {
    expect(visibles('hastaAyer')).toEqual(['ayer']);
    expect(visibles('hastaHoy')).toEqual(['ayer', 'hoy']);
    expect(visibles('soloHoy')).toEqual(['hoy']);
    expect(visibles('desdeManana')).toEqual(['manana']);
    expect(visibles('todos')).toEqual(['ayer', 'hoy', 'manana', 'sinFecha']);
  });

  it('cinco opciones en orden, con "Hasta ayer" como predeterminado', () => {
    expect(RANGOS_FECHA.map((r) => r.label)).toEqual(['Hasta ayer', 'Hasta hoy', 'Solo hoy', 'Desde mañana', 'Todos los días']);
    expect(RANGO_FECHA_PREDETERMINADO).toBe('hastaAyer');
  });
});
