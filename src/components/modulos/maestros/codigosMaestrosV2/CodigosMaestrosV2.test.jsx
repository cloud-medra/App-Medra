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
const { default: CodigosMaestrosV2 } = await import('./CodigosMaestrosV2');

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', (cb) => setTimeout(cb, 0));
});
afterEach(() => { cleanup(); confirmAction.mockClear(); vi.unstubAllGlobals(); });

describe('Códigos', () => {
  it('monta directamente la vista (sin selector de vista)', () => {
    render(<CodigosMaestrosV2 />);
    expect(screen.getByRole('heading', { name: 'Códigos maestros' })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: /vista clásica/i })).not.toBeInTheDocument();
  });

  it('Sin código muestra solo pendientes y la columna Copiar', () => {
    render(<CodigosMaestrosV2 />);
    expect(screen.getByText('REF-P1')).toBeInTheDocument();
    expect(screen.queryByText('REF-C1')).not.toBeInTheDocument();
    expect(screen.getByTitle('Copiar Desc. Auto y Precio Neto')).toBeInTheDocument();
  });

  it('el panel se abre solo con doble clic en la fila, no con clic ni desde los íconos', async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    vi.useFakeTimers();
    render(<CodigosMaestrosV2 />);

    fireEvent.click(screen.getByText('REF-P1'));
    const copiar = screen.getByTitle('Copiar Desc. Auto y Precio Neto');
    fireEvent.click(copiar);
    fireEvent.doubleClick(copiar);
    await act(async () => { vi.advanceTimersByTime(300); });
    expect(document.getElementById('cod-codigo')).toBeNull();
    expect(writeText).toHaveBeenCalledWith('REF-P1 PLACA\t12500');

    fireEvent.doubleClick(screen.getByText('REF-P1'));
    await act(async () => { vi.advanceTimersByTime(300); });
    expect(document.getElementById('cod-codigo')).not.toBeNull();
    vi.useRealTimers();
  });

  it('el panel marca cambios sin guardar y pide confirmación al cerrar con Esc', async () => {
    vi.useFakeTimers();
    render(<CodigosMaestrosV2 />);
    fireEvent.click(screen.getByRole('tab', { name: /con código/i }));
    fireEvent.doubleClick(screen.getByText('REF-C1'));
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
    render(<CodigosMaestrosV2 />);
    fireEvent.click(screen.getByRole('button', { name: /nuevo registro/i }));
    await act(async () => { vi.runAllTimers(); });
    fireEvent.keyDown(window, { key: 's', ctrlKey: true });
    expect(screen.getAllByText('Campo obligatorio').length).toBeGreaterThanOrEqual(2);
    vi.useRealTimers();
  });
});
