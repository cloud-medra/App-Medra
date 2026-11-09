import { beforeEach, describe, expect, it, vi } from 'vitest';

// Firestore simulado: ordena, filtra y aplica limit/startAfter como el
// servidor, y registra cada consulta para comprobar lo que se pide.
const h = vi.hoisted(() => ({
  datos: {},
  consultas: [],
  auth: { currentUser: { uid: 'usuario-1' } },
  sesion: { callback: null },
}));

vi.mock('../../../../firebaseConfig', () => ({ db: {}, auth: h.auth }));
vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (_auth, cb) => { h.sesion.callback = cb; },
}));

vi.mock('firebase/firestore', () => {
  const coincide = (d, r) => {
    const v = d.campos[r.campo];
    if (r.op === '==') return v === r.valor;
    if (typeof v !== typeof r.valor) return false; // Firestore separa por tipo.
    return r.op === '>=' ? v >= r.valor : v < r.valor;
  };
  const resolver = (q) => {
    const restr = q.restr || [];
    let docs = (h.datos[q.ruta] || []).filter((d) => restr.filter((r) => r.t === 'where').every((r) => coincide(d, r)));
    const orden = restr.find((r) => r.t === 'orderBy');
    if (orden) {
      docs = docs.filter((d) => d.campos[orden.campo] !== undefined)
        .sort((a, b) => (a.campos[orden.campo] < b.campos[orden.campo] ? -1 : a.campos[orden.campo] > b.campos[orden.campo] ? 1 : (a.id < b.id ? -1 : 1)));
    }
    const cursor = restr.find((r) => r.t === 'startAfter');
    if (cursor) docs = docs.slice(docs.findIndex((d) => d.id === cursor.doc.id) + 1);
    const tope = restr.find((r) => r.t === 'limit');
    return tope ? docs.slice(0, tope.n) : docs;
  };
  const aSnap = (d) => ({ id: d.id, data: () => d.campos });
  return {
    collection: (_db, ...seg) => ({ ruta: seg.join('/') }),
    query: (ref, ...restr) => ({ ruta: ref.ruta, restr: [...(ref.restr || []), ...restr] }),
    where: (campo, op, valor) => ({ t: 'where', campo, op, valor }),
    orderBy: (campo) => ({ t: 'orderBy', campo }),
    limit: (n) => ({ t: 'limit', n }),
    startAfter: (doc) => ({ t: 'startAfter', doc }),
    count: () => ({ tipo: 'count' }),
    sum: (campo) => ({ tipo: 'sum', campo }),
    getDocs: async (q) => {
      h.consultas.push({ clase: 'docs', ...q });
      return { docs: resolver(q).map(aSnap) };
    },
    getCountFromServer: async (q) => {
      h.consultas.push({ clase: 'conteo', ...q });
      return { data: () => ({ count: resolver(q).length }) };
    },
    getAggregateFromServer: async (q, campos) => {
      h.consultas.push({ clase: 'agregacion', ...q });
      const docs = resolver(q);
      return {
        data: () => Object.fromEntries(Object.entries(campos).map(([k, a]) => [k, a.tipo === 'count'
          ? docs.length
          : docs.reduce((acc, d) => acc + (typeof d.campos[a.campo] === 'number' ? d.campos[a.campo] : 0), 0)])),
      };
    },
  };
});

import {
  buscarAdmisionEnAnio, descargarMes, invalidarHistorial, limpiarCacheHistorial, mesDescargado,
  obtenerConteoBusqueda, obtenerPagina, obtenerTotales,
} from './historialImputacionesStore';
import { SIN_BUSQUEDA, TAMANO_PAGINA } from './logicaHistorial';
import { ORIGEN } from '../cargasConsolidado/utils/normalizarFila';

const { IMPLANTES, CONSIGNACION, HEMODINAMIA } = ORIGEN;
const TRES = [IMPLANTES, CONSIGNACION, HEMODINAMIA];
const ruta = (raiz, mes = 'octubre') => `${raiz}/2026/meses/${mes}/documentos`;

const filas = (cantidad, prefijo, extra = {}) => Array.from({ length: cantidad }, (_, i) => ({
  id: `${prefijo}${String(i).padStart(4, '0')}`,
  campos: { gestionId: String(100000 + i * 3 + extra.desfase), total: 10, venta: 20, paciente: 'JUAN PEREZ SOTO', nombre: 'ANA MUNOZ ROJAS' },
}));

