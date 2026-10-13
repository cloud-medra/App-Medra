// @vitest-environment jsdom
// Gestión de Hemodinamia = Gestión de Implantes: misma pantalla (formulario
// colapsable, filtros por día y estado, paginación, Sincronizar OC,
// Configuración) con lo propio de cada módulo.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

vi.mock('../../../../../hooks/useGranularPermission', () => ({ useGranularPermission: () => ({ hasPermission: () => true }) }));
vi.mock('../../../../../context/UserContext', () => ({ useUser: () => ({ userData: { rol: 'dev' } }) }));
const sincronizarPedidos = [];
vi.mock('../ocIndex/useSincronizarOC', () => ({
  useSincronizarOC: ({ modulo }) => { sincronizarPedidos.push(modulo); return { sincronizandoOC: false, handleSincronizarOC: vi.fn(), resumenOC: null, cerrarResumenOC: vi.fn() }; },
}));
vi.mock('../ocIndex/useMarcarOcPendiente', () => ({ useMarcarOcPendiente: () => ({}) }));
vi.mock('../ocIndex/SincronizarOCResumenModal', () => ({ SincronizarOCResumenModal: () => null }));
vi.mock('./GestionesForm', () => ({ default: ({ modulo }) => <div data-testid="formulario">form {modulo}</div> }));
vi.mock('./GestionesTable', () => ({ GestionesTable: ({ modulo, implantesFiltrados }) => <div data-testid="tabla">tabla {modulo} {implantesFiltrados.length}</div> }));

const { default: GestionGestiones } = await import('./GestionGestiones');
afterEach(() => { cleanup(); sincronizarPedidos.length = 0; });

const datos = {
  implantes: [], hayMasGestiones: false, cargarMasGestiones: vi.fn(), implantesFiltrados: Array(60).fill({}), implantesPagina: Array(50).fill({}),
  pagina: 1, setPagina: vi.fn(), totalPaginas: 2, formData: {}, setFormData: vi.fn(), busqueda: '', setBusqueda: vi.fn(),
  filtroAnio: '2026', setFiltroAnio: vi.fn(), filtroMes: '10', setFiltroMes: vi.fn(), filtrosDias: [], toggleFiltroDia: vi.fn(),
  limpiarFiltroDias: vi.fn(), opcionesDias: [], filtroSoloHastaHoy: true, setFiltroSoloHastaHoy: vi.fn(),
  opcionesFechas: { anios: ['2026'], meses: ['10'] }, limpiarFiltrosFecha: vi.fn(), opcionesEstados: [], filtrosEstados: [],
  toggleFiltroEstado: vi.fn(), limpiarFiltroEstados: vi.fn(), editingId: null, cargando: false, showLogDrawer: false,
  setShowLogDrawer: vi.fn(), logsList: [], loadingLogs: false, showConfigDrawer: false, setShowConfigDrawer: vi.fn(),
  importing: false,
};
const componentes = {
  useGestiones: () => datos,
  DetalleView: () => null,
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
    expect(screen.getByText('Hasta hoy')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sincronizar OC' })).toBeInTheDocument();
    expect(sincronizarPedidos.at(-1)).toBe(modulo);
    const colapsar = screen.getByRole('button', { name: 'Ocultar formulario' });
    expect(colapsar).toHaveAttribute('aria-controls', `gestion-${modulo}-formulario`);
    fireEvent.click(colapsar);
    expect(screen.getByRole('button', { name: 'Mostrar formulario' })).toBeInTheDocument();
  });
});
