// @vitest-environment jsdom
// Ajustes → Datos: nombre completo, nombre de usuario y correo no se editan
// directamente; se pide el cambio (solicitud que aprueba el administrador).
// El correo aprobado se confirma con verifyBeforeUpdateEmail, solo con la
// dirección aprobada.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const verifyBeforeUpdateEmail = vi.fn(async () => {});
vi.mock('firebase/auth', () => ({ verifyBeforeUpdateEmail: (...a) => verifyBeforeUpdateEmail(...a) }));
const usuarioAuth = { uid: 'u1', email: 'ana@medra.cl', reload: vi.fn(async () => {}) };
vi.mock('../../../../../firebaseConfig', () => ({ db: {}, functions: {}, auth: { currentUser: usuarioAuth } }));
const showToast = vi.fn();
vi.mock('../../../../../context/ToastContext', () => ({ useToast: () => ({ showToast }) }));
const setUserData = vi.fn();
vi.mock('../../../../../context/UserContext', () => ({
  useUser: () => ({ userData: { uid: 'u1', nombreCompleto: 'Ana Pérez', nombreUsuario: 'aperez', email: 'ana@medra.cl' }, setUserData }),
}));
let solicitudes = [];
const llamadas = [];
vi.mock('../../../administracion/alertas/solicitudesServicio', async (original) => ({
  ...(await original()),
  useMisSolicitudes: () => ({ datos: solicitudes, cargando: false }),
  crearSolicitud: async (d) => { llamadas.push(['crearSolicitud', d]); return { id: 's1' }; },
  cancelarSolicitud: async (d) => { llamadas.push(['cancelarSolicitud', d]); return { estado: 'cancelada' }; },
  sincronizarMiCorreo: async () => { llamadas.push(['sincronizarMiCorreo']); return { resultado: 'aplicada' }; },
}));

const { default: DatosUsuarios } = await import('./DatosUsuarios');

beforeEach(() => { verifyBeforeUpdateEmail.mockClear(); showToast.mockClear(); llamadas.length = 0; solicitudes = []; usuarioAuth.email = 'ana@medra.cl'; });
afterEach(cleanup);

const solicitar = async (label, valor, motivo) => {
  const fila = screen.getByText(label).parentElement;
  fireEvent.click(within(fila).getByRole('button', { name: 'Solicitar cambio' }));
  fireEvent.change(screen.getByLabelText('Nuevo valor'), { target: { value: valor } });
  fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: motivo } });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Enviar solicitud/ })); });
};

describe('Ajustes → Datos: cambios por solicitud', () => {
  it('ningún dato se edita directamente', () => {
    render(<DatosUsuarios />);
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
    expect(screen.getAllByRole('button', { name: 'Solicitar cambio' })).toHaveLength(3);
  });

  it('envía la solicitud con tipo, valor y motivo', async () => {
    render(<DatosUsuarios />);
    await solicitar('Nombre de usuario', ' anaperez ', 'Me casé');
    expect(llamadas).toEqual([['crearSolicitud', { tipo: 'nombreUsuario', valorSolicitado: 'anaperez', motivo: 'Me casé' }]]);
    expect(showToast).toHaveBeenCalledWith('Solicitud enviada. La revisará tu administrador.', 'success');
  });

  it('valida antes de enviar: formato, motivo y que sea distinto', async () => {
    render(<DatosUsuarios />);
    await solicitar('Nombre de usuario', 'ana@x', '');
    expect(llamadas).toEqual([]);
    expect(screen.getByText('El nombre de usuario no puede contener "@".')).toBeInTheDocument();
    expect(screen.getByText('Indica el motivo del cambio.')).toBeInTheDocument();
    cleanup();
    render(<DatosUsuarios />);
    await solicitar('Correo', 'ANA@medra.cl', 'x');
    expect(screen.getByText('Es igual al valor actual.')).toBeInTheDocument();
  });

  it('con una solicitud en curso no se puede pedir otra del mismo dato; se puede cancelar', async () => {
    solicitudes = [{ id: 's1', tipo: 'nombreCompleto', estado: 'pendiente', valorActual: 'Ana Pérez', valorSolicitado: 'Ana P.' }];
    render(<DatosUsuarios />);
    expect(screen.getByText('Solicitud en curso')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Solicitar cambio' })).toHaveLength(2);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Cancelar solicitud/ })); });
    expect(llamadas).toEqual([['cancelarSolicitud', { id: 's1' }]]);
  });

  it('correo aprobado: "confirma desde tu nuevo correo" y envía la confirmación solo a la dirección aprobada', async () => {
    solicitudes = [{ id: 's2', tipo: 'email', estado: 'aprobada', valorActual: 'ana@medra.cl', valorSolicitado: 'ana@nuevo.cl' }];
    render(<DatosUsuarios />);
    expect(screen.getByText('Aprobada, confirma desde tu nuevo correo')).toBeInTheDocument();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Enviar correo de confirmación/ })); });
    expect(verifyBeforeUpdateEmail).toHaveBeenCalledWith(usuarioAuth, 'ana@nuevo.cl');
    expect(showToast).toHaveBeenCalledWith('Te enviamos un correo de confirmación a la nueva dirección.', 'success');
  });

  it('correo aprobado y ya confirmado: lo aplica al perfil', async () => {
    usuarioAuth.email = 'ana@nuevo.cl';
    solicitudes = [{ id: 's3', tipo: 'email', estado: 'aprobada', valorActual: 'ana@medra.cl', valorSolicitado: 'ana@nuevo.cl' }];
    await act(async () => { render(<DatosUsuarios />); });
    expect(llamadas).toEqual([['sincronizarMiCorreo']]);
    expect(showToast).toHaveBeenCalledWith('Tu correo se actualizó.', 'success');
  });
});
