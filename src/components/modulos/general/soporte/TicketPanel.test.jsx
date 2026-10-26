// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const actualizarTicket = vi.fn(async () => {});
const listarMisTickets = vi.fn();
vi.mock('./ticketsServicio', () => ({
  actualizarTicket: (...a) => actualizarTicket(...a),
  listarMisTickets: (...a) => listarMisTickets(...a),
  crearTicket: vi.fn(),
  validarCaptura: () => null,
  TIPOS_CAPTURA: ['image/png'],
}));
const showToast = vi.fn();
vi.mock('../../../../context/ToastContext', () => ({ useToast: () => ({ showToast }) }));
vi.mock('../../../../context/UserContext', () => ({ useUser: () => ({ userData: { uid: 'u1', nombreCompleto: 'Ana' } }) }));

const { default: TicketPanel } = await import('./TicketPanel');
const { default: AyudaSoporte } = await import('./AyudaSoporte');

const TICKET = {
  id: 't1', numero: 7, titulo: 'No guarda la gestión', descripcion: 'Al guardar sale un error', tipo: 'ERROR',
  prioridad: 'ALTA', modulo: 'implantes', estado: 'NUEVO', mensajes: [], capturas: [],
  creadoPor: 'u1', creadoPorNombre: 'Ana', noLeidoUsuario: true, pendienteGestor: true,
  contexto: { vista: '/implantes/gestionImplantes', navegador: 'Chrome', versionApp: '1.0.0' },
};

beforeEach(() => vi.stubGlobal('requestAnimationFrame', (cb) => setTimeout(cb, 0)));
afterEach(() => { cleanup(); actualizarTicket.mockClear(); showToast.mockClear(); vi.unstubAllGlobals(); });

describe('TicketPanel', () => {
  it('el usuario lo abre: se marca como visto (sin cambiar la fecha) y puede responder', async () => {
    const onActualizado = vi.fn();
    render(<TicketPanel abierto ticket={TICKET} modo="usuario" userData={{ uid: 'u1', nombreCompleto: 'Ana' }} onCerrar={vi.fn()} onActualizado={onActualizado} />);
    await waitFor(() => expect(actualizarTicket).toHaveBeenCalledWith('t1', { noLeidoUsuario: false }, { tocarFecha: false }));
    expect(screen.getByText('TK-0007')).toBeInTheDocument();
    expect(screen.queryByText('Cambiar estado')).not.toBeInTheDocument();
    expect(screen.queryByText('Contexto técnico')).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Escribe una respuesta…'), { target: { value: 'Sigue fallando' } });
    fireEvent.click(screen.getByRole('button', { name: /Responder/ }));
    await waitFor(() => expect(actualizarTicket).toHaveBeenCalledTimes(2));
    const [, cambios] = actualizarTicket.mock.calls[1];
    expect(cambios).toMatchObject({ pendienteGestor: true, noLeidoUsuario: false });
    expect(cambios.mensajes[0]).toMatchObject({ texto: 'Sigue fallando', autorUid: 'u1', deGestor: false });
  });

  it('quien gestiona ve el contexto técnico y no puede rechazar sin motivo', async () => {
    render(<TicketPanel abierto ticket={TICKET} modo="gestor" userData={{ uid: 'g1', nombreCompleto: 'Soporte' }} onCerrar={vi.fn()} />);
    await waitFor(() => expect(actualizarTicket).toHaveBeenCalledWith('t1', { pendienteGestor: false }, { tocarFecha: false }));
    expect(screen.getByText('Contexto técnico')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Nuevo estado'), { target: { value: 'RECHAZADO' } });
    fireEvent.click(screen.getByRole('button', { name: 'Rechazar' }));
    expect(showToast).toHaveBeenCalledWith('El motivo del rechazo es obligatorio', 'error');
    expect(actualizarTicket).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByLabelText('Motivo del rechazo'), { target: { value: 'Ya existe otro ticket' } });
    fireEvent.click(screen.getByRole('button', { name: 'Rechazar' }));
    await waitFor(() => expect(actualizarTicket).toHaveBeenCalledTimes(2));
    expect(actualizarTicket.mock.calls[1][1]).toMatchObject({ estado: 'RECHAZADO', noLeidoUsuario: true });
  });
});

describe('AyudaSoporte (Mis tickets)', () => {
  it('lista mis tickets (una página) con la marca de novedad', async () => {
    listarMisTickets.mockResolvedValue({ tickets: [TICKET], cursor: null, hayMas: false });
    render(<AyudaSoporte />);
    await waitFor(() => expect(screen.getByText('No guarda la gestión')).toBeInTheDocument());
    expect(listarMisTickets).toHaveBeenCalledWith('u1', null);
    expect(screen.getByTitle('Tiene una respuesta o un cambio de estado sin ver')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Cargar más/ })).not.toBeInTheDocument();
  });
});
