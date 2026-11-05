// @vitest-environment jsdom
// Órdenes de Compra del portal. Lo central: un externo solo consulta la copia de su
// empresa y nunca ve ni pide nombre ni montos; un interno lee las filas originales.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const consultas = [];
const FECHA = (d) => ({ toDate: () => new Date(2026, 8, d) });
const COPIAS = [
  { id: 'a', oc: '100', codigo: 'C1', descripcion: 'TROCAR', cantidad: 2, estado: 'Facturado', numero_guia: 'G1', numero_factura: 'F1', fecha_cx: FECHA(10), proveedor: 'ARENYS', empresaId: 'e1' },
  { id: 'b', oc: '200', codigo: 'C2', descripcion: 'PLACA', cantidad: 1, estado: 'Pendiente factura', numero_guia: 'G2', numero_factura: '', fecha_cx: FECHA(20), proveedor: 'ARENYS', empresaId: 'e1' },
];
const ORIGINALES = [
  { id: 'x_1', paciente: 'JUANA PEREZ', medico: 'DR SOTO', admision: '114584', oc: '100', codigo: 'C1', descripcion: 'TROCAR', cantidad: 2, precio_u: 1500, oc_monto: 3000, estado: 'Facturado', numero_guia: 'G1', numero_factura: 'F1', fecha_cx: FECHA(10), proveedor: 'ARENYS' },
  { id: 'x_2', paciente: 'ANA SOTO', medico: 'DR ROJAS', admision: '114585', oc: '300', codigo: 'C3', descripcion: 'TORNILLO', cantidad: 1, precio_u: 0, oc_monto: 0, estado: 'Facturado', numero_guia: '', numero_factura: '', fecha_cx: FECHA(15), proveedor: 'BETA' },
  { id: 'x_3', paciente: 'EVA DIAZ', medico: 'DR ROJAS', admision: '114586', oc: '400', codigo: 'C4', descripcion: 'MALLA', cantidad: 1, precio_u: 10, oc_monto: 10, estado: 'Facturado', numero_guia: '', numero_factura: '', fecha_cx: FECHA(20), proveedor: 'MEDILAND SPA' },
];
const respuestaDe = (filas) => ({ docs: filas.map((f) => ({ id: f.id, data: () => f })), size: filas.length });
const respuestaNormal = async (q) => respuestaDe(q.col === 'grupo:detalles' ? ORIGINALES : COPIAS);
let respuesta = respuestaNormal;
vi.mock('firebase/firestore', () => ({
  collection: (_db, c) => c,
  collectionGroup: (_db, c) => `grupo:${c}`,
  documentId: () => '__name__',
  orderBy: (campo, dir) => ({ orden: campo, dir }),
  limit: (n) => ({ limite: n }),
  where: (campo, op, valor) => ({ campo, op, valor }),
  query: (col, ...r) => ({ col, r }),
  getDocs: (q) => { consultas.push(q); return respuesta(q); },
  serverTimestamp: vi.fn(),
}));
vi.mock('../../../../firebaseConfig', () => ({ db: {} }));
let usuario;
vi.mock('../../../../context/UserContext', () => ({ useUser: () => ({ userData: usuario }) }));
// Un externo con TODAS las columnas marcadas: ni así debe ver las de internos.
let permitir = () => true;
vi.mock('../../../../hooks/useGranularPermission', () => ({ useGranularPermission: () => ({ hasPermission: (...a) => permitir(...a) }) }));
const CATALOGO = () => ({ datos: [{ id: 'e2', nombre: 'BETA' }, { id: 'e1', nombre: 'ARENYS' }], cargado: true });
const useCatalogo = vi.fn(CATALOGO);
vi.mock('../../../../hooks/useCatalogo', () => ({ useCatalogo: (...a) => useCatalogo(...a) }));

const { default: OrdenesCompra } = await import('./OrdenesCompra');

beforeEach(() => { consultas.length = 0; useCatalogo.mockClear(); useCatalogo.mockImplementation(CATALOGO); respuesta = respuestaNormal; permitir = () => true; });
afterEach(cleanup);

