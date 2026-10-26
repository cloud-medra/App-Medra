// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

vi.mock('../../../../firebaseConfig', () => ({ db: {}, storage: {} }));

const { validarArchivoFoto, calcularRecorte, TAMANO_MAXIMO_ORIGINAL_MB } = await import('./fotoPerfil');
const { default: AvatarUsuario, inicialesDe } = await import('../../../ui/AvatarUsuario');

afterEach(cleanup);

describe('foto de perfil: validación', () => {
  const archivo = (type, size = 1000) => ({ type, size });
  it('acepta JPG, PNG y WebP', () => {
    ['image/jpeg', 'image/png', 'image/webp'].forEach((t) => expect(validarArchivoFoto(archivo(t))).toBeNull());
  });
  it('rechaza otros formatos y archivos muy pesados con un mensaje claro', () => {
    expect(validarArchivoFoto(archivo('image/gif'))).toMatch(/JPG, PNG o WebP/);
    expect(validarArchivoFoto(archivo('application/pdf'))).toMatch(/JPG, PNG o WebP/);
    expect(validarArchivoFoto(archivo('image/png', (TAMANO_MAXIMO_ORIGINAL_MB + 1) * 1024 * 1024))).toMatch(/pesa más/);
    expect(validarArchivoFoto(null)).toMatch(/No se eligió/);
  });
});

describe('foto de perfil: recorte cuadrado', () => {
  it('centrado, el lado es el lado menor de la imagen', () => {
    expect(calcularRecorte({ ancho: 800, alto: 400 })).toEqual({ x: 200, y: 0, lado: 400 });
  });
  it('con zoom se achica la zona y el desplazamiento la mueve sin salirse', () => {
    expect(calcularRecorte({ ancho: 400, alto: 400 }, 2)).toEqual({ x: 100, y: 100, lado: 200 });
    expect(calcularRecorte({ ancho: 400, alto: 400 }, 2, { x: 1, y: -1 })).toEqual({ x: 200, y: 0, lado: 200 });
    expect(calcularRecorte({ ancho: 400, alto: 400 }, 2, { x: 5, y: -5 })).toEqual({ x: 200, y: 0, lado: 200 });
  });
});

describe('AvatarUsuario', () => {
  it('sin foto muestra las iniciales', () => {
    render(<AvatarUsuario nombre="Ana María Pérez" />);
    expect(screen.getByText('AM')).toBeInTheDocument();
    expect(inicialesDe('  juan  ')).toBe('J');
  });
  it('con foto muestra la imagen y, si falla, vuelven las iniciales', () => {
    render(<AvatarUsuario nombre="Ana Pérez" fotoUrl="https://x/foto.webp" />);
    const img = screen.getByAltText('Foto de Ana Pérez');
    fireEvent.error(img);
    expect(screen.getByText('AP')).toBeInTheDocument();
  });
});
