// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within, waitFor, act } from '@testing-library/react';
import SeguimientoFacturasGuias from './SeguimientoFacturasGuias';

const mockGetDocs = vi.fn();
const mockWhere = vi.fn((...args) => ({ _type: 'where', args }));
const mockCount = vi.fn();

vi.mock('../../../../../firebaseConfig', () => ({ db: {} }));
vi.mock('../../../../../context/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('../../../../../hooks/useGranularPermission', () => ({
  useGranularPermission: () => ({ hasPermission: () => true })
}));
// Maestros → Empresas para el RUT junto al filtro (catalogosStore aparte, así
// no se mezcla con las consultas de la tabla).
const mockEmpresas = [
  { id: 'a', nombre: 'EMPRESA A S.A.', rut: '761234567' },
  { id: 'b', nombre: 'Empresa B', rut: '' }
];
const mockUseCatalogo = vi.fn(() => ({ datos: mockEmpresas, cargando: false, error: null }));
vi.mock('../../../../../hooks/useCatalogo', () => ({ useCatalogo: (...args) => mockUseCatalogo(...args) }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, ...seg) => ({ _type: 'collection', path: seg.join('/') })),
  collectionGroup: vi.fn((_db, nombre) => ({ _type: 'collectionGroup', nombre })),
  query: vi.fn((ref, ...c) => ({ ...ref, _c: c })),
  where: (...args) => mockWhere(...args),
  and: vi.fn((...c) => ({ _type: 'and', c })),
  or: vi.fn((...c) => ({ _type: 'or', c })),
  orderBy: vi.fn(),
  limit: vi.fn(),
  documentId: vi.fn(),
  getDocs: (...args) => mockGetDocs(...args),
  getCountFromServer: (...args) => mockCount(...args)
}));

// where(...) de una consulta de conteo (Facturas envuelve todo en and(...)).
const wheresDe = (q) => q._c.flatMap((c) => (c?._type === 'and' ? c.c : [c])).filter((c) => c?._type === 'where');
const mesDeConteo = (q) => wheresDe(q).find((w) => w.args[1] === '>=').args[2].match(/meses\/(\d{2})$/)[1];
const anioDeConteo = (q) => wheresDe(q).find((w) => w.args[1] === '>=').args[2].split('/')[1];
const consultasTabla = () => mockGetDocs.mock.calls.filter(([ref]) => ref._type === 'collectionGroup');
const conteo = (n) => ({ data: () => ({ count: n }) });

const docsDeIds = (ids, dataFn = () => ({})) => ({ docs: ids.map((id) => ({ id, ref: { path: `x/${id}` }, data: () => dataFn(id) })) });

