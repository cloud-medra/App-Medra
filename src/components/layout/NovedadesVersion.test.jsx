// @vitest-environment jsdom
// Versión del sidebar y ventana de novedades de la última versión.
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import NovedadesVersion from './NovedadesVersion';
import { ULTIMA_VERSION, VERSION_APP } from '../../config/versionApp';

describe('NovedadesVersion', () => {
  afterEach(cleanup);

  it('muestra la versión y, con el ícono, los cambios de la última versión', () => {
    render(<NovedadesVersion />);
    expect(screen.getByText(`v${VERSION_APP}`)).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: `Ver cambios de la versión ${VERSION_APP}` }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    ULTIMA_VERSION.cambios.forEach((c) => expect(screen.getByText(c)).toBeInTheDocument());

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('colapsado: la versión abre la ventana y el botón Cerrar la cierra', () => {
    render(<NovedadesVersion colapsado />);
    fireEvent.click(screen.getByText(`v${VERSION_APP}`));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
