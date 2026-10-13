// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import EstadoBadge from './EstadoBadge';

describe('EstadoBadge', () => {
  it('muestra el estado con los colores de su mapa y el punto', () => {
    const { container } = render(<EstadoBadge estado="CARGADO" />);
    const badge = screen.getByTitle('CARGADO');
    expect(badge.textContent).toBe('CARGADO');
    expect(badge.className).toContain('bg-emerald-50');
    expect(badge.className).toContain('min-w-[96px]');
    expect(container.querySelector('[aria-hidden="true"]').className).toContain('bg-emerald-500');
  });

  it('respeta el texto indicado y usa gris para estados desconocidos', () => {
    render(<EstadoBadge estado={undefined} texto="P" ancho={false} />);
    const badge = screen.getByTitle('P');
    expect(badge.className).toContain('bg-gray-50');
    expect(badge.className).not.toContain('min-w-[96px]');
  });
});
