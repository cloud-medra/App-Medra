import { describe, it, expect, vi, beforeEach } from 'vitest';

const estado = vi.hoisted(() => ({ lotes: [], snapshot: {}, meta: {}, indiceEliminados: null, invalidadas: null, falla: false }));

vi.mock('../../../../../../firebaseConfig', () => ({ db: {}, storage: {}, auth: {} }));
vi.mock('firebase/firestore', () => ({
  doc: (_db, ...p) => ({ path: p.join('/') }),
  serverTimestamp: () => 'TS',
  writeBatch: () => {
    const ops = [];
    return {
      set: (ref, data) => ops.push({ tipo: 'set', path: ref.path, data }),
      delete: (ref) => ops.push({ tipo: 'delete', path: ref.path }),
      commit: async () => { if (estado.falla) throw Object.assign(new Error('x'), { code: 'unavailable' }); estado.lotes.push(ops); }
    };
  },
  setDoc: async (_ref, data) => { estado.meta = { ...estado.meta, ...data }; }
}));
vi.mock('./snapshotStorageDetallesOC', () => ({
  obtenerSnapshotDetallesOC: async () => ({ filas: structuredClone(estado.snapshot) }),
  guardarSnapshotDetallesOC: async (filas) => { estado.snapshot = filas; return 'v2'; },
  camposMetaSnapshot: (v) => ({ snapshotDetallesVersion: v })
}));
vi.mock('../../../shared/ocIndex/indiceOCRemoto', () => ({
  leerMetaOC: async () => ({}),
  obtenerIndiceOC: async () => ({ indice: { A_1: { k: 'x', q: 1, e: 'E', oc: '1', p: '' }, B_1: { k: 'y', q: 1, e: 'E', oc: '2', p: '' } } }),
  publicarIndiceOC: async (indice) => { estado.indiceEliminados = Object.keys(indice); },
  agregarInvalidacionesPendientes: vi.fn()
}));
vi.mock('../../../shared/ocIndex/invalidarOCGestiones', () => ({
  invalidarOCGestiones: async (lista) => { estado.invalidadas = lista; return { lecturas: 1, escrituras: 2, gestionesActualizadas: 1, itemsLiberados: 1 }; }
}));

const { planificarEliminacion, eliminarFilasDetallesOC } = await import('./eliminarFilasDetallesOC');

const entrada = (a, f, p, codigo, oc) => ({ g: `${a}_${f}`, a, f, p, v: { codigo, oc } });
const SNAP = {
  A_1: entrada('100', '2026-09-15', 'MEDTRONIC', '510012', '4500001'),
  A_2: entrada('100', '2026-09-15', 'MEDTRONIC', '510012', '4500001'), // repetida con la misma OC
  B_1: entrada('200', '2026-10-02', 'ALCO', '777', '4500009'),
  C_1: entrada('200', '2026-10-02', 'ABBOTT', '888', '')
};

describe('planificarEliminacion', () => {
  it('marcadores: solo las rutas que quedan sin ninguna fila', () => {
    const { marcadores } = planificarEliminacion(['B_1'], SNAP);
    // Queda C_1 en 2026/10 y admisión 200: solo se vacía la empresa ALCO.
    expect(marcadores).toEqual([['documentos_sistema', '2026', 'meses', '10', 'admisiones', '200', 'empresas', 'alco']]);
    const todo = planificarEliminacion(['B_1', 'C_1'], SNAP).marcadores.map(r => r.join('/'));
    expect(todo).toContain('documentos_sistema/2026/meses/10');
    expect(todo).not.toContain('documentos_sistema/2026'); // septiembre sigue
  });

  it('OC a liberar: no si otra fila que queda respalda la misma OC', () => {
    expect(planificarEliminacion(['A_1'], SNAP).ocALiberar).toEqual([]);
    expect(planificarEliminacion(['A_1', 'A_2'], SNAP).ocALiberar).toEqual([
      { admision: '100', fecha: '2026-09-15', proveedor: 'MEDTRONIC', codigo: '510012', ocAntes: '4500001', ocDespues: '' }
    ]);
    expect(planificarEliminacion(['C_1'], SNAP).ocALiberar).toEqual([]); // sin OC
  });
});

describe('eliminarFilasDetallesOC', () => {
  beforeEach(() => Object.assign(estado, { lotes: [], snapshot: structuredClone(SNAP), meta: {}, indiceEliminados: null, invalidadas: null, falla: false }));
  const fila = (id, extra = {}) => ({ id, refPath: `documentos_sistema/2026/meses/10/admisiones/200/empresas/alco/detalles/${id}`, admision: '200', oc: '4500009', ...extra });

  it('respaldo y borrado en el mismo lote; snapshot, índice y OC actualizados', async () => {
    const r = await eliminarFilasDetallesOC([fila('B_1')], { liberarOC: true, usuario: { nombreCompleto: 'Admin', email: 'a@x' } });
    const [lote] = estado.lotes;
    expect(lote.map(o => o.tipo)).toEqual(['set', 'delete', 'delete']);
    expect(lote[2].path).toMatch(/^portal_ordenes_compra\/[0-9a-f]{64}$/); // su copia de Portal Proveedores
    expect(lote[0].path).toMatch(/^detallesOCEliminados\/B_1_\d+$/);
    expect(lote[0].data).toMatchObject({ idFila: 'B_1', admision: '200', oc: '4500009', eliminadoPor: 'Admin', rutaOriginal: fila('B_1').refPath });
    expect(lote[1].path).toBe(fila('B_1').refPath);
    expect(Object.keys(estado.snapshot)).toEqual(['A_1', 'A_2', 'C_1']);
    expect(estado.indiceEliminados).toEqual(['A_1']);
    expect(estado.meta.snapshotDetallesVersion).toBeUndefined(); // va en el mismo setDoc del índice
    expect(estado.invalidadas).toEqual([expect.objectContaining({ admision: '200', ocAntes: '4500009' })]);
    expect(r).toMatchObject({ eliminadas: 1, marcadoresBorrados: 1, lecturasFirestore: 2 });
  });

  it('un lote nunca pasa el máximo de Firestore, con 3 operaciones por fila', async () => {
    estado.snapshot = Object.fromEntries(Array.from({ length: 200 }, (_, i) => [`F_${i}`, entrada('200', '2026-10-02', 'ALCO', '777', '')]));
    await eliminarFilasDetallesOC(Array.from({ length: 200 }, (_, i) => fila(`F_${i}`)));
    expect(estado.lotes.length).toBeGreaterThan(1);
    estado.lotes.forEach(l => expect(l.length).toBeLessThanOrEqual(500));
    expect(estado.lotes.flat().filter(o => o.path.startsWith('portal_ordenes_compra/'))).toHaveLength(200);
  });

  it('sin liberar OC no toca gestiones', async () => {
    await eliminarFilasDetallesOC([fila('B_1')], { liberarOC: false });
    expect(estado.invalidadas).toBeNull();
  });

  it('si el lote falla no cambia el snapshot ni el índice', async () => {
    estado.falla = true;
    const r = await eliminarFilasDetallesOC([fila('B_1')]);
    expect(r).toMatchObject({ eliminadas: 0, errores: [{ id: 'B_1', error: 'unavailable' }] });
    expect(Object.keys(estado.snapshot)).toHaveLength(4);
    expect(estado.indiceEliminados).toBeNull();
  });
});
