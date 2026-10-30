// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { claveFormularioVisible, leerFormularioVisible, guardarFormularioVisible, useFormularioVisible } from './formularioVisible';
import { claveFijarColumnas } from './fijarColumnas';

const simularPantalla = (escritorio) => {
  window.matchMedia = vi.fn().mockReturnValue({ matches: escritorio });
};

describe('formularioVisible', () => {
  const matchMediaOriginal = window.matchMedia;

  beforeEach(() => localStorage.clear());
  afterEach(() => { window.matchMedia = matchMediaOriginal; });

  it('sin preferencia guardada: visible en escritorio, oculto en celular', () => {
    simularPantalla(true);
    expect(renderHook(() => useFormularioVisible('implantes', 'u1')).result.current[0]).toBe(true);
    simularPantalla(false);
    expect(renderHook(() => useFormularioVisible('implantes', 'u1')).result.current[0]).toBe(false);
  });

  it('la preferencia guardada manda sobre el valor por defecto y un valor desconocido no', () => {
    const clave = claveFormularioVisible('implantes', 'u1');
    guardarFormularioVisible(clave, false);
    expect(leerFormularioVisible(clave, true)).toBe(false);
    localStorage.setItem(clave, 'basura');
    expect(leerFormularioVisible(clave, true)).toBe(true);
  });

  it('se guarda al cambiarla y se mantiene al volver a montar la pantalla', () => {
    simularPantalla(true);
    const { result, unmount } = renderHook(() => useFormularioVisible('implantes', 'u1'));
    act(() => result.current[1](false));
    expect(result.current[0]).toBe(false);
    unmount();
    expect(renderHook(() => useFormularioVisible('implantes', 'u1')).result.current[0]).toBe(false);
  });

  it('cada usuario y cada módulo tiene la suya', () => {
    simularPantalla(true);
    const { result } = renderHook(() => useFormularioVisible('implantes', 'u1'));
    act(() => result.current[1](false));
    expect(renderHook(() => useFormularioVisible('implantes', 'u2')).result.current[0]).toBe(true);
    expect(renderHook(() => useFormularioVisible('hemodinamia', 'u1')).result.current[0]).toBe(true);
  });

  it('si el uid llega después, usa la preferencia de ese usuario', () => {
    simularPantalla(true);
    guardarFormularioVisible(claveFormularioVisible('implantes', 'u1'), false);
    const { result, rerender } = renderHook(({ uid }) => useFormularioVisible('implantes', uid), { initialProps: { uid: undefined } });
    expect(result.current[0]).toBe(true);
    rerender({ uid: 'u1' });
    expect(result.current[0]).toBe(false);
  });

  it('las claves no chocan con otras preferencias del módulo', () => {
    expect(claveFormularioVisible('implantes', 'u1')).not.toBe(claveFijarColumnas('implantes'));
  });
});
