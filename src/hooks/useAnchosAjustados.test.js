import { describe, it, expect } from 'vitest';
import { ajustarAnchos } from './useAnchosAjustados';

const COLS = [
  { key: 'a', ancho: 200, min: 100 },
  { key: 'b', ancho: 100, min: 100 },
  { key: 'c', ancho: 300, min: 100 },
];
const DEF = { a: 200, b: 100, c: 300 };
const suma = (anchos) => Object.values(anchos).reduce((s, v) => s + v, 0);

describe('ajustarAnchos', () => {
  it('si cabe (o no se midió) deja los anchos igual', () => {
    expect(ajustarAnchos(COLS, DEF, 600)).toBe(DEF);
    expect(ajustarAnchos(COLS, DEF, 0)).toBe(DEF);
  });

  it('achica en proporción a lo que cada columna puede ceder, sin pasar el espacio', () => {
    const r = ajustarAnchos(COLS, DEF, 450); // exceso 150 sobre 300 cedibles
    expect(r).toEqual({ a: 150, b: 100, c: 200 });
    expect(suma(r)).toBeLessThanOrEqual(450);
  });

  it('respeta anchos guardados más grandes y nunca baja del mínimo', () => {
    const r = ajustarAnchos(COLS, { a: 500, b: 100, c: 300 }, 650);
    expect(suma(r)).toBeLessThanOrEqual(650);
    expect(r.a).toBeGreaterThan(r.c);
    expect(ajustarAnchos(COLS, DEF, 200)).toEqual({ a: 100, b: 100, c: 100 }); // ni con mínimos cabe: barra de respaldo
  });
});
