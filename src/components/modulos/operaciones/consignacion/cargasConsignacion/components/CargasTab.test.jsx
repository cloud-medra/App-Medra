// @vitest-environment jsdom
// Consignación → Cargas: editar el precio de un ítem (precio especial) con
// venta y total recalculados en vivo; se guardan solo los campos cambiados.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, within, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const updateDoc = vi.fn(async () => {});
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(), updateDoc: (...a) => updateDoc(...a), writeBatch: vi.fn(),
  collection: vi.fn(), addDoc: vi.fn(), serverTimestamp: vi.fn(),
}));
vi.mock('../../../../../../firebaseConfig', () => ({ db: {} }));
const showToast = vi.fn();
vi.mock('../../../../../../context/ToastContext', () => ({ useToast: () => ({ showToast }) }));
vi.mock('../../../../../../context/UserContext', () => ({ useUser: () => ({ userData: { uid: 'u1', nombreCompleto: 'Ana' } }) }));
vi.mock('../../../../../../hooks/useGranularPermission', () => ({ useGranularPermission: () => ({ hasPermission: () => true }) }));
vi.mock('../../../../../../hooks/useCatalogo', () => ({
  useCatalogo: () => ({ datos: [{ id: 'r1', desde: 0, hasta: 100000, vecesCosto: 1.5 }] }),
}));
const registrarLog = vi.fn(async () => {});
vi.mock('../../utils/registrarLogConsignacion', () => ({ registrarLogConsignacion: (...a) => registrarLog(...a) }));
vi.mock('./cacheDelivery', () => ({ resolverGuiaCacheada: vi.fn(), resolverMaestroCacheado: vi.fn(), resolverMaestrosCacheados: vi.fn(), normalizarCodigo: (c) => c }));
vi.mock('./useAutocompleteReferenciaConsignacion', () => ({
  useAutocompleteReferenciaConsignacion: () => ({ sugerencias: [], buscando: false, mostrarSug: false, setMostrarSug: vi.fn(), containerRef: { current: null }, portalRef: { current: null }, skipNext: { current: false } }),
}));
vi.mock('./verificacionPeriodoConsignacion', () => ({ periodoEstaAbierto: vi.fn(async () => true) }));
vi.mock('../../registroConsignacion/utils/cacheMaestros', () => ({ obtenerCodigosCacheados: vi.fn() }));
const solicitarPrecio = vi.fn();
vi.mock('../../../../maestros/shared/solicitudesPrecio/useSolicitarPrecio', () => ({ useSolicitarPrecio: () => solicitarPrecio }));

const { default: CargasTab } = await import('./CargasTab');
const { periodoEstaAbierto } = await import('./verificacionPeriodoConsignacion');

// Ítem con venta ya guardada coherente con la regla (el efecto de recargo no escribe).
const ITEM = {
  id: 'i1', ref: { path: 'consignacion_registros/i1' }, codigo: 'C1', referencia: 'REF-1', descripcion: 'PLACA', empresa: 'ACME',
  costo: 1000, cantidad: 2, lote: 'L1', vencimiento: '', estado: 'INGRESADO', recargoVecesCosto: 1.5, venta: 3000,
};

afterEach(() => { cleanup(); updateDoc.mockClear(); registrarLog.mockClear(); showToast.mockClear(); solicitarPrecio.mockClear(); });

const editar = () => {
  render(<CargasTab registro={{ gestionId: '500' }} items={[ITEM]} formData={{}} onChange={vi.fn()} setCargando={vi.fn()} />);
  fireEvent.click(screen.getByTitle('Editar ítem'));
  return screen.getByLabelText('Precio');
};

