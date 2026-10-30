// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { claveFijarColumnas, leerFijarColumnas, guardarFijarColumnas, useFijarColumnas } from './fijarColumnas';

const simularPantalla = (escritorio) => {
  window.matchMedia = vi.fn().mockReturnValue({ matches: escritorio });
};

describe('fijarColumnas', () => {
  const clave = claveFijarColumnas('implantes');
  const matchMediaOriginal = window.matchMedia;

  beforeEach(() => localStorage.clear());
  afterEach(() => { window.matchMedia = matchMediaOriginal; });

  it('sin preferencia guardada usa el valor por defecto', () => {
    expect(leerFijarColumnas(clave, true)).toBe(true);
    expect(leerFijarColumnas(clave, false)).toBe(false);
  });

  it('la preferencia guardada manda sobre el valor por defecto', () => {
    guardarFijarColumnas(clave, false);
    expect(leerFijarColumnas(clave, true)).toBe(false);
    guardarFijarColumnas(clave, true);
    expect(leerFijarColumnas(clave, false)).toBe(true);
  });

  it('un valor desconocido cae al valor por defecto', () => {
    localStorage.setItem(clave, 'basura');
    expect(leerFijarColumnas(clave, true)).toBe(true);
  });

  it('cada módulo guarda su propia preferencia', () => {
    expect(claveFijarColumnas('implantes')).not.toBe(claveFijarColumnas('hemodinamia'));
  });

  it('por defecto: fijadas en escritorio, desfijadas en celular', () => {
    simularPantalla(true);
    expect(renderHook(() => useFijarColumnas('implantes')).result.current[0]).toBe(true);
    simularPantalla(false);
    expect(renderHook(() => useFijarColumnas('implantes')).result.current[0]).toBe(false);
  });

  it('el cambio del usuario se guarda y se mantiene al volver a montar', () => {
    simularPantalla(true);
    const { result } = renderHook(() => useFijarColumnas('implantes'));
    act(() => result.current[1](false));
    expect(result.current[0]).toBe(false);
    expect(localStorage.getItem(clave)).toBe('0');
    expect(renderHook(() => useFijarColumnas('implantes')).result.current[0]).toBe(false);
  });
});
