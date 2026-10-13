import { describe, it, expect, vi } from 'vitest';
import { enfocar, alPresionarEnter } from './foco';

describe('foco', () => {
  it('enfocar: después del render (setTimeout 0), si el campo existe', () => {
    vi.useFakeTimers();
    const focus = vi.fn();
    enfocar({ current: { focus } });
    expect(focus).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(focus).toHaveBeenCalledTimes(1);
    enfocar({ current: null });
    expect(() => vi.runAllTimers()).not.toThrow();
    vi.useRealTimers();
  });

  it('alPresionarEnter: solo Enter (no componiendo texto) ejecuta la acción, con preventDefault', () => {
    const accion = vi.fn();
    const tecla = (key, extra = {}) => ({ key, preventDefault: vi.fn(), nativeEvent: {}, ...extra });
    const enter = tecla('Enter');
    alPresionarEnter(accion)(enter);
    expect(accion).toHaveBeenCalledTimes(1);
    expect(enter.preventDefault).toHaveBeenCalled();
    alPresionarEnter(accion)(tecla('Tab'));
    alPresionarEnter(accion)(tecla('Enter', { nativeEvent: { isComposing: true } }));
    expect(accion).toHaveBeenCalledTimes(1);
  });
});