describe('Consignación → Cargas: editar precio', () => {
  it('recalcula total y venta en vivo y guarda solo lo modificado, con precio especial y el del maestro', async () => {
    const precio = editar();
    fireEvent.change(precio, { target: { value: '800' } });
    expect(screen.getByText('Maestro: $1.000')).toBeInTheDocument();
    // Total del ítem (Ítems Registrados) y de la admisión, en vivo (800 × 2).
    expect(screen.getAllByText('$1.600')).toHaveLength(2);
    // Venta en la fila de Cargas que se edita: 800 × 1,5 × 2.
    expect(within(precio.closest('tr')).getByText(/\$2\.400/)).toBeInTheDocument();

    fireEvent.click(screen.getByTitle('Guardar cambios'));
    await waitFor(() => expect(updateDoc).toHaveBeenCalledTimes(1));
    expect(updateDoc.mock.calls[0][1]).toEqual({
      // El recargo sigue en 1,5 (mismo rango): no se reescribe.
      costo: 800, costoMaestro: 1000, precioEspecial: true, venta: 2400,
    });
    expect(registrarLog.mock.calls[0][1]).toBe('ITEM_EDITADO');
    expect(registrarLog.mock.calls[0][2]).toMatchObject({ costo: 800, costoAnterior: 1000, precioEspecial: true });
  });

  it('rechaza un precio cero o vacío', async () => {
    const precio = editar();
    fireEvent.change(precio, { target: { value: '0' } });
    fireEvent.click(screen.getByTitle('Guardar cambios'));
    expect(showToast).toHaveBeenCalledWith('El precio debe ser mayor que cero', 'error');
    expect(updateDoc).not.toHaveBeenCalled();
  });

  it('cambiar solo la cantidad no marca precio especial', async () => {
    editar();
    const fila = screen.getByLabelText('Precio').closest('tr');
    fireEvent.change(within(fila).getAllByRole('spinbutton')[0], { target: { value: '3' } });
    fireEvent.click(screen.getByTitle('Guardar cambios'));
    await waitFor(() => expect(updateDoc).toHaveBeenCalledTimes(1));
    expect(updateDoc.mock.calls[0][1]).toEqual({ cantidad: 3, venta: 4500 });
  });

  it('muestra el badge en las filas con precio especial (en las dos tablas)', () => {
    render(<CargasTab registro={{}} items={[{ ...ITEM, costo: 800, costoMaestro: 1000, precioEspecial: true, venta: 2400 }]} formData={{}} onChange={vi.fn()} setCargando={vi.fn()} />);
    expect(screen.getAllByTitle('Precio especial (maestro: $1.000)')).toHaveLength(2);
  });
});

// La edición y las Acciones están en "Cargas"; "Ítems Registrados" es solo consulta.
describe('Consignación → Cargas: edición en la tabla Cargas', () => {
  const montar = () => render(<CargasTab registro={{ gestionId: '500' }} items={[ITEM]} formData={{}} onChange={vi.fn()} setCargando={vi.fn()} />);
  const tabla = (titulo) => screen.getByText(titulo, { selector: 'h3' }).closest('div.rounded-lg').querySelector('table');

  it('Cargas muestra referencia, descripción, costo y las acciones; Ítems Registrados no tiene acciones', () => {
    montar();
    const cargas = tabla('Cargas');
    expect(within(cargas).getByText('REF-1')).toBeInTheDocument();
    expect(within(cargas).getByText('PLACA')).toBeInTheDocument();
    expect(within(cargas).getByText('$1.000')).toBeInTheDocument();
    expect(within(cargas).getByTitle('Editar ítem')).toBeInTheDocument();
    expect(within(cargas).getByTitle('Solicitar actualización de precio')).toBeInTheDocument();
    const registrados = tabla('Ítems Registrados');
    expect(within(registrados).queryByText('Acciones')).toBeNull();
    expect(within(registrados).queryByRole('button')).toBeNull();
    expect(within(registrados).queryByRole('combobox')).toBeNull();
    // Lote y vencimiento no son columnas de Cargas fuera de la edición.
    expect(within(cargas).queryByText('L1')).toBeNull();
    expect(within(cargas).queryByLabelText('Lote')).toBeNull();
  });

  it('lote y vencimiento se editan en la fila expandida y se guardan con el mismo ✓', async () => {
    montar();
    fireEvent.click(screen.getByTitle('Editar ítem'));
    const cargas = tabla('Cargas');
    fireEvent.change(within(cargas).getByLabelText('Lote'), { target: { value: 'L2' } });
    fireEvent.change(within(cargas).getByLabelText('Vencimiento'), { target: { value: '2027-05-31' } });
    fireEvent.click(screen.getByTitle('Guardar cambios'));
    await waitFor(() => expect(updateDoc).toHaveBeenCalledTimes(1));
    expect(updateDoc.mock.calls[0][1]).toEqual({ lote: 'L2', vencimiento: '2027-05-31' });
    await waitFor(() => expect(within(tabla('Cargas')).queryByLabelText('Lote')).toBeNull());
  });

  it('cancelar cierra la edición sin guardar', () => {
    montar();
    fireEvent.click(screen.getByTitle('Editar ítem'));
    fireEvent.click(screen.getByTitle('Cancelar edición'));
    expect(screen.queryByLabelText('Precio')).toBeNull();
    expect(updateDoc).not.toHaveBeenCalled();
  });
});

