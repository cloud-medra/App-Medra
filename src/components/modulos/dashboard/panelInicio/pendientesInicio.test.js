// Inicio → Pendientes: quién ve cada bloque, conteo de cirugías, uso de
// fibras por referencia (con las alertas de la pantalla Fibras) y los
// valores Al día / No disponible.
import { describe, it, expect } from 'vitest';
import { alertaFibra } from '../../operaciones/implantes/fibras/seccionesFibras';
import {
  bloquesPendientes, hayBloques, contarCirugias, usoFibrasPorReferencia, filtroGestion, tipoPorRevisar,
  valorIndicador, sumarResultados, diaSiguienteISO,
} from './pendientesInicio';

const GESTION_IMP = '/implantes/gestionImplantes';
const SOLICITUD_IMP = '/implantes/solicitudImplantes';
const FIBRAS = '/implantes/fibrasReutilizables';
const GESTION_HEM = '/hemodinamia/gestionHemodinamia';
const usuario = (permisos) => ({ rol: 'operador', activo: true, permisos });

describe('Pendientes — permisos', () => {
  it('el Desarrollador ve todos los bloques', () => {
    expect(bloquesPendientes({ rol: 'dev', activo: true, permisos: {} })).toEqual({
      implantes: true, abreSolicitud: true, cirugias: ['implantes', 'hemodinamia'], fibras: true,
    });
  });

  it('sin Gestión ni Fibras no hay bloques (la sección no aparece)', () => {
    const b = bloquesPendientes(usuario({ implantes: [SOLICITUD_IMP, '/implantes/resumenImplantes'] }));
    expect(b).toEqual({ implantes: false, abreSolicitud: false, cirugias: [], fibras: false });
    expect(hayBloques(b)).toBe(false);
    expect(hayBloques(bloquesPendientes({ rol: 'admin', activo: true, permisos: {} }))).toBe(false);
  });

  it('Gestión de Implantes da el bloque Implantes y sus cirugías; Solicitud solo habilita el clic de Por imputar', () => {
    expect(bloquesPendientes(usuario({ implantes: [GESTION_IMP] })))
      .toEqual({ implantes: true, abreSolicitud: false, cirugias: ['implantes'], fibras: false });
    expect(bloquesPendientes(usuario({ implantes: [GESTION_IMP, SOLICITUD_IMP] })).abreSolicitud).toBe(true);
  });

  it('Hemodinamia solo agrega sus cirugías (HEM), con su propia Gestión', () => {
    const b = bloquesPendientes(usuario({ hemodinamia: [GESTION_HEM] }));
    expect(b).toEqual({ implantes: false, abreSolicitud: false, cirugias: ['hemodinamia'], fibras: false });
    expect(hayBloques(b)).toBe(true);
  });

  it('Fibras solo con la pantalla Fibras', () => {
    expect(bloquesPendientes(usuario({ implantes: [FIBRAS] })))
      .toEqual({ implantes: false, abreSolicitud: false, cirugias: [], fibras: true });
  });

  it('un ítem desactivado en Gestión de módulos oculta su bloque, también al Desarrollador', () => {
    const b = bloquesPendientes({ rol: 'dev', activo: true, permisos: {} }, { itemsInactivos: [FIBRAS], modulosInactivos: ['hemodinamia'] });
    expect(b.fibras).toBe(false);
    expect(b.cirugias).toEqual(['implantes']);
  });
});

describe('Pendientes — cirugías', () => {
  it('cuenta pacientes (admisiones) distintos; una gestión sin admisión cuenta sola', () => {
    expect(contarCirugias([
      { gestionId: '123', empresa: 'A' },
      { gestionId: '123', empresa: 'B' },
      { agendaId: '124' },
      { gestionId: 'P', refPath: 'x/1' },
      { gestionId: 'P', refPath: 'x/2' },
    ])).toBe(4);
    expect(contarCirugias([])).toBe(0);
  });

  it('mañana es el día siguiente, también a fin de mes y de año', () => {
    expect(diaSiguienteISO('2026-10-31')).toBe('2026-11-01');
    expect(diaSiguienteISO('2026-12-31')).toBe('2027-01-01');
    expect(diaSiguienteISO('2028-02-28')).toBe('2028-02-29');
  });

  it('los filtros de Gestión abren hoy, mañana y cada indicador', () => {
    expect(filtroGestion('hoy', '2026-10-28')).toMatchObject({ rango: 'soloHoy', anio: '', mes: '' });
    expect(filtroGestion('manana', '2026-10-31')).toEqual({ anio: '2026', mes: '11', dias: ['01'], rango: 'desdeManana', estados: [] });
    expect(filtroGestion('incompletas', '2026-10-28')).toMatchObject({ rango: 'todos', estados: ['INCOMPLETO'] });
    expect(filtroGestion('agendadasVencidas', '2026-10-28')).toMatchObject({ rango: 'hastaAyer', estados: ['AGENDANDO', 'AGENDADO'] });
    expect(filtroGestion('porRevisar', '2026-10-28').estados).toEqual(expect.arrayContaining(['REVISAR', 'S/COTIZACION', 'AGENDANDO']));
  });

  it('Por revisar abre con el filtro de la parte que tiene gestiones', () => {
    expect(tipoPorRevisar({ n: 2 }, { n: 0 })).toBe('enRevision');
    expect(tipoPorRevisar({ n: 0 }, { n: 1 })).toBe('agendadasVencidas');
    expect(tipoPorRevisar({ n: 2 }, { n: 1 })).toBe('porRevisar');
    expect(tipoPorRevisar({ error: true }, { n: 1 })).toBe('porRevisar');
  });
});

