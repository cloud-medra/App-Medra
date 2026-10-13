// ocImport/meta por módulo: versión sincronizada y OC cambiadas pendientes
// de Implantes (campos de siempre) y de Hemodinamia (campos propios).
import { describe, it, expect, vi, beforeEach } from 'vitest';

const escritos = [];
vi.mock('firebase/firestore', () => ({
  doc: () => ({}),
  getDoc: vi.fn(),
  setDoc: async (_ref, datos) => { escritos.push(Object.keys(datos)); },
  updateDoc: async (_ref, datos) => { escritos.push(Object.keys(datos)); },
  serverTimestamp: () => 'ts',
  arrayUnion: (...v) => v,
  deleteField: () => 'x',
}));
vi.mock('firebase/storage', () => ({ ref: vi.fn(), uploadString: vi.fn(), getBytes: vi.fn() }));
vi.mock('../../../../../firebaseConfig', () => ({ db: {}, storage: {} }));
vi.mock('./cacheIndiceOC', () => ({ leerCacheIndiceOC: vi.fn(), guardarCacheIndiceOC: vi.fn() }));

const remoto = await import('./indiceOCRemoto');
beforeEach(() => { escritos.length = 0; });

describe('indiceOCRemoto por módulo', () => {
  it('registrar sincronización', async () => {
    await remoto.registrarSincronizacionOC(3);
    await remoto.registrarSincronizacionOC(3, 'hemodinamia');
    expect(escritos).toEqual([['ultimaSyncVersion', 'ultimaSyncEn'], ['ultimaSyncVersionHemodinamia', 'ultimaSyncEnHemodinamia']]);
  });

  it('pendientes: por defecto en todos los módulos; o solo en los que fallaron; limpiar uno', async () => {
    await remoto.agregarInvalidacionesPendientes([{ a: 1 }]);
    await remoto.agregarInvalidacionesPendientes([{ a: 1 }], ['hemodinamia']);
    await remoto.limpiarInvalidacionesPendientes('hemodinamia');
    await remoto.limpiarInvalidacionesPendientes();
    expect(escritos).toEqual([
      ['ocInvalidacionesPendientes', 'ocInvalidacionesPendientesHemodinamia'],
      ['ocInvalidacionesPendientesHemodinamia'],
      ['ocInvalidacionesPendientesHemodinamia'],
      ['ocInvalidacionesPendientes'],
    ]);
  });
});
