// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// --- Firestore simulado ---
const mockOnSnapshot = vi.fn();
const mockGetDocs = vi.fn();
const mockUnsubscribe = vi.fn();
let emitirCodigos = null;

vi.mock('../firebaseConfig', () => ({ db: {} }));
vi.mock('firebase/firestore', () => {
  class FieldValue {
    constructor(tipo) { this.tipo = tipo; }
    isEqual(otro) { return otro instanceof FieldValue && otro.tipo === this.tipo; }
  }
  return {
    FieldValue,
    serverTimestamp: () => new FieldValue('serverTimestamp'),
    deleteField: () => new FieldValue('delete'),
    increment: () => new FieldValue('increment'),
    collection: (_db, ruta) => ({ path: ruta }),
    query: (q, ...restricciones) => ({ q, restricciones }),
    getDocs: (...a) => mockGetDocs(...a),
    onSnapshot: (...a) => mockOnSnapshot(...a),
  };
});

const snap = (docs) => ({ docs: docs.map(({ id, ...data }) => ({ id, data: () => data })) });

const store = await import('./catalogosStore');
const firestore = await import('firebase/firestore');
const { useCatalogo } = await import('../hooks/useCatalogo');

beforeEach(() => {
  store.reiniciarCatalogos();
  vi.clearAllMocks();
  emitirCodigos = null;
  mockOnSnapshot.mockImplementation((_ref, onNext) => {
    emitirCodigos = onNext;
    return mockUnsubscribe;
  });
  mockGetDocs.mockResolvedValue(snap([{ id: 'e1', nombre: 'BETA' }, { id: 'e2', nombre: 'ALFA' }]));
});

describe('catalogosStore — maestros_codigos en vivo', () => {
  it('abre un único listener compartido y no lo cierra al desmontar', async () => {
    const a = renderHook(() => useCatalogo('codigos'));
    const b = renderHook(() => useCatalogo('codigos'));
    expect(mockOnSnapshot).toHaveBeenCalledTimes(1);

    await act(async () => { emitirCodigos(snap([{ id: 'c1', referencia: 'R1' }])); });
    expect(a.result.current.datos).toHaveLength(1);
    expect(b.result.current.cargado).toBe(true);

    a.unmount();
    b.unmount();
    expect(mockUnsubscribe).not.toHaveBeenCalled();

    // Una nueva pantalla reutiliza los datos sin abrir otro listener.
    const c = renderHook(() => useCatalogo('codigos'));
    expect(c.result.current.datos).toHaveLength(1);
    expect(mockOnSnapshot).toHaveBeenCalledTimes(1);
  });

  it('refleja los cambios que llegan por el listener', async () => {
    const { result } = renderHook(() => useCatalogo('codigos'));
    await act(async () => { emitirCodigos(snap([{ id: 'c1' }])); });
    await act(async () => { emitirCodigos(snap([{ id: 'c1' }, { id: 'c2' }])); });
    expect(result.current.datos.map(d => d.id)).toEqual(['c1', 'c2']);
  });

  it('reiniciarCatalogos cierra el listener y borra los datos', async () => {
    const p = store.cargarCatalogo('codigos');
    emitirCodigos(snap([{ id: 'c1' }]));
    await p;
    store.reiniciarCatalogos();
    expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
    expect(store.leerCatalogo('codigos')).toBeNull();
  });

  it('codigosPorReferenciaSiDisponible devuelve null si nadie pidió el catálogo', async () => {
    expect(await store.codigosPorReferenciaSiDisponible(['R1'])).toBeNull();
    expect(mockOnSnapshot).not.toHaveBeenCalled();
  });

  it('codigosPorReferenciaSiDisponible resuelve en memoria (primera coincidencia)', async () => {
    const p = store.cargarCatalogo('codigos');
    emitirCodigos(snap([{ id: 'a', referencia: 'R1' }, { id: 'b', referencia: 'R1' }, { id: 'c', referencia: 'R2' }]));
    await p;
    const mapa = await store.codigosPorReferenciaSiDisponible(['R1', 'R9']);
    expect(mapa.get('R1').id).toBe('a');
    expect(mapa.has('R9')).toBe(false);
  });
});

