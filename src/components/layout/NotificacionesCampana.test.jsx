// @vitest-environment jsdom
// Campana de notificaciones del header: panel vacío sin contador, lista con
// contador de no leídas y clic que marca leída y abre la pantalla.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const fuente = { lista: [] };
vi.mock('./useNotificaciones', () => ({ useNotificaciones: () => fuente.lista }));
const leidas = [];
vi.mock('../modulos/administracion/alertas/solicitudesServicio', () => ({
  marcarLeida: async (id, uid) => { leidas.push([id, uid]); },
}));

const { default: NotificacionesCampana, NotificacionesCampanaVista } = await import('./NotificacionesCampana');

afterEach(() => { cleanup(); fuente.lista = []; leidas.length = 0; });

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

  it('clic en una notificación: la marca leída, cierra el panel y abre su pantalla', () => {
    fuente.lista = [
      { id: 'pendientes_zonas', titulo: '3 zonas por diagnóstico por revisar', leida: false, ruta: '/maestros/zonasDiagnostico' },
      { id: 'ticket_t1', titulo: 'Ticket nuevo TK-0001: Error', leida: true, ruta: '/administracion/tickets' },
    ];
    const onAbrir = vi.fn();
    render(<NotificacionesCampana uid="u1" onAbrir={onAbrir} />);
    expect(screen.getByTestId('badge-notificaciones')).toHaveTextContent('1');
    fireEvent.click(campana());
    fireEvent.click(screen.getByRole('button', { name: /3 zonas por diagnóstico/ }));
    expect(onAbrir).toHaveBeenCalledWith('/maestros/zonasDiagnostico');
    expect(leidas).toEqual([['pendientes_zonas', 'u1']]);
    expect(screen.queryByRole('region', { name: 'Notificaciones' })).toBeNull();
    // Una ya leída solo navega.
    fireEvent.click(campana());
    fireEvent.click(screen.getByRole('button', { name: /Ticket nuevo/ }));
    expect(onAbrir).toHaveBeenLastCalledWith('/administracion/tickets');
    expect(leidas).toHaveLength(1);
  });
});
