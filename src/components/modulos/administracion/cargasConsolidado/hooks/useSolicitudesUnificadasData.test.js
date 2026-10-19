// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import * as XLSX from 'xlsx';
import { useSolicitudesUnificadasData } from './useSolicitudesUnificadasData';
import { ORIGEN } from '../utils/normalizarFila';

// --- Firestore en memoria ---
// `almacen` guarda los documentos por ruta. writeBatch valida igual que el
// SDK real (rechaza `undefined` a cualquier nivel), aplica las escrituras
// al hacer commit y vuelve a disparar los onSnapshot activos — así se
// comprueba de punta a punta que las filas salen de la tabla, que no
// vuelven al "recargar" (montar el hook de nuevo) y cuántas copias quedan
// en imputadas.
const almacen = new Map();
const listeners = new Set();
const escrituras = [];
const mockCommit = vi.fn();

const buscarUndefined = (valor, ruta = '') => {
  if (valor === undefined) return ruta;
  if (Array.isArray(valor)) {
    for (let i = 0; i < valor.length; i++) {
      const r = buscarUndefined(valor[i], `${ruta}[${i}]`);
      if (r) return r;
    }
  } else if (valor && typeof valor === 'object' && Object.getPrototypeOf(valor) === Object.prototype) {
    for (const [k, v] of Object.entries(valor)) {
      const r = buscarUndefined(v, ruta ? `${ruta}.${k}` : k);
      if (r) return r;
    }
  }
  return null;
};

const validar = (metodo, ref, datos) => {
  const campo = buscarUndefined(datos);
  if (campo) {
    throw new Error(`Function WriteBatch.${metodo}() called with invalid data. Unsupported field value: undefined (found in field ${campo} in document ${ref.path})`);
  }
};

const snapDoc = (path) => ({
  id: path.split('/').pop(),
  ref: { path },
  data: () => almacen.get(path)
});

// Resuelve cada consulta que arma el hook según sus restricciones.
const resolverConsulta = (q) => {
  if (q.ref.path === 'cierres_periodos') {
    // Listener compartido de periodosStore: períodos abiertos de todos los módulos.
    const docs = ['implantes', 'consignacion', 'hemodinamia'].map(modulo => ({
      id: `p_${modulo}`, data: () => ({ anio: 2026, mes: 'septiembre', estado: 'ABIERTO', modulo })
    }));
    return { empty: false, docs };
  }
  const desde = q.constraints.find(c => c.op === '>=')?.valor;
  if (desde) {
    const prefijo = desde.split('/')[0] + '/';
    return { docs: [...almacen.keys()].filter(p => p.startsWith(prefijo) && almacen.get(p).solicitud === 'SOLICITAR').map(snapDoc) };
  }
  // Consulta de candidatos de Consignación: estado == 'CARGADO'.
  return { docs: [...almacen.keys()].filter(p => almacen.get(p).estado === 'CARGADO').map(snapDoc) };
};

const notificar = () => listeners.forEach(l => l.cb(resolverConsulta(l.q)));

vi.mock('../../../../../firebaseConfig', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, ...p) => ({ _type: 'collection', path: p.join('/') })),
  collectionGroup: vi.fn((_db, nombre) => ({ _type: 'collectionGroup', nombre })),
  doc: vi.fn((_db, ...p) => ({ path: p.join('/') })),
  query: vi.fn((ref, ...constraints) => ({ ref, constraints })),
  where: vi.fn((campo, op, valor) => ({ campo, op, valor })),
  orderBy: vi.fn((campo, dir) => ({ campo, dir })),
  documentId: vi.fn(() => '__id__'),
  getDocs: vi.fn(async () => ({ empty: true, docs: [] })),
  getDoc: vi.fn(async (ref) => ({ exists: () => almacen.has(ref.path), data: () => almacen.get(ref.path) })),
  onSnapshot: vi.fn((q, cb) => {
    const l = { q, cb };
    listeners.add(l);
    cb(resolverConsulta(q));
    return () => listeners.delete(l);
  }),
  writeBatch: vi.fn(() => {
    const pendientes = [];
    return {
      set: (ref, datos, opciones) => { validar('set', ref, datos); pendientes.push({ tipo: 'set', path: ref.path, datos, opciones }); },
      update: (ref, datos) => { validar('update', ref, datos); pendientes.push({ tipo: 'update', path: ref.path, datos }); },
      commit: async (...args) => {
        await mockCommit(...args);
        pendientes.forEach(e => {
          escrituras.push(e);
          almacen.set(e.path, { ...(almacen.get(e.path) || {}), ...e.datos });
        });
        notificar();
      }
    };
  })
}));

