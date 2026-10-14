// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDocumentosSistemaPeriodo } from './useDocumentosSistemaPeriodo';

const mockGetDocs = vi.fn();
const mockWhere = vi.fn((...args) => ({ _type: 'where', args }));

vi.mock('../../../../../firebaseConfig', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, ...pathSegments) => ({ _type: 'collection', path: pathSegments.join('/') })),
  collectionGroup: vi.fn((_db, nombre) => ({ _type: 'collectionGroup', nombre })),
  query: vi.fn((ref, ...constraints) => ({ ...ref, _constraints: constraints })),
  where: (...args) => mockWhere(...args),
  and: vi.fn((...c) => ({ _type: 'and', c })),
  or: vi.fn((...c) => ({ _type: 'or', c })),
  orderBy: vi.fn(),
  limit: vi.fn(),
  documentId: vi.fn(),
  getDocs: (...args) => mockGetDocs(...args)
}));

const docsDeIds = (ids) => ({ docs: ids.map((id) => ({ id, ref: { path: `x/${id}` }, data: () => ({ estado: 'Recibido' }) })) });

// Cambiar de año dispara DOS efectos (meses y filas) al mismo tiempo — se
// deja la cola de mocks con margen (una respuesta vacía extra) para no
// depender del orden exacto en que ambos terminan, y se espera con
// setTimeout(0) en vez de un solo microtask para dar tiempo a ambos.
const flush = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

