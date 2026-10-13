// @vitest-environment jsdom
// Ajustes → Datos: el nombre de usuario es de solo lectura y el correo
// cambia con verifyBeforeUpdateEmail (el perfil no se toca hasta confirmar).
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const verifyBeforeUpdateEmail = vi.fn(async () => {});
vi.mock('firebase/auth', () => ({ verifyBeforeUpdateEmail: (...a) => verifyBeforeUpdateEmail(...a) }));
const updateDoc = vi.fn(async () => {});
vi.mock('firebase/firestore', () => ({ doc: vi.fn((_db, col, id) => `${col}/${id}`), updateDoc: (...a) => updateDoc(...a) }));
vi.mock('../../../../../firebaseConfig', () => ({ db: {}, auth: { currentUser: { uid: 'u1', email: 'ana@medra.cl' } } }));
const showToast = vi.fn();
vi.mock('../../../../../context/ToastContext', () => ({ useToast: () => ({ showToast }) }));
const setUserData = vi.fn();
vi.mock('../../../../../context/UserContext', () => ({
  useUser: () => ({ userData: { nombreCompleto: 'Ana Pérez', nombreUsuario: 'aperez', email: 'ana@medra.cl' }, setUserData }),
}));

const { default: DatosUsuarios } = await import('./DatosUsuarios');

beforeEach(() => { verifyBeforeUpdateEmail.mockClear(); updateDoc.mockClear(); showToast.mockClear(); });
afterEach(cleanup);

const editar = (label, valor) => {
  fireEvent.click(screen.getByTitle(`Cambiar ${label}`));
  fireEvent.change(screen.getByDisplayValue(label === 'correo' ? 'ana@medra.cl' : 'Ana Pérez'), { target: { value: valor } });
};

describe('Ajustes → Datos', () => {
  it('el nombre de usuario no se puede editar', () => {
    render(<DatosUsuarios />);
    expect(screen.getByText('aperez')).toBeInTheDocument();
    expect(screen.queryByTitle('Cambiar nombre de usuario')).not.toBeInTheDocument();
  });

  it('cambiar el correo envía la confirmación y no toca el perfil hasta confirmarla', async () => {
    render(<DatosUsuarios />);
    editar('correo', 'ana.perez@medra.cl');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Guardar cambios/ })); });
    expect(verifyBeforeUpdateEmail).toHaveBeenCalledWith(expect.objectContaining({ uid: 'u1' }), 'ana.perez@medra.cl');
    expect(updateDoc).not.toHaveBeenCalled();
    expect(setUserData).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith('Te enviamos un correo de confirmación a la nueva dirección.', 'success');
    expect(screen.getByRole('status')).toHaveTextContent('ana.perez@medra.cl');
    // Mientras tanto se sigue mostrando el correo actual.
    expect(screen.getByText('ana@medra.cl')).toBeInTheDocument();
  });

  it('cambiar solo el nombre lo guarda sin pedir confirmación de correo', async () => {
    render(<DatosUsuarios />);
    editar('nombre completo', 'Ana P. Soto');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Guardar cambios/ })); });
    expect(verifyBeforeUpdateEmail).not.toHaveBeenCalled();
    expect(updateDoc).toHaveBeenCalledWith('usuarios/u1', { nombreCompleto: 'Ana P. Soto' });
  });
});
