// @vitest-environment jsdom
// Listado de Flexibles: vista inicial (Armado y En tránsito), filtro de estado
// con los cerrados como historial, "Con reposición pendiente", vínculo del
// rearmado, relectura al volver a la pestaña y al abrir un kit.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';

const h = vi.hoisted(() => ({ kits: [], leerKits: null, leerKit: null }));
vi.mock('../../../../context/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('../../../../context/UserContext', () => ({ useUser: () => ({ userData: { uid: 'u' } }) }));
vi.mock('../../../../hooks/useGranularPermission', () => ({ useGranularPermission: () => ({ hasPermission: () => true }) }));
vi.mock('../../../../hooks/useColumnasPermitidas', () => ({ useColumnasPermitidas: (_r, _s, cols) => ({ columnasVisibles: cols, ver: () => true }) }));
vi.mock('../../../../hooks/useColumnResize', () => ({ useColumnResize: (cols) => ({ anchos: Object.fromEntries(cols.map((c) => [c.key, c.ancho])), handleResize: () => {}, restablecerAnchos: () => {}, personalizados: false }) }));
vi.mock('./useConfiguracionKits', () => ({ useConfiguracionKits: () => ({ config: { modelos: [{ referencia: 'KFH', nombre: 'Kit Flexible Hombre', genero: 'HOMBRE', vaina: 'NORMAL', activo: true }], componentes: [] }, cargando: false }) }));
vi.mock('./kitsApi', () => ({ leerKits: (...a) => h.leerKits(...a), leerKit: (...a) => h.leerKit(...a) }));
vi.mock('./DetalleKit', () => ({ default: ({ kit }) => <div aria-label="Detalle">{kit.codigo} {kit.estado}</div> }));
vi.mock('./FormKitModal', () => ({ default: () => null }));
vi.mock('../../bodega/shared/bodegaApi', () => ({ mensajeError: (e) => e.message }));

import PantallaKits from './PantallaKits';
import { avisosKit, textoFiltroEstado } from './listadoKits';

const kit = (codigo, estado, extra = {}) => ({ id: codigo, codigo, estado, referencia: 'KFH', modeloNombre: 'Kit Flexible Hombre', cantidadLineas: 1, totalUnidades: 2, lineas: [], ...extra });
const llamada = (n = -1) => h.leerKits.mock.calls.at(n)[0];
const abrirFiltro = () => fireEvent.click(screen.getByLabelText('Filtrar por estado'));

beforeEach(() => {
  h.kits = [kit('F002', 'ARMADO'), kit('F001', 'EN_TRANSITO')];
  h.leerKits = vi.fn(async ({ estados, pendiente }) => ({ kits: h.kits.filter((k) => (pendiente ? k.reposicionPendiente : estados.includes(k.estado))), cursor: null, hayMas: false }));
  h.leerKit = vi.fn(async (id) => h.kits.find((k) => k.id === id) || null);
});
afterEach(cleanup);

describe('Flexibles: filtro de estado', () => {
  it('la vista inicial muestra solo Armado y En tránsito', async () => {
    render(<PantallaKits familia="FLEXIBLE" />);
    await screen.findByText('F002');
    expect(llamada()).toMatchObject({ familia: 'FLEXIBLE', estados: ['ARMADO', 'EN_TRANSITO'], pendiente: false });
    // F001 despachado se ve "En tránsito" en el listado.
    expect(screen.getByText('F001').closest('tr').textContent).toContain('En tránsito');
    expect(screen.getByLabelText('Filtrar por estado').textContent).toContain('Armado, En tránsito');
  });

  it('el filtro muestra los kits Entregado y Entregado parcial (historial)', async () => {
    h.kits.push(kit('F003', 'ENTREGADO'), kit('F004', 'ENTREGADO_PARCIAL', { rearmadoEn: { id: 'F005', codigo: 'F005' } }));
    render(<PantallaKits familia="FLEXIBLE" />);
    await screen.findByText('F002');
    expect(screen.queryByText('F003')).toBeNull();
    abrirFiltro();
    fireEvent.click(screen.getByLabelText('Entregado'));
    fireEvent.click(screen.getByLabelText('Entregado parcial'));
    await screen.findByText('F004');
    expect(llamada().estados.sort()).toEqual(['ARMADO', 'ENTREGADO', 'ENTREGADO_PARCIAL', 'EN_TRANSITO']);
    expect(screen.getByText('F003')).toBeTruthy();
    expect(screen.getByText('Rearmado en F005')).toBeTruthy();
    // Volver a la vista por defecto.
    fireEvent.click(screen.getByText('Volver a Armado y En tránsito'));
    await waitFor(() => expect(screen.queryByText('F003')).toBeNull());
  });

  it('"Con reposición pendiente" consulta solo esos kits', async () => {
    h.kits.push(kit('F003', 'ENTREGADO', { reposicionPendiente: true, lineas: [{ cantidad: 2, valor: 10, usado: 2, repuesto: 0 }] }));
    render(<PantallaKits familia="FLEXIBLE" />);
    await screen.findByText('F002');
    abrirFiltro();
    fireEvent.click(screen.getByLabelText('Con reposición pendiente'));
    await screen.findByText('F003');
    expect(llamada()).toMatchObject({ pendiente: true });
    expect(screen.queryByText('F002')).toBeNull();
    expect(screen.getByText('Reposición pendiente: 2')).toBeTruthy();
  });

  it('se combina con la referencia: el filtro de estado se mantiene al elegir KFH', async () => {
    render(<PantallaKits familia="FLEXIBLE" />);
    await screen.findByText('F002');
    fireEvent.change(screen.getByLabelText('Filtrar por referencia'), { target: { value: 'KFH' } });
    await waitFor(() => expect(llamada()).toMatchObject({ tipo: 'HOMBRE_NORMAL', estados: ['ARMADO', 'EN_TRANSITO'] }));
  });

  it('sin ningún estado marcado no consulta y lo avisa', async () => {
    render(<PantallaKits familia="FLEXIBLE" />);
    await screen.findByText('F002');
    const n = h.leerKits.mock.calls.length;
    abrirFiltro();
    fireEvent.click(screen.getByLabelText('Armado'));
    fireEvent.click(screen.getByLabelText('En tránsito'));
    await screen.findByText('Elige al menos un estado en el filtro.');
    expect(h.leerKits.mock.calls.length).toBe(n + 1);
  });
});

describe('Flexibles: datos al día', () => {
  it('al abrir un kit se relee (muestra el estado actual, no el del listado)', async () => {
    render(<PantallaKits familia="FLEXIBLE" />);
    await screen.findByText('F002');
    h.kits[0] = { ...h.kits[0], estado: 'EN_TRANSITO' };
    fireEvent.click(screen.getByText('F002'));
    await waitFor(() => expect(within(screen.getByLabelText('Detalle')).getByText(/EN_TRANSITO/)).toBeTruthy());
    expect(h.leerKit).toHaveBeenCalledWith('F002');
  });

  it('al volver a la pestaña relee el listado', async () => {
    render(<PantallaKits familia="FLEXIBLE" />);
    await screen.findByText('F002');
    const n = h.leerKits.mock.calls.length;
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    await waitFor(() => expect(h.leerKits.mock.calls.length).toBe(n + 1));
  });
});

describe('listado: textos y avisos', () => {
  it('texto del filtro', () => {
    expect(textoFiltroEstado(['ARMADO', 'EN_TRANSITO'], false)).toBe('Armado, En tránsito');
    expect(textoFiltroEstado(['ENTREGADO_PARCIAL', 'ARMADO', 'EN_TRANSITO', 'ENTREGADO'], false)).toBe('Todos los estados');
    expect(textoFiltroEstado([], true)).toBe('Con reposición pendiente');
  });
  it('el enlace entre el kit rearmado y el original', () => {
    expect(avisosKit(kit('F001', 'ENTREGADO_PARCIAL', { rearmadoEn: { id: 'F004', codigo: 'F004' } })).map((a) => a.texto)).toContain('Rearmado en F004');
    expect(avisosKit(kit('F004', 'ARMADO', { rearmadoDe: { id: 'F001', codigo: 'F001' } })).map((a) => a.texto)).toEqual(['Rearmado de F001']);
  });
});
