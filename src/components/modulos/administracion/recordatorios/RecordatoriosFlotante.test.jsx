// @vitest-environment jsdom
// Recuadro flotante de Recordatorios: tareas de hoy, atrasadas en rojo
// (recuadro e ícono), hora de cada tarea, Realizado, minimizar (ícono con el
// número), se abre solo al llegar la hora de una tarea, posición recordada
// por usuario, sin pendientes no aparece, y sin permiso no lee nada.
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

import RecordatoriosFlotante, { RecordatoriosFlotanteVista } from './RecordatoriosFlotante';
import { clavePosicion, claveMinimizado, claveAbiertasPorHora } from './recordatoriosConfig';
import { INTERVALO_RELOJ_MS } from './useRecordatoriosPendientes';

beforeEach(() => { localStorage.clear(); onSnapshot.mockClear(); });
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

describe('RecordatoriosFlotanteVista', () => {
  it('encabezado con el número de pendientes; las atrasadas en rojo con la fecha en que tocaban', () => {
    render(<RecordatoriosFlotanteVista uid="u1" pendientes={PENDIENTES} onRealizado={vi.fn()} />);
    const caja = screen.getByRole('region', { name: 'Recordatorios de hoy' });
    expect(within(caja).getByRole('heading')).toHaveTextContent('2 tareas pendientes');
    expect(caja).toHaveTextContent('1 atrasada: márcalas como realizadas');
    expect(caja).toHaveTextContent('Resultados del día');
    const [atrasada, deHoy] = within(caja).getAllByRole('listitem');
    expect(atrasada).toHaveTextContent('Revisar facturas');
    expect(atrasada).toHaveTextContent('Atrasada desde lunes 12-10');
    expect(atrasada).toHaveAttribute('data-atrasada');
    expect(atrasada.className).toMatch(/text-red-700/);
    expect(deHoy).not.toHaveAttribute('data-atrasada');
    // Con atrasadas, el borde del recuadro es rojo.
    expect(caja).toHaveAttribute('data-atrasadas');
    expect(caja.className).toMatch(/border-red-500/);
  });

  it('sin atrasadas, el borde es azul y el encabezado cuenta las de hoy', () => {
    render(<RecordatoriosFlotanteVista uid="u1" pendientes={SIN_ATRASO} onRealizado={vi.fn()} />);
    const caja = screen.getByRole('region', { name: 'Recordatorios de hoy' });
    expect(within(caja).getByRole('heading')).toHaveTextContent('1 tarea pendiente');
    expect(caja).not.toHaveAttribute('data-atrasadas');
    expect(caja.className).toMatch(/border-\[#2383C2\]/);
    expect(caja).not.toHaveTextContent('Atrasada');
  });

  it('muestra la hora junto a la tarea', () => {
    render(<RecordatoriosFlotanteVista uid="u1" pendientes={[CON_HORA]} onRealizado={vi.fn()} />);
    expect(screen.getByRole('listitem')).toHaveTextContent('09:00Cuadrar caja');
  });

  it('no tiene botón para cerrar: solo minimizar', () => {
    render(<RecordatoriosFlotanteVista uid="u1" pendientes={PENDIENTES} onRealizado={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /cerrar/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Minimizar recordatorios' })).toBeInTheDocument();
  });

  it('el botón Realizado informa la tarea y su repetición', () => {
    const onRealizado = vi.fn();
    render(<RecordatoriosFlotanteVista uid="u1" pendientes={PENDIENTES} onRealizado={onRealizado} />);
    fireEvent.click(screen.getByRole('button', { name: 'Marcar "Ver laboratorio" como realizado' }));
    expect(onRealizado).toHaveBeenCalledWith({ tarea: PENDIENTES[1].tarea, fecha: '2026-10-13' });
  });

  it('sin pendientes no aparece', () => {
    const { container } = render(<RecordatoriosFlotanteVista uid="u1" pendientes={[]} onRealizado={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('se minimiza a un ícono con el número de pendientes, y lo recuerda por usuario', () => {
    render(<RecordatoriosFlotanteVista uid="u1" pendientes={PENDIENTES} onRealizado={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Minimizar recordatorios' }));
    const icono = screen.getByRole('button', { name: 'Recordatorios: 2 pendiente(s), 1 atrasada(s). Abrir' });
    expect(icono).toHaveTextContent('2');
    // Con atrasadas el ícono minimizado también es rojo.
    expect(icono).toHaveAttribute('data-atrasadas');
    expect(icono.className).toMatch(/bg-red-600/);
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
    expect(localStorage.getItem(claveMinimizado('u1'))).toBe('true');

    cleanup();
    render(<RecordatoriosFlotanteVista uid="u1" pendientes={PENDIENTES} onRealizado={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Recordatorios: 2 pendiente/ })).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('button', { name: /Recordatorios: 2 pendiente/ }), { key: 'Enter' });
    expect(screen.getByRole('region', { name: 'Recordatorios de hoy' })).toBeInTheDocument();
  });

  it('minimizado sin atrasadas, el ícono es azul', () => {
    localStorage.setItem(claveMinimizado('u1'), 'true');
    render(<RecordatoriosFlotanteVista uid="u1" pendientes={SIN_ATRASO} onRealizado={vi.fn()} />);
    const icono = screen.getByRole('button', { name: 'Recordatorios: 1 pendiente(s). Abrir' });
    expect(icono).not.toHaveAttribute('data-atrasadas');
    expect(icono.className).toMatch(/bg-\[#2383C2\]/);
  });

  it('se abre solo cuando aparece una tarea con hora, aunque esté minimizado (una sola vez)', () => {
    localStorage.setItem(claveMinimizado('u1'), 'true');
    const { rerender } = render(<RecordatoriosFlotanteVista uid="u1" pendientes={SIN_ATRASO} onRealizado={vi.fn()} />);
    expect(screen.queryByRole('region')).not.toBeInTheDocument();

    // Llega su hora: la tarea entra a la lista y el recuadro se abre.
    rerender(<RecordatoriosFlotanteVista uid="u1" pendientes={[...SIN_ATRASO, CON_HORA]} onRealizado={vi.fn()} />);
    expect(screen.getByRole('region', { name: 'Recordatorios de hoy' })).toHaveTextContent('Cuadrar caja');
    expect(localStorage.getItem(claveMinimizado('u1'))).toBe('false');

    // Si lo vuelve a minimizar, no se reabre por la misma tarea (ni al recargar).
    fireEvent.click(screen.getByRole('button', { name: 'Minimizar recordatorios' }));
    rerender(<RecordatoriosFlotanteVista uid="u1" pendientes={[...SIN_ATRASO, CON_HORA]} onRealizado={vi.fn()} />);
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
    cleanup();
    render(<RecordatoriosFlotanteVista uid="u1" pendientes={[]} onRealizado={vi.fn()} />);
    cleanup();
    render(<RecordatoriosFlotanteVista uid="u1" pendientes={[...SIN_ATRASO, CON_HORA]} onRealizado={vi.fn()} />);
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(claveAbiertasPorHora('u1')))).toEqual(['nueve_2026-10-13']);
  });

  it('usa la posición guardada del usuario, dentro de la pantalla', () => {
    localStorage.setItem(clavePosicion('u1'), JSON.stringify({ x: 120, y: 90 }));
    render(<RecordatoriosFlotanteVista uid="u1" pendientes={PENDIENTES} onRealizado={vi.fn()} />);
    const caja = screen.getByRole('region', { name: 'Recordatorios de hoy' });
    expect(caja.style.left).toBe('120px');
    expect(caja.style.top).toBe('90px');

    cleanup();
    localStorage.setItem(clavePosicion('u1'), JSON.stringify({ x: -500, y: 99999 }));
    render(<RecordatoriosFlotanteVista uid="u1" pendientes={PENDIENTES} onRealizado={vi.fn()} />);
    const fuera = screen.getByRole('region', { name: 'Recordatorios de hoy' });
    expect(fuera.style.left).toBe('8px');
    expect(Number.parseInt(fuera.style.top, 10)).toBeLessThanOrEqual(window.innerHeight);
  });
});

describe('RecordatoriosFlotante (con permisos)', () => {
  it('un usuario sin permiso no lee nada ni ve el recuadro', () => {
    usuario = { uid: 'u9', rol: 'operador', permisos: { administracion: ['/administracion/notasAdmin'] }, permisosGranulares: {} };
    const { container } = render(<RecordatoriosFlotante />);
    expect(container).toBeEmptyDOMElement();
    expect(onSnapshot).not.toHaveBeenCalled();
  });

  it('con la pestaña "Mis recordatorios" escucha sus tareas y sus Realizados', () => {
    usuario = {
      uid: 'u1', rol: 'operador',
      permisos: { administracion: ['/administracion/recordatorios'] },
      permisosGranulares: { '/administracion/recordatorios': {}, '/administracion/recordatorios/mis': {} },
    };
    render(<RecordatoriosFlotante />);
    expect(onSnapshot).toHaveBeenCalledTimes(2);
  });
});

describe('RecordatoriosFlotante: horario (America/Santiago)', () => {
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
  const conTareas = () => onSnapshot.mockImplementation((q, ok) => {
    const esTareas = q.c?.some((w) => w?.campo === 'asignados');
    ok({ docs: esTareas ? TAREAS.map(({ id, ...d }) => ({ id, data: () => d })) : [] });
    return () => {};
  });

  it('la tarea con hora aparece solo desde esa hora y el recuadro se abre solo, aunque estuviera minimizado', () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(new Date('2026-10-12T11:59:50Z')); // 08:59:50 en Santiago
    usuario = RECIBE;
    localStorage.setItem(claveMinimizado('u1'), 'true');
    conTareas();
    render(<RecordatoriosFlotante />);

    // 08:59: solo la tarea sin hora, minimizado.
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Recordatorios: 1 pendiente(s). Abrir' })).toBeInTheDocument();

    // 09:00: aparece "Cuadrar caja" y el recuadro se abre.
    act(() => { vi.advanceTimersByTime(INTERVALO_RELOJ_MS); });
    const caja = screen.getByRole('region', { name: 'Recordatorios de hoy' });
    const items = within(caja).getAllByRole('listitem');
    expect(items.map((li) => li.textContent)).toEqual([
      expect.stringContaining('Revisar facturas'),
      expect.stringContaining('09:00Cuadrar caja'),
    ]);
  });

  it('al día siguiente, la que no se marcó queda atrasada y en rojo junto a las del día', () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(new Date('2026-10-13T13:00:00Z')); // martes 10:00
    usuario = RECIBE;
    onSnapshot.mockImplementation((q, ok) => {
      const esTareas = q.c?.some((w) => w?.campo === 'asignados');
      const tareas = [...TAREAS, { id: 'lab', titulo: 'Ver laboratorio', dias: [2], asignados: ['u1'], activa: true, desde: '2026-10-12' }];
      ok({ docs: esTareas ? tareas.map(({ id, ...d }) => ({ id, data: () => d })) : [] });
      return () => {};
    });
    render(<RecordatoriosFlotante />);
    const caja = screen.getByRole('region', { name: 'Recordatorios de hoy' });
    expect(caja).toHaveAttribute('data-atrasadas');
    const items = within(caja).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent('Revisar facturas');
    expect(items[0]).toHaveTextContent('Atrasada desde lunes 12-10');
    expect(items[1]).toHaveTextContent('Cuadrar caja');
    expect(items[1]).toHaveTextContent('Atrasada desde lunes 12-10');
    expect(items[2]).toHaveTextContent('Ver laboratorio');
    expect(items[2]).not.toHaveAttribute('data-atrasada');
  });
});
