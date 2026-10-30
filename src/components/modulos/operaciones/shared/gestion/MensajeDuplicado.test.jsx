// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

vi.mock('../../../../../firebaseConfig', () => ({ db: {} }));
const { default: MensajeDuplicado } = await import('./MensajeDuplicado');
const { confirmarRegistroDuplicado } = await import('./duplicadosGestion');

afterEach(cleanup);

const existente = { nombre: 'JOSÉ PÉREZ', fecha: '2026-10-30', empresa: 'MEDTRONIC', gestionId: '12.345.678-9', estado: 'AGENDADO' };

describe('Alerta de gestión duplicada', () => {
  it('muestra nombre, fecha, empresa, ID y estado del registro que ya existe', () => {
    render(<MensajeDuplicado duplicado={{ motivo: 'datos', existente }} />);
    expect(screen.getByText(/mismo nombre, fecha y empresa/)).toBeInTheDocument();
    ['JOSÉ PÉREZ', '30-10-2026', 'MEDTRONIC', '12.345.678-9', 'AGENDADO'].forEach((t) => expect(screen.getByText(t, { exact: false })).toBeInTheDocument());
  });

  it('sin ID no muestra la línea de ID; por ID lo dice', () => {
    render(<MensajeDuplicado duplicado={{ motivo: 'id', existente: { ...existente, gestionId: 'P', estado: undefined } }} />);
    expect(screen.getByText(/mismo ID/)).toBeInTheDocument();
    expect(screen.queryByText('ID:')).not.toBeInTheDocument();
    expect(screen.getByText('AGENDANDO', { exact: false })).toBeInTheDocument();
  });

  it('"Registrar de todas formas" resuelve true y "Cancelar" false', async () => {
    const confirmar = vi.fn((titulo, mensaje, onConfirm, opciones) => {
      expect(opciones.confirmText).toBe('Registrar de todas formas');
      expect(opciones.cancelText).toBe('Cancelar');
      onConfirm();
    });
    await expect(confirmarRegistroDuplicado(confirmar, { motivo: 'datos', existente })).resolves.toBe(true);
    const cancelar = vi.fn((titulo, mensaje, onConfirm, opciones) => opciones.onCancel());
    await expect(confirmarRegistroDuplicado(cancelar, { motivo: 'datos', existente })).resolves.toBe(false);
  });
});
