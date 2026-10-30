import { describe, it, expect, vi, beforeEach } from 'vitest';

// Firestore simulado: cada consulta guarda sus filtros y getDocs responde
// según `respuestas` (función de la consulta) o falla.
const consultas = [];
let responder = () => [];
vi.mock('../../../../../firebaseConfig', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collectionGroup: (_db, nombre) => ({ nombre }),
  documentId: () => '__name__',
  where: (campo, op, valor) => ({ tipo: 'where', campo, op, valor }),
  limit: (n) => ({ tipo: 'limit', n }),
  query: (base, ...filtros) => { const q = { base, filtros }; consultas.push(q); return q; },
  getDocs: async (q) => {
    const docs = await responder(q);
    return { docs: docs.map(({ ruta, ...datos }) => ({ data: () => datos, ref: { path: ruta } })) };
  },
}));

const {
  normalizarTexto, normalizarId, variantesId, buscarDuplicado, cambiaIdentidad, revisarDuplicadoGestion,
} = await import('./duplicadosGestion');

const RUTA = (id) => `implantes_gestiones/2026/mes/10/dia/30/admision/A/empresa/E/detalles/${id}`;

describe('normalización', () => {
  it('nombre: sin tildes, mayúsculas, espacios al inicio/fin ni dobles', () => {
    expect(normalizarTexto('  José   Pérez  ')).toBe('JOSE PEREZ');
    expect(normalizarTexto('MARÍA ñuñez')).toBe(normalizarTexto('maria Ñuñez'));
  });

  it('ID / RUT sin puntos, guiones ni espacios', () => {
    expect(normalizarId('12.345.678-9')).toBe('123456789');
    expect(normalizarId(' 12345678 - k ')).toBe('12345678K');
  });

  it('variantes del ID para la consulta: tal cual, número y RUT con y sin puntos', () => {
    expect(variantesId('123456789')).toEqual(expect.arrayContaining(['123456789', 123456789, '12345678-9', '12.345.678-9']));
    expect(variantesId('12.345.678-9')).toEqual(expect.arrayContaining(['12.345.678-9', '123456789', '12345678-9']));
    expect(variantesId('P')).toEqual([]);
    expect(variantesId('')).toEqual([]);
  });
});

describe('buscarDuplicado', () => {
  const existente = { refPath: RUTA('x'), nombre: 'JOSÉ PÉREZ', fecha: '2026-10-30', empresa: 'MEDTRONIC', gestionId: '12.345.678-9', estado: 'AGENDADO' };

  it('nombre + fecha + empresa con tildes, mayúsculas y espacios distintos', () => {
    const nueva = { nombre: ' jose  perez ', fecha: '2026-10-30', empresa: 'medtronic', gestionId: 'P' };
    expect(buscarDuplicado(nueva, [existente])).toEqual({ motivo: 'datos', existente });
  });

  it('si solo coinciden una o dos de las tres, no alerta', () => {
    const base = { nombre: 'JOSE PEREZ', fecha: '2026-10-30', empresa: 'MEDTRONIC', gestionId: 'P' };
    expect(buscarDuplicado({ ...base, empresa: 'OTRA' }, [existente])).toBeNull();
    expect(buscarDuplicado({ ...base, fecha: '2026-10-29' }, [existente])).toBeNull();
    expect(buscarDuplicado({ ...base, nombre: 'JOSE PERE' }, [existente])).toBeNull();
  });

  it('un nombre o empresa pendiente ("P") no identifica a nadie', () => {
    const pendiente = { ...existente, nombre: 'P' };
    expect(buscarDuplicado({ nombre: 'P', fecha: '2026-10-30', empresa: 'MEDTRONIC', gestionId: 'P' }, [pendiente])).toBeNull();
  });

  it('el mismo RUT con y sin puntos ni guion', () => {
    const nueva = { nombre: 'OTRO', fecha: '2026-01-01', empresa: 'OTRA', gestionId: '123456789' };
    expect(buscarDuplicado(nueva, [existente])).toEqual({ motivo: 'id', existente });
    expect(buscarDuplicado({ ...nueva, gestionId: '12345678-9' }, [existente])?.motivo).toBe('id');
    expect(buscarDuplicado({ ...nueva, gestionId: '12345678-0' }, [existente])).toBeNull();
  });

  it('ID guardado como número', () => {
    const numerico = { ...existente, gestionId: 102345 };
    expect(buscarDuplicado({ nombre: 'X', fecha: '2026-01-01', empresa: 'Y', gestionId: '102345' }, [numerico])?.motivo).toBe('id');
  });

  it('al editar no se compara consigo misma', () => {
    const nueva = { nombre: 'JOSE PEREZ', fecha: '2026-10-30', empresa: 'MEDTRONIC', gestionId: '123456789' };
    expect(buscarDuplicado(nueva, [existente], { excluirRefPath: existente.refPath })).toBeNull();
  });

  it('cambiaIdentidad: solo nombre, fecha, empresa o ID', () => {
    const original = { nombre: 'José', fecha: '2026-10-30', empresa: 'A', gestionId: '12.345.678-9', observacion: 'x' };
    expect(cambiaIdentidad(null, original)).toBe(true);
    expect(cambiaIdentidad(original, { ...original, nombre: 'JOSE', gestionId: '123456789', observacion: 'otra' })).toBe(false);
    expect(cambiaIdentidad(original, { ...original, empresa: 'B' })).toBe(true);
    expect(cambiaIdentidad(original, { ...original, gestionId: '1' })).toBe(true);
  });
});

