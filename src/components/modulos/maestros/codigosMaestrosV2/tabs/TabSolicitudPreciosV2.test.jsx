// @vitest-environment jsdom
// Solicitud de precios a TI: selección con checkbox, "Descargar Excel" solo
// con filas elegidas y, solo si el Excel se generó, se quitan de la lista.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const REGISTROS = [
  { id: 'a', referencia: 'REF-1', descripcion: 'PLACA', modulos: ['Implantes', 'Consignación'], costo: 1000, venta: 1500, agregadoEl: new Date('2026-11-01T12:00:00Z') },
  { id: 'b', referencia: 'REF-2', descripcion: 'TORNILLO', modulos: ['Hemodinamia'], costo: 10, venta: 20, agregadoEl: new Date('2026-11-02T12:00:00Z') },
];
const leer = vi.fn();
const eliminar = vi.fn();
const descargarExcel = vi.fn();
const showToast = vi.fn();
vi.mock('../../shared/solicitudesPrecio/accionesSolicitudesPrecio', () => ({
  leerSolicitudesPrecio: (...a) => leer(...a), eliminarDescargadas: (...a) => eliminar(...a),
}));
vi.mock('../../shared/solicitudesPrecio/descargarExcelSolicitudes', () => ({ descargarExcelSolicitudes: (...a) => descargarExcel(...a) }));
vi.mock('../../../../../context/ToastContext', () => ({ useToast: () => ({ showToast }) }));
vi.mock('../../../../../hooks/useGranularPermission', () => ({ useGranularPermission: () => ({ hasPermission: () => true }) }));

const { default: TabSolicitudPreciosV2 } = await import('./TabSolicitudPreciosV2');

beforeEach(() => {
  leer.mockResolvedValue(REGISTROS);
  eliminar.mockResolvedValue({ eliminadas: 1, conservadas: 0 });
  descargarExcel.mockReset();
});
afterEach(() => { cleanup(); leer.mockReset(); eliminar.mockReset(); showToast.mockClear(); });

const montar = async () => {
  render(<TabSolicitudPreciosV2 />);
  await screen.findByText('REF-1');
};

describe('Solicitud de precios a TI', () => {
  it('muestra las columnas con el módulo y sin botón de descarga hasta seleccionar', async () => {
    await montar();
    expect(screen.getByText('Implantes, Consignación')).toBeInTheDocument();
    expect(screen.queryByText(/Descargar Excel/)).toBeNull();
  });

  it('descarga solo las seleccionadas y luego las quita de la lista', async () => {
    await montar();
    fireEvent.click(screen.getByLabelText('Seleccionar REF-1'));
    fireEvent.click(screen.getByText(/Descargar Excel \(1\)/));
    await waitFor(() => expect(eliminar).toHaveBeenCalledTimes(1));
    expect(descargarExcel.mock.calls[0][0].map((r) => r.id)).toEqual(['a']);
    expect(eliminar.mock.calls[0][0].map((r) => r.id)).toEqual(['a']);
    await waitFor(() => expect(leer).toHaveBeenCalledTimes(2)); // recarga la lista
  });

  it('seleccionar todas marca todas las filas', async () => {
    await montar();
    fireEvent.click(screen.getByLabelText('Seleccionar todas'));
    expect(screen.getByText(/Descargar Excel \(2\)/)).toBeInTheDocument();
  });

  it('si el Excel falla no quita nada', async () => {
    descargarExcel.mockImplementation(() => { throw new Error('sin espacio'); });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await montar();
    fireEvent.click(screen.getByLabelText('Seleccionar todas'));
    fireEvent.click(screen.getByText(/Descargar Excel/));
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('No se pudo generar el Excel. La lista no se modificó.', 'error'));
    expect(eliminar).not.toHaveBeenCalled();
  });
});
