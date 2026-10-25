// @vitest-environment jsdom
// Ícono de Recordatorios en el header: badge con la cantidad (rojo si hay
// atrasadas, sin badge si no hay), lista desplegable (atrasadas primero, en
// rojo y con su fecha), Realizado, cierre con clic fuera o Esc, nunca se
// abre sola, y sin permiso no lee nada.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const onSnapshot = vi.fn(() => () => {});
vi.mock('firebase/firestore', () => ({
  onSnapshot: (...a) => onSnapshot(...a),
  // query/where dejan rastro del campo filtrado para distinguir la consulta de
  // tareas (asignados) de la de Realizados (fecha) en onSnapshot.
  collection: vi.fn(() => ({})), doc: vi.fn(), query: vi.fn((_ref, ...c) => ({ c })), where: vi.fn((campo) => ({ campo })),
  getDocs: vi.fn(), setDoc: vi.fn(), updateDoc: vi.fn(), deleteDoc: vi.fn(), addDoc: vi.fn(), serverTimestamp: vi.fn(),
}));
vi.mock('../../../../firebaseConfig', () => ({ db: {} }));
let usuario = null;
vi.mock('../../../../context/UserContext', () => ({ useUser: () => ({ userData: usuario }) }));
vi.mock('../../../../context/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));

import RecordatoriosAlarma, { RecordatoriosAlarmaVista } from './RecordatoriosAlarma';
import { INTERVALO_RELOJ_MS } from './useRecordatoriosPendientes';

beforeEach(() => { onSnapshot.mockClear(); });
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  onSnapshot.mockImplementation(() => () => {});
});

const tarea = (id, titulo) => ({ id, titulo, dias: [1], asignados: ['u1'] });
const PENDIENTES = [
  { tarea: tarea('facturas', 'Revisar facturas'), fecha: '2026-10-12', hora: '', atrasada: true },
  { tarea: { ...tarea('lab', 'Ver laboratorio'), descripcion: 'Resultados del día' }, fecha: '2026-10-13', hora: '', atrasada: false },
];
const SIN_ATRASO = [PENDIENTES[1]];
const CON_HORA = { tarea: { ...tarea('nueve', 'Cuadrar caja'), hora: '09:00' }, fecha: '2026-10-13', hora: '09:00', atrasada: false };

const alarma = () => screen.getByRole('button', { name: /^Recordatorios:/ });
const abrir = () => { fireEvent.click(alarma()); return screen.getByRole('region', { name: 'Recordatorios pendientes' }); };

describe('RecordatoriosAlarmaVista', () => {
  it('badge con la cantidad, en rojo si hay atrasadas; la lista no se abre sola', () => {
    render(<RecordatoriosAlarmaVista pendientes={PENDIENTES} onRealizado={vi.fn()} />);
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
    expect(alarma()).toHaveAccessibleName('Recordatorios: 2 pendiente(s), 1 atrasada(s)');
    expect(alarma()).toHaveAttribute('data-atrasadas');
    expect(screen.getByTestId('badge-recordatorios')).toHaveTextContent('2');
    expect(screen.getByTestId('badge-recordatorios').className).toMatch(/bg-red-700/);
  });

  it('solo tareas del día: badge en color normal', () => {
    render(<RecordatoriosAlarmaVista pendientes={SIN_ATRASO} onRealizado={vi.fn()} />);
    expect(alarma()).not.toHaveAttribute('data-atrasadas');
    expect(screen.getByTestId('badge-recordatorios').className).toMatch(/bg-amber-500/);
  });

  it('sin pendientes: ícono sin badge y "Sin tareas pendientes" al abrirla', () => {
    render(<RecordatoriosAlarmaVista pendientes={[]} onRealizado={vi.fn()} />);
    expect(screen.queryByTestId('badge-recordatorios')).not.toBeInTheDocument();
    expect(abrir()).toHaveTextContent('Sin tareas pendientes');
  });

  it('la lista muestra las atrasadas primero, en rojo y con su fecha', () => {
    render(<RecordatoriosAlarmaVista pendientes={PENDIENTES} onRealizado={vi.fn()} />);
    const lista = abrir();
    expect(within(lista).getByRole('heading')).toHaveTextContent('2 tareas pendientes');
    expect(lista).toHaveTextContent('1 atrasada: márcalas como realizadas');
    const [atrasada, deHoy] = within(lista).getAllByRole('listitem');
    expect(atrasada).toHaveTextContent('Revisar facturas');
    expect(atrasada).toHaveTextContent('Atrasada desde lunes 12-10');
    expect(atrasada).toHaveAttribute('data-atrasada');
    expect(atrasada.className).toMatch(/text-red-700/);
    expect(deHoy).toHaveTextContent('Resultados del día');
    expect(deHoy).not.toHaveAttribute('data-atrasada');
  });

  it('muestra la hora junto a la tarea', () => {
    render(<RecordatoriosAlarmaVista pendientes={[CON_HORA]} onRealizado={vi.fn()} />);
    expect(within(abrir()).getByRole('listitem')).toHaveTextContent('09:00Cuadrar caja');
  });

  it('el botón Realizado informa la tarea y su repetición', () => {
    const onRealizado = vi.fn();
    render(<RecordatoriosAlarmaVista pendientes={PENDIENTES} onRealizado={onRealizado} />);
    abrir();
    fireEvent.click(screen.getByRole('button', { name: 'Marcar "Ver laboratorio" como realizado' }));
    expect(onRealizado).toHaveBeenCalledWith({ tarea: PENDIENTES[1].tarea, fecha: '2026-10-13' });
  });

  it('se cierra con clic fuera y con Esc (no al hacer clic dentro)', () => {
    render(<div><span>afuera</span><RecordatoriosAlarmaVista pendientes={PENDIENTES} onRealizado={vi.fn()} /></div>);
    const lista = abrir();
    fireEvent.mouseDown(lista);
    expect(screen.getByRole('region')).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByText('afuera'));
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
    abrir();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
  });

  it('al marcar una tarea, badge y lista se actualizan con los nuevos pendientes', () => {
    const { rerender } = render(<RecordatoriosAlarmaVista pendientes={PENDIENTES} onRealizado={vi.fn()} />);
    abrir();
    rerender(<RecordatoriosAlarmaVista pendientes={SIN_ATRASO} onRealizado={vi.fn()} />);
    expect(screen.getByTestId('badge-recordatorios')).toHaveTextContent('1');
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(alarma()).not.toHaveAttribute('data-atrasadas');
  });
});

