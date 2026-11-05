// @vitest-environment jsdom
// Mi perfil: solo fechas reales; lo que no se conoce dice "Sin registro".
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

vi.mock('firebase/firestore', () => ({ serverTimestamp: vi.fn() }));
vi.mock('../../../ui/AvatarUsuario', () => ({ default: () => null }));

const { default: Perfil } = await import('./Perfil');

afterEach(cleanup);

describe('Perfil', () => {
  it('sin datos muestra "Sin registro" en ambas fechas', () => {
    render(<Perfil userData={{ nombreCompleto: 'Ana' }} />);
    expect(screen.getByText(/Último cambio de contraseña: Sin registro\./)).toBeTruthy();
    expect(screen.getByText('Sin registro')).toBeTruthy(); // Miembro desde
    expect(document.body.textContent).not.toMatch(/3 meses|15 de Mayo/);
  });

  it('muestra la fecha guardada en hora de Chile', () => {
    const passwordCambiadaEl = { toDate: () => new Date('2026-11-05T11:30:00Z') };
    render(<Perfil userData={{ nombreCompleto: 'Ana', passwordCambiadaEl }} />);
    expect(screen.getByText(/Último cambio de contraseña: 05-11-2026 08:30\./)).toBeTruthy();
  });
});
