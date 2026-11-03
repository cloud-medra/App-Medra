// Importación completa con Firebase simulado en memoria (sin red).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as XLSX from 'xlsx';

const estado = vi.hoisted(() => ({ snapshot: null, version: null, meta: {}, escrituras: [], invalidaciones: [], indice: {} }));

vi.mock('../../../../../../firebaseConfig', () => ({ db: {}, storage: {}, auth: {} }));
vi.mock('firebase/firestore', () => ({
  doc: (_db, ...p) => ({ path: p.join('/') }),
  writeBatch: () => {
    const ops = [];
    return {
      set: (ref, data, opts) => ops.push({ tipo: opts?.merge ? 'merge' : 'set', path: ref.path, data }),
      delete: (ref) => ops.push({ tipo: 'delete', path: ref.path }),
      commit: async () => { estado.escrituras.push(...ops); }
    };
  },
  serverTimestamp: () => 'ahora',
  setDoc: async (ref, data) => { estado.meta = { ...estado.meta, ...data }; estado.escrituras.push({ tipo: 'meta', path: ref.path, data }); }
}));
vi.mock('./snapshotStorageDetallesOC', () => ({
  SnapshotAntiguoError: class extends Error {},
  obtenerSnapshotDetallesOC: async () => ({ filas: structuredClone(estado.snapshot || {}), version: estado.version, desdeCache: true }),
  guardarSnapshotDetallesOC: async (filas) => { estado.snapshot = structuredClone(filas); estado.version = `v${Date.now()}${Math.random()}`; return estado.version; },
  camposMetaSnapshot: (version) => ({ snapshotDetallesVersion: version })
}));
vi.mock('../../../shared/ocIndex/indiceOCRemoto', () => ({
  leerMetaOC: async () => estado.meta,
  obtenerIndiceOC: async () => ({ indice: estado.indice }),
  publicarIndiceOC: async (indice, { extraMeta } = {}) => { estado.indice = indice; estado.meta = { ...estado.meta, ...extraMeta }; estado.escrituras.push({ tipo: 'meta' }); },
  agregarInvalidacionesPendientes: vi.fn()
}));
vi.mock('../../../shared/ocIndex/invalidarOCGestiones', () => ({
  invalidarOCGestiones: async (cambios) => { estado.invalidaciones.push(...cambios); return { lecturas: 1, escrituras: 2, gestionesActualizadas: 1, itemsLiberados: 1 }; }
}));

const { procesarImportacionDetallesOC } = await import('./procesarImportacionDetallesOC');

const ENC = ['ID_PACIENTE', 'PACIENTE', 'MEDICO', 'FECHA_CIRUGIA', 'PROVEEDOR', 'CODIGO_CLINICA', 'CODIGO_PROVEEDOR', 'CANTIDAD', 'PRECIO_UNITARIO', 'OC', 'NUMERO_FACTURA', 'NUMERO_GUIA', 'LOTE'];
const fila = (o = {}) => {
  const f = { adm: 114584, pac: 'PACIENTE UNO', med: 'DR X', fecha: new Date(2026, 8, 15), prov: 'MEDTRONIC', cod: 510012, desc: 'TORNILLO', cant: 1, precio: 1000, oc: '', fact: '', guia: '', lote: '', ...o };
  return [f.adm, f.pac, f.med, f.fecha, f.prov, f.cod, f.desc, f.cant, f.precio, f.oc, f.fact, f.guia, f.lote];
};
const archivo = (filas) => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([ENC, ...filas]), 'planilla');
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return { arrayBuffer: async () => buf.slice(0) };
};
const importar = async (filas) => {
  estado.escrituras = [];
  return procesarImportacionDetallesOC(archivo(filas));
};
const escriturasDeFilas = () => estado.escrituras.filter(e => e.path?.includes('/detalles/'));

