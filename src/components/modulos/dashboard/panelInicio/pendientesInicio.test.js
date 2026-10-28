// Inicio → Pendientes: quién ve cada bloque, conteo de cirugías y fibras
// (con las mismas reglas que la pantalla Fibras) y los valores Al día /
// No disponible.
import { describe, it, expect } from 'vitest';
import { alertaFibra } from '../../operaciones/implantes/fibras/seccionesFibras';
import {
  bloquesPendientes, hayBloques, cirugiasDelDia, unirCirugias, indicadoresFibras, filtroGestion, filtroFibras,
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
  it('cuenta pacientes (admisiones) distintos y limpia los datos vacíos', () => {
    const lista = cirugiasDelDia([
      { gestionId: '123', nombre: 'Ana Pérez', medico: 'Dr. Soto', empresa: 'A' },
      { gestionId: '123', nombre: 'Ana Pérez', medico: 'Dr. Soto', empresa: 'B' },
      { gestionId: 'P', nombre: 'P', medico: 'P', refPath: 'x/1' },
      { gestionId: 'P', nombre: 'Luis', medico: 'Dra. Rojas', refPath: 'x/2' },
    ], 'implantes');
    expect(lista).toHaveLength(3);
    expect(lista[0]).toMatchObject({ modulo: 'implantes', gestionId: '123', paciente: 'Ana Pérez', medico: 'Dr. Soto' });
    expect(lista[1]).toMatchObject({ gestionId: '', paciente: 'Sin nombre', medico: 'Sin médico' });
  });

  it('une Implantes y Hemodinamia ordenadas por paciente', () => {
    const unidas = unirCirugias([
      cirugiasDelDia([{ gestionId: '1', nombre: 'Zoe' }], 'implantes'),
      cirugiasDelDia([{ gestionId: '1', nombre: 'Ana' }], 'hemodinamia'),
    ]);
    expect(unidas.map((c) => [c.paciente, c.modulo])).toEqual([['Ana', 'hemodinamia'], ['Zoe', 'implantes']]);
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
    expect(filtroGestion('enRevision', '2026-10-28').estados).toEqual(expect.arrayContaining(['REVISAR', 'S/COTIZACION']));
  });
});

describe('Pendientes — fibras', () => {
  const hoy = '2026-10-28';
  const f = (id, referencia, extra) => ({ id, codigoInterno: id, referencia, usosTotales: 5, usosPrevios: 0, vencimiento: '2027-12-31', ...extra });
  const fibras = [
    f('F1', 'R1', { ubicacion: 'EN USO', usosPrevios: 4 }),             // último uso
    f('F2', 'R2', { ubicacion: 'EN USO', vencimiento: '2026-11-15' }),     // vence pronto
    f('F3', 'R3', { ubicacion: 'EN BODEGA', vencimiento: '2026-10-01' }),  // vencida, en bodega
    f('F4', 'R4', { ubicacion: 'EN BODEGA' }),                             // R4 en bodega, ninguna en uso
    f('F5', 'R5', { ubicacion: 'AGOTADA', usosPrevios: 5, estado: 'AGOTADA' }), // R5 sin disponibles
  ];
  const codigos = [{ referencia: 'R1' }, { referencia: 'R2' }, { referencia: 'r3' }, { referencia: 'R4' }, { referencia: 'R5' }, { referencia: 'R6' }];

  it('cuenta cada alerta y sus referencias', () => {
    const r = indicadoresFibras(fibras, codigos, hoy);
    expect(r.ultimoUso).toEqual({ n: 1, referencias: ['R1'] });
    expect(r.vencenPronto).toEqual({ n: 1, referencias: ['R2'] });
    expect(r.vencidas).toEqual({ n: 1, referencias: ['R3'] });
    // R3 (solo una vencida en bodega) y R4 no tienen fibra en uso.
    expect(r.bodegaSinUso).toEqual({ n: 2, referencias: ['R3', 'R4'] });
    // Sin ninguna vigente en uso ni en bodega: R3 (vencida), R5 (agotada) y R6 (nunca registrada).
    expect(r.sinDisponibles).toEqual({ n: 3, referencias: ['R3', 'R5', 'R6'] });
  });

  it('coincide con las alertas ámbar y roja de la pantalla Fibras para las fibras en uso', () => {
    const enUso = fibras.filter((x) => x.ubicacion === 'EN USO');
    const r = indicadoresFibras(enUso, [], hoy);
    expect(enUso.filter((x) => alertaFibra(x, hoy) === 'ambar')).toHaveLength(r.ultimoUso.n + r.vencenPronto.n);
    expect(enUso.filter((x) => alertaFibra(x, hoy) === 'rojo')).toHaveLength(r.vencidas.n);
  });

  it('sin fibras ni códigos todo está al día', () => {
    const r = indicadoresFibras([], [], hoy);
    expect(Object.values(r).map((x) => x.n)).toEqual([0, 0, 0, 0, 0]);
  });

  it('abre Fibras filtrada solo si hay una referencia', () => {
    expect(filtroFibras(['R1'])).toEqual({ texto: 'R1' });
    expect(filtroFibras(['R1', 'R2'])).toBeNull();
    expect(filtroFibras()).toBeNull();
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
