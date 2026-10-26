// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { vistaDeModulo, entradaDeVista, leerModuloDeURL, urlConModulo } from './vistaModulo';

beforeEach(() => window.history.replaceState(null, '', '/plataforma'));

describe('vista de acceso rápido de un módulo', () => {
  it('vista <-> entrada', () => {
    expect(entradaDeVista(vistaDeModulo('implantes'))).toBe('implantes');
    expect(entradaDeVista('/implantes/gestionImplantes')).toBeNull();
    expect(entradaDeVista('dashboard')).toBeNull();
    expect(entradaDeVista(null)).toBeNull();
  });

  it('pone y quita ?modulo= conservando los demás parámetros', () => {
    window.history.replaceState(null, '', '/plataforma?vista=%2Fimplantes%2FreportesInfo&detalle=200');
    const con = urlConModulo('finanzas');
    expect(con).toContain('modulo=finanzas');
    expect(con).toContain('detalle=200');
    window.history.replaceState(null, '', con);
    expect(leerModuloDeURL()).toBe('finanzas');
    const sin = urlConModulo(null);
    expect(sin).not.toContain('modulo=');
    expect(sin).toContain('detalle=200');
  });

  it('sin parámetro no hay módulo', () => {
    expect(leerModuloDeURL()).toBeNull();
  });
});