describe('procesarImportacionDetallesOC', () => {
  beforeEach(() => { Object.assign(estado, { snapshot: null, version: null, meta: {}, escrituras: [], invalidaciones: [], indice: {} }); });

  it('reimportar el mismo archivo sin cambios: 0 escrituras y 1 lectura', async () => {
    const archivoBase = [fila({ oc: '4500001' }), fila({ cod: 510013, oc: '4500001' }), fila()];
    const primera = await importar(archivoBase);
    expect(primera).toMatchObject({ nuevas: 3, actualizadas: 0 });
    expect(escriturasDeFilas()).toHaveLength(3);

    const segunda = await importar(archivoBase);
    expect(segunda).toMatchObject({ nuevas: 0, actualizadas: 0, sinCambios: 3, lecturasFirestore: 1, escriturasFirestore: 0 });
    expect(estado.escrituras).toEqual([]);
  });

  it('completar campos vacíos: escribe solo esos campos (merge), sin marcadores; un vacío no borra', async () => {
    await importar([fila({ fact: 'F-1' }), fila({ cod: 510013 })]);
    const r = await importar([fila({ fact: '', guia: 'G-9', lote: 'L-1' }), fila({ cod: 510013, fact: 'F-2' })]);
    expect(r).toMatchObject({ nuevas: 0, actualizadas: 2, sinCambios: 0 });
    const filas = escriturasDeFilas();
    expect(filas.every(e => e.tipo === 'merge')).toBe(true);
    expect(filas.map(e => Object.keys(e.data).sort())).toEqual([['actualizadoEn', 'lote', 'numero_guia'], ['actualizadoEn', 'numero_factura']]);
    expect(estado.escrituras.filter(e => !e.path?.includes('/detalles/') && e.tipo !== 'meta')).toEqual([]); // sin marcadores
    expect(r.noSobrescritos).toEqual([expect.objectContaining({ campo: 'numero_factura', valorGuardado: 'F-1' })]);
    expect(r.camposActualizados).toEqual({ lote: 1, numero_guia: 1, numero_factura: 1 });
  });

  it('precio y monto en 0 sobrescriben lo guardado y el Resumen Mensual se recalcula; vacío conserva', async () => {
    const enc = ['ID_PACIENTE', 'FECHA_CIRUGIA', 'PROVEEDOR', 'CODIGO_CLINICA', 'CANTIDAD', 'PRECIO_UNITARIO', 'OC_MONTO'];
    const conMonto = (filas) => {
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([enc, ...filas]), 'planilla');
      const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
      estado.escrituras = [];
      return procesarImportacionDetallesOC({ arrayBuffer: async () => buf.slice(0) });
    };
    const f = new Date(2026, 8, 15);
    await conMonto([[114584, f, 'MEDTRONIC', 510012, 1, 141184, 141184], [114584, f, 'MEDTRONIC', 510013, 1, 5000, 5000]]);

    const r = await conMonto([[114584, f, 'MEDTRONIC', 510012, 1, 0, 0], [114584, f, 'MEDTRONIC', 510013, 1, null, null]]);
    expect(r).toMatchObject({ nuevas: 0, actualizadas: 1, sinCambios: 1 });
    const [escrita] = escriturasDeFilas();
    expect(escrita).toMatchObject({ tipo: 'merge', data: { precio_u: 0, oc_monto: 0 } });
    expect(r.noSobrescritos.map(n => n.campo).sort()).toEqual(['oc_monto', 'precio_u']);
    expect(r.resumenFacturacion).toMatchObject({ ok: true, escrituras: 1 });
    const resumen = estado.escrituras.find(e => e.path === 'resumen_facturacion_mensual/2026');
    expect(resumen.data.meses['09']).toMatchObject({ total: 5000, cantidad: 2 });
  });

  it('repetidos en otro orden: sin escrituras', async () => {
    await importar([fila({ cant: 1 }), fila({ cant: 2 }), fila({ cant: 1 })]);
    const r = await importar([fila({ cant: 2 }), fila({ cant: 1 }), fila({ cant: 1 })]);
    expect(r).toMatchObject({ nuevas: 0, actualizadas: 0, sinCambios: 3, escriturasFirestore: 0 });
  });

  it('cambio de OC: actualiza la fila y libera la OC antigua en las gestiones', async () => {
    await importar([fila({ oc: '4500001' })]);
    const r = await importar([fila({ oc: '4500002' })]);
    expect(r.actualizadas).toBe(1);
    expect(r.ocCambiadas).toEqual([expect.objectContaining({ admision: '114584', ocAntes: '4500001', ocDespues: '4500002' })]);
    expect(estado.invalidaciones).toHaveLength(1);
    expect(r.lecturasFirestore).toBe(2); // meta + gestiones
  });

  it('cambio de fecha: crea en el mes nuevo y borra la anterior en el mismo lote', async () => {
    await importar([fila({ fact: 'F-1' })]);
    const r = await importar([fila({ fecha: new Date(2026, 9, 2) })]);
    expect(r).toMatchObject({ nuevas: 0, fechasCambiadas: [expect.objectContaining({ fechaAntes: '2026-09-15', fechaDespues: '2026-10-02' })] });
    const filas = escriturasDeFilas();
    expect(filas.map(e => e.tipo)).toEqual(['set', 'delete']);
    expect(filas[0].path).toContain('documentos_sistema/2026/meses/10/');
    expect(filas[0].data.numero_factura).toBe('F-1'); // conserva lo guardado
    expect(filas[1].path).toContain('documentos_sistema/2026/meses/09/');
    expect(Object.keys(estado.snapshot)).toEqual(['114584_20261002_medtronic_510012_1']);
  });

  it('archivo general con varios meses: nuevas en su mes, actualizadas y las que faltan solo se informan', async () => {
    await importar([fila(), fila({ adm: 300, fecha: new Date(2026, 9, 5) })]);
    const r = await importar([
      fila({ adm: 300, fecha: new Date(2026, 9, 5), fact: 'F-5' }),
      fila({ adm: 301, fecha: new Date(2026, 9, 9) }),
      fila({ adm: 500, fecha: new Date(2026, 10, 1) })
    ]);
    expect(r).toMatchObject({ meses: ['2026-10', '2026-11'], nuevas: 2, actualizadas: 1, sinCambios: 0 });
    // La de septiembre no viene, pero septiembre no está en el archivo: no se informa.
    expect(r.yaNoVienen).toEqual([]);
    const rutasNuevas = escriturasDeFilas().filter(e => e.tipo === 'set').map(e => e.path.split('/').slice(1, 4).join('/'));
    expect(rutasNuevas.sort()).toEqual(['2026/meses/10', '2026/meses/11']);
    expect(estado.escrituras.some(e => e.tipo === 'delete')).toBe(false);
  });
});
