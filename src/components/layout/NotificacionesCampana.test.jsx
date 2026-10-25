// @vitest-environment jsdom
// Campana de notificaciones del header: por ahora sin fuente (panel vacío,
// sin contador); preparada para recibir la lista.
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import NotificacionesCampana, { NotificacionesCampanaVista } from './NotificacionesCampana';

afterEach(cleanup);

const campana = () => screen.getByRole('button', { name: 'Notificaciones' });

describe('NotificacionesCampana', () => {
  it('sin notificaciones: sin contador y panel con "No tienes notificaciones"', () => {
    render(<NotificacionesCampana />);
    expect(campana()).toHaveAttribute('title', 'Notificaciones');
    expect(screen.queryByTestId('badge-notificaciones')).toBeNull();
    fireEvent.click(campana());
    const panel = screen.getByRole('region', { name: 'Notificaciones' });
    expect(within(panel).getByText('No tienes notificaciones')).toBeInTheDocument();
  });

  it('se cierra con Esc', () => {
    render(<NotificacionesCampana />);
    fireEvent.click(campana());
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('region', { name: 'Notificaciones' })).toBeNull();
  });

  it('con una fuente conectada: lista y contador de no leídas', () => {
    render(<NotificacionesCampanaVista notificaciones={[
      { id: '1', titulo: 'Solicitud aprobada' },
      { id: '2', titulo: 'Cierre de período', detalle: 'Octubre', leida: true },
    ]} />);
    expect(screen.getByTestId('badge-notificaciones')).toHaveTextContent('1');
    fireEvent.click(campana());
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.queryByText('No tienes notificaciones')).toBeNull();
  });
});
