// @vitest-environment jsdom
// Contadores del menú de Laboratorio: qué ítems cuentan, con qué estados y
// cuándo se vuelve a contar (sin conteos de más).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

const getCountFromServer = vi.fn();
vi.mock('../../../../../firebaseConfig', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collectionGroup: (_db, nombre) => ({ nombre }),
  documentId: () => '__name__',
  where: (campo, op, valor) => ({ campo, op, valor }),
  query: (base, ...filtros) => ({ base, filtros }),
  getCountFromServer: (...a) => getCountFromServer(...a),
}));

const { usePendientesLaboratorio, INTERVALO_PENDIENTES_MS } = await import('./usePendientesLaboratorio');
const { rutasConContador, PENDIENTES_LABORATORIO, ESTADOS_INICIAR_INGRESO } = await import('./pendientesLaboratorio');

const BASE = '/laboratorio/archivosControlLaboratorio';
const INICIAR = `${BASE}/iniciarProcesos`;
const LISTOS = `${BASE}/documentosListos`;
const estadosDe = (llamada) => llamada[0].filtros.find((f) => f.campo === 'estado').valor;

describe('rutasConContador', () => {
  it('solo las 5 fases con contador que el usuario ve', () => {
    expect(Object.keys(PENDIENTES_LABORATORIO)).toHaveLength(5);
    expect(rutasConContador([`${BASE}/documentosRecibidos`, LISTOS, '/laboratorio/ordenLaboratorio', INICIAR]))
      .toEqual([INICIAR, LISTOS]);
    expect(rutasConContador([])).toEqual([]);
  });
});

describe('usePendientesLaboratorio', () => {
  beforeEach(() => {
    getCountFromServer.mockReset();
    getCountFromServer.mockImplementation(async (q) => ({
      data: () => ({ count: estadosDe([q]) === ESTADOS_INICIAR_INGRESO ? 3 : 0 }),
    }));
  });
  afterEach(() => vi.useRealTimers());

  it('sin ítems con contador en el menú no lee nada', () => {
    const { result } = renderHook(() => usePendientesLaboratorio(['/implantes/gestion'], '/implantes/gestion'));
    expect(result.current).toEqual({});
    expect(getCountFromServer).not.toHaveBeenCalled();
  });

  it('un conteo por ítem visible, en collectionGroup acotado a laboratorio_documentos', async () => {
    const { result } = renderHook(() => usePendientesLaboratorio([INICIAR, LISTOS], null));
    await waitFor(() => expect(result.current).toEqual({ [INICIAR]: 3, [LISTOS]: 0 }));
    expect(getCountFromServer).toHaveBeenCalledTimes(2);
    const q = getCountFromServer.mock.calls[0][0];
    expect(q.base.nombre).toBe('documentos');
    expect(q.filtros).toContainEqual({ campo: '__name__', op: '>=', valor: 'laboratorio_documentos/0000' });
  });

  it('volver a abrir el menú no recuenta; salir de una fase sí', async () => {
    const { result, rerender } = renderHook(({ rutas, vista }) => usePendientesLaboratorio(rutas, vista), {
      initialProps: { rutas: [INICIAR], vista: INICIAR },
    });
    await waitFor(() => expect(result.current[INICIAR]).toBe(3));
    rerender({ rutas: [], vista: INICIAR });
    rerender({ rutas: [INICIAR], vista: INICIAR });
    expect(getCountFromServer).toHaveBeenCalledTimes(1);

    rerender({ rutas: [INICIAR], vista: '/laboratorio/ordenLaboratorio' });
    await waitFor(() => expect(getCountFromServer).toHaveBeenCalledTimes(2));
  });

  it('recuenta cada intervalo con la pestaña visible', async () => {
    vi.useFakeTimers();
    renderHook(() => usePendientesLaboratorio([INICIAR], null));
    await act(async () => {});
    expect(getCountFromServer).toHaveBeenCalledTimes(1);
    await act(async () => { vi.advanceTimersByTime(INTERVALO_PENDIENTES_MS); });
    expect(getCountFromServer).toHaveBeenCalledTimes(2);
  });
});