describe('catalogosStore — catálogos de lectura única', () => {
  it('lee una sola vez aunque lo pidan varias pantallas', async () => {
    await Promise.all([store.cargarCatalogo('empresas'), store.cargarCatalogo('empresas')]);
    await store.cargarCatalogo('empresas');
    expect(mockGetDocs).toHaveBeenCalledTimes(1);
  });

  it('refrescarCatalogo vuelve a leer', async () => {
    await store.cargarCatalogo('empresas');
    await store.refrescarCatalogo('empresas');
    expect(mockGetDocs).toHaveBeenCalledTimes(2);
  });

  it('upsertLocal agrega/edita (resolviendo serverTimestamp) y removeLocal elimina', async () => {
    await store.cargarCatalogo('empresas');
    store.upsertLocal('empresas', 'e1', { nombre: 'BETA 2', fecha: firestore.serverTimestamp(), rut: firestore.deleteField() });
    store.upsertLocal('empresas', 'e3', { nombre: 'GAMMA' });
    store.removeLocal('empresas', 'e2');

    const datos = store.leerCatalogo('empresas');
    expect(datos.map(d => d.id)).toEqual(['e1', 'e3']);
    expect(datos[0].nombre).toBe('BETA 2');
    expect(datos[0].fecha).toBeInstanceOf(Date);
    expect(datos[0]).not.toHaveProperty('rut');
    expect(mockGetDocs).toHaveBeenCalledTimes(1);
  });

  it('upsertLocal no hace nada si el catálogo aún no se cargó', () => {
    store.upsertLocal('empresas', 'e9', { nombre: 'X' });
    expect(store.leerCatalogo('empresas')).toBeNull();
  });

  it('un error de lectura permite reintentar', async () => {
    mockGetDocs.mockRejectedValueOnce(new Error('offline'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(store.cargarCatalogo('centros')).rejects.toThrow('offline');
    expect(store.obtenerEstadoCatalogo('centros').error).toBeTruthy();
    await store.cargarCatalogo('centros');
    expect(mockGetDocs).toHaveBeenCalledTimes(2);
  });
});

describe('ordenarPor', () => {
  it('ordena como orderBy y deja al final los que no tienen el campo', () => {
    const datos = [{ n: 'b' }, {}, { n: 'a' }];
    expect([...datos].sort(store.ordenarPor('n')).map(d => d.n)).toEqual(['a', 'b', undefined]);
    expect([...datos].sort(store.ordenarPor('n', 'desc')).map(d => d.n)).toEqual(['b', 'a', undefined]);
  });

  it('compara Timestamps y Dates', () => {
    const ts = (ms) => ({ toMillis: () => ms });
    const datos = [{ f: ts(2) }, { f: new Date(3) }, { f: ts(1) }];
    expect([...datos].sort(store.ordenarPor('f', 'desc')).map(d => (d.f.toMillis ? d.f.toMillis() : d.f.getTime()))).toEqual([3, 2, 1]);
  });
});

describe('catalogosStore — consulta filtrada (notas por rol)', () => {
  it('lee con la consulta y vuelve a leer solo si cambia la clave', async () => {
    const consulta = (rol) => ({ clave: `rol:${rol}`, restricciones: [{ rol }] });
    await store.cargarCatalogo('notas', consulta('operador'));
    expect(mockGetDocs).toHaveBeenCalledTimes(1);
    expect(mockGetDocs.mock.calls[0][0]).toEqual({ q: { path: 'administracion_notas' }, restricciones: [{ rol: 'operador' }] });

    await store.cargarCatalogo('notas', consulta('operador'));
    expect(mockGetDocs).toHaveBeenCalledTimes(1);

    await store.refrescarCatalogo('notas');
    expect(mockGetDocs.mock.calls[1][0].restricciones).toEqual([{ rol: 'operador' }]);

    await store.cargarCatalogo('notas', consulta('admin'));
    expect(mockGetDocs).toHaveBeenCalledTimes(3);
    expect(mockGetDocs.mock.calls[2][0].restricciones).toEqual([{ rol: 'admin' }]);
  });

  it('una respuesta de la consulta anterior no pisa los datos de la nueva', async () => {
    let resolverVieja;
    mockGetDocs.mockReturnValueOnce(new Promise((r) => { resolverVieja = r; }));
    store.cargarCatalogo('notas', { clave: 'rol:operador', restricciones: [] }).catch(() => {});
    mockGetDocs.mockResolvedValueOnce(snap([{ id: 'nueva' }]));
    await store.cargarCatalogo('notas', { clave: 'todas', restricciones: [] });
    resolverVieja(snap([{ id: 'vieja' }]));
    await Promise.resolve();
    expect(store.leerCatalogo('notas').map((d) => d.id)).toEqual(['nueva']);
  });
});
