// Sincronizar OC por módulo (Implantes y Hemodinamia): cada uno cruza solo
// sus gestiones, registra su propia versión sincronizada y aplica/limpia sus
// propias OC cambiadas pendientes; corregir gestiones por una reimportación
// se hace por módulo (si uno falla, el otro igual se corrige).
import { describe, it, expect, vi, beforeEach } from 'vitest';

const escrituras = [];
let docsConsulta = [];
let fallarCommitEn = null;
vi.mock('firebase/firestore', () => ({
  collectionGroup: () => ({}),
  collection: (ref, nombre) => ({ ruta: `${ref.ruta}/${nombre}` }),
  query: (...p) => p,
  where: () => ({}),
  getDocs: async () => ({ size: docsConsulta.length, docs: docsConsulta.map((d) => ({ id: d.id, ref: { path: d.path }, data: () => d.data })) }),
  doc: (a, b) => (typeof a === 'object' && a.ruta ? { ruta: `${a.ruta}/auto` } : { ruta: b }),
  writeBatch: () => {
    const ops = [];
    return {
      update: (ref) => ops.push(ref.ruta),
      set: () => {},
      commit: async () => {
        if (fallarCommitEn && ops.some((r) => r.startsWith(fallarCommitEn))) throw Object.assign(new Error('sin permiso'), { code: 'permission-denied' });
        escrituras.push(...ops);
      },
    };
  },
  FieldPath: function FieldPath() {},
  deleteField: () => 'deleteField',
  serverTimestamp: () => 'ts',
}));
vi.mock('../../../../../firebaseConfig', () => ({ db: {}, storage: {} }));
const remoto = { registrar: [], limpiar: [] };
vi.mock('./indiceOCRemoto', () => ({
  obtenerIndiceOC: async () => ({ meta: metaActual, indice: { f1: {} }, desdeCache: true }),
  registrarSincronizacionOC: async (version, modulo) => { remoto.registrar.push([version, modulo]); },
  limpiarInvalidacionesPendientes: async (modulo) => { remoto.limpiar.push(modulo); },
}));
let metaActual = {};

const { prepararSincronizacionOC, ejecutarSincronizacionOC } = await import('./sincronizarOC');
const { invalidarOCGestiones } = await import('./invalidarOCGestiones');
const { rangoRutasGestiones } = await import('./marcarOcPendiente');

beforeEach(() => {
  escrituras.length = 0; docsConsulta = []; fallarCommitEn = null; remoto.registrar.length = 0; remoto.limpiar.length = 0;
});

const gestion = (path, extra = {}) => ({ id: path.split('/').pop(), path, data: { gestionId: '100', fecha: '2026-10-01', empresa: 'ACME', cotizaciones: [{ items: [] }], ...extra } });

describe('Sincronizar OC por módulo', () => {
  it('sinNovedades usa la versión sincronizada del módulo', async () => {
    metaActual = { version: 5, ultimaSyncVersion: 5, ultimaSyncVersionHemodinamia: 4, fechaMin: '2026-01-01', fechaMax: '2026-12-31' };
    expect((await prepararSincronizacionOC('implantes')).sinNovedades).toBe(true);
    expect((await prepararSincronizacionOC('hemodinamia')).sinNovedades).toBe(false);
  });

  it('Hemodinamia cruza solo sus gestiones y registra su versión', async () => {
    metaActual = { version: 7, fechaMin: '2026-01-01', fechaMax: '2026-12-31' };
    docsConsulta = [gestion('implantes_gestiones/2026/mes/10/x/detalles/a'), gestion('hemodinamia_gestiones/2026/mes/10/x/detalles/b'), gestion('consignacion_registros/2026/x/detalles/c')];
    const r = await ejecutarSincronizacionOC({ meta: metaActual, indice: {} }, { modulo: 'hemodinamia' });
    expect(r.gestionesRevisadas).toBe(1);
    expect(remoto.registrar).toEqual([[7, 'hemodinamia']]);
  });

  it('aplica y limpia solo las OC cambiadas pendientes del módulo', async () => {
    metaActual = { version: 7, fechaMin: '2026-01-01', fechaMax: '2026-12-31', ocInvalidacionesPendientes: [{ admision: '1' }], ocInvalidacionesPendientesHemodinamia: [] };
    await ejecutarSincronizacionOC({ meta: metaActual, indice: {} }, { modulo: 'hemodinamia' });
    expect(remoto.limpiar).toEqual([]);
    await ejecutarSincronizacionOC({ meta: metaActual, indice: {} }, { modulo: 'implantes' });
    expect(remoto.limpiar).toEqual(['implantes']);
  });
});

describe('invalidarOCGestiones: cada módulo aparte', () => {
  const cambio = { admision: '100', fecha: '2026-10-01', proveedor: 'ACME', codigo: 'C1', ocAntes: 'OC1', ocDespues: 'OC2' };
  const conOC = (path) => gestion(path, { cotizaciones: [{ items: [{ id: 'i1', codigo: 'C1' }] }], ocPorItem: { i1: 'OC1' } });

  it('corrige las gestiones de ambos módulos', async () => {
    docsConsulta = [conOC('implantes_gestiones/2026/a'), conOC('hemodinamia_gestiones/2026/b')];
    const r = await invalidarOCGestiones([cambio]);
    expect(r.error).toBeNull();
    expect(escrituras).toEqual(['implantes_gestiones/2026/a', 'hemodinamia_gestiones/2026/b']);
  });

  it('si un módulo falla (sin permiso), el otro igual se corrige y se informa cuál queda pendiente', async () => {
    docsConsulta = [conOC('implantes_gestiones/2026/a'), conOC('hemodinamia_gestiones/2026/b')];
    fallarCommitEn = 'hemodinamia_gestiones';
    const r = await invalidarOCGestiones([cambio]);
    expect(escrituras).toEqual(['implantes_gestiones/2026/a']);
    expect(r.modulosConError).toEqual(['hemodinamia']);
    expect(r.error).toMatch(/Sin permiso de Hemodinamia/);
  });

  it('`modulos` acota a un solo módulo', async () => {
    docsConsulta = [conOC('implantes_gestiones/2026/a'), conOC('hemodinamia_gestiones/2026/b')];
    await invalidarOCGestiones([cambio], { modulos: ['hemodinamia'] });
    expect(escrituras).toEqual(['hemodinamia_gestiones/2026/b']);
  });
});

describe('Marcar OC pendiente por módulo', () => {
  it('rango de rutas sobre la colección del módulo', () => {
    expect(rangoRutasGestiones('2026-01', '2026-12', 'hemodinamia_gestiones')).toEqual({ inicio: 'hemodinamia_gestiones/2026/mes/01', fin: 'hemodinamia_gestiones/2027/mes/01' });
    expect(rangoRutasGestiones('2026-01', '2026-01')).toEqual({ inicio: 'implantes_gestiones/2026/mes/01', fin: 'implantes_gestiones/2026/mes/02' });
  });
});
