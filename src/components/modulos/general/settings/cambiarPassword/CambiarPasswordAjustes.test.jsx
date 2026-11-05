// @vitest-environment jsdom
// Cambio de contraseña de Ajustes (también lo abre el menú del header): guarda
// la fecha solo si la contraseña cambió, y un fallo al guardarla no se
// presenta como fallo del cambio.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, cleanup, waitFor } from '@testing-library/react';

const reautenticar = vi.fn(async () => {});
const cambiar = vi.fn(async () => {});
const updateDoc = vi.fn(async () => {});
const showToast = vi.fn();
vi.mock('firebase/auth', () => ({
  EmailAuthProvider: { credential: (email, password) => ({ email, password }) },
  reauthenticateWithCredential: (...a) => reautenticar(...a),
  updatePassword: (...a) => cambiar(...a),
}));
vi.mock('firebase/firestore', () => ({
  doc: (_db, ...ruta) => ruta.join('/'),
  updateDoc: (...a) => updateDoc(...a),
  serverTimestamp: () => 'AHORA',
}));
vi.mock('../../../../../firebaseConfig', () => ({ db: {}, auth: { currentUser: { uid: 'u1', email: 'ana@medra.cl' } } }));
vi.mock('../../../../../context/ToastContext', () => ({ useToast: () => ({ showToast }) }));
vi.mock('../../../../ui/Spinner', () => ({ default: () => null }));

const { default: CambiarPasswordAjustes } = await import('./CambiarPasswordAjustes');

afterEach(() => { cleanup(); vi.clearAllMocks(); });

const enviar = () => {
  const { container } = render(<CambiarPasswordAjustes />);
  const campos = container.querySelectorAll('input[type="password"]');
  fireEvent.change(campos[0], { target: { value: 'Actual123' } });
  fireEvent.change(campos[1], { target: { value: 'Nueva1234' } });
  fireEvent.change(campos[2], { target: { value: 'Nueva1234' } });
  const boton = [...container.querySelectorAll('button')].at(-1);
  fireEvent.click(boton);
};

describe('CambiarPasswordAjustes', () => {
  it('cambia la contraseña en Auth y después guarda la fecha', async () => {
    enviar();
    await waitFor(() => expect(updateDoc).toHaveBeenCalledTimes(1));
    expect(reautenticar.mock.calls[0][1]).toEqual({ email: 'ana@medra.cl', password: 'Actual123' });
    expect(cambiar.mock.calls[0][1]).toBe('Nueva1234');
    expect(updateDoc).toHaveBeenCalledWith('usuarios/u1', { passwordCambiadaEl: 'AHORA' });
    expect(cambiar.mock.invocationCallOrder[0]).toBeLessThan(updateDoc.mock.invocationCallOrder[0]);
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('Contraseña actualizada correctamente', 'success'));
  });

  it('si la contraseña no cambia, no guarda fecha', async () => {
    reautenticar.mockRejectedValueOnce(Object.assign(new Error('x'), { code: 'auth/wrong-password' }));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    enviar();
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('La contraseña actual ingresada es incorrecta.', 'error'));
    expect(cambiar).not.toHaveBeenCalled();
    expect(updateDoc).not.toHaveBeenCalled();
  });

  it('si solo falla guardar la fecha, avisa que la contraseña sí cambió', async () => {
    updateDoc.mockRejectedValueOnce(new Error('sin red'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    enviar();
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('Contraseña actualizada, pero no se pudo guardar la fecha del cambio.', 'warning'));
  });
});
