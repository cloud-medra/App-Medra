// @vitest-environment jsdom
// Órdenes de Compra del portal: filtro de empresa según el tipo de usuario, solo consulta,
// y que el externo nunca pida el Maestro de Empresas ni otra empresa.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const consultas = [];
let respuesta = async () => ({ docs: FILAS.map((f) => ({ id: f.id, data: () => f })), size: FILAS.length });
const FILAS = [
  { id: 'a', oc: '100', codigo: 'C1', descripcion: 'TROCAR', cantidad: 2, estado: 'Facturado', numero_guia: 'G1', numero_factura: 'F1', fecha_cx: { toDate: () => new Date(2026, 8, 10) }, proveedor: 'ARENYS' },
  { id: 'b', oc: '200', codigo: 'C2', descripcion: 'PLACA', cantidad: 1, estado: 'Pendiente factura', numero_guia: 'G2', numero_factura: '', fecha_cx: { toDate: () => new Date(2026, 8, 20) }, proveedor: 'ARENYS' },
];
vi.mock('firebase/firestore', () => ({
  collection: (_db, c) => c,
  limit: (n) => ({ limite: n }),
  where: (campo, op, valor) => ({ campo, op, valor }),
  query: (col, ...r) => ({ col, r }),
  getDocs: (q) => { consultas.push(q); return respuesta(q); },
  serverTimestamp: vi.fn(),
}));
vi.mock('../../../../firebaseConfig', () => ({ db: {} }));
let usuario;
vi.mock('../../../../context/UserContext', () => ({ useUser: () => ({ userData: usuario }) }));
vi.mock('../../../../hooks/useGranularPermission', () => ({ useGranularPermission: () => ({ hasPermission: () => true }) }));
const useCatalogo = vi.fn(() => ({ datos: [{ id: 'e2', nombre: 'BETA' }, { id: 'e1', nombre: 'ARENYS' }] }));
vi.mock('../../../../hooks/useCatalogo', () => ({ useCatalogo: (...a) => useCatalogo(...a) }));

const { default: OrdenesCompra } = await import('./OrdenesCompra');

beforeEach(() => { consultas.length = 0; useCatalogo.mockClear(); });
afterEach(cleanup);

const EXTERNO = { uid: 'x', rol: 'operador', tipoUsuario: 'externo', empresaId: 'e1' };
const INTERNO = { uid: 'i', rol: 'dev' };
const periodo = () => {
  fireEvent.change(screen.getByLabelText('Año'), { target: { value: '2026' } });
  fireEvent.change(screen.getByLabelText('Mes'), { target: { value: '09' } });
};
const empresaDe = (q) => q.r.find((x) => x.campo === 'empresaId');

describe('usuario externo', () => {
  beforeEach(() => { usuario = EXTERNO; });

  it('no consulta hasta tener año y mes', () => {
    render(<OrdenesCompra />);
    expect(consultas).toHaveLength(0);
    expect(screen.getByText(/Selecciona un año y mes/)).toBeInTheDocument();
  });

  it('consulta siempre su empresa, con año y mes, en la copia del portal', async () => {
    render(<OrdenesCompra />);
    periodo();
    await screen.findByText('TROCAR');
    expect(consultas).toHaveLength(1);
    expect(consultas[0].col).toBe('portal_ordenes_compra');
    expect(empresaDe(consultas[0])).toEqual({ campo: 'empresaId', op: '==', valor: 'e1' });
    expect(consultas[0].r).toEqual(expect.arrayContaining([{ campo: 'anio', op: '==', valor: '2026' }, { campo: 'mes', op: '==', valor: '09' }]));
  });

  it('no tiene filtro de empresa ni pide el Maestro, y no ve la columna Proveedor', async () => {
    render(<OrdenesCompra />);
    periodo();
    await screen.findByText('TROCAR');
    expect(screen.queryByLabelText('Empresa')).toBeNull();
    expect(useCatalogo).not.toHaveBeenCalled();
    expect(screen.queryByRole('columnheader', { name: 'Proveedor' })).toBeNull();
  });

  it('solo consulta: sin importar, editar ni eliminar', async () => {
    render(<OrdenesCompra />);
    periodo();
    await screen.findByText('TROCAR');
    expect(screen.queryByText(/Importar|Eliminar|Editar/i)).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('muestra las columnas autorizadas, sin paciente, médico, admisión ni montos', async () => {
    render(<OrdenesCompra />);
    periodo();
    await screen.findByText('TROCAR');
    ['Fecha Cx', 'OC', 'Código', 'Descripción', 'Cant.', 'Estado', 'N° Guía', 'N° Factura'].forEach((n) => {
      expect(screen.getByRole('columnheader', { name: n })).toBeInTheDocument();
    });
    ['Paciente', 'Médico', 'Admisión', 'ID', 'Monto', 'Precio'].forEach((n) => {
      expect(screen.queryByRole('columnheader', { name: n })).toBeNull();
    });
  });

  it('ordena por fecha, de la más reciente, y filtra sin volver a consultar', async () => {
    render(<OrdenesCompra />);
    periodo();
    await screen.findByText('TROCAR');
    const celdas = screen.getAllByRole('row').slice(1).map((r) => r.textContent);
    expect(celdas[0]).toContain('PLACA');
    fireEvent.change(screen.getByLabelText('Buscar'), { target: { value: 'g1' } });
    expect(screen.queryByText('PLACA')).toBeNull();
    expect(screen.getByText('TROCAR')).toBeInTheDocument();
    expect(consultas).toHaveLength(1);
  });

  it('si la lectura se rechaza avisa, sin mostrar datos', async () => {
    respuesta = async () => { throw Object.assign(new Error('x'), { code: 'permission-denied' }); };
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<OrdenesCompra />);
    periodo();
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudieron cargar');
    respuesta = async () => ({ docs: FILAS.map((f) => ({ id: f.id, data: () => f })), size: FILAS.length });
  });
});

describe('usuario interno', () => {
  beforeEach(() => { usuario = INTERNO; });

  it('por defecto ve todas las empresas, con la columna Proveedor', async () => {
    render(<OrdenesCompra />);
    periodo();
    await screen.findByText('TROCAR');
    expect(empresaDe(consultas[0])).toBeUndefined();
    expect(screen.getByRole('columnheader', { name: 'Proveedor' })).toBeInTheDocument();
  });

  it('puede filtrar por una empresa o por las sin empresa reconocida', async () => {
    render(<OrdenesCompra />);
    periodo();
    await screen.findByText('TROCAR');
    fireEvent.change(screen.getByLabelText('Empresa'), { target: { value: 'e2' } });
    await waitFor(() => expect(consultas).toHaveLength(2));
    expect(empresaDe(consultas[1])).toEqual({ campo: 'empresaId', op: '==', valor: 'e2' });
    fireEvent.change(screen.getByLabelText('Empresa'), { target: { value: '__sin_empresa__' } });
    await waitFor(() => expect(consultas).toHaveLength(3));
    expect(empresaDe(consultas[2])).toEqual({ campo: 'empresaId', op: '==', valor: null });
  });
});
