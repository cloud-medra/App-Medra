import { describe, it, expect } from 'vitest';
import { MODULES, PALETA_MENU } from './modulesConfig.jsx';
import { GRUPOS_MENU, colorEntrada } from './gruposMenu.jsx';

const colores = new Set(Object.values(PALETA_MENU));

describe('Colores del menú (una sola definición en la configuración)', () => {
  it('cada módulo con ítems, cada grupo y cada ítem tiene un color de la paleta', () => {
    Object.entries(MODULES).filter(([, m]) => m.subItems).forEach(([key, m]) => {
      expect(colores.has(m.color), key).toBe(true);
      m.subItems.forEach((s) => expect(colores.has(s.color), s.path).toBe(true));
    });
    Object.entries(GRUPOS_MENU).forEach(([key, g]) => expect(colores.has(g.color), key).toBe(true));
  });

  it('los ítems seguidos de un mismo módulo no repiten color', () => {
    Object.values(MODULES).filter((m) => m.subItems).forEach((m) => {
      m.subItems.slice(1).forEach((s, i) => expect(s.color, s.path).not.toBe(m.subItems[i].color));
    });
  });

  it('colorEntrada resuelve módulos y grupos', () => {
    expect(colorEntrada('implantes')).toBe(MODULES.implantes.color);
    expect(colorEntrada('finanzas')).toBe(GRUPOS_MENU.finanzas.color);
  });
});
