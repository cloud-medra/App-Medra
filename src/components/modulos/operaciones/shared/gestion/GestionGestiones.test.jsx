// @vitest-environment jsdom
// Gestión de Hemodinamia = Gestión de Implantes: misma pantalla (formulario
// colapsable, filtros por día y estado, paginación, Sincronizar OC,
// Configuración) con lo propio de cada módulo.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

vi.mock('../../../../../hooks/useGranularPermission', () => ({ useGranularPermission: () => ({ hasPermission: () => true }) }));
vi.mock('../../../../../context/UserContext', () => ({ useUser: () => ({ userData: { rol: 'dev', uid: 'u1' } }) }));
const sincronizarPedidos = [];
vi.mock('../ocIndex/useSincronizarOC', () => ({
  useSincronizarOC: ({ modulo }) => { sincronizarPedidos.push(modulo); return { sincronizandoOC: false, handleSincronizarOC: vi.fn(), resumenOC: null, cerrarResumenOC: vi.fn() }; },
}));
vi.mock('../ocIndex/useMarcarOcPendiente', () => ({ useMarcarOcPendiente: () => ({}) }));
// Listener del registro de PDF de OC: se cuenta cuántos se abren y se cierran.
const listenerPdf = { abiertos: 0, cerrados: 0 };
vi.mock('../ordenesOC/registroPdfOC', () => ({
  escucharRegistroPdfOC: (onDatos) => { listenerPdf.abiertos += 1; onDatos({}); return () => { listenerPdf.cerrados += 1; }; },
}));
vi.mock('../ocIndex/SincronizarOCResumenModal', () => ({ SincronizarOCResumenModal: () => null }));
vi.mock('./GestionesForm', () => ({ default: ({ modulo }) => <div data-testid="formulario">form {modulo}</div> }));
vi.mock('./GestionesTable', () => ({ GestionesTable: ({ modulo, implantesFiltrados, onRowDoubleClick, iniciarEdicion }) => (
  <div data-testid="tabla">tabla {modulo} {implantesFiltrados.length}<button onClick={() => onRowDoubleClick({ id: 'g1' })}>abrir detalle</button>
    <button onClick={() => iniciarEdicion({ id: 'g1' })}>editar fila</button></div>
) }));

const { default: GestionGestiones } = await import('./GestionGestiones');
afterEach(() => { cleanup(); localStorage.clear(); datos.editingId = null; sincronizarPedidos.length = 0; listenerPdf.abiertos = 0; listenerPdf.cerrados = 0; });

const datos = {
  implantes: [], hayMasGestiones: false, cargarMasGestiones: vi.fn(), implantesFiltrados: Array(60).fill({}), implantesPagina: Array(50).fill({}),
  pagina: 1, setPagina: vi.fn(), totalPaginas: 2, formData: {}, setFormData: vi.fn(), busqueda: '', setBusqueda: vi.fn(),
  filtroAnio: '2026', setFiltroAnio: vi.fn(), filtroMes: '10', setFiltroMes: vi.fn(), filtrosDias: [], toggleFiltroDia: vi.fn(),
  limpiarFiltroDias: vi.fn(), opcionesDias: [], filtroRangoFecha: 'hastaAyer', setFiltroRangoFecha: vi.fn(),
  opcionesFechas: { anios: ['2026'], meses: ['10'] }, limpiarFiltrosFecha: vi.fn(), opcionesEstados: [], filtrosEstados: [],
  toggleFiltroEstado: vi.fn(), limpiarFiltroEstados: vi.fn(), editingId: null, iniciarEdicion: vi.fn(), cargando: false, showLogDrawer: false,
  setShowLogDrawer: vi.fn(), logsList: [], loadingLogs: false, showConfigDrawer: false, setShowConfigDrawer: vi.fn(),
  importing: false,
};
const componentes = {
  useGestiones: () => datos,
  DetalleView: () => <div data-testid="detalle" />,
  DrawersOverlay: () => null,
  LogDrawer: () => null,
  ConfigDrawer: () => null,
  formatearFecha: (f) => f,
};

describe('Gestión compartida', () => {
  it.each([
    ['implantes', 'GESTIONES DE IMPLANTE'],
    ['hemodinamia', 'GESTIONES DE HEMODINAMIA'],
  ])('%s: título, formulario colapsable, filtros, paginación y Sincronizar OC', (modulo, titulo) => {
    render(<GestionGestiones modulo={modulo} componentes={componentes} />);
    expect(screen.getByText(titulo)).toBeInTheDocument();
    expect(screen.getByTestId('formulario')).toHaveTextContent(`form ${modulo}`);
    expect(screen.getByTestId('tabla')).toHaveTextContent(`tabla ${modulo} 50`);
    ['Hasta ayer', 'Hasta hoy', 'Solo hoy', 'Desde mañana', 'Todos los días'].forEach((t) => expect(screen.getByText(t)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Hasta ayer' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Sincronizar OC' })).toBeInTheDocument();
    expect(sincronizarPedidos.at(-1)).toBe(modulo);
    const colapsar = screen.getByRole('button', { name: 'Ocultar formulario' });
    expect(colapsar).toHaveAttribute('aria-controls', `gestion-${modulo}-formulario`);
    fireEvent.click(colapsar);
    expect(screen.getByRole('button', { name: 'Mostrar formulario' })).toBeInTheDocument();
  });
});

describe('Formulario oculto: preferencia guardada', () => {
  it('se recuerda al volver a la pantalla; editar lo abre solo mientras dura la edición', () => {
    const { unmount } = render(<GestionGestiones modulo="implantes" componentes={componentes} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ocultar formulario' }));
    unmount();

    const { rerender } = render(<GestionGestiones modulo="implantes" componentes={componentes} />);
    expect(screen.getByRole('button', { name: 'Mostrar formulario' })).toBeInTheDocument();

    // Editar una fila muestra el formulario sin cambiar la preferencia.
    fireEvent.click(screen.getByText('editar fila'));
    datos.editingId = 'g1';
    rerender(<GestionGestiones modulo="implantes" componentes={componentes} />);
    expect(screen.getByRole('button', { name: 'Ocultar formulario' })).toBeInTheDocument();

    // Guardar o cancelar (editingId vacío): vuelve a quedar oculto.
    datos.editingId = null;
    rerender(<GestionGestiones modulo="implantes" componentes={componentes} />);
    expect(screen.getByRole('button', { name: 'Mostrar formulario' })).toBeInTheDocument();
    expect(localStorage.getItem('medra:gestiones:implantes:u1:formularioVisible')).toBe('0');
  });
});

describe('Colores por Orden: listener del registro de PDF', () => {
  it('abre un único listener, no lo duplica al entrar y salir del detalle y lo cierra al salir de Gestiones', () => {
    const { unmount } = render(<GestionGestiones modulo="implantes" componentes={componentes} />);
    expect(listenerPdf.abiertos).toBe(1);

    fireEvent.click(screen.getByText('abrir detalle'));
    expect(screen.getByTestId('detalle')).toBeInTheDocument();
    fireEvent.click(screen.getByTitle('Volver'));
    expect(screen.getByTestId('tabla')).toBeInTheDocument();
    fireEvent.click(screen.getByText('abrir detalle'));
    fireEvent.click(screen.getByTitle('Volver'));

    expect(listenerPdf.abiertos).toBe(1);
    expect(listenerPdf.cerrados).toBe(0);
    unmount();
    expect(listenerPdf.cerrados).toBe(1);
  });
});
