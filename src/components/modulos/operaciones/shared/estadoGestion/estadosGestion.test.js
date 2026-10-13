import { describe, it, expect } from 'vitest';
import { coloresEstadoGestion, normalizarEstadoGestion } from './estadosGestion';

describe('coloresEstadoGestion', () => {
  it.each([
    ['AGENDADO', 'blue'], ['AGENDANDO', 'blue'],
    ['PENDIENTE', 'amber'],
    ['REVISAR', 'orange'],
    ['S/COTIZACION', 'purple'], ['SIN COTIZACION', 'purple'],
    ['INCOMPLETO', 'red'],
    ['CARGADO', 'emerald']
  ])('%s -> %s', (estado, tono) => {
    const { badge, punto } = coloresEstadoGestion(estado);
    expect(punto).toBe(`bg-${tono}-500`);
    expect(badge).toContain(`bg-${tono}-50`);
    expect(badge).toContain(`text-${tono}-800`);
    expect(badge).toContain(`border-${tono}-200`);
    expect(badge).toContain(`dark:text-${tono}-300`);
  });

  it('no distingue mayúsculas ni espacios', () => {
    expect(coloresEstadoGestion(' cargado ').punto).toBe('bg-emerald-500');
    expect(normalizarEstadoGestion(' s/cotizacion ')).toBe('S/COTIZACION');
  });

  it('estado desconocido o vacío se muestra en gris', () => {
    expect(coloresEstadoGestion('OTRO').punto).toBe('bg-gray-400');
    expect(coloresEstadoGestion('').punto).toBe('bg-gray-400');
    expect(coloresEstadoGestion(undefined).punto).toBe('bg-gray-400');
  });
});