const EXTERNO = { uid: 'x', rol: 'operador', tipoUsuario: 'externo', empresaId: 'e1' };
const INTERNO = { uid: 'i', rol: 'operador', permisos: { portalProveedores: ['/portalProveedores/ordenesCompra'] } };
const periodo = () => {
  fireEvent.change(screen.getByLabelText('Año'), { target: { value: '2026' } });
  fireEvent.change(screen.getByLabelText('Mes'), { target: { value: '09' } });
};
const empresaDe = (q) => q.r.find((x) => x.campo === 'empresaId');
const encabezados = () => screen.getAllByRole('columnheader').map((h) => h.textContent.trim()).filter(Boolean);

describe('usuario externo', () => {
  beforeEach(() => { usuario = EXTERNO; });

  it('no consulta hasta tener año y mes', () => {
    render(<OrdenesCompra />);
    expect(consultas).toHaveLength(0);
    expect(screen.getByText(/Selecciona un año y mes/)).toBeInTheDocument();
  });

  it('consulta solo la copia del portal, siempre con su empresa, año y mes', async () => {
    render(<OrdenesCompra />);
    periodo();
    await screen.findByText('TROCAR');
    expect(consultas).toHaveLength(1);
    expect(consultas[0].col).toBe('portal_ordenes_compra');
    expect(empresaDe(consultas[0])).toEqual({ campo: 'empresaId', op: '==', valor: 'e1' });
    expect(consultas[0].r).toEqual(expect.arrayContaining([{ campo: 'anio', op: '==', valor: '2026' }, { campo: 'mes', op: '==', valor: '09' }]));
    expect(consultas.some((q) => String(q.col).includes('detalles'))).toBe(false);
  });

  it('no tiene filtro de empresa ni pide el Maestro', async () => {
    render(<OrdenesCompra />);
    periodo();
    await screen.findByText('TROCAR');
    expect(screen.queryByLabelText('Empresa')).toBeNull();
    expect(useCatalogo).not.toHaveBeenCalled();
  });

  it('solo consulta: sin importar, editar ni eliminar', async () => {
    render(<OrdenesCompra />);
    periodo();
    await screen.findByText('TROCAR');
    expect(screen.queryByText(/Importar|Eliminar|Editar/i)).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('sus columnas son exactamente las aprobadas, aunque tenga marcadas las de internos', async () => {
    render(<OrdenesCompra />);
    periodo();
    await screen.findByText('TROCAR');
    expect(encabezados()).toEqual(['Fecha Cx', 'OC', 'Código', 'Descripción', 'Cant.', 'Estado', 'N° Guía', 'N° Factura']);
  });

  it('un dato de paciente o monto colado en la copia tampoco se muestra ni se busca', async () => {
    respuesta = async () => respuestaDe([{ ...COPIAS[0], paciente: 'JUANA PEREZ', precio_u: 1500, oc_monto: 3000 }]);
    render(<OrdenesCompra />);
    periodo();
    await screen.findByText('TROCAR');
    expect(screen.queryByText('JUANA PEREZ')).toBeNull();
    expect(screen.queryByText(/1\.500|3\.000/)).toBeNull();
    fireEvent.change(screen.getByLabelText('Buscar'), { target: { value: 'juana' } });
    expect(screen.queryByText('TROCAR')).toBeNull();
  });

  it('ordena por fecha, de la más reciente, y filtra sin volver a consultar', async () => {
    render(<OrdenesCompra />);
    periodo();
    await screen.findByText('TROCAR');
    expect(screen.getAllByRole('row')[1].textContent).toContain('PLACA');
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
  });
});

describe('usuario interno', () => {
  beforeEach(() => { usuario = INTERNO; });

  it('lee las filas originales del mes, no la copia', async () => {
    render(<OrdenesCompra />);
    periodo();
    await screen.findByText('JUANA PEREZ');
    expect(consultas).toHaveLength(1);
    expect(consultas[0].col).toBe('grupo:detalles');
    expect(consultas[0].r).toEqual(expect.arrayContaining([
      { campo: '__name__', op: '>=', valor: 'documentos_sistema/2026/meses/09' },
      { campo: '__name__', op: '<', valor: 'documentos_sistema/2026/meses/09' },
    ]));
  });

  it('Nombre va primero y suma Precio unitario y Total ítems', async () => {
    render(<OrdenesCompra />);
    periodo();
    await screen.findByText('JUANA PEREZ');
    expect(encabezados()).toEqual(['Nombre', 'Fecha Cx', 'Proveedor', 'OC', 'Código', 'Descripción', 'Cant.', 'Precio unitario', 'Total ítems', 'Estado', 'N° Guía', 'N° Factura']);
  });

  it('muestra los montos, con "-" si están en 0, y nunca médico ni admisión', async () => {
    render(<OrdenesCompra />);
    periodo();
    await screen.findByText('JUANA PEREZ');
    const fila = (texto) => screen.getByText(texto).closest('tr');
    expect(fila('JUANA PEREZ')).toHaveTextContent('$1.500');
    expect(fila('JUANA PEREZ')).toHaveTextContent('$3.000');
    const ceros = [...fila('ANA SOTO').querySelectorAll('td')].filter((td) => td.textContent === '-').length;
    expect(ceros).toBeGreaterThanOrEqual(2);
    expect(fila('ANA SOTO')).not.toHaveTextContent('$0');
    expect(screen.queryByText('DR SOTO')).toBeNull();
    expect(screen.queryByText('114584')).toBeNull();
  });

  it('busca por nombre', async () => {
    render(<OrdenesCompra />);
    periodo();
    await screen.findByText('JUANA PEREZ');
    fireEvent.change(screen.getByLabelText('Buscar'), { target: { value: 'juana' } });
    expect(screen.getByText('TROCAR')).toBeInTheDocument();
    expect(screen.queryByText('MALLA')).toBeNull();
  });

  it('filtrar por empresa no vuelve a consultar', async () => {
    render(<OrdenesCompra />);
    periodo();
    await screen.findByText('JUANA PEREZ');
    fireEvent.change(screen.getByLabelText('Empresa'), { target: { value: 'e2' } });
    expect(screen.getByText('ANA SOTO')).toBeInTheDocument();
    expect(screen.queryByText('JUANA PEREZ')).toBeNull();
    fireEvent.change(screen.getByLabelText('Empresa'), { target: { value: '__sin_empresa__' } });
    expect(screen.getByText('EVA DIAZ')).toBeInTheDocument();
    expect(screen.queryByText('ANA SOTO')).toBeNull();
    expect(consultas).toHaveLength(1);
  });

  it('con el filtro de empresa puesto, no muestra filas hasta tener el Maestro', async () => {
    useCatalogo.mockImplementation(() => ({ datos: [], cargado: false }));
    render(<OrdenesCompra />);
    periodo();
    await screen.findByText('JUANA PEREZ'); // sin filtro no depende del Maestro
    fireEvent.change(screen.getByLabelText('Empresa'), { target: { value: '__sin_empresa__' } });
    expect(screen.getByText(/Cargando órdenes/)).toBeInTheDocument();
    expect(screen.queryByText('JUANA PEREZ')).toBeNull();
  });

  it('si el Maestro falla, el filtro de empresa avisa en vez de cargar para siempre', async () => {
    useCatalogo.mockImplementation(() => ({ datos: [], cargado: false, error: new Error('x') }));
    render(<OrdenesCompra />);
    periodo();
    await screen.findByText('JUANA PEREZ');
    fireEvent.change(screen.getByLabelText('Empresa'), { target: { value: '__sin_empresa__' } });
    expect(screen.getByRole('alert')).toHaveTextContent('No se pudieron cargar');
  });

  it('las columnas nuevas se pueden quitar por usuario', async () => {
    permitir = (_ruta, _seccion, el) => !['col_paciente', 'col_precio_u', 'col_oc_monto'].includes(el);
    render(<OrdenesCompra />);
    periodo();
    await screen.findByText('TROCAR');
    expect(encabezados()).toEqual(['Fecha Cx', 'Proveedor', 'OC', 'Código', 'Descripción', 'Cant.', 'Estado', 'N° Guía', 'N° Factura']);
    expect(screen.queryByText('JUANA PEREZ')).toBeNull();
  });
});
