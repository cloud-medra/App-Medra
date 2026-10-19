// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

const mockGetDocs = vi.fn();

vi.mock('../../../../../firebaseConfig', () => ({ db: {} }));
vi.mock('../../../../../context/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('../../../../../context/ModalContext', () => ({ useModal: () => ({ confirmAction: vi.fn() }) }));
vi.mock('../../../../../context/UserContext', () => ({ useUser: () => ({ userData: { uid: 'u1' } }) }));
vi.mock('./utils/cacheMaestros', () => ({ buscarReporteInfoPorAdmisionCacheado: vi.fn(), invalidarReporteAdmision: vi.fn() }));
vi.mock('firebase/firestore', () => ({
  collectionGroup: vi.fn(() => ({})),
  query: vi.fn(() => ({})),
  orderBy: vi.fn(),
  where: vi.fn(),
  limit: vi.fn(),
  startAfter: vi.fn(),
  getDocs: (...a) => mockGetDocs(...a),
  writeBatch: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn()
}));
vi.mock('./components/RegistroConsignacionForm', () => ({ default: () => null }));
vi.mock('./components/ConsignacionFiltros', () => ({ default: () => null }));
// Tabla simulada: solo el orden de las filas que recibe.
vi.mock('./components/ConsignacionTable', () => ({
  default: ({ registros }) => <ol>{registros.map((r) => <li key={r.id}>{r.nombre}</li>)}</ol>
}));

import RegistroConsignacion from './RegistroConsignacion';

const hoy = new Date();
const FECHA = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-01`;
const CARGA = { toMillis: () => 1000 };

afterEach(cleanup);

describe('RegistroConsignacion: orden de la carga masiva', () => {
  it('muestra las filas en el orden de ingreso, con cada admisión junta', async () => {
    const filas = [
      { id: 'zz', gestionId: '100', nombre: 'P-0', posicionCarga: 0 },
      { id: 'aa', gestionId: '200', nombre: 'P-3', posicionCarga: 3 },
      { id: 'mm', gestionId: '100', nombre: 'P-2', posicionCarga: 2 },
      { id: 'bb', gestionId: '100', nombre: 'P-1', posicionCarga: 1 }
    ];
    mockGetDocs.mockResolvedValue({
      docs: filas.map((f) => ({ id: f.id, ref: { path: `consignacion_registros/x/detalles/${f.id}` }, data: () => ({ ...f, fecha: FECHA, fechaRegistro: CARGA }) }))
    });
    render(<RegistroConsignacion />);
    await screen.findByText('P-0');
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['P-0', 'P-1', 'P-2', 'P-3']);
    expect(mockGetDocs).toHaveBeenCalledTimes(1);
  });
});