const lecturas = () => h.consultas.reduce((acc, q) => acc + (q.clase === 'docs' ? 1 : 0), 0);
const limitesPedidos = () => h.consultas.filter((q) => q.clase === 'docs').map((q) => q.restr.find((r) => r.t === 'limit')?.n);

beforeEach(() => {
  h.auth.currentUser = { uid: 'usuario-1' };
  limpiarCacheHistorial();
  h.consultas.length = 0;
  h.datos = {
    [ruta('implantes_imputadas')]: filas(60, 'i', { desfase: 0 }),
    [ruta('consignacion_imputadas')]: filas(40, 'c', { desfase: 1 }),
    [ruta('hemodinamia_imputadas')]: filas(7, 'h', { desfase: 2 }),
  };
});

describe('paginación', () => {
  it('una pestaña de un tipo pide solo su colección, con limit', async () => {
    const pagina = await obtenerPagina([HEMODINAMIA], '2026', 'octubre', SIN_BUSQUEDA, 0);
    expect(pagina).toHaveLength(7);
    expect(h.consultas).toHaveLength(1);
    expect(h.consultas[0].ruta).toBe(ruta('hemodinamia_imputadas'));
    expect(limitesPedidos()).toEqual([TAMANO_PAGINA]);
  });

  it('General recorre todo sin duplicar, saltar ni desordenar', async () => {
    const vistos = [];
    for (let i = 0; i < 6; i++) vistos.push(...await obtenerPagina(TRES, '2026', 'octubre', SIN_BUSQUEDA, i));
    expect(vistos).toHaveLength(107);
    expect(new Set(vistos.map((f) => `${f.origen}:${f.id}`)).size).toBe(107);
    const ids = vistos.map((f) => f.gestionId);
    expect(ids).toEqual([...ids].sort());
  });

  it('General nunca pide más de una página por colección', async () => {
    for (let i = 0; i < 4; i++) await obtenerPagina(TRES, '2026', 'octubre', SIN_BUSQUEDA, i);
    expect(Math.max(...limitesPedidos())).toBeLessThanOrEqual(TAMANO_PAGINA);
  });

  it('solo consulta las colecciones del alcance', async () => {
    await obtenerPagina([IMPLANTES, HEMODINAMIA], '2026', 'octubre', SIN_BUSQUEDA, 0);
    await obtenerTotales([IMPLANTES, HEMODINAMIA], '2026', 'octubre');
    expect(h.consultas.some((q) => q.ruta.startsWith('consignacion'))).toBe(false);
  });

  it('volver a una página ya vista no lee', async () => {
    await obtenerPagina([IMPLANTES], '2026', 'octubre', SIN_BUSQUEDA, 0);
    await obtenerPagina([IMPLANTES], '2026', 'octubre', SIN_BUSQUEDA, 1);
    const antes = lecturas();
    await obtenerPagina([IMPLANTES], '2026', 'octubre', SIN_BUSQUEDA, 0);
    expect(lecturas()).toBe(antes);
  });

  it('dos pedidos simultáneos de la misma página no duplican la lectura', async () => {
    const [a, b] = await Promise.all([
      obtenerPagina([IMPLANTES], '2026', 'octubre', SIN_BUSQUEDA, 0),
      obtenerPagina([IMPLANTES], '2026', 'octubre', SIN_BUSQUEDA, 0),
    ]);
    expect(a).toEqual(b);
    expect(lecturas()).toBe(1);
  });
});

describe('totales', () => {
  it('cuenta los documentos sin venta numérica, incluso sin el campo', async () => {
    const docs = h.datos[ruta('hemodinamia_imputadas')];
    delete docs[0].campos.venta;
    docs[1].campos.venta = null;
    const t = await obtenerTotales([HEMODINAMIA], '2026', 'octubre');
    expect(t).toMatchObject({ cantidad: 7, totalCosto: 70, totalVenta: 100, sinVenta: 2 });
  });

  it('usa la caché y Actualizar la invalida', async () => {
    await obtenerTotales([HEMODINAMIA], '2026', 'octubre');
    const primeras = h.consultas.length;
    await obtenerTotales([HEMODINAMIA], '2026', 'octubre');
    expect(h.consultas).toHaveLength(primeras);
    invalidarHistorial({ anio: '2026', mes: 'octubre', origenes: [HEMODINAMIA] });
    await obtenerTotales([HEMODINAMIA], '2026', 'octubre');
    expect(h.consultas).toHaveLength(primeras * 2);
  });
});