describe('revisarDuplicadoGestion (consultas)', () => {
  beforeEach(() => { consultas.length = 0; responder = () => []; });

  const filtro = (q, campo) => q.filtros.find((f) => f.campo === campo);

  it('una consulta por día y una por ID (limit 1), acotadas a la colección del módulo', async () => {
    responder = (q) => (filtro(q, 'fecha') ? [{ ruta: RUTA('a'), nombre: 'Jose Pérez', fecha: '2026-10-30', empresa: 'MEDTRONIC' }] : []);
    const r = await revisarDuplicadoGestion('hemodinamia', { nombre: 'JOSE PEREZ', fecha: '2026-10-30', empresa: 'Medtronic', gestionId: '102' });
    expect(r?.motivo).toBe('datos');
    expect(consultas).toHaveLength(2);
    consultas.forEach((q) => {
      expect(q.base.nombre).toBe('detalles');
      expect(filtro(q, '__name__')?.valor).toBe('hemodinamia_gestiones/0000');
    });
    expect(filtro(consultas[0], 'fecha').valor).toBe('2026-10-30');
    expect(filtro(consultas[1], 'gestionId').op).toBe('in');
    expect(consultas[1].filtros.find((f) => f.tipo === 'limit').n).toBe(1);
  });

  it('al editar pide 2 por ID para poder descartarse a sí misma', async () => {
    responder = (q) => (filtro(q, 'gestionId') ? [{ ruta: RUTA('yo'), gestionId: '102' }] : []);
    const r = await revisarDuplicadoGestion('implantes', { nombre: 'P', fecha: '2026-10-30', empresa: 'P', gestionId: '102' }, { excluirRefPath: RUTA('yo') });
    expect(r).toBeNull();
    expect(consultas).toHaveLength(1);
    expect(consultas[0].filtros.find((f) => f.tipo === 'limit').n).toBe(2);
  });

  it('sin nombre/empresa ni ID no consulta nada', async () => {
    expect(await revisarDuplicadoGestion('implantes', { nombre: 'P', fecha: '2026-10-30', empresa: 'P', gestionId: 'P' })).toBeNull();
    expect(consultas).toHaveLength(0);
  });

  it('si la revisión falla o tarda, no impide registrar', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    responder = () => { throw new Error('sin conexión'); };
    expect(await revisarDuplicadoGestion('implantes', { nombre: 'A', fecha: '2026-10-30', empresa: 'B', gestionId: 'P' })).toBeNull();
    responder = () => new Promise(() => {});
    expect(await revisarDuplicadoGestion('implantes', { nombre: 'A', fecha: '2026-10-30', empresa: 'B', gestionId: 'P' }, { esperaMs: 10 })).toBeNull();
    warn.mockRestore();
  });
});