describe('useDocumentosSistemaPeriodo', () => {
  beforeEach(() => {
    mockGetDocs.mockReset();
    mockGetDocs.mockResolvedValue(docsDeIds([])); // default: cualquier llamada no explícitamente encolada no revienta
    mockWhere.mockClear();
  });

  it('con año pero sin mes, consulta el año completo (sin necesitar mes)', async () => {
    mockGetDocs.mockResolvedValueOnce(docsDeIds(['2026'])); // años
    const { result } = renderHook(() => useDocumentosSistemaPeriodo());
    await flush();

    mockGetDocs.mockResolvedValueOnce(docsDeIds([])); // meses del año elegido
    mockGetDocs.mockResolvedValueOnce(docsDeIds(['1001', '1002'])); // filas del año completo
    act(() => { result.current.setAnio('2026'); });
    await flush();

    expect(result.current.filas).toHaveLength(2);
    const llamadaWhereMin = mockWhere.mock.calls.find(c => c[1] === '>=' && !c[2].includes('meses'));
    expect(llamadaWhereMin[2]).toBe('documentos_sistema/2026');
  });

  it('con año Y mes, acota el rango al mes elegido', async () => {
    mockGetDocs.mockResolvedValueOnce(docsDeIds(['2026']));
    const { result } = renderHook(() => useDocumentosSistemaPeriodo());
    await flush();

    mockGetDocs.mockResolvedValueOnce(docsDeIds(['09'])); // meses
    act(() => { result.current.setAnio('2026'); });
    await flush();

    mockGetDocs.mockResolvedValueOnce(docsDeIds(['1001'])); // filas del mes
    act(() => { result.current.setMes('09'); });
    await flush();

    const llamadaWhereMin = mockWhere.mock.calls.find(c => c[1] === '>=' && c[2].includes('meses'));
    expect(llamadaWhereMin[2]).toBe('documentos_sistema/2026/meses/09');
  });

  it('los meses del año elegido quedan en orden cronológico', async () => {
    mockGetDocs.mockImplementation(async (ref) => {
      if (ref.path === 'documentos_sistema') return docsDeIds(['2026']);
      if (ref.path === 'documentos_sistema/2026/meses') return docsDeIds(['10', '09', '12', '01']);
      return docsDeIds([]);
    });
    const { result } = renderHook(() => useDocumentosSistemaPeriodo());
    await flush();

    act(() => { result.current.setAnio('2026'); });
    await flush();

    expect(result.current.meses).toEqual(['01', '09', '10', '12']);
  });

  it('cuando se pasa filtroServidor, agrega ese where(...) a la consulta', async () => {
    mockGetDocs.mockResolvedValueOnce(docsDeIds(['2026']));
    const filtro = { campo: 'estado', operador: '==', valor: 'Pendiente factura' };
    const { result } = renderHook(() => useDocumentosSistemaPeriodo(filtro));
    await flush();

    act(() => { result.current.setAnio('2026'); });
    await flush();

    const llamadaEstado = mockWhere.mock.calls.find(c => c[0] === 'estado');
    expect(llamadaEstado).toEqual(['estado', '==', 'Pendiente factura']);
  });

  it('un filtro { o: [...] } va como or(...) dentro de and(...) junto al rango de ruta', async () => {
    mockGetDocs.mockResolvedValueOnce(docsDeIds(['2026']));
    const filtro = { o: [
      { campo: 'estado', operador: '==', valor: 'Pendiente factura' },
      { campo: 'numero_factura', operador: 'in', valor: ['', '0'] }
    ] };
    const { result } = renderHook(() => useDocumentosSistemaPeriodo(filtro));
    await flush();

    mockGetDocs.mockResolvedValue(docsDeIds([]));
    act(() => { result.current.setAnio('2026'); });
    await flush();

    const consulta = mockGetDocs.mock.calls.map(c => c[0]).find(q => q._type === 'collectionGroup');
    const [filtroRaiz] = consulta._constraints;
    expect(filtroRaiz._type).toBe('and');
    const ramaOr = filtroRaiz.c.find(c => c._type === 'or');
    expect(ramaOr.c.map(w => w.args)).toEqual([
      ['estado', '==', 'Pendiente factura'],
      ['numero_factura', 'in', ['', '0']]
    ]);
  });

  it('soporta operador "in" (ej. numero_guia vacío o "0")', async () => {
    mockGetDocs.mockResolvedValueOnce(docsDeIds(['2026']));
    const filtro = { campo: 'numero_guia', operador: 'in', valor: ['', '0'] };
    const { result } = renderHook(() => useDocumentosSistemaPeriodo(filtro));
    await flush();

    act(() => { result.current.setAnio('2026'); });
    await flush();

    const llamada = mockWhere.mock.calls.find(c => c[0] === 'numero_guia');
    expect(llamada).toEqual(['numero_guia', 'in', ['', '0']]);
  });

  it('sin filtroServidor, NO agrega ningún where extra más allá del rango de período', async () => {
    mockGetDocs.mockResolvedValueOnce(docsDeIds(['2026']));
    const { result } = renderHook(() => useDocumentosSistemaPeriodo());
    await flush();

    act(() => { result.current.setAnio('2026'); });
    await flush();

    const llamadasExtra = mockWhere.mock.calls.filter(c => c[0] !== undefined && typeof c[0] === 'string' && c[0] !== '__name__');
    expect(llamadasExtra).toHaveLength(0);
  });

  it('cambiar de filtroServidor entre renders no entra en loop (identidad estable vía JSON.stringify)', async () => {
    mockGetDocs.mockResolvedValueOnce(docsDeIds(['2026']));
    // objeto NUEVO en cada render (a propósito, simulando un llamador que no memoiza)
    const { result, rerender } = renderHook(
      ({ filtro }) => useDocumentosSistemaPeriodo(filtro),
      { initialProps: { filtro: { campo: 'estado', operador: '==', valor: 'Pendiente factura' } } }
    );
    await flush();

    mockGetDocs.mockResolvedValueOnce(docsDeIds(['1001']));
    act(() => { result.current.setAnio('2026'); });
    await flush();

    const llamadasAntes = mockGetDocs.mock.calls.length;
    // mismo contenido, pero OTRA instancia de objeto — no debería disparar una nueva consulta
    rerender({ filtro: { campo: 'estado', operador: '==', valor: 'Pendiente factura' } });
    await flush();

    expect(mockGetDocs.mock.calls.length).toBe(llamadasAntes);
  });
});
