import { describe, it, expect, vi, beforeEach } from 'vitest';

// Firestore simulado: las restricciones se registran como objetos legibles.
const llamadas = { getDocs: [], tx: [] };
let contador = null;
vi.mock('firebase/firestore', () => ({
  collection: (_db, nombre) => ({ coleccion: nombre }),
  doc: (...partes) => (partes.length === 1 ? { id: 'nuevo1', path: `tickets/nuevo1` } : { path: partes.slice(1).join('/') }),
  where: (campo, op, valor) => ({ where: [campo, op, valor] }),
  orderBy: (campo, dir) => ({ orderBy: [campo, dir] }),
  limit: (n) => ({ limit: n }),
  startAfter: (c) => ({ startAfter: c }),
  query: (col, ...r) => ({ col, r }),
  getDocs: async (q) => { llamadas.getDocs.push(q); return { docs: [] }; },
  getDoc: vi.fn(),
  updateDoc: vi.fn(),
  onSnapshot: vi.fn(() => () => {}),
  serverTimestamp: () => 'TS',
  runTransaction: async (_db, fn) => fn({
    get: async () => ({ exists: () => contador !== null, data: () => ({ ultimo: contador }) }),
    set: (ref, datos) => llamadas.tx.push({ ref, datos }),
  }),
}));
vi.mock('firebase/storage', () => ({ ref: vi.fn(), uploadBytes: vi.fn(), getDownloadURL: vi.fn(), deleteObject: vi.fn() }));
vi.mock('../../../../firebaseConfig', () => ({ db: {}, storage: {} }));
vi.mock('../../../../hooks/useVisibleSnapshot', () => ({ suscribirConVisibilidad: (abrir) => abrir() }));

const { crearTicket, listarMisTickets, listarBandeja, listarEquipo, escucharNovedadesUsuario, escucharPendientesGestor } = await import('./ticketsServicio');
const firestore = await import('firebase/firestore');

beforeEach(() => { llamadas.getDocs = []; llamadas.tx = []; contador = null; firestore.onSnapshot.mockClear(); });

const FORM = { tipo: 'ERROR', titulo: ' No guarda ', descripcion: 'Detalle', prioridad: 'ALTA', modulo: 'implantes' };
const USUARIO = { uid: 'u1', nombreCompleto: 'Ana', email: 'ana@x.cl', rol: 'operador', centroCostoId: 'c1', administradoresAsignados: ['a1'] };

describe('ticketsServicio', () => {
  it('crea el ticket con el número correlativo siguiente, en la misma transacción que el contador', async () => {
    contador = 41;
    const r = await crearTicket({ form: FORM, userData: USUARIO, vista: '/implantes/gestionImplantes' });
    expect(r).toEqual({ id: 'nuevo1', numero: 42 });
    expect(llamadas.tx[0]).toMatchObject({ ref: { path: 'tickets_meta/contador' }, datos: { ultimo: 42 } });
    expect(llamadas.tx[1].datos).toMatchObject({
      numero: 42, titulo: 'No guarda', estado: 'NUEVO', creadoPor: 'u1', mensajes: [], capturas: [],
      noLeidoUsuario: false, pendienteGestor: true, contexto: { vista: '/implantes/gestionImplantes' },
      // Visibilidad: el administrador asignado al autor, tomado de sus datos ya cargados.
      administradores: ['a1'], centroAdministradores: null
    });
  });

  it('el primer ticket es el número 1', async () => {
    const r = await crearTicket({ form: FORM, userData: USUARIO });
    expect(r.numero).toBe(1);
  });

  it('Mis tickets: filtrada por usuario, ordenada y paginada (nunca toda la colección)', async () => {
    await listarMisTickets('u1');
    expect(llamadas.getDocs[0].r).toEqual([
      { where: ['creadoPor', '==', 'u1'] }, { orderBy: ['actualizadoEl', 'desc'] }, { limit: 21 }
    ]);
    await listarMisTickets('u1', 'cursor');
    expect(llamadas.getDocs[1].r).toContainEqual({ startAfter: 'cursor' });
  });

  it('Bandeja: los filtros van en la consulta, paginada; un número busca ese ticket', async () => {
    await listarBandeja({ estado: 'NUEVO', modulo: 'implantes', orden: 'asc' });
    expect(llamadas.getDocs[0].r).toEqual([
      { where: ['estado', '==', 'NUEVO'] }, { where: ['modulo', '==', 'implantes'] }, { orderBy: ['creadoEl', 'asc'] }, { limit: 21 }
    ]);
    await listarBandeja({ numero: 12, estado: 'NUEVO' });
    expect(llamadas.getDocs[1].r).toEqual([{ where: ['numero', '==', 12] }, { limit: 21 }]);
  });

  it('los indicadores consultan con limit, nunca todos los tickets', () => {
    escucharNovedadesUsuario('u1', vi.fn());
    escucharPendientesGestor(vi.fn());
    const [[q1], [q2]] = firestore.onSnapshot.mock.calls;
    expect(q1.r).toEqual([{ where: ['creadoPor', '==', 'u1'] }, { where: ['noLeidoUsuario', '==', true] }, { limit: 1 }]);
    expect(q2.r).toEqual([{ where: ['pendienteGestor', '==', true] }, { limit: 10 }]);
  });
});

describe('Tickets de mi equipo', () => {
  it('consulta paginada por los campos de visibilidad del ticket, con filtros; nunca todos los tickets', async () => {
    await listarEquipo({ uid: 'a1', centros: ['c1', 'c2'] }, { estado: 'NUEVO' });
    const [asignados, centro] = llamadas.getDocs;
    expect(asignados.r).toEqual([
      { where: ['administradores', 'array-contains', 'a1'] }, { where: ['estado', '==', 'NUEVO'] }, { orderBy: ['creadoEl', 'desc'] }, { limit: 21 }
    ]);
    expect(centro.r).toEqual([
      { where: ['centroAdministradores', 'in', ['c1', 'c2']] }, { where: ['estado', '==', 'NUEVO'] }, { orderBy: ['creadoEl', 'desc'] }, { limit: 21 }
    ]);
  });
  it('sin centros administrados solo consulta los asignados; una fuente agotada no se vuelve a consultar', async () => {
    const r = await listarEquipo({ uid: 'a1', centros: [] });
    expect(llamadas.getDocs).toHaveLength(1);
    expect(r).toMatchObject({ hayMas: false, cursores: { asignados: false, centro: false } });
    llamadas.getDocs = [];
    await listarEquipo({ uid: 'a1', centros: ['c1'] }, {}, { asignados: false, centro: 'cursor' });
    expect(llamadas.getDocs).toHaveLength(1);
    expect(llamadas.getDocs[0].r).toContainEqual({ startAfter: 'cursor' });
  });
});
