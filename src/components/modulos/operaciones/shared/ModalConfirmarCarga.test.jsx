// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import ModalConfirmarCarga from './ModalConfirmarCarga';

const renderModal = (props = {}) => {
  const onCerrar = vi.fn();
  const onConfirmar = vi.fn();
  render(
    <ModalConfirmarCarga
      abierto
      onCerrar={onCerrar}
      onConfirmar={onConfirmar}
      cantidad={3}
      detalles={[
        { etiqueta: 'Cotización', valor: 'COT-1' },
        { etiqueta: 'Empresa', valor: 'EMPRESA X' },
        { etiqueta: 'Fecha', valor: '' }
      ]}
      notaExclusiones="ítems PAD y sin código"
      {...props}
    />
  );
  return { onCerrar, onConfirmar };
};

describe('ModalConfirmarCarga', () => {
  afterEach(cleanup);

  it('cerrado no renderiza nada', () => {
    renderModal({ abierto: false });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('diálogo accesible con resumen, contexto sin valores vacíos y notas', () => {
    renderModal();
    const dialogo = screen.getByRole('dialog', { name: 'Confirmar carga' });
    expect(dialogo).toHaveAttribute('aria-modal', 'true');
    expect(dialogo).toHaveTextContent('3ítems se marcarán como Cargado');
    expect(dialogo).toHaveTextContent('COT-1');
    expect(dialogo).toHaveTextContent('EMPRESA X');
    expect(screen.queryByText('Fecha')).not.toBeInTheDocument();
    expect(dialogo).toHaveTextContent('No se modifican: ítems PAD y sin código.');
    expect(dialogo).toHaveTextContent('Este paso aún no guarda: los cambios se guardan al presionar Guardar Todo.');
  });

  it('el foco inicial queda en Cancelar', () => {
    renderModal();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveFocus();
  });

  it('cierra con Escape, clic fuera, X y Cancelar, pero no con clic dentro', () => {
    const { onCerrar } = renderModal();
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.mouseDown(screen.getByRole('dialog').parentElement);
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onCerrar).toHaveBeenCalledTimes(4);
    fireEvent.mouseDown(screen.getByRole('dialog'));
    expect(onCerrar).toHaveBeenCalledTimes(4);
  });

  it('con una promesa en curso muestra "Procesando...", bloquea todo y no confirma dos veces', async () => {
    let terminar;
    const onConfirmar = vi.fn(() => new Promise((r) => { terminar = r; }));
    const { onCerrar } = renderModal({ onConfirmar });

    const confirmar = screen.getByRole('button', { name: 'Confirmar carga' });
    fireEvent.click(confirmar);
    fireEvent.click(confirmar);
    expect(onConfirmar).toHaveBeenCalledTimes(1);
    expect(confirmar).toHaveTextContent('Procesando...');
    expect(confirmar).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cerrar' })).toBeDisabled();

    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.mouseDown(screen.getByRole('dialog').parentElement);
    expect(onCerrar).not.toHaveBeenCalled();

    await act(async () => terminar());
    expect(confirmar).toHaveTextContent('Confirmar carga');
    expect(confirmar).toBeEnabled();
  });

  it('con una función síncrona confirma una vez', async () => {
    const { onConfirmar } = renderModal();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Confirmar carga' })));
    expect(onConfirmar).toHaveBeenCalledTimes(1);
  });
});