describe('búsqueda por prefijo', () => {
  it('filtra en el servidor por el campo de nombre de cada colección', async () => {
    const busqueda = { tipo: 'nombre', valor: 'JUAN' };
    await obtenerPagina([IMPLANTES, CONSIGNACION], '2026', 'octubre', busqueda, 0);
    const campoDe = (raiz) => h.consultas.find((q) => q.ruta.startsWith(raiz)).restr.find((r) => r.t === 'orderBy').campo;
    expect(campoDe('implantes')).toBe('paciente');
    expect(campoDe('consignacion')).toBe('nombre');
  });

  it('cuenta con el mismo alcance', async () => {
    expect(await obtenerConteoBusqueda([IMPLANTES, HEMODINAMIA], '2026', 'octubre', { tipo: 'nombre', valor: 'JUAN' })).toBe(67);
    expect(await obtenerConteoBusqueda([CONSIGNACION], '2026', 'octubre', { tipo: 'nombre', valor: 'JUAN' })).toBe(0);
  });
});

describe('Buscar en este mes', () => {
  it('descarga una vez por colección y se reutiliza entre pestañas', async () => {
    expect(mesDescargado(HEMODINAMIA, '2026', 'octubre')).toBe(false);
    await descargarMes([HEMODINAMIA], '2026', 'octubre');
    expect(mesDescargado(HEMODINAMIA, '2026', 'octubre')).toBe(true);
    expect(lecturas()).toBe(1);
    const filasGeneral = await descargarMes([HEMODINAMIA, CONSIGNACION], '2026', 'octubre');
    expect(filasGeneral).toHaveLength(47);
    expect(lecturas()).toBe(2);
    expect(h.consultas.filter((q) => q.ruta.startsWith('hemodinamia'))).toHaveLength(1);
  });
});

describe('Buscar en todo el año', () => {
  const MESES = ['septiembre', 'octubre'];

  beforeEach(() => {
    h.datos[ruta('implantes_imputadas', 'septiembre')] = [{ id: 'x1', campos: { gestionId: '500000', paciente: 'A B C' } }];
    h.datos[ruta('implantes_imputadas', 'octubre')] = [
      { id: 'x1', campos: { gestionId: '500000', paciente: 'A B C' } },
      { id: 'x2', campos: { gestionId: '5000001', paciente: 'A B C' } },
    ];
  });

  it('busca coincidencia exacta, solo en los meses indicados', async () => {
    const r = await buscarAdmisionEnAnio([IMPLANTES, HEMODINAMIA], '2026', '500000', MESES);
    expect(r.filas).toHaveLength(2);
    expect(new Set(r.filas.map((f) => f.id)).size).toBe(2);
    expect(h.consultas).toHaveLength(4);
    expect(h.consultas.every((q) => q.restr.some((c) => c.t === 'where' && c.op === '==' && c.valor === '500000'))).toBe(true);
    expect(h.consultas.every((q) => q.restr.some((c) => c.t === 'limit'))).toBe(true);
    expect(h.consultas.some((q) => q.ruta.includes('noviembre'))).toBe(false);
  });

  it('repetir la búsqueda no lee', async () => {
    await buscarAdmisionEnAnio([IMPLANTES], '2026', '500000', MESES);
    const antes = h.consultas.length;
    await buscarAdmisionEnAnio([IMPLANTES], '2026', '500000', MESES);
    expect(h.consultas).toHaveLength(antes);
  });
});

describe('sesión', () => {
  it('cambiar de usuario descarta la caché', async () => {
    await obtenerTotales([HEMODINAMIA], '2026', 'octubre');
    const antes = h.consultas.length;
    h.auth.currentUser = { uid: 'usuario-2' };
    await obtenerTotales([HEMODINAMIA], '2026', 'octubre');
    expect(h.consultas).toHaveLength(antes * 2);
  });

  it('cerrar sesión la borra sin esperar otra lectura', async () => {
    await descargarMes([HEMODINAMIA], '2026', 'octubre');
    h.auth.currentUser = null;
    h.sesion.callback(null);
    h.auth.currentUser = { uid: 'usuario-1' };
    expect(mesDescargado(HEMODINAMIA, '2026', 'octubre')).toBe(false);
  });
});