describe('SeguimientoFacturasGuias', () => {
  beforeEach(() => {
    mockGetDocs.mockReset();
    mockWhere.mockClear();
    mockCount.mockReset();
    mockCount.mockResolvedValue(conteo(1));
    mockUseCatalogo.mockClear();
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
      await screen.findByRole('option', { name: 'Octubre' });
      fireEvent.change(screen.getByLabelText('Mes'), { target: { value: '10' } });
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

    describe('RUT de la empresa elegida', () => {
      afterEach(() => {
        vi.useRealTimers();
        Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
      });

      it('sin empresa elegida no se muestra ni se lee Maestros', async () => {
        await abrirFacturas2026();
        expect(screen.queryByRole('button', { name: /Copiar RUT/ })).not.toBeInTheDocument();
        expect(screen.queryByText('Sin RUT')).not.toBeInTheDocument();
        expect(mockUseCatalogo).not.toHaveBeenCalled();
      });

      it('muestra el RUT formateado (cruce flexible por nombre) y lo copia con "¡Copiado!" por 2 s', async () => {
        const writeText = vi.fn().mockResolvedValue();
        Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
        await abrirFacturas2026();
        fireEvent.change(screen.getByDisplayValue('Empresa'), { target: { value: 'Empresa A' } });

        const boton = screen.getByRole('button', { name: 'Copiar RUT 76.123.456-7' });
        expect(boton).toHaveAttribute('title', 'Clic para copiar');
        vi.useFakeTimers();
        fireEvent.click(boton);
        await vi.waitFor(() => expect(boton).toHaveTextContent('¡Copiado!'));
        expect(writeText).toHaveBeenCalledWith('76.123.456-7');
        act(() => vi.advanceTimersByTime(2000));
        expect(boton).toHaveTextContent('76.123.456-7');
      });

      it('"Sin RUT" si está en Maestros sin RUT y "No encontrada en Maestros" si no está', async () => {
        FILAS.push({ admision: '103', proveedor: 'Empresa Z', oc: '4504', oc_monto: 1 });
        try {
          await abrirFacturas2026();
          fireEvent.change(screen.getByDisplayValue('Empresa'), { target: { value: 'Empresa B' } });
          expect(screen.getByText('Sin RUT')).toBeInTheDocument();
          expect(screen.queryByRole('button', { name: /Copiar RUT/ })).not.toBeInTheDocument();

          fireEvent.change(screen.getByDisplayValue('Empresa B'), { target: { value: 'Empresa Z' } });
          expect(screen.getByText('No encontrada en Maestros')).toBeInTheDocument();

          fireEvent.change(screen.getByDisplayValue('Empresa Z'), { target: { value: '' } });
          expect(screen.queryByText('No encontrada en Maestros')).not.toBeInTheDocument();
        } finally {
          FILAS.pop();
        }
      });
    });
  });

  describe('meses del selector (Facturas)', () => {
    let mesesMarcador;
    beforeEach(() => {
      mesesMarcador = ['01', '02', '10'];
      mockGetDocs.mockImplementation(async (ref) => {
        if (ref._type === 'collection' && ref.path === 'documentos_sistema') return docsDeIds(['2025', '2026']);
        if (ref._type === 'collection') return docsDeIds(mesesMarcador);
        return docsDeIds(['f0'], () => ({ proveedor: 'Empresa A', oc_monto: 1000 }));
      });
    });

    const abrir = async () => {
      render(<SeguimientoFacturasGuias />);
      fireEvent.click(screen.getByText('Seguimiento de Facturas'));
      await screen.findByRole('option', { name: '2026' });
      fireEvent.change(screen.getByDisplayValue('Año'), { target: { value: '2026' } });
    };
    const opcionesMes = () => Array.from(screen.getByLabelText('Mes').options).map((o) => o.textContent);

    it('oculta los meses sin pendientes, en orden cronológico', async () => {
      mockCount.mockImplementation(async (q) => conteo(mesDeConteo(q) === '02' ? 0 : 3));
      await abrir();
      await screen.findByDisplayValue('Mes');
      expect(opcionesMes()).toEqual(['Mes', 'Enero', 'Octubre']);
      expect(mockCount).toHaveBeenCalledTimes(3);
    });

    it('muestra "Cargando meses..." mientras cuenta', async () => {
      const pendientes = [];
      mockCount.mockImplementation(() => new Promise((r) => { pendientes.push(r); }));
      await abrir();
      await waitFor(() => expect(pendientes).toHaveLength(3));
      expect(screen.getByLabelText('Mes')).toHaveDisplayValue('Cargando meses...');
      expect(screen.getByLabelText('Mes')).toBeDisabled();
      pendientes.forEach((r) => r(conteo(1)));
      expect(await screen.findByDisplayValue('Mes')).toBeEnabled();
      expect(opcionesMes()).toEqual(['Mes', 'Enero', 'Febrero', 'Octubre']);
    });

    it('si un conteo falla, el mes se muestra igual', async () => {
      const consola = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockCount.mockImplementation(async (q) => {
        if (mesDeConteo(q) === '02') throw new Error('índice en construcción');
        return conteo(0);
      });
      await abrir();
      await screen.findByDisplayValue('Mes');
      expect(opcionesMes()).toEqual(['Mes', 'Febrero']);
      expect(consola).toHaveBeenCalled();
      consola.mockRestore();
    });

    it('sin ningún mes pendiente, selector deshabilitado con "Sin meses pendientes"', async () => {
      mockCount.mockResolvedValue(conteo(0));
      await abrir();
      expect(await screen.findByDisplayValue('Sin meses pendientes')).toBeDisabled();
    });

    it('con solo el año no consulta la tabla: muestra el mensaje y Empresa queda deshabilitada', async () => {
      await abrir();
      await screen.findByDisplayValue('Mes');
      expect(screen.getByText('Selecciona un mes para ver los registros')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Empresa')).toBeDisabled();
      expect(screen.queryByTestId('total-monto-oc')).not.toBeInTheDocument();
      expect(mockGetDocs.mock.calls.some(([ref]) => ref._type === 'collectionGroup')).toBe(false);
    });

    it('al elegir un mes carga la tabla una vez y habilita Empresa', async () => {
      await abrir();
      await screen.findByDisplayValue('Mes');
      fireEvent.change(screen.getByLabelText('Mes'), { target: { value: '10' } });
      await screen.findByTestId('total-monto-oc');
      expect(screen.getByDisplayValue('Empresa')).toBeEnabled();
      const consultasTabla = mockGetDocs.mock.calls.filter(([ref]) => ref._type === 'collectionGroup');
      expect(consultasTabla).toHaveLength(1);
    });

    it('cambiar de empresa no vuelve a contar meses ni a consultar la tabla', async () => {
      await abrir();
      await screen.findByDisplayValue('Mes');
      fireEvent.change(screen.getByLabelText('Mes'), { target: { value: '10' } });
      await screen.findByRole('option', { name: 'Empresa A' });
      const conteosAntes = mockCount.mock.calls.length;
      const consultasAntes = consultasTabla().length;

      fireEvent.change(screen.getByDisplayValue('Empresa'), { target: { value: 'Empresa A' } });
      expect(screen.getByLabelText('Mes')).toHaveValue('10');
      expect(mockCount.mock.calls).toHaveLength(conteosAntes);
      expect(consultasTabla()).toHaveLength(consultasAntes);
      expect(mockCount.mock.calls.every(([q]) => !wheresDe(q).some((w) => w.args[0] === 'proveedor'))).toBe(true);
    });

    it('al cambiar de año cuenta solo los meses del año nuevo, y volver a un año ya contado no vuelve a contar', async () => {
      await abrir();
      await screen.findByDisplayValue('Mes');
      expect(mockCount).toHaveBeenCalledTimes(3);

      mesesMarcador = ['05'];
      fireEvent.change(screen.getByLabelText('Año'), { target: { value: '2025' } });
      await screen.findByRole('option', { name: 'Mayo' });
      // Ningún conteo de 2025 con los meses de 2026 (01, 02, 10).
      const de2025 = mockCount.mock.calls.filter(([q]) => anioDeConteo(q) === '2025').map(([q]) => mesDeConteo(q));
      expect(de2025).toEqual(['05']);

      mesesMarcador = ['01', '02', '10'];
      fireEvent.change(screen.getByLabelText('Año'), { target: { value: '2026' } });
      await screen.findByRole('option', { name: 'Octubre' });
      expect(mockCount).toHaveBeenCalledTimes(4);
    });

    it('"Volver" con año y mes elegidos no consulta filas sin filtro', async () => {
      await abrir();
      await screen.findByDisplayValue('Mes');
      fireEvent.change(screen.getByLabelText('Mes'), { target: { value: '10' } });
      await screen.findByTestId('total-monto-oc');
      const consultasAntes = consultasTabla().length;

      fireEvent.click(screen.getByTitle('Volver'));
      await new Promise((r) => setTimeout(r, 0));
      expect(consultasTabla()).toHaveLength(consultasAntes);
    });

    it('Guías no cuenta: muestra todos los meses como antes', async () => {
      render(<SeguimientoFacturasGuias />);
      fireEvent.click(screen.getByText('Seguimiento de Guías'));
      await screen.findByRole('option', { name: '2026' });
      fireEvent.change(screen.getByDisplayValue('Año'), { target: { value: '2026' } });
      await screen.findByRole('option', { name: 'Octubre' });
      expect(opcionesMes()).toEqual(['Mes', 'Enero', 'Febrero', 'Octubre']);
      expect(mockCount).not.toHaveBeenCalled();
    });
  });
});
