// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

const mockCodigos = vi.fn();
const mockReporte = vi.fn();
const mockGuardarLote = vi.fn();

vi.mock('../../../../../firebaseConfig', () => ({ db: {} }));
vi.mock('../../../../../context/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
// Confirmaciones aceptadas al instante.
vi.mock('../../../../../context/ModalContext', () => ({ useModal: () => ({ confirmAction: (_t, _m, fn) => fn() }) }));
vi.mock('../../../../../context/UserContext', () => ({ useUser: () => ({ userData: { uid: 'u1', nombreCompleto: 'Ana' } }) }));
// Reglas de recargo (catálogo en memoria) para la venta en vivo.
vi.mock('../../../../../hooks/useCatalogo', () => ({
  useCatalogo: () => ({ datos: [{ id: 'r1', desde: 0, hasta: 100000, vecesCosto: 1.5 }], cargado: true })
}));
vi.mock('../registroConsignacion/utils/cacheMaestros', () => ({
  obtenerCodigosCacheados: (...a) => mockCodigos(...a),
  buscarReporteInfoReintentandoNoEncontradas: (...a) => mockReporte(...a)
}));
vi.mock('../utils/registroConsignacionService', async (importOriginal) => ({
  ...(await importOriginal()),
  guardarRegistrosConsignacionEnLote: (...a) => mockGuardarLote(...a)
}));

import CargaMasivaConsignacion from './CargaMasivaConsignacion';
import { claveBorrador } from './utils/borradorCargaMasiva';

const item = (codigo) => ({ codigo, referencia: `REF-${codigo}`, empresa: 'ACME', tipo: 'CONSIGNACION', precioNeto: 1000 });
// Admisión, paciente, médico, fecha, proveedor, código, cantidad, delivery.
const PEGADO = ['100\tJUAN\tDR X\t08-10-2026\t\tA1\t1\t', '100\tJUAN\tDR X\t08-10-2026\t\tMAL\t2\t'].join('\n');

const celdas = () => screen.getAllByRole('textbox');
const borrador = () => JSON.parse(localStorage.getItem(claveBorrador('u1')) || 'null');
const pegar = () => fireEvent.paste(celdas()[0], { clipboardData: { getData: () => PEGADO } });
const cargar = async () => {
  fireEvent.click(screen.getByRole('button', { name: /Cargar/ }));
  await waitFor(() => expect(screen.queryByText('Consultando datos...')).not.toBeInTheDocument());
};

describe('CargaMasivaConsignacion: borrador', () => {
  beforeEach(() => {
    localStorage.clear();
    mockCodigos.mockReset();
    mockReporte.mockReset();
    mockGuardarLote.mockReset();
    mockCodigos.mockResolvedValue([item('A1')]);
    mockReporte.mockResolvedValue({ Paciente: 'JUAN' });
  });
  afterEach(cleanup);

  it('sin "Cargar" no guarda borrador; al cargar lo guarda con lo pegado', async () => {
    render(<CargaMasivaConsignacion />);
    pegar();
    expect(borrador()).toBeNull();
    await cargar();
    expect(borrador().filas.map((f) => f.codigo)).toEqual(['A1', 'MAL']);
    expect(screen.getByText(/1 fila OK, 1 con errores/)).toBeInTheDocument();
  });

  it('al volver a la pantalla restaura los datos con aviso; al revalidar, lo corregido queda OK', async () => {
    const { unmount } = render(<CargaMasivaConsignacion />);
    pegar();
    await cargar();
    unmount(); // salir de la pantalla (o recargar)

    render(<CargaMasivaConsignacion />);
    expect(screen.getByRole('alert')).toHaveTextContent('Tienes datos sin guardar de una carga anterior');
    expect(celdas()[5]).toHaveValue('A1');
    expect(celdas()[13]).toHaveValue('MAL');

    // El código se corrigió en el maestro mientras tanto.
    mockCodigos.mockResolvedValue([item('A1'), item('MAL')]);
    await cargar();
    expect(screen.getByText(/2 filas OK, 0 con errores/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('las ediciones después de "Cargar" actualizan el borrador', async () => {
    render(<CargaMasivaConsignacion />);
    pegar();
    await cargar();
    fireEvent.change(celdas()[13], { target: { value: 'NUEVO' } });
    expect(borrador().filas[1].codigo).toBe('NUEVO');
  });

  it('al guardar todo se borra el borrador; si quedan filas con error, el borrador queda solo con esas', async () => {
    mockGuardarLote.mockImplementation(async (_db, payloads) => payloads.map(() => ({ ok: true })));
    render(<CargaMasivaConsignacion />);
    pegar();
    await cargar();

    fireEvent.click(screen.getByRole('button', { name: /Guardar/ }));
    await waitFor(() => expect(mockGuardarLote).toHaveBeenCalled());
    await waitFor(() => expect(borrador().filas.map((f) => f.codigo)).toEqual(['MAL']));

    mockCodigos.mockResolvedValue([item('A1'), item('MAL')]);
    await cargar();
    fireEvent.click(screen.getByRole('button', { name: /Guardar/ }));
    await waitFor(() => expect(mockGuardarLote).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(borrador()).toBeNull());
    expect(screen.queryByText('Descartar borrador')).not.toBeInTheDocument();
  });

  it('"Descartar borrador" limpia la grilla y el borrador', async () => {
    render(<CargaMasivaConsignacion />);
    pegar();
    await cargar();
    fireEvent.click(screen.getByRole('button', { name: 'Descartar borrador' }));
    expect(borrador()).toBeNull();
    expect(celdas()[0]).toHaveValue('');
  });
});

describe('CargaMasivaConsignacion: precio especial en la vista previa', () => {
  beforeEach(() => {
    localStorage.clear();
    mockCodigos.mockReset();
    mockReporte.mockReset();
    mockGuardarLote.mockReset();
    mockCodigos.mockResolvedValue([item('A1')]);
    mockReporte.mockResolvedValue({ Paciente: 'JUAN' });
    mockGuardarLote.mockImplementation(async (_db, payloads) => payloads.map(() => ({ ok: true })));
  });
  afterEach(cleanup);

  it('edita el precio de una fila OK: venta en vivo y se guarda como precio especial (el maestro no cambia)', async () => {
    render(<CargaMasivaConsignacion />);
    pegar();
    await cargar();
    const precio = screen.getByLabelText('Precio fila 1');
    expect(precio).toHaveAttribute('placeholder', '$1.000'); // precio del maestro
    fireEvent.change(precio, { target: { value: '800' } });
    expect(screen.getByText(/Venta \$1\.200 · 1\.5 x/)).toBeInTheDocument(); // 800 × 1,5 × 1
    expect(borrador().filas[0].precioEditado).toBe('800');

    fireEvent.click(screen.getByRole('button', { name: /Guardar/ }));
    await waitFor(() => expect(mockGuardarLote).toHaveBeenCalled());
    const [payload] = mockGuardarLote.mock.calls[0][1];
    expect(payload).toMatchObject({ costo: 800, costoMaestro: 1000, precioEspecial: true });
  });

  it('sin editar, el precio es el del maestro y no se marca como especial', async () => {
    render(<CargaMasivaConsignacion />);
    pegar();
    await cargar();
    fireEvent.click(screen.getByRole('button', { name: /Guardar/ }));
    await waitFor(() => expect(mockGuardarLote).toHaveBeenCalled());
    const [payload] = mockGuardarLote.mock.calls[0][1];
    expect(payload.costo).toBe(1000);
    expect(payload).not.toHaveProperty('precioEspecial');
  });

  it('un precio cero no deja guardar', async () => {
    render(<CargaMasivaConsignacion />);
    pegar();
    await cargar();
    fireEvent.change(screen.getByLabelText('Precio fila 1'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: /Guardar/ }));
    expect(mockGuardarLote).not.toHaveBeenCalled();
  });
});
