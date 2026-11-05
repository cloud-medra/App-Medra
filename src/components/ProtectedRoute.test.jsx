// @vitest-environment jsdom
// Cambio obligatorio de contraseña en el primer ingreso: igual para internos y
// externos, antes de llegar a su pantalla.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

let sesion = { userData: null, loading: false };
vi.mock('../context/UserContext', () => ({ useUser: () => sesion }));
vi.mock('./ui/Spinner', () => ({ default: () => <p>CARGANDO</p> }));

const { default: ProtectedRoute } = await import('./ProtectedRoute');

afterEach(cleanup);

const montar = () => render(
  <MemoryRouter initialEntries={['/plataforma']}>
    <Routes>
      <Route path="/" element={<p>LOGIN</p>} />
      <Route path="/cambiar-password" element={<p>CAMBIO OBLIGATORIO</p>} />
      <Route path="/plataforma" element={<ProtectedRoute><p>PLATAFORMA</p></ProtectedRoute>} />
    </Routes>
  </MemoryRouter>
);

describe('ProtectedRoute', () => {
  it.each([
    ['externo', { tipoUsuario: 'externo', empresaId: 'e1' }],
    ['interno', { rol: 'operador' }],
  ])('%s con passwordChanged false va al cambio obligatorio', (_n, perfil) => {
    sesion = { userData: { ...perfil, passwordChanged: false }, loading: false };
    montar();
    expect(screen.getByText('CAMBIO OBLIGATORIO')).toBeInTheDocument();
    expect(screen.queryByText('PLATAFORMA')).toBeNull();
  });

  it.each([
    ['externo', { tipoUsuario: 'externo', empresaId: 'e1' }],
    ['interno', { rol: 'operador' }],
  ])('%s con la contraseña ya cambiada entra', (_n, perfil) => {
    sesion = { userData: { ...perfil, passwordChanged: true }, loading: false };
    montar();
    expect(screen.getByText('PLATAFORMA')).toBeInTheDocument();
  });

  it('sin sesión va al login', () => {
    sesion = { userData: null, loading: false };
    montar();
    expect(screen.getByText('LOGIN')).toBeInTheDocument();
  });
});
