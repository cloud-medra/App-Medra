// @vitest-environment jsdom
// Administración → Recordatorios: pestañas por permiso, listado, crear con
// validación, editar, desactivar y borrar.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const TAREAS = [
  { id: 't1', titulo: 'Revisar facturas', descripcion: '', dias: [1], asignados: ['u1'], activa: true, desde: '2026-10-12' },
  { id: 't2', titulo: 'Ver laboratorio', descripcion: '', dias: [2], asignados: ['u2'], activa: false, desde: '2026-10-12' },
];
const USUARIOS = [
  { id: 'u1', nombreCompleto: 'ANA PEREZ', email: 'ana@x.cl', rol: 'operador', permisos: { administracion: ['/administracion/recordatorios'] }, permisosGranulares: { '/administracion/recordatorios': {}, '/administracion/recordatorios/mis': {} } },
  { id: 'u2', nombreCompleto: 'BETO SOTO', email: 'beto@x.cl', rol: 'operador', permisos: {} },
];
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})), doc: vi.fn(), query: vi.fn(() => ({})), where: vi.fn(),
  getDocs: vi.fn(async () => ({ docs: USUARIOS.map(({ id, ...d }) => ({ id, data: () => d })) })),
  onSnapshot: vi.fn((_q, ok) => { ok({ docs: TAREAS.map(({ id, ...d }) => ({ id, data: () => d })) }); return () => {}; }),
  setDoc: vi.fn(), updateDoc: vi.fn(), deleteDoc: vi.fn(), addDoc: vi.fn(), serverTimestamp: vi.fn(),
}));
vi.mock('../../../../firebaseConfig', () => ({ db: {} }));
let usuario;
vi.mock('../../../../context/UserContext', () => ({ useUser: () => ({ userData: usuario }) }));
vi.mock('../../../../context/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
const confirmAction = vi.fn((_t, _m, ok) => ok());
vi.mock('../../../../context/ModalContext', () => ({ useModal: () => ({ confirmAction }) }));
const servicio = vi.hoisted(() => ({
  crearTarea: vi.fn(async () => 'nueva'), actualizarTarea: vi.fn(async () => {}),
  cambiarActivaTarea: vi.fn(async () => {}), borrarTarea: vi.fn(async () => {}),
}));
vi.mock('./recordatoriosServicio', async (importOriginal) => ({ ...(await importOriginal()), ...servicio }));

import Recordatorios from './Recordatorios';

beforeEach(() => {
  usuario = { uid: 'adm', rol: 'dev', nombreCompleto: 'ADMIN' };
  Object.values(servicio).forEach((f) => f.mockClear());
});
afterEach(cleanup);

describe('Recordatorios', () => {
  it('el Desarrollador ve las dos pestañas y el listado (desactivadas al final)', async () => {
    render(<Recordatorios />);
    expect(screen.getByRole('button', { name: 'Administrar tareas' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mis recordatorios' })).toBeInTheDocument();
    const items = await screen.findAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Revisar facturas');
    expect(items[1]).toHaveTextContent('Desactivado');
    await waitFor(() => expect(items[0]).toHaveTextContent('Lunes · ANA PEREZ'));
  });

  it('crear: valida y guarda título, días y usuarios; avisa quién no tiene permiso', async () => {
    render(<Recordatorios />);
    fireEvent.click(screen.getByRole('button', { name: /Nuevo recordatorio/ }));
    fireEvent.click(screen.getByRole('button', { name: /Guardar/ }));
    expect(screen.getByText('Escribe un título.')).toBeInTheDocument();
    expect(servicio.crearTarea).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Ver órdenes' } });
    fireEvent.click(screen.getByRole('button', { name: 'Miércoles' }));
    const beto = (await screen.findByText('BETO SOTO')).closest('label');
    expect(beto).toHaveTextContent('Sin permiso: no lo verá');
    expect(screen.getByText('ANA PEREZ').closest('label')).not.toHaveTextContent('Sin permiso');
    fireEvent.click(within(screen.getByText('ANA PEREZ').closest('label')).getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /Guardar/ }));
    await waitFor(() => expect(servicio.crearTarea).toHaveBeenCalledWith(
      expect.anything(),
      { titulo: 'Ver órdenes', descripcion: '', dias: [3], hora: '', asignados: ['u1'] },
      expect.objectContaining({ desde: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) })
    ));
  });

  it('crear con hora opcional: varias tareas pueden tocar el mismo día, cada una con su hora', async () => {
    render(<Recordatorios />);
    fireEvent.click(screen.getByRole('button', { name: /Nuevo recordatorio/ }));
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Cuadrar caja' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lunes' }));
    fireEvent.change(screen.getByLabelText(/^Hora/), { target: { value: '09:00' } });
    fireEvent.click(within((await screen.findByText('ANA PEREZ')).closest('label')).getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /Guardar/ }));
    await waitFor(() => expect(servicio.crearTarea).toHaveBeenCalledWith(
      expect.anything(),
      { titulo: 'Cuadrar caja', descripcion: '', dias: [1], hora: '09:00', asignados: ['u1'] },
      expect.anything()
    ));
  });

  it('editar, desactivar y borrar', async () => {
    render(<Recordatorios />);
    fireEvent.click(await screen.findByRole('button', { name: 'Editar Revisar facturas' }));
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Revisar facturas y guías' } });
    fireEvent.click(screen.getByRole('button', { name: /Guardar/ }));
    await waitFor(() => expect(servicio.actualizarTarea).toHaveBeenCalledWith(expect.anything(), 't1', expect.objectContaining({ titulo: 'Revisar facturas y guías', activa: true })));

    fireEvent.click(screen.getByRole('button', { name: 'Desactivar Revisar facturas' }));
    expect(servicio.cambiarActivaTarea).toHaveBeenCalledWith(expect.anything(), 't1', false);
    fireEvent.click(screen.getByRole('button', { name: 'Activar Ver laboratorio' }));
    expect(servicio.cambiarActivaTarea).toHaveBeenCalledWith(expect.anything(), 't2', true);

    fireEvent.click(screen.getByRole('button', { name: 'Borrar Ver laboratorio' }));
    await waitFor(() => expect(servicio.borrarTarea).toHaveBeenCalledWith(expect.anything(), 't2'));
  });

  it('con solo "Mis recordatorios" no ve la administración', () => {
    usuario = { uid: 'u1', rol: 'operador', ...USUARIOS[0] };
    render(<Recordatorios />);
    expect(screen.queryByRole('button', { name: 'Administrar tareas' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Nuevo recordatorio/ })).not.toBeInTheDocument();
    expect(screen.getByText('Revisar facturas')).toBeInTheDocument();
  });
});
