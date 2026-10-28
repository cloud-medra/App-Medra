import { describe, it, expect } from 'vitest';
import { esFechaISO, aFechaISO } from './fechaISO';

describe('esFechaISO', () => {
  it('acepta AAAA-MM-DD de una fecha que existe', () => {
    expect(esFechaISO('2026-10-09')).toBe(true);
    expect(esFechaISO('2028-02-29')).toBe(true);
  });

  it('rechaza otros formatos, fechas inexistentes y valores que no son texto', () => {
    ['09/10/2026', '2026-9-1', '2026-10-09T00:00:00', '2026-02-30', '2026-13-01', '', ' 2026-10-09', null, undefined, 20261009]
      .forEach((v) => expect(esFechaISO(v)).toBe(false));
  });
});

describe('aFechaISO', () => {
  it('deja igual una fecha ISO y le quita la hora', () => {
    expect(aFechaISO('2026-10-09')).toBe('2026-10-09');
    expect(aFechaISO('2026-10-09T15:30:00.000Z')).toBe('2026-10-09');
  });

  it('lee DD/MM/AAAA como día/mes (lo que grababa el editor)', () => {
    expect(aFechaISO('09/10/2026')).toBe('2026-10-09');
    expect(aFechaISO('4/8/2026')).toBe('2026-08-04');
    expect(aFechaISO(' 27/07/2026 ')).toBe('2026-07-27');
  });

  it('devuelve vacío si no hay fecha o no es válida', () => {
    ['', null, undefined, '31/02/2026', '2026-02-30', '10-09-2026', 'hoy'].forEach((v) => expect(aFechaISO(v)).toBe(''));
  });
});
