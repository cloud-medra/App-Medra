import { describe, it, expect, vi } from 'vitest';
import { CLASE_SIN_FLECHAS, evitarFlechasTeclado, evitarRuedaMouse, SIN_CAMBIO_ACCIDENTAL } from './numeroSinFlechas';

describe('campos numéricos sin flechas', () => {
  it('oculta las flechas en Chrome/Edge y Firefox', () => {
    expect(CLASE_SIN_FLECHAS).toContain('[appearance:textfield]');
    expect(CLASE_SIN_FLECHAS).toContain('[&::-webkit-inner-spin-button]:appearance-none');
    expect(CLASE_SIN_FLECHAS).toContain('[&::-webkit-outer-spin-button]:appearance-none');
  });

  it('las flechas ↑/↓ no cambian el valor; el resto de las teclas (números, punto, borrar) sí funciona', () => {
    for (const key of ['ArrowUp', 'ArrowDown']) {
      const e = { key, preventDefault: vi.fn() };
      evitarFlechasTeclado(e);
      expect(e.preventDefault).toHaveBeenCalled();
    }
    for (const key of ['1', '.', ',', 'Backspace', 'ArrowLeft', 'Enter']) {
      const e = { key, preventDefault: vi.fn() };
      evitarFlechasTeclado(e);
      expect(e.preventDefault).not.toHaveBeenCalled();
    }
  });

  it('la rueda del mouse quita el foco del campo enfocado (así no cambia el número)', () => {
    const campo = { blur: vi.fn() };
    vi.stubGlobal('document', { activeElement: campo });
    evitarRuedaMouse({ currentTarget: campo });
    expect(campo.blur).toHaveBeenCalled();
    const otro = { blur: vi.fn() };
    evitarRuedaMouse({ currentTarget: otro });
    expect(otro.blur).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
    expect(SIN_CAMBIO_ACCIDENTAL).toEqual({ onKeyDown: evitarFlechasTeclado, onWheel: evitarRuedaMouse });
  });
});