vi.mock('xlsx', async (importOriginal) => ({ ...(await importOriginal()), writeFile: vi.fn() }));

const mockShowToast = vi.fn();
let confirmar;
vi.mock('../../../../../context/ToastContext', () => ({ useToast: () => ({ showToast: mockShowToast }) }));
vi.mock('../../../../../context/ModalContext', () => ({
  useModal: () => ({ confirmAction: (_t, _m, cb) => { confirmar = cb; } })
}));
vi.mock('../../../../../context/UserContext', () => ({ useUser: () => ({ userData: { nombreCompleto: 'Tester' } }) }));
vi.mock('../../../operaciones/implantes/gestionImplantes/utils/registrarLogImplantes', () => ({ registrarLogImplantes: vi.fn() }));
vi.mock('../../../operaciones/consignacion/utils/registrarLogConsignacion', () => ({ registrarLogConsignacion: vi.fn() }));
vi.mock('../../../operaciones/hemodinamia/gestionHemodinamia/utils/registrarLogHemodinamia', () => ({ registrarLogHemodinamia: vi.fn() }));

// --- Datos: forma real de cada origen ---
const RUTA_IMP = 'implantes_gestiones/2026/detalles/g1';
const RUTA_HEMO = 'hemodinamia_gestiones/2026/detalles/h1';
const RUTA_CON = 'consignacion_registros/2026/mes/09/dia/17/admision/102050/empresa/E/detalles/c1';

// Gestión de Implantes SIN N° de cotización (ni en el ítem ni en
// cotizaciones[0]) y sin varios campos de cabecera opcionales.
const gestionImplantes = () => ({
  solicitud: 'SOLICITAR',
  gestionId: '102030',
  nombre: 'PACIENTE IMP',
  medico: 'DR IMP',
  fecha: '2026-09-18',
  empresa: 'EMP IMP',
  prevision: 'FONASA',
  cotizaciones: [{
    items: [{
      id: 'item_1789390791179_lksto', codigo: 'C-1', referencia: 'REF-IMP', descriptorAuto: 'TORNILLO 3.5MM',
      tipoVinculado: 'OSTEOSINTESIS', cantidad: 2, precio: 100, venta: 150, estadoCarga: 'CARGADO'
    }]
  }]
});

const gestionHemodinamia = () => ({
  solicitud: 'SOLICITAR',
  gestionId: '102040',
  nombre: 'PACIENTE HEMO',
  medico: 'DR HEMO',
  fecha: '2026-09-19',
  empresa: 'EMP HEMO',
  cotizaciones: [{
    numCotizacion: 'COT-2',
    items: [{ id: 'hi1', codigo: 'C-2', referencia: 'REF-HEMO', descriptorAuto: 'STENT CORONARIO', cantidad: 1, precio: 500, venta: 800 }]
  }]
});

const registroConsignacion = () => ({
  estado: 'CARGADO',
  gestionId: '102050',
  nombre: 'PACIENTE CON',
  medico: 'DR CON',
  fecha: '2026-09-17',
  empresa: 'EMP CON',
  codigo: 'C-3',
  descripcion: 'PLACA BLOQUEADA',
  cantidad: 3,
  costo: 40,
  atributo: 'CONSIGNACION',
  prevision: 'PARTICULAR'
});

const flush = () => act(async () => { await new Promise(r => setTimeout(r, 0)); });

const montar = async () => {
  const hook = renderHook(() => useSolicitudesUnificadasData());
  await flush();
  return hook.result;
};

const exportarTodo = async (result) => {
  act(() => { result.current.toggleSeleccionarTodos(); });
  act(() => { result.current.handleExportarYMarcarSolicitado(); });
  await act(async () => { await confirmar(); });
  await flush();
};

const imputadas = () => escrituras.filter(e => e.tipo === 'set').map(e => e.path);

