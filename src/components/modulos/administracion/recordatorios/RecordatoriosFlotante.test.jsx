// @vitest-environment jsdom
// Recuadro flotante de Recordatorios: tareas de hoy, atrasadas, Realizado,
// minimizar (ícono con el número), posición recordada por usuario, sin
// pendientes no aparece, y sin permiso no lee nada.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const onSnapshot = vi.fn(() => () => {});
vi.mock('firebase/firestore', () => ({
  onSnapshot: (...a) => onSnapshot(...a),
  collection: vi.fn(() => ({})), doc: vi.fn(), query: vi.fn(() => ({})), where: vi.fn(),
  getDocs: vi.fn(), setDoc: vi.fn(), updateDoc: vi.fn(), deleteDoc: vi.fn(), addDoc: vi.fn(), serverTimestamp: vi.fn(),
}));
vi.mock('../../../../firebaseConfig', () => ({ db: {} }));
let usuario = null;
vi.mock('../../../../context/UserContext', () => ({ useUser: () => ({ userData: usuario }) }));
vi.mock('../../../../context/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));

import RecordatoriosFlotante, { RecordatoriosFlotanteVista } from './RecordatoriosFlotante';
import { clavePosicion, claveMinimizado } from './recordatoriosConfig';

beforeEach(() => { localStorage.clear(); onSnapshot.mockClear(); });
afterEach(cleanup);

const tarea = (id, titulo) => ({ id, titulo, dias: [1], asignados: ['u1'] });
const PENDIENTES = [
  { tarea: tarea('facturas', 'Revisar facturas'), fecha: '2026-10-12', atrasada: true },
  { tarea: { ...tarea('lab', 'Ver laboratorio'), descripcion: 'Resultados del día' }, fecha: '2026-10-13', atrasada: false },
];

describe('RecordatoriosFlotanteVista', () => {
  it('muestra las tareas pendientes y marca las atrasadas', () => {
    render(<RecordatoriosFlotanteVista uid="u1" pendientes={PENDIENTES} onRealizado={vi.fn()} />);
    const caja = screen.getByRole('region', { name: 'Recordatorios de hoy' });
    expect(caja).toHaveTextContent('Recordatorios (2)');
    expect(caja).toHaveTextContent('Revisar facturas');
    expect(caja).toHaveTextContent('Atrasada · Lunes 12-10-2026');
    expect(caja).toHaveTextContent('Resultados del día');
    expect(screen.getAllByText(/Atrasada/)).toHaveLength(1);
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
    const icono = screen.getByRole('button', { name: 'Recordatorios: 2 pendiente(s). Abrir' });
    expect(icono).toHaveTextContent('2');
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
    expect(localStorage.getItem(claveMinimizado('u1'))).toBe('true');

    cleanup();
    render(<RecordatoriosFlotanteVista uid="u1" pendientes={PENDIENTES} onRealizado={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Recordatorios: 2 pendiente/ })).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('button', { name: /Recordatorios: 2 pendiente/ }), { key: 'Enter' });
    expect(screen.getByRole('region', { name: 'Recordatorios de hoy' })).toBeInTheDocument();
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
