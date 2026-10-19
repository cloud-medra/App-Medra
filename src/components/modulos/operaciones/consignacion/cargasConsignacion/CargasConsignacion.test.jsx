// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';

const mockGetDocs = vi.fn();
const mockGetDoc = vi.fn();

vi.mock('../../../../../firebaseConfig', () => ({ db: {} }));
vi.mock('../../../../../context/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('../../../../../context/ModalContext', () => ({ useModal: () => ({ confirmAction: vi.fn() }) }));
vi.mock('../../shared/ocIndex/useSincronizarOC', () => ({
  useSincronizarOC: () => ({ sincronizandoOC: false, handleSincronizarOC: vi.fn(), resumenOC: null, cerrarResumenOC: vi.fn() })
}));
vi.mock('../../shared/ocIndex/SincronizarOCResumenModal', () => ({ SincronizarOCResumenModal: () => null }));
vi.mock('firebase/firestore', () => ({
  collectionGroup: vi.fn(() => ({})),
  query: vi.fn(() => ({})),
  orderBy: vi.fn(),
  where: vi.fn(),
  limit: vi.fn(),
  startAfter: vi.fn(),
  getDocs: (...a) => mockGetDocs(...a),
  getDoc: (...a) => mockGetDoc(...a),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn()
}));
// Detalle simulado: al volver entrega las filas de la admisión ya marcadas
// como CARGADO (lo que el detalle real recibe de su onSnapshot).
vi.mock('./components/CargasConsignacionDetalleView', () => ({
  default: ({ registro, onVolver }) => (
    <button type="button" onClick={() => onVolver(FILAS
      .filter((f) => f.gestionId === registro.gestionId)
      .map((f) => ({ ...docDe(f), estado: 'CARGADO' })))}
    >
      Volver del detalle
    </button>
  )
}));

import CargasConsignacion from './CargasConsignacion';

const hoy = new Date();
const FECHA = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-01`;
const CARGA = { toMillis: () => 1000 };
// Carga masiva: admisión 100 en las posiciones 0, 1 y 2; 200 en la 3. Los
// ids son los que Firestore usaría para desempatar (aleatorios).
const FILAS = [
  { id: 'zz', gestionId: '100', nombre: 'P-0', posicionCarga: 0 },
  { id: 'aa', gestionId: '200', nombre: 'P-3', posicionCarga: 3 },
  { id: 'mm', gestionId: '100', nombre: 'P-2', posicionCarga: 2 },
  { id: 'bb', gestionId: '100', nombre: 'P-1', posicionCarga: 1 }
];
const docDe = (f) => ({ ...f, ref: { path: `consignacion_registros/x/detalles/${f.id}` }, fecha: FECHA, estado: 'INGRESADO', fechaRegistro: CARGA });

const pacientesEnTabla = () => screen.getAllByText(/^P-\d$/).map((el) => el.textContent);
const filaDe = (paciente) => screen.getByText(paciente).closest('tr');

describe('CargasConsignacion', () => {
  beforeEach(() => {
    mockGetDoc.mockReset();
    mockGetDocs.mockReset();
    mockGetDocs.mockResolvedValue({
      docs: FILAS.map((f) => {
        const d = docDe(f);
        const { id, ref, ...data } = d;
        return { id, ref, data: () => data };
      })
    });
  });
  afterEach(cleanup);

  it('al volver del detalle, todas las filas de la admisión quedan CARGADO sin releer de Firestore', async () => {
    render(<CargasConsignacion />);
    await screen.findByText('P-0');
    fireEvent.click(within(filaDe('P-2')).getByTitle('Ver detalle'));
    fireEvent.click(screen.getByText('Volver del detalle'));

    ['P-0', 'P-1', 'P-2'].forEach((p) => expect(within(filaDe(p)).getByText('CARGADO')).toBeInTheDocument());
    expect(within(filaDe('P-3')).getByText('INGRESADO')).toBeInTheDocument();
    expect(mockGetDoc).not.toHaveBeenCalled();
    expect(mockGetDocs).toHaveBeenCalledTimes(1);
  });
});
