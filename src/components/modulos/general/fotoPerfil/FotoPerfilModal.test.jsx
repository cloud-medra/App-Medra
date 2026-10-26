// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const quitarFotoPerfil = vi.fn(async () => {});
vi.mock('./fotoPerfil', async (importOriginal) => ({
  ...(await importOriginal()),
  quitarFotoPerfil: (...a) => quitarFotoPerfil(...a),
}));
vi.mock('../../../../firebaseConfig', () => ({ db: {}, storage: {} }));
vi.mock('../../../../context/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));

const { default: FotoPerfilModal } = await import('./FotoPerfilModal');

afterEach(() => { cleanup(); quitarFotoPerfil.mockClear(); });

describe('FotoPerfilModal', () => {
  it('sin foto ofrece subirla y muestra las iniciales', () => {
    render(<FotoPerfilModal abierto onCerrar={vi.fn()} userData={{ uid: 'u1', nombreCompleto: 'Ana Pérez' }} />);
    expect(screen.getByText('AP')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Subir foto/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Quitar foto/ })).not.toBeInTheDocument();
  });

  it('con foto permite quitarla (vuelven las iniciales) borrando la anterior', async () => {
    const onCerrar = vi.fn();
    const userData = { uid: 'u1', nombreCompleto: 'Ana Pérez', fotoPerfilUrl: 'https://x/f.webp', fotoPerfilPath: 'fotos_perfil/u1/foto_1.webp' };
    render(<FotoPerfilModal abierto onCerrar={onCerrar} userData={userData} />);
    fireEvent.click(screen.getByRole('button', { name: /Quitar foto/ }));
    await waitFor(() => expect(quitarFotoPerfil).toHaveBeenCalledWith('u1', 'fotos_perfil/u1/foto_1.webp'));
    await waitFor(() => expect(onCerrar).toHaveBeenCalled());
  });

  it('rechaza un formato no permitido con un mensaje claro', () => {
    const { container } = render(<FotoPerfilModal abierto onCerrar={vi.fn()} userData={{ uid: 'u1' }} />);
    const input = container.querySelector('input[type="file"]');
    fireEvent.change(input, { target: { files: [new File(['x'], 'a.gif', { type: 'image/gif' })] } });
    return waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/JPG, PNG o WebP/));
  });
});