// Candado de la admisión en la cabecera de "Cargas" (el de cada ítem, en Acciones).
describe('Consignación → Cargas: candado de ítems imputados', () => {
  const imputado = (id, extra = {}) => ({ ...ITEM, id, estado: 'SOLICITADO', periodoAnio: 2026, periodoMes: 'octubre', ...extra });
  const montar = (items) => render(<CargasTab registro={{ gestionId: '500' }} items={items} formData={{}} onChange={vi.fn()} setCargando={vi.fn()} />);

  it('muestra "Imputado" y el aviso de solo lectura; al presionarlo desbloquea los ítems con período abierto', async () => {
    montar([imputado('a'), imputado('b')]);
    expect(screen.getByText(/Esta admisión ya fue solicitada e imputada/)).toBeInTheDocument();
    expect(screen.queryByTitle('Editar ítem')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Imputado/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Editando/ })).toBeDisabled());
    expect(screen.getAllByTitle('Desbloqueado — editá y guardá para volver a bloquearlo')).toHaveLength(2);
    expect(screen.queryByText(/ya fue solicitada e imputada/)).toBeNull();
    // Un solo período distinto: una sola consulta.
    expect(periodoEstaAbierto).toHaveBeenCalledTimes(1);
  });

  it('deja bloqueados los de período cerrado o sin período, y avisa', async () => {
    periodoEstaAbierto.mockClear();
    periodoEstaAbierto.mockImplementation(async (_a, mes) => mes === 'octubre');
    montar([imputado('a'), imputado('b', { periodoMes: 'septiembre' }), imputado('c', { periodoAnio: undefined, periodoMes: undefined })]);
    fireEvent.click(screen.getByRole('button', { name: /Imputado/ }));
    await waitFor(() => expect(showToast).toHaveBeenCalled());
    expect(showToast.mock.calls[0][0]).toMatch(/Se desbloquearon 1 ítem\(s\)\. Quedan bloqueados: 1 con el período ya cerrado y 1 sin período/);
    expect(screen.getByText(/2 de 3 ítem\(s\) ya fueron solicitados/)).toBeInTheDocument();
    periodoEstaAbierto.mockImplementation(async () => true);
  });

  it('sin ítems imputados no aparece', () => {
    montar([ITEM]);
    expect(screen.queryByRole('button', { name: /Imputado/ })).toBeNull();
  });
});

describe('Consignación → Cargas: solicitar actualización de precio', () => {
  it('agrega la referencia con código, costo, veces costo y venta unitaria, sin tocar el ítem', () => {
    render(<CargasTab registro={{ gestionId: '500' }} items={[ITEM]} formData={{}} onChange={vi.fn()} setCargando={vi.fn()} />);
    fireEvent.click(screen.getByTitle('Solicitar actualización de precio'));
    // Venta guardada 3000 por 2 unidades → 1500 por unidad.
    expect(solicitarPrecio).toHaveBeenCalledWith({ referencia: 'REF-1', codigo: 'C1', descripcion: 'PLACA', costo: 1000, vecesCosto: 1.5, venta: 1500 });
    expect(updateDoc).not.toHaveBeenCalled();
    expect(registrarLog).not.toHaveBeenCalled();
  });
});
