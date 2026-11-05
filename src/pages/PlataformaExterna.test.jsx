// @vitest-environment jsdom
// Pantalla del externo: su empresa, el aviso si está desactivada, y Plataforma
// elige esta pantalla o Dashboard según el tipo de usuario.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

let empresa = { esExterno: true, empresaId: 'e1', nombre: 'IMH S A', activa: true, cargando: false };
let usuario = { tipoUsuario: 'externo', empresaId: 'e1', nombreCompleto: 'Beto' };
vi.mock('../context/UserContext', () => ({ useUser: () => ({ userData: usuario }) }));
vi.mock('../context/ThemeContext', () => ({ useTheme: () => ({ oscuro: false, alternarOscuro: vi.fn() }) }));
vi.mock('../hooks/useEmpresaUsuario', () => ({ useEmpresaUsuario: () => empresa }));
const cerrarSesion = vi.fn(async () => {});
vi.mock('../utils/cerrarSesion', () => ({ cerrarSesion: () => cerrarSesion() }));
vi.mock('../components/modulos/general/perfil/Perfil', () => ({ default: () => <p>PANTALLA PERFIL</p> }));
vi.mock('../components/modulos/general/settings/cambiarPassword/CambiarPasswordAjustes', () => ({ default: () => <p>PANTALLA CLAVE</p> }));
vi.mock('./Dashboard', () => ({ default: () => <p>DASHBOARD INTERNO</p> }));
vi.mock('../components/modulos/portalProveedores/ordenesCompra/OrdenesCompra', () => ({ default: () => <p>PANTALLA ORDENES</p> }));

const { default: PlataformaExterna } = await import('./PlataformaExterna');
const { default: Plataforma } = await import('./Plataforma');

afterEach(() => { cleanup(); cerrarSesion.mockClear(); });

describe('PlataformaExterna', () => {
  it('muestra su empresa y no el aviso si está activa', () => {
    empresa = { ...empresa, activa: true };
    render(<PlataformaExterna />);
    expect(screen.getByText('IMH S A')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('con la empresa desactivada avisa, y sigue pudiendo cambiar la contraseña', () => {
    empresa = { ...empresa, activa: false };
    render(<PlataformaExterna />);
    expect(screen.getByRole('alert')).toHaveTextContent('Tu empresa está desactivada. Contacta al administrador.');
    fireEvent.click(screen.getByRole('button', { name: /Cambiar contraseña/ }));
    expect(screen.getByText('PANTALLA CLAVE')).toBeInTheDocument();
  });

  it('abre Mi perfil y cierra sesión', () => {
    empresa = { ...empresa, activa: true };
    render(<PlataformaExterna />);
    fireEvent.click(screen.getByRole('button', { name: /Mi perfil/ }));
    expect(screen.getByText('PANTALLA PERFIL')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Cerrar sesión/ }));
    expect(cerrarSesion).toHaveBeenCalledTimes(1);
  });
});

describe('PlataformaExterna: Órdenes de Compra', () => {
  const RUTA = '/portalProveedores/ordenesCompra';
  afterEach(() => { usuario = { tipoUsuario: 'externo', empresaId: 'e1', nombreCompleto: 'Beto' }; empresa = { ...empresa, activa: true }; });

  it('sin el permiso no aparece', () => {
    render(<PlataformaExterna />);
    expect(screen.queryByRole('button', { name: /Órdenes de Compra/ })).toBeNull();
    expect(screen.getByText('Todavía no tienes módulos asignados.')).toBeInTheDocument();
  });

  it('con el permiso se abre', () => {
    usuario = { ...usuario, permisos: { portalProveedores: [RUTA] } };
    render(<PlataformaExterna />);
    fireEvent.click(screen.getByRole('button', { name: /Órdenes de Compra/ }));
    expect(screen.getByText('PANTALLA ORDENES')).toBeInTheDocument();
  });

  it('con la empresa desactivada no se ofrece, aunque tenga el permiso', () => {
    usuario = { ...usuario, permisos: { portalProveedores: [RUTA] } };
    empresa = { ...empresa, activa: false };
    render(<PlataformaExterna />);
    expect(screen.queryByRole('button', { name: /Órdenes de Compra/ })).toBeNull();
  });
});

describe('Plataforma', () => {
  it('un externo no carga el Dashboard interno', () => {
    usuario = { tipoUsuario: 'externo', empresaId: 'e1' };
    render(<Plataforma />);
    expect(screen.queryByText('DASHBOARD INTERNO')).toBeNull();
  });

  it.each([[{ rol: 'operador' }], [{ rol: 'dev', tipoUsuario: 'interno' }], [{}]])('un interno %j entra al Dashboard', (perfil) => {
    usuario = perfil;
    render(<Plataforma />);
    expect(screen.getByText('DASHBOARD INTERNO')).toBeInTheDocument();
  });
});