describe('RecordatoriosAlarma (con permisos)', () => {
  it('un usuario sin permiso no lee nada ni ve el ícono', () => {
    usuario = { uid: 'u9', rol: 'operador', permisos: { administracion: ['/administracion/notasAdmin'] }, permisosGranulares: {} };
    const { container } = render(<RecordatoriosAlarma />);
    expect(container).toBeEmptyDOMElement();
    expect(onSnapshot).not.toHaveBeenCalled();
  });

  it('con la pestaña "Mis recordatorios" escucha sus tareas y sus Realizados (2 listeners)', () => {
    usuario = {
      uid: 'u1', rol: 'operador',
      permisos: { administracion: ['/administracion/recordatorios'] },
      permisosGranulares: { '/administracion/recordatorios': {}, '/administracion/recordatorios/mis': {} },
    };
    render(<RecordatoriosAlarma />);
    expect(onSnapshot).toHaveBeenCalledTimes(2);
    expect(alarma()).toBeInTheDocument();
  });
});

describe('RecordatoriosAlarma: horario (America/Santiago)', () => {
  const RECIBE = {
    uid: 'u1', rol: 'operador',
    permisos: { administracion: ['/administracion/recordatorios'] },
    permisosGranulares: { '/administracion/recordatorios': {}, '/administracion/recordatorios/mis': {} },
  };
  // Lunes 12-10-2026: "Revisar facturas" sin hora y "Cuadrar caja" a las 09:00.
  const TAREAS = [
    { id: 'facturas', titulo: 'Revisar facturas', dias: [1], asignados: ['u1'], activa: true, desde: '2026-10-12' },
    { id: 'caja', titulo: 'Cuadrar caja', dias: [1], hora: '09:00', asignados: ['u1'], activa: true, desde: '2026-10-12' },
  ];
  const conTareas = (tareas) => onSnapshot.mockImplementation((q, ok) => {
    const esTareas = q.c?.some((w) => w?.campo === 'asignados');
    ok({ docs: esTareas ? tareas.map(({ id, ...d }) => ({ id, data: () => d })) : [] });
    return () => {};
  });

  it('la tarea con hora entra al badge desde esa hora, sin abrir la lista', () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(new Date('2026-10-12T11:59:50Z')); // 08:59:50 en Santiago
    usuario = RECIBE;
    conTareas(TAREAS);
    render(<RecordatoriosAlarma />);
    expect(screen.getByTestId('badge-recordatorios')).toHaveTextContent('1');

    act(() => { vi.advanceTimersByTime(INTERVALO_RELOJ_MS); });
    expect(screen.getByTestId('badge-recordatorios')).toHaveTextContent('2');
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
  });

  it('al día siguiente, la que no se marcó queda atrasada, en rojo y primero', () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(new Date('2026-10-13T13:00:00Z')); // martes 10:00
    usuario = RECIBE;
    conTareas([...TAREAS, { id: 'lab', titulo: 'Ver laboratorio', dias: [2], asignados: ['u1'], activa: true, desde: '2026-10-12' }]);
    render(<RecordatoriosAlarma />);
    expect(alarma()).toHaveAttribute('data-atrasadas');
    const items = within(abrir()).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent('Atrasada desde lunes 12-10');
    expect(items[1]).toHaveTextContent('Atrasada desde lunes 12-10');
    expect(items[2]).toHaveTextContent('Ver laboratorio');
    expect(items[2]).not.toHaveAttribute('data-atrasada');
  });
});
