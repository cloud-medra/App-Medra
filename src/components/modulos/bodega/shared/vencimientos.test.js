import { describe, it, expect } from 'vitest';
import { estadoVencimiento, diasHasta } from './vencimientos';

const HOY = '2026-10-14';

describe('vencimientos', () => {
  it('días hasta la fecha', () => {
    expect(diasHasta('2026-10-15', HOY)).toBe(1);
    expect(diasHasta('2026-10-13', HOY)).toBe(-1);
    expect(diasHasta('', HOY)).toBeNull();
  });
  it('vencido, próximo (hoy cuenta como vigente) y vigente', () => {
    expect(estadoVencimiento('2026-10-13', { hoy: HOY }).nivel).toBe('vencido');
    expect(estadoVencimiento('2026-10-14', { hoy: HOY }).nivel).toBe('proximo');
    expect(estadoVencimiento('2026-12-31', { hoy: HOY, diasAviso: 30 }).nivel).toBeNull();
    expect(estadoVencimiento('2026-11-01', { hoy: HOY, diasAviso: 30 })).toMatchObject({ nivel: 'proximo', dias: 18 });
    expect(estadoVencimiento(undefined, { hoy: HOY }).nivel).toBeNull();
  });
});
