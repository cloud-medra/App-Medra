// Sincronizar OC de Consignación: al escribir la orden, una carga SOLICITADO
// pasa a FINALIZADO en la misma escritura (y el log lo anota); en otro
// estado solo se escribe la orden.
import { describe, it, expect, vi } from 'vitest';

const actualizaciones = [];
const logs = [];
vi.mock('firebase/firestore', () => ({
  collectionGroup: vi.fn(), query: vi.fn(), where: vi.fn(), FieldPath: vi.fn(),
  serverTimestamp: () => 'TS',
  doc: (_db, path) => ({ path }),
  collection: (ref, nombre) => ({ path: `${ref.path}/${nombre}` }),
  getDocs: vi.fn(async () => ({
    size: 2,
    docs: [
      { id: 'a', ref: { path: 'consignacion_registros/2026/mes/octubre/dia/01/detalles/a' }, data: () => ({ estado: 'SOLICITADO', orden: '' }) },
      { id: 'b', ref: { path: 'consignacion_registros/2026/mes/octubre/dia/01/detalles/b' }, data: () => ({ estado: 'CARGADO', orden: '' }) },
    ],
  })),
  writeBatch: () => ({
    update: (ref, datos) => actualizaciones.push([ref.path, datos]),
    set: (ref, datos) => logs.push(datos),
    commit: vi.fn(async () => {}),
  }),
}));
vi.mock('../../../../../firebaseConfig', () => ({ db: {} }));
vi.mock('./indiceOCRemoto', () => ({ obtenerIndiceOC: vi.fn(), registrarSincronizacionOC: vi.fn(), limpiarInvalidacionesPendientes: vi.fn() }));
vi.mock('./invalidarOCGestiones', () => ({ invalidarOCGestiones: vi.fn() }));
vi.mock('./indiceOC', () => ({
  agruparIndiceOC: vi.fn(),
  cruzarGestionesOC: vi.fn(),
  cruzarRegistrosConsignacionOC: (registros) => ({
    asignaciones: registros.map((r, i) => ({ refPath: r.refPath, oc: String(100 + i) })),
    detalle: [], contadores: {},
  }),
}));

const { ejecutarSincronizacionOCConsignacion } = await import('./sincronizarOC');

describe('ejecutarSincronizacionOCConsignacion', () => {
  it('SOLICITADO + orden → FINALIZADO; CARGADO conserva su estado', async () => {
    await ejecutarSincronizacionOCConsignacion({ meta: { fechaMin: '2026-01-01', fechaMax: '2026-12-31' }, indice: {} }, { userData: { nombreCompleto: 'Ana' } });
    expect(actualizaciones).toEqual([
      ['consignacion_registros/2026/mes/octubre/dia/01/detalles/a', { orden: '100', ordenOrigen: 'oc', ocActualizadoEn: 'TS', estado: 'FINALIZADO' }],
      ['consignacion_registros/2026/mes/octubre/dia/01/detalles/b', { orden: '101', ordenOrigen: 'oc', ocActualizadoEn: 'TS' }],
    ]);
    expect(logs[0].detalles).toEqual({ orden: '100', origen: 'SINCRONIZAR_OC', estadoAnterior: 'SOLICITADO', estadoNuevo: 'FINALIZADO' });
    expect(logs[1].detalles).toEqual({ orden: '101', origen: 'SINCRONIZAR_OC' });
  });
});
