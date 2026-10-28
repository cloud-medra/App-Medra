// @vitest-environment jsdom
// Formulario de registro de Gestión: tras registrar una gestión nueva el
// cursor queda en Nombre; si falla, en el campo con el error.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../../implantes/gestionImplantes/components/EmpresaSelect', () => ({ default: () => <div>empresa</div> }));
vi.mock('../estadoGestion/EstadoBadge', () => ({ default: () => null }));

const { default: GestionesForm } = await import('./GestionesForm.jsx');

afterEach(cleanup);

const formulario = (props = {}) => render(
  <GestionesForm
    formData={{ gestionId: '', nombre: '', fecha: '2026-10-28' }}
    setFormData={vi.fn()}
    handleIdChange={vi.fn()}
    cancelarEdicion={vi.fn()}
    {...props}
  />
);
const registrar = () => fireEvent.click(screen.getByRole('button', { name: /Registrar|Actualizar/ }));

describe('GestionesForm — cursor tras registrar', () => {
  it('registro nuevo con éxito: el cursor queda en Nombre', async () => {
    const handleGuardar = vi.fn(async () => ({ ok: true, nueva: true }));
    formulario({ handleGuardar });
    screen.getByLabelText('ID').focus();
    registrar();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('Nombre')));
    expect(handleGuardar).toHaveBeenCalledTimes(1);
  });

  it('duplicado: el cursor queda en ID, no en Nombre', async () => {
    formulario({ handleGuardar: vi.fn(async () => ({ ok: false, campo: 'gestionId' })) });
    registrar();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('ID')));
  });

  it('sin fecha: no guarda, marca Requerida y el cursor queda en Fecha', async () => {
    const handleGuardar = vi.fn();
    formulario({ handleGuardar, formData: { nombre: 'ANA', fecha: '' } });
    registrar();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('Fecha')));
    expect(screen.getByText('Requerida')).toBeTruthy();
    expect(handleGuardar).not.toHaveBeenCalled();
  });

  it('error que no es de un campo (ej. sin conexión): el cursor no se mueve a Nombre', async () => {
    formulario({ handleGuardar: vi.fn(async () => ({ ok: false, campo: null })) });
    screen.getByLabelText('ID').focus();
    registrar();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('ID')));
    expect(document.activeElement).not.toBe(screen.getByLabelText('Nombre'));
  });

  it('al actualizar una gestión existente no se mueve el cursor a Nombre', async () => {
    formulario({ editingId: 'x', handleGuardar: vi.fn(async () => ({ ok: true, nueva: false })) });
    screen.getByLabelText('ID').focus();
    registrar();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('ID')));
  });
});
