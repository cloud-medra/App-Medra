// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { abreDetalleConUnToque, esToqueEnControl, SIN_HOVER } from './aperturaDetalle';

// Simula la pantalla: ancho de escritorio (>= 768px) y si tiene mouse.
const simular = ({ escritorio, conMouse }) => {
  window.matchMedia = vi.fn((consulta) => ({ matches: consulta === SIN_HOVER ? !conMouse : escritorio }));
};

describe('aperturaDetalle', () => {
  const matchMediaOriginal = window.matchMedia;
  afterEach(() => { window.matchMedia = matchMediaOriginal; });

  it('escritorio con mouse: solo doble clic', () => {
    simular({ escritorio: true, conMouse: true });
    expect(abreDetalleConUnToque()).toBe(false);
  });

  it('celular: un toque abre el detalle', () => {
    simular({ escritorio: false, conMouse: false });
    expect(abreDetalleConUnToque()).toBe(true);
  });

  it('tablet ancha sin mouse: un toque abre el detalle', () => {
    simular({ escritorio: true, conMouse: false });
    expect(abreDetalleConUnToque()).toBe(true);
  });

  it('sin matchMedia se comporta como escritorio', () => {
    window.matchMedia = undefined;
    expect(abreDetalleConUnToque()).toBe(false);
  });

  it('un toque en un botón o campo de la fila no cuenta', () => {
    document.body.innerHTML = '<table><tr><td id="celda"><span id="texto">x</span><button><svg id="icono"></svg></button></td></tr></table>';
    expect(esToqueEnControl(document.getElementById('texto'))).toBe(false);
    expect(esToqueEnControl(document.getElementById('celda'))).toBe(false);
    expect(esToqueEnControl(document.getElementById('icono'))).toBe(true);
    expect(esToqueEnControl(null)).toBe(false);
  });
});
