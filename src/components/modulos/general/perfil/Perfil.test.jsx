// @vitest-environment jsdom
// Mi perfil: solo fechas reales ("Miembro desde": creadoEl o, si no hay, la de
// Auth); lo que no se conoce dice "Sin registro". "Gestionar" abre Cambiar Contraseña.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

vi.mock('firebase/firestore', () => ({ serverTimestamp: vi.fn() }));
vi.mock('../../../ui/AvatarUsuario', () => ({ default: () => null }));
const auth = vi.hoisted(() => ({ currentUser: null }));
vi.mock('../../../../firebaseConfig', () => ({ auth }));

const { default: Perfil } = await import('./Perfil');

afterEach(() => { cleanup(); auth.currentUser = null; });

describe('Perfil', () => {
  it('sin datos muestra "Sin registro" en ambas fechas', () => {
    render(<Perfil userData={{ nombreCompleto: 'Ana' }} />);
    expect(screen.getByText(/Último cambio de contraseña: Sin registro\./)).toBeTruthy();
    expect(screen.getByText('Sin registro')).toBeTruthy(); // Miembro desde
    expect(document.body.textContent).not.toMatch(/3 meses|15 de Mayo/);
  });

  it('muestra el último cambio de contraseña en hora de Chile', () => {
    const passwordCambiadaEl = { toDate: () => new Date('2026-11-05T11:30:00Z') };
    render(<Perfil userData={{ nombreCompleto: 'Ana', passwordCambiadaEl }} />);
    expect(screen.getByText(/Último cambio de contraseña: 05-11-2026 08:30\./)).toBeTruthy();
  });

  it('Miembro desde: creadoEl tiene prioridad sobre la fecha de Auth', () => {
    auth.currentUser = { metadata: { creationTime: 'Mon, 24 Aug 2026 18:54:51 GMT' } };
    const creadoEl = { toDate: () => new Date('2026-10-13T14:01:33Z') };
    render(<Perfil userData={{ nombreCompleto: 'Ana', creadoEl }} />);
    expect(screen.getByText('13-10-2026')).toBeTruthy();
  });

  it('Miembro desde: sin creadoEl usa la creación de la cuenta en Auth', () => {
    auth.currentUser = { metadata: { creationTime: 'Mon, 24 Aug 2026 18:54:51 GMT' } };
    render(<Perfil userData={{ nombreCompleto: 'Ana' }} />);
    expect(screen.getByText('24-08-2026')).toBeTruthy();
  });

  it('"Gestionar" abre Cambiar Contraseña', () => {
    const onGestionarPassword = vi.fn();
    render(<Perfil userData={{ nombreCompleto: 'Ana' }} onGestionarPassword={onGestionarPassword} />);
    fireEvent.click(screen.getByRole('button', { name: 'Gestionar' }));
    expect(onGestionarPassword).toHaveBeenCalledTimes(1);
  });
});
