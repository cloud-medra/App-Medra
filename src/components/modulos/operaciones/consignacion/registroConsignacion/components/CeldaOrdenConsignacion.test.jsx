// @vitest-environment jsdom
// Celda ORDEN de Registro: la orden sincronizada desde OC es de solo
// lectura; la manual solo acepta números separados por coma.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { CeldaOrdenConsignacion } from './CeldaOrdenConsignacion';

afterEach(cleanup);
const escribir = (texto) => {
  const input = screen.getByRole('textbox', { name: 'N° Orden' });
  fireEvent.change(input, { target: { value: texto } });
  fireEvent.blur(input);
  return input;
};

describe('orden sincronizada', () => {
  it('se muestra bloqueada, sin campo editable, con el tooltip', () => {
    const onGuardar = vi.fn();
    render(<CeldaOrdenConsignacion registro={{ orden: '4500001', ordenOrigen: 'oc' }} onGuardar={onGuardar} />);
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    const celda = screen.getByLabelText('Orden 4500001, sincronizada desde OC');
    expect(celda).toHaveTextContent('4500001');
    expect(celda).toHaveAttribute('title', expect.stringMatching(/^Sincronizada desde OC/));
    expect(onGuardar).not.toHaveBeenCalled();
  });
});

describe('orden manual', () => {
  it('guarda la orden normalizada', () => {
    const onGuardar = vi.fn(() => true);
    render(<CeldaOrdenConsignacion registro={{ orden: '' }} onGuardar={onGuardar} />);
    const input = escribir('12345,12356');
    expect(onGuardar).toHaveBeenCalledWith('12345, 12356');
    expect(input).toHaveValue('12345, 12356');
  });

  it('no deja escribir letras', () => {
    render(<CeldaOrdenConsignacion registro={{ orden: '' }} onGuardar={vi.fn()} />);
    const input = screen.getByRole('textbox', { name: 'N° Orden' });
    fireEvent.change(input, { target: { value: 'OC 12a3' } });
    expect(input).toHaveValue(' 123');
  });

  it('formato inválido: avisa, no guarda y vuelve al valor guardado', () => {
    const onGuardar = vi.fn();
    const onInvalido = vi.fn();
    render(<CeldaOrdenConsignacion registro={{ orden: '777' }} onGuardar={onGuardar} onInvalido={onInvalido} />);
    const input = escribir('12345,');
    expect(onGuardar).not.toHaveBeenCalled();
    expect(onInvalido).toHaveBeenCalledWith(expect.stringMatching(/solo admite números/));
    expect(input).toHaveValue('777');
  });

  it('se puede borrar una orden manual', () => {
    const onGuardar = vi.fn(() => true);
    render(<CeldaOrdenConsignacion registro={{ orden: '777', ordenOrigen: 'manual' }} onGuardar={onGuardar} />);
    escribir('');
    expect(onGuardar).toHaveBeenCalledWith('');
  });

  it('si no se pudo guardar (p. ej. reglas), vuelve al valor guardado', async () => {
    render(<CeldaOrdenConsignacion registro={{ orden: '' }} onGuardar={vi.fn(async () => false)} />);
    const input = escribir('12345');
    await waitFor(() => expect(input).toHaveValue(''));
  });

  it('sin cambios no guarda', () => {
    const onGuardar = vi.fn();
    render(<CeldaOrdenConsignacion registro={{ orden: '12345' }} onGuardar={onGuardar} />);
    escribir(' 12345 ');
    expect(onGuardar).not.toHaveBeenCalled();
  });
});