describe('Pendientes — fibras', () => {
  const hoy = '2026-10-28';
  const f = (id, referencia, extra) => ({ id, codigoInterno: id, referencia, usosTotales: 10, usosPrevios: 0, vencimiento: '2027-12-31', ...extra });
  const fibras = [
    f('F1', 'FL-1000', { ubicacion: 'EN USO', usosPrevios: 8 }),
    f('F2', 'FL-365', { ubicacion: 'EN USO', usosTotales: 5, usosPrevios: 1 }),
    f('F3', 'FL-365', { ubicacion: 'EN BODEGA' }),
    f('F4', 'FL-200', { ubicacion: 'EN BODEGA' }),
    f('F5', 'FL-550', { ubicacion: 'EN USO', usosPrevios: 9 }),
    f('F6', 'FL-600', { ubicacion: 'EN USO', usosPrevios: 2, vencimiento: '2026-10-01' }),
    f('F7', 'FL-700', { ubicacion: 'AGOTADA', usosPrevios: 10 }),
  ];
  const codigos = [{ referencia: 'fl-1000' }, { referencia: 'FL-365' }, { referencia: 'FL-700' }, { referencia: 'FL-800' }];

  it('una línea por referencia con el uso (consumidos/totales) de su fibra en uso', () => {
    const lineas = usoFibrasPorReferencia(fibras, codigos, hoy);
    expect(lineas.map((l) => [l.referencia, l.uso && `${l.uso.consumidos}/${l.uso.totales}`])).toEqual([
      ['fl-1000', '8/10'], ['FL-200', null], ['FL-365', '1/5'], ['FL-550', '9/10'], ['FL-600', '2/10'], ['FL-700', null], ['FL-800', null],
    ]);
  });

  it('el color es el de la pantalla Fibras: ámbar con 1 uso restante o por vencer, rojo vencida', () => {
    const porRef = Object.fromEntries(usoFibrasPorReferencia(fibras, codigos, hoy).map((l) => [l.referencia, l.uso?.alerta ?? null]));
    expect(porRef).toMatchObject({ 'FL-550': 'ambar', 'FL-600': 'rojo', 'fl-1000': null, 'FL-365': null });
    fibras.filter((x) => x.ubicacion === 'EN USO').forEach((x) => {
      const linea = usoFibrasPorReferencia([x], [], hoy)[0];
      expect(linea.uso.alerta).toBe(alertaFibra(x, hoy));
    });
  });

  it('sin fibras ni códigos no hay líneas', () => {
    expect(usoFibrasPorReferencia([], [], hoy)).toEqual([]);
  });
});

describe('Pendientes — Al día y No disponible', () => {
  it('0 es Al día, un error es No disponible (nunca 0) y sin respuesta, cargando', () => {
    expect(valorIndicador({ n: 0 })).toEqual({ estado: 'alDia', n: 0 });
    expect(valorIndicador({ n: 4 })).toEqual({ estado: 'conPendientes', n: 4 });
    expect(valorIndicador({ error: true })).toEqual({ estado: 'noDisponible' });
    expect(valorIndicador({})).toEqual({ estado: 'noDisponible' });
    expect(valorIndicador(undefined)).toEqual({ estado: 'cargando' });
  });

  it('Por revisar suma sus dos partes; si una falla, no está disponible', () => {
    expect(sumarResultados({ n: 2 }, { n: 1 })).toEqual({ n: 3 });
    expect(sumarResultados({ n: 2 }, { error: true })).toEqual({ error: true });
    expect(sumarResultados({ n: 2 }, undefined)).toBeUndefined();
  });
});
