// @vitest-environment jsdom
// Módulos Visibles: el contador habilitados/total solo se renderiza para dev.
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import ModulosVisibles from './ModulosVisibles.jsx';
import { MODULES } from '../../../../../config/modulesConfig.jsx';

// Un módulo con un solo ítem habilitado, para que el contador sea "1/N".
const [moduloKey, modulo] = Object.entries(MODULES).find(([, m]) => m.subItems?.length > 1);
const permisos = { [moduloKey]: [modulo.subItems[0].path] };
const contador = `1/${modulo.subItems.length}`;

describe('ModulosVisibles: contador de ítems', () => {
  it('el desarrollador ve el contador habilitados/total', () => {
    const { container } = render(<ModulosVisibles userData={{ rol: 'dev', permisos }} />);
    expect(container.textContent).toContain(contador);
  });

  it.each(['admin', 'encargado', 'operador'])('el rol %s no recibe el contador en el DOM', (rol) => {
    const { container } = render(<ModulosVisibles userData={{ rol, permisos }} />);
    expect(container.textContent).toContain(modulo.subItems[0].label);
    expect(container.textContent).not.toContain(contador);
  });
});
