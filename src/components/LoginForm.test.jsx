// @vitest-environment jsdom
// Login con un único campo "Usuario o correo": envía el identificador a la
// Cloud Function iniciarSesion y entra con el custom token que devuelve.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom/vitest';

const llamadas = [];
let respuesta = null; // { token } o un error
vi.mock('firebase/functions', () => ({
  httpsCallable: (_f, nombre) => async (datos) => {
    llamadas.push({ nombre, datos });
    if (respuesta instanceof Error) throw respuesta;
    return { data: respuesta };
  },
}));
const signInWithCustomToken = vi.fn(async () => ({}));
const signOut = vi.fn(async () => {});
vi.mock('firebase/auth', () => ({ signInWithCustomToken: (...a) => signInWithCustomToken(...a), signOut: (...a) => signOut(...a) }));
const authMock = { currentUser: null };
vi.mock('../firebaseConfig', () => ({ auth: authMock, functions: {} }));
let perfilError = null;
vi.mock('../context/UserContext', () => ({ useUser: () => ({ userData: null, loading: false, perfilError }) }));
vi.mock('framer-motion', () => ({ motion: { img: (props) => <img alt={props.alt} /> } }));

const { default: LoginForm } = await import('./LoginForm');

beforeEach(() => { llamadas.length = 0; signInWithCustomToken.mockClear(); });
afterEach(cleanup);

const ingresar = async (identificador, password) => {
  render(<MemoryRouter><LoginForm /></MemoryRouter>);
  fireEvent.change(screen.getByLabelText('Usuario o correo'), { target: { value: identificador } });
  fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: password } });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Ingresar/ })); });
};

describe('LoginForm: usuario o correo', () => {
  it('un solo campo de texto "Usuario o correo"', () => {
    render(<MemoryRouter><LoginForm /></MemoryRouter>);
    const campo = screen.getByLabelText('Usuario o correo');
    expect(campo).toHaveAttribute('type', 'text');
    expect(campo).toHaveAttribute('placeholder', 'Usuario o correo');
  });

  it('título de la pestaña "Iniciar sesión | Medra" y lo restaura al salir', () => {
    document.title = 'Medra Sistema Integral';
    const { unmount } = render(<MemoryRouter><LoginForm /></MemoryRouter>);
    expect(document.title).toBe('Iniciar sesión | Medra');
    unmount();
    expect(document.title).toBe('Medra Sistema Integral');
  });

  it.each(['jperez', 'ana@medra.cl'])('envía "%s" como identificador y entra con el token', async (identificador) => {
    respuesta = { token: 'tkn' };
    await ingresar(identificador, 'secreto123');
    expect(llamadas).toEqual([{ nombre: 'iniciarSesion', datos: { identificador, password: 'secreto123' } }]);
    expect(signInWithCustomToken).toHaveBeenCalledWith(expect.anything(), 'tkn');
  });

  it('credenciales incorrectas: mensaje genérico', async () => {
    respuesta = Object.assign(new Error('x'), { code: 'functions/unauthenticated' });
    await ingresar('jperez', 'malaclave');
    expect(screen.getByText('Usuario/correo o contraseña incorrectos.')).toBeInTheDocument();
    expect(signInWithCustomToken).not.toHaveBeenCalled();
  });

  it('usuario inactivo con la contraseña correcta: "deshabilitado"', async () => {
    respuesta = Object.assign(new Error('x'), { code: 'functions/permission-denied' });
    await ingresar('jperez', 'secreto123');
    expect(screen.getByText('Tu usuario está deshabilitado. Contacta al administrador.')).toBeInTheDocument();
    expect(signInWithCustomToken).not.toHaveBeenCalled();
  });

  it('bloqueo por intentos: lo informa', async () => {
    respuesta = Object.assign(new Error('x'), { code: 'functions/resource-exhausted' });
    await ingresar('jperez', 'malaclave');
    expect(screen.getByText(/Demasiados intentos fallidos/)).toBeInTheDocument();
  });

  it('sin identificador no llama a la función', async () => {
    await ingresar('   ', 'secreto123');
    expect(llamadas).toEqual([]);
    expect(screen.getByText('Ingresa tu usuario o correo')).toBeInTheDocument();
  });
});

describe('LoginForm: sesión de un usuario inactivado', () => {
  afterEach(() => { perfilError = null; authMock.currentUser = null; });

  it('cierra la sesión y avisa que está deshabilitado', async () => {
    perfilError = 'inactivo';
    authMock.currentUser = { uid: 'u1' };
    await act(async () => { render(<MemoryRouter><LoginForm /></MemoryRouter>); });
    expect(signOut).toHaveBeenCalled();
    expect(screen.getByText('Tu usuario está deshabilitado. Contacta al administrador.')).toBeInTheDocument();
  });
});