describe('useSolicitudesUnificadasData — Exportar y Marcar como Solicitado', () => {
  beforeEach(() => {
    almacen.clear();
    listeners.clear();
    escrituras.length = 0;
    mockCommit.mockReset();
    mockCommit.mockResolvedValue();
    mockShowToast.mockReset();
    XLSX.writeFile.mockReset();
    almacen.set(RUTA_IMP, gestionImplantes());
    almacen.set(RUTA_HEMO, gestionHemodinamia());
    almacen.set(RUTA_CON, registroConsignacion());
  });

  it('las filas de los 3 orígenes (también Consignación) desaparecen de la tabla al terminar la exportación', async () => {
    const result = await montar();
    expect(new Set(result.current.filas.map(f => f.origen))).toEqual(new Set([ORIGEN.IMPLANTES, ORIGEN.CONSIGNACION, ORIGEN.HEMODINAMIA]));

    await exportarTodo(result);

    expect(mockShowToast).toHaveBeenCalledWith('Se exportaron y marcaron como SOLICITADO 3 registro(s)', 'success');
    expect(result.current.filas).toEqual([]);
    expect(result.current.exportando).toBe(false);
  });

  it('al recargar (montar de nuevo) tampoco vuelven a aparecer', async () => {
    await exportarTodo(await montar());
    const recargado = await montar();
    expect(recargado.current.filas).toEqual([]);
    expect(almacen.get(RUTA_CON).estado).toBe('SOLICITADO');
  });

  it('copia una sola vez a cada colección de imputadas', async () => {
    await exportarTodo(await montar());
    expect(imputadas()).toEqual([
      'implantes_imputadas/2026/meses/septiembre/documentos/item_1789390791179_lksto',
      'consignacion_imputadas/2026/meses/septiembre/documentos/c1',
      'hemodinamia_imputadas/2026/meses/septiembre/documentos/hi1'
    ]);
  });

  it('si la tabla estaba desactualizada, omite lo que en Firestore ya está solicitado (no descarga ni copia de nuevo)', async () => {
    const result = await montar();
    // Otro usuario/pestaña ya lo solicitó, y esta tabla aún no se enteró.
    almacen.set(RUTA_CON, { ...almacen.get(RUTA_CON), estado: 'SOLICITADO' });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await exportarTodo(result);

    expect(imputadas()).not.toContain('consignacion_imputadas/2026/meses/septiembre/documentos/c1');
    expect(imputadas()).toHaveLength(2);
    const libro = XLSX.writeFile.mock.calls[0][0];
    const detalle = XLSX.utils.sheet_to_json(libro.Sheets['Detalle Unificado']);
    expect(detalle.map(f => f.ORIGEN)).toEqual(['Implantes', 'Hemodinamia']);
    expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining('1 omitido(s)'), 'success');
    warn.mockRestore();
  });

  it('si todo lo seleccionado ya estaba solicitado, no genera Excel ni escribe nada', async () => {
    const result = await montar();
    [RUTA_IMP, RUTA_HEMO].forEach(p => almacen.set(p, { ...almacen.get(p), solicitud: 'SOLICITADO' }));
    almacen.set(RUTA_CON, { ...almacen.get(RUTA_CON), estado: 'SOLICITADO' });
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    await exportarTodo(result);

    expect(XLSX.writeFile).not.toHaveBeenCalled();
    expect(escrituras).toEqual([]);
    expect(result.current.exportando).toBe(false);
    console.warn.mockRestore();
  });

  it('un doble clic en Confirmar ejecuta la exportación una sola vez', async () => {
    const result = await montar();
    act(() => { result.current.toggleSeleccionarTodos(); });
    act(() => { result.current.handleExportarYMarcarSolicitado(); });
    await act(async () => { await Promise.all([confirmar(), confirmar()]); });

    expect(XLSX.writeFile).toHaveBeenCalledTimes(1);
    expect(imputadas()).toHaveLength(3);
  });

  it('una gestión de Implantes sin N° de cotización no rompe el batch (numCotizacion = "P", igual que la Solicitud nativa)', async () => {
    await exportarTodo(await montar());
    const imputadaImp = escrituras.find(e => e.path.startsWith('implantes_imputadas/'));
    expect(imputadaImp.datos).toMatchObject({
      numCotizacion: 'P', agendaId: '102030', admision: 'P', informe: 'PENDIENTE', convenio: 'P',
      centro: 'PABELLON', atributo: 'IMPLANTES', estado: 'AGENDANDO', costoGestion: 0, prevision: 'FONASA'
    });
    expect(imputadaImp.opciones).toEqual({ merge: true });
    expect(escrituras.find(e => e.path.startsWith('hemodinamia_imputadas/')).datos.numCotizacion).toBe('COT-2');
  });

  it('los campos que son solo del Excel no se guardan en Firestore', async () => {
    await exportarTodo(await montar());
    const soloExcel = ['descripcionExport', 'atributoExport', 'ventaExport', 'estadoExport', 'area', 'selectId', 'esFilaGuia', 'numGuia', 'fechaCarga'];
    escrituras.forEach(e => soloExcel.forEach(k => expect(e.datos).not.toHaveProperty(k)));
  });

  it('el Excel mantiene las 5 hojas, la Descripción correcta y Área/Previsión/Estado en el Resumen', async () => {
    await exportarTodo(await montar());
    const libro = XLSX.writeFile.mock.calls[0][0];
    expect(libro.SheetNames).toEqual(['Solicitud Implantes', 'Solicitud Consignación', 'Solicitud Hemodinamia', 'Detalle Unificado', 'Resumen']);
    const detalle = XLSX.utils.sheet_to_json(libro.Sheets['Detalle Unificado'], { defval: '' });
    expect(detalle.map(f => f.DESCRIPCION)).toEqual(['TORNILLO 3.5MM', 'PLACA BLOQUEADA', 'STENT CORONARIO']);
    expect(detalle[0]['N° COTIZACIÓN']).toBe('P');
    const resumen = XLSX.utils.sheet_to_json(libro.Sheets.Resumen, { defval: '' });
    expect(resumen[0]).toMatchObject({ 'Área': 'PABELLON', 'Previsión': 'FONASA', 'Estado': 'CARGADO' });
    expect(resumen[1]).toMatchObject({ 'Área': 'PABELLON', 'Previsión': 'PARTICULAR', 'Estado': 'CARGADO' });
  });

  it('un campo undefined inesperado se omite (con aviso en consola) en vez de tumbar la exportación', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    almacen.set(RUTA_CON, { ...registroConsignacion(), campoRaro: undefined });

    await exportarTodo(await montar());

    expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining('Se exportaron'), 'success');
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/Consignación · consignacion_imputadas\/.*c1: .*campoRaro/));
    warn.mockRestore();
  });

  it('si falla el commit, informa qué quedó escrito, muestra error y no deja la interfaz cargando', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockCommit.mockRejectedValueOnce(new Error('permission-denied'));

    const result = await montar();
    await exportarTodo(result);

    expect(result.current.exportando).toBe(false);
    expect(mockShowToast).toHaveBeenCalledWith('Error al exportar: permission-denied', 'error');
    expect(error).toHaveBeenCalledWith(expect.stringContaining('No se escribió ningún documento'), [], expect.any(String), expect.any(Array));
    // Nada se aplicó: las filas siguen pendientes y visibles.
    expect(result.current.filas).toHaveLength(3);
    error.mockRestore();
  });

  it('las filas de Consignación salen en el orden de la carga masiva, con cada admisión junta', async () => {
    almacen.delete(RUTA_CON);
    const carga = new Date(2026, 8, 17, 10);
    // Insertadas en el orden en que Firestore las devolvería (id aleatorio).
    [['c-z', '200', 3], ['c-a', '100', 2], ['c-m', '100', 0], ['c-b', '200', 1]].forEach(([id, adm, pos]) => {
      almacen.set(`consignacion_registros/2026/mes/09/dia/17/admision/${adm}/empresa/E/detalles/${id}`,
        { ...registroConsignacion(), gestionId: adm, nombre: `P-${pos}`, posicionCarga: pos, fechaRegistro: carga });
    });
    const result = await montar();
    const consignacion = result.current.filas.filter(f => f.origen === ORIGEN.CONSIGNACION).map(f => f.paciente);
    // 100 (pos 0, 2), 200 (pos 1, 3).
    expect(consignacion).toEqual(['P-0', 'P-2', 'P-1', 'P-3']);
  });
});

