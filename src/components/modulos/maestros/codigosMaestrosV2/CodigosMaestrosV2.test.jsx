// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const CODIGOS = [
  { id: 'p1', codigo: '', referencia: 'REF-P1', empresa: 'ACME', descriptorAuto: 'REF-P1 PLACA', precioNeto: 12500 },
  { id: 'c1', codigo: '1001', tieneCodigo: true, referencia: 'REF-C1', empresa: 'ACME', descriptorAuto: 'REF-C1 TORNILLO', precioNeto: 9000 }
];

const confirmAction = vi.fn();
vi.mock('../../../../hooks/useCatalogo', () => ({
  useCatalogo: (nombre) => ({ datos: nombre === 'codigos' ? CODIGOS : [{ id: 'e1', nombre: 'ACME' }], cargado: true, cargando: false })
}));
vi.mock('../../../../hooks/useGranularPermission', () => ({
  useGranularPermission: () => ({ hasPermission: () => true, hasAccesoProceso: () => true })
}));
vi.mock('../../../../context/UserContext', () => ({ useUser: () => ({ userData: { nombreCompleto: 'Test' } }) }));
vi.mock('../../../../context/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('../../../../context/ModalContext', () => ({ useModal: () => ({ confirmAction }) }));
vi.mock('firebase/firestore', () => ({ doc: vi.fn(), onSnapshot: () => () => {}, collection: vi.fn(), writeBatch: vi.fn(), serverTimestamp: vi.fn() }));
vi.mock('../../../../firebaseConfig', () => ({ db: {} }));
// La vista clásica no se prueba acá.
vi.mock('../codigosMaestros/CodigosMaestros', () => ({ default: () => <div data-testid="vista-clasica" /> }));

const { default: CodigosConSelectorVista } = await import('./CodigosConSelectorVista');

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('requestAnimationFrame', (cb) => setTimeout(cb, 0));
});
afterEach(() => { cleanup(); confirmAction.mockClear(); vi.unstubAllGlobals(); });

describe('Códigos: selector de vista', () => {
  it('por defecto muestra la vista clásica y recuerda la elección', () => {
    render(<CodigosConSelectorVista />);
    expect(screen.getByTestId('vista-clasica')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: /vista nueva/i }));
    expect(localStorage.getItem('workcraft:codigos:vista')).toBe('nueva');
    expect(screen.getByRole('heading', { name: 'Códigos maestros' })).toBeInTheDocument();
  });
});

describe('Códigos: vista nueva', () => {
  beforeEach(() => localStorage.setItem('workcraft:codigos:vista', 'nueva'));

  it('Sin código muestra solo pendientes y la columna Copiar', () => {
    render(<CodigosConSelectorVista />);
    expect(screen.getByText('REF-P1')).toBeInTheDocument();
    expect(screen.queryByText('REF-C1')).not.toBeInTheDocument();
    expect(screen.getByTitle('Copiar Desc. Auto y Precio Neto')).toBeInTheDocument();
  });

  it('el panel marca cambios sin guardar y pide confirmación al cerrar con Esc', async () => {
    vi.useFakeTimers();
    render(<CodigosConSelectorVista />);
    fireEvent.click(screen.getByRole('tab', { name: /con código/i }));
    fireEvent.click(screen.getByText('REF-C1'));
    await act(async () => { vi.runAllTimers(); });

    const precio = document.getElementById('cod-precioNeto');
    expect(precio).toHaveValue('9000');
    fireEvent.change(precio, { target: { value: '9500' } });
    expect(screen.getByText('1 cambio sin guardar')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(confirmAction).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('valida en línea los obligatorios al intentar guardar', async () => {
    vi.useFakeTimers();
    render(<CodigosConSelectorVista />);
    fireEvent.click(screen.getByRole('button', { name: /nuevo registro/i }));
    await act(async () => { vi.runAllTimers(); });
    fireEvent.keyDown(window, { key: 's', ctrlKey: true });
    expect(screen.getAllByText('Campo obligatorio').length).toBeGreaterThanOrEqual(2);
    vi.useRealTimers();
  });
});
