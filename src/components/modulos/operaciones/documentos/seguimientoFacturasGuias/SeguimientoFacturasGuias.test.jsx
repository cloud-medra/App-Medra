// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import SeguimientoFacturasGuias from './SeguimientoFacturasGuias';

const mockGetDocs = vi.fn();
const mockWhere = vi.fn((...args) => ({ _type: 'where', args }));

vi.mock('../../../../../firebaseConfig', () => ({ db: {} }));
vi.mock('../../../../../context/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('../../../../../hooks/useGranularPermission', () => ({
  useGranularPermission: () => ({ hasPermission: () => true })
}));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, ...seg) => ({ _type: 'collection', path: seg.join('/') })),
  collectionGroup: vi.fn((_db, nombre) => ({ _type: 'collectionGroup', nombre })),
  query: vi.fn((ref, ...c) => ({ ...ref, _c: c })),
  where: (...args) => mockWhere(...args),
  orderBy: vi.fn(),
  limit: vi.fn(),
  documentId: vi.fn(),
  getDocs: (...args) => mockGetDocs(...args)
}));

const docsDeIds = (ids, dataFn = () => ({})) => ({ docs: ids.map((id) => ({ id, ref: { path: `x/${id}` }, data: () => dataFn(id) })) });

describe('SeguimientoFacturasGuias', () => {
  beforeEach(() => {
    mockGetDocs.mockReset();
    mockWhere.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it('muestra primero el selector de tipo de seguimiento', () => {
    render(<SeguimientoFacturasGuias />);
    expect(screen.getByText('Seguimiento de Facturas')).toBeInTheDocument();
    expect(screen.getByText('Seguimiento de Guías')).toBeInTheDocument();
    expect(screen.queryByText('Año')).not.toBeInTheDocument();
  });

  // El comportamiento exacto del filtro de servidor (estado vs. numero_guia)
  // ya está cubierto a fondo, con datos y timing controlados, en
  // useDocumentosSistemaPeriodo.test.js. Acá solo se verifica que, al elegir
  // cada criterio, los filtros aparecen (año habilitado) — el detalle de
  // qué where() exacto arma cada uno se prueba a nivel de hook, no de DOM.
  it('al elegir "Facturas", se muestra la barra de filtros con el año habilitado', async () => {
    mockGetDocs.mockResolvedValue(docsDeIds([]));
    render(<SeguimientoFacturasGuias />);

    fireEvent.click(screen.getByText('Seguimiento de Facturas'));
    const selectAnio = await screen.findByDisplayValue('Año');
    expect(selectAnio).toBeEnabled();
  });

  it('al elegir "Guías", se muestra la barra de filtros con el año habilitado', async () => {
    mockGetDocs.mockResolvedValue(docsDeIds([]));
    render(<SeguimientoFacturasGuias />);

    fireEvent.click(screen.getByText('Seguimiento de Guías'));
    const selectAnio = await screen.findByDisplayValue('Año');
    expect(selectAnio).toBeEnabled();
  });

  it('el botón "Volver" regresa al selector inicial', async () => {
    mockGetDocs.mockResolvedValue(docsDeIds([]));
    render(<SeguimientoFacturasGuias />);

    fireEvent.click(screen.getByText('Seguimiento de Facturas'));
    await screen.findByText('Año');

    fireEvent.click(screen.getByTitle('Volver'));
    expect(screen.getByText('Seguimiento de Guías')).toBeInTheDocument();
    expect(screen.queryByText('Año')).not.toBeInTheDocument();
  });

  it('los selects de Mes y Empresa no muestran una opción "Todos"/"Todas"', async () => {
    mockGetDocs.mockResolvedValue(docsDeIds([]));
    render(<SeguimientoFacturasGuias />);
    fireEvent.click(screen.getByText('Seguimiento de Facturas'));
    await screen.findByText('Año');

    expect(screen.queryByText(/\(Todos\)/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\(Todas\)/)).not.toBeInTheDocument();
  });

  describe('con datos (Facturas)', () => {
    // 3 filas de octubre 2026: dos de Empresa A (una con monto como texto) y
    // una de Empresa B con monto vacío.
    const FILAS = [
      { admision: '100', proveedor: 'Empresa A', oc: '4501', oc_monto: 1200000, precio_u: 600000, cantidad: 2, atributo: 'Estéril', lote: 'LT-9', fecha_vencimiento: new Date(2028, 0, 9) },
      { admision: '101', proveedor: 'Empresa A', oc: '4502', oc_monto: '$ 300.000', precio_u: '300.000', cantidad: 1, atributo: '', lote: 'LT-1' },
      { admision: '102', proveedor: 'Empresa B', oc: '4503', oc_monto: '', precio_u: null, cantidad: 1 }
    ];
    beforeEach(() => {
      mockGetDocs.mockImplementation(async (ref) => {
        if (ref._type === 'collection' && ref.path === 'documentos_sistema') return docsDeIds(['2026']);
        if (ref._type === 'collection') return docsDeIds(['10']);
        return docsDeIds(FILAS.map((_, i) => `f${i}`), (id) => FILAS[Number(id.slice(1))]);
      });
    });

    const abrirFacturas2026 = async () => {
      render(<SeguimientoFacturasGuias />);
      fireEvent.click(screen.getByText('Seguimiento de Facturas'));
      await screen.findByRole('option', { name: '2026' });
      fireEvent.change(screen.getByDisplayValue('Año'), { target: { value: '2026' } });
      await screen.findByTestId('total-monto-oc');
    };

    it('muestra las columnas nuevas con moneda chilena y fecha dd-mm-aaaa', async () => {
      await abrirFacturas2026();
      ['Monto OC', 'Atributo', 'Lote', 'Vencimiento', 'Precio U.'].forEach((t) => expect(screen.getByRole('columnheader', { name: t })).toBeInTheDocument());
      const fila = screen.getByText('LT-9').closest('tr');
      expect(fila).toHaveTextContent('$ 1.200.000');
      expect(fila).toHaveTextContent('$ 600.000');
      expect(fila).toHaveTextContent('Estéril');
      expect(fila).toHaveTextContent('09-01-2028');
    });

    it('recuadro TOTAL con la suma de Monto OC y registros, recalculado con año + mes + empresa + búsqueda', async () => {
      await abrirFacturas2026();
      const total = () => screen.getByTestId('total-monto-oc').textContent;
      const registros = () => screen.getByTestId('total-registros').textContent;
      expect(total()).toBe('$ 1.500.000');
      expect(registros()).toBe('3');

      fireEvent.change(screen.getByDisplayValue('Mes'), { target: { value: '10' } });
      await screen.findByText('LT-9');
      expect(total()).toBe('$ 1.500.000');

      fireEvent.change(screen.getByDisplayValue('Empresa'), { target: { value: 'Empresa B' } });
      expect(total()).toBe('$ 0');
      expect(registros()).toBe('1');

      fireEvent.change(screen.getByDisplayValue('Empresa B'), { target: { value: 'Empresa A' } });
      expect(total()).toBe('$ 1.500.000');
      expect(registros()).toBe('2');

      fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar' }), { target: { value: 'LT-1' } });
      expect(total()).toBe('$ 300.000');
      expect(registros()).toBe('1');
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('misma OC con dos códigos del mismo monto: suma completa y sin aviso', async () => {
      FILAS.push(
        { admision: '115569', proveedor: 'Empresa C', oc: '61740', codigo: '254139', oc_monto: 98000, fecha_cx: new Date(2026, 9, 5) },
        { admision: '115569', proveedor: 'Empresa C', oc: '61740', codigo: '254138', oc_monto: 98000, fecha_cx: new Date(2026, 9, 5) }
      );
      try {
        await abrirFacturas2026();
        fireEvent.change(screen.getByDisplayValue('Empresa'), { target: { value: 'Empresa C' } });
        expect(screen.getByTestId('total-monto-oc').textContent).toBe('$ 196.000');
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      } finally {
        FILAS.splice(-2);
      }
    });

    it('avisa cuando una fila está exactamente duplicada', async () => {
      FILAS.push({ ...FILAS[0] });
      try {
        await abrirFacturas2026();
        expect(screen.getByTestId('total-monto-oc').textContent).toBe('$ 2.700.000');
        const aviso = screen.getByRole('alert');
        expect(aviso).toHaveTextContent('1 fila parece importada dos veces');
        expect(aviso).toHaveTextContent('OC 4501, código -, lote LT-9, admisión 100');
        expect(within(aviso).getByText('$ 1.500.000')).toBeInTheDocument();
      } finally {
        FILAS.pop();
      }
    });

    it('el botón Exportar Excel se habilita con registros', async () => {
      await abrirFacturas2026();
      expect(screen.getByRole('button', { name: /Exportar Excel/ })).toBeEnabled();
    });
  });
});
