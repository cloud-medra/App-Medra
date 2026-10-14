import { describe, it, expect } from 'vitest';
import {
  fechaEnSantiago, horaEnSantiago, textoAtrasada, sumarDias, DIAS_MAX_ATRASO, diaSemana, ultimaRepeticion, proximaRepeticion, tareasPendientes, idRealizado,
  puedeRecibirRecordatorios, puedeAdministrarRecordatorios, validarTarea, textoDias,
  RUTA_RECORDATORIOS, RUTA_MIS_RECORDATORIOS, RUTA_ADMINISTRAR_RECORDATORIOS,
} from './recordatoriosConfig';

// 2026-10-12 = lunes, 13 = martes, 14 = miércoles, 19 = lunes siguiente.
const UID = 'u1';
const LUNES = { id: 'facturas', titulo: 'Revisar facturas', dias: [1], asignados: [UID], activa: true, desde: '2026-10-12' };
const MARTES = { id: 'lab', titulo: 'Ver laboratorio', dias: [2], asignados: [UID], activa: true, desde: '2026-10-12' };
const MIERCOLES = { id: 'ordenes', titulo: 'Ver órdenes', dias: [3], asignados: [UID, 'u2'], activa: true, desde: '2026-10-12' };
const TAREAS = [LUNES, MARTES, MIERCOLES];
const pendientes = (hoy, realizados = [], tareas = TAREAS, uid = UID, hora) =>
  tareasPendientes(tareas, new Set(realizados), { uid, hoy, hora })
    .map(({ tarea, fecha, hora: h, atrasada }) => `${tarea.id}@${fecha}${h ? ` ${h}` : ''}${atrasada ? ' atrasada' : ''}`);

describe('fechas en America/Santiago', () => {
  it('usa el día de Santiago, no el UTC', () => {
    // 02:00 UTC del martes 13 = 23:00 del lunes 12 en Santiago (UTC-3).
    expect(fechaEnSantiago(new Date('2026-10-13T02:00:00Z'))).toBe('2026-10-12');
    expect(fechaEnSantiago(new Date('2026-10-13T04:00:00Z'))).toBe('2026-10-13');
  });

  it('hora de Santiago HH:MM (00 a 23)', () => {
    expect(horaEnSantiago(new Date('2026-10-12T12:00:00Z'))).toBe('09:00');
    expect(horaEnSantiago(new Date('2026-10-13T03:05:00Z'))).toBe('00:05');
    expect(horaEnSantiago(new Date('2026-10-13T02:59:00Z'))).toBe('23:59');
  });

  it('texto de atrasada con el día en que debía hacerse', () => {
    expect(textoAtrasada('2026-10-12')).toBe('Atrasada desde lunes 12-10');
    expect(textoAtrasada('2026-10-14')).toBe('Atrasada desde miércoles 14-10');
  });

  it('días de la semana 1 (lunes) a 7 (domingo)', () => {
    expect(diaSemana('2026-10-12')).toBe(1);
    expect(diaSemana('2026-10-18')).toBe(7);
  });

  it('última y próxima repetición', () => {
    expect(ultimaRepeticion(LUNES, '2026-10-12')).toBe('2026-10-12');
    expect(ultimaRepeticion(LUNES, '2026-10-14')).toBe('2026-10-12');
    expect(proximaRepeticion(LUNES, '2026-10-12')).toBe('2026-10-19');
    // Una repetición anterior a la creación de la tarea no cuenta.
    expect(ultimaRepeticion({ ...LUNES, desde: '2026-10-13' }, '2026-10-14')).toBeNull();
    expect(ultimaRepeticion(LUNES, '2026-10-11')).toBeNull();
  });
});

describe('tareas pendientes del usuario', () => {
  it('muestra la tarea del día', () => {
    expect(pendientes('2026-10-12')).toEqual(['facturas@2026-10-12']);
  });

  it('se oculta al marcarla como realizada', () => {
    expect(pendientes('2026-10-12', [idRealizado('facturas', '2026-10-12')])).toEqual([]);
  });

  it('reaparece en la siguiente repetición', () => {
    const hecho = [idRealizado('facturas', '2026-10-12'), idRealizado('lab', '2026-10-13'), idRealizado('ordenes', '2026-10-14')];
    expect(pendientes('2026-10-18', hecho)).toEqual([]);
    expect(pendientes('2026-10-19', hecho)).toEqual(['facturas@2026-10-19']);
  });

  it('si no se marcó en su día, sigue como atrasada hasta marcarla', () => {
    expect(pendientes('2026-10-13')).toEqual(['facturas@2026-10-12 atrasada', 'lab@2026-10-13']);
    expect(pendientes('2026-10-15', [idRealizado('lab', '2026-10-13')]))
      .toEqual(['facturas@2026-10-12 atrasada', 'ordenes@2026-10-14 atrasada']);
    expect(pendientes('2026-10-15', [idRealizado('facturas', '2026-10-12'), idRealizado('lab', '2026-10-13'), idRealizado('ordenes', '2026-10-14')]))
      .toEqual([]);
  });

  it('las atrasadas se acumulan (una por cada día sin marcar) hasta marcarlas', () => {
    // Lunes 12, 19 y 26 sin marcar: el 26 se ven las tres, las atrasadas primero.
    expect(pendientes('2026-10-26', [], [LUNES])).toEqual([
      'facturas@2026-10-12 atrasada', 'facturas@2026-10-19 atrasada', 'facturas@2026-10-26',
    ]);
    // Cada repetición se marca por separado.
    expect(pendientes('2026-10-26', [idRealizado('facturas', '2026-10-19')], [LUNES]))
      .toEqual(['facturas@2026-10-12 atrasada', 'facturas@2026-10-26']);
    // Tarea diaria sin marcar desde el lunes: el jueves se ven 4.
    const DIARIA = { ...LUNES, id: 'diaria', dias: [1, 2, 3, 4, 5, 6, 7] };
    expect(pendientes('2026-10-15', [], [DIARIA])).toHaveLength(4);
  });

  it('no acumula antes de la creación de la tarea ni más allá de DIAS_MAX_ATRASO', () => {
    expect(pendientes('2026-10-26', [], [{ ...LUNES, desde: '2026-10-20' }])).toEqual(['facturas@2026-10-26']);
    const hoy = sumarDias('2026-10-12', DIAS_MAX_ATRASO + 7);
    const lista = tareasPendientes([{ ...LUNES, dias: [1, 2, 3, 4, 5, 6, 7] }], new Set(), { uid: UID, hoy });
    expect(lista).toHaveLength(DIAS_MAX_ATRASO + 1);
    expect(lista[0].fecha).toBe(sumarDias(hoy, -DIAS_MAX_ATRASO));
  });

  it('varias tareas el mismo día: cada una se marca por separado', () => {
    const CAJA = { ...LUNES, id: 'caja', titulo: 'Cuadrar caja' };
    const STOCK = { ...LUNES, id: 'stock', titulo: 'Contar stock' };
    expect(pendientes('2026-10-12', [], [LUNES, CAJA, STOCK]))
      .toEqual(['stock@2026-10-12', 'caja@2026-10-12', 'facturas@2026-10-12']);
    expect(pendientes('2026-10-12', [idRealizado('caja', '2026-10-12')], [LUNES, CAJA, STOCK]))
      .toEqual(['stock@2026-10-12', 'facturas@2026-10-12']);
  });

  it('con hora: la de hoy aparece recién desde esa hora; sin hora, desde el inicio del día', () => {
    const A_LAS_9 = { ...LUNES, id: 'nueve', titulo: 'A las 9', hora: '09:00' };
    expect(pendientes('2026-10-12', [], [LUNES, A_LAS_9], UID, '00:00')).toEqual(['facturas@2026-10-12']);
    expect(pendientes('2026-10-12', [], [LUNES, A_LAS_9], UID, '08:59')).toEqual(['facturas@2026-10-12']);
    expect(pendientes('2026-10-12', [], [LUNES, A_LAS_9], UID, '09:00')).toEqual(['facturas@2026-10-12', 'nueve@2026-10-12 09:00']);
    // Pasado el día, sigue como atrasada a cualquier hora del día siguiente.
    expect(pendientes('2026-10-19', [], [A_LAS_9], UID, '00:01'))
      .toEqual(['nueve@2026-10-12 09:00 atrasada']);
  });

  it('orden: atrasadas primero, después las de hoy por hora', () => {
    const tareas = [
      { ...LUNES, id: 'tarde', titulo: 'A', hora: '15:30' },
      { ...LUNES, id: 'manana', titulo: 'B', hora: '08:15' },
      { ...LUNES, id: 'sinHora', titulo: 'C' },
      { ...MARTES, id: 'martes', titulo: 'D', hora: '07:00', desde: '2026-10-01' },
    ];
    expect(pendientes('2026-10-12', [], tareas, UID, '16:00')).toEqual([
      'martes@2026-10-06 07:00 atrasada', 'sinHora@2026-10-12', 'manana@2026-10-12 08:15', 'tarde@2026-10-12 15:30',
    ]);
  });

  it('no muestra tareas desactivadas ni de otros usuarios', () => {
    expect(pendientes('2026-10-12', [], [{ ...LUNES, activa: false }])).toEqual([]);
    expect(pendientes('2026-10-14', [], TAREAS, 'u2')).toEqual(['ordenes@2026-10-14']);
    expect(pendientes('2026-10-12', [], TAREAS, 'u3')).toEqual([]);
  });
});

describe('permisos', () => {
  const conPestanas = (...pestanas) => ({
    uid: UID, rol: 'operador',
    permisos: { administracion: [RUTA_RECORDATORIOS] },
    permisosGranulares: Object.fromEntries([RUTA_RECORDATORIOS, ...pestanas].map((r) => [r, {}])),
  });

  it('recibe solo con la pestaña "Mis recordatorios" (Desarrollador siempre; Administrador, con la pestaña)', () => {
    expect(puedeRecibirRecordatorios(conPestanas(RUTA_MIS_RECORDATORIOS))).toBe(true);
    expect(puedeRecibirRecordatorios(conPestanas())).toBe(false);
    expect(puedeRecibirRecordatorios({ uid: UID, rol: 'operador', permisos: {}, permisosGranulares: { [RUTA_MIS_RECORDATORIOS]: {} } })).toBe(false);
    expect(puedeRecibirRecordatorios({ uid: UID, rol: 'operador' })).toBe(false);
    expect(puedeRecibirRecordatorios({ uid: UID, rol: 'admin' })).toBe(false);
    expect(puedeRecibirRecordatorios({ ...conPestanas(RUTA_MIS_RECORDATORIOS), rol: 'admin' })).toBe(true);
    expect(puedeRecibirRecordatorios({ uid: UID, rol: 'dev' })).toBe(true);
  });

  it('administra solo con la pestaña "Administrar tareas" (Desarrollador siempre)', () => {
    expect(puedeAdministrarRecordatorios(conPestanas(RUTA_MIS_RECORDATORIOS))).toBe(false);
    expect(puedeAdministrarRecordatorios(conPestanas(RUTA_ADMINISTRAR_RECORDATORIOS))).toBe(true);
    expect(puedeAdministrarRecordatorios({ rol: 'dev' })).toBe(true);
    expect(puedeAdministrarRecordatorios({ rol: 'admin' })).toBe(false);
  });
});

describe('formulario y textos', () => {
  it('valida título, días y usuarios', () => {
    expect(validarTarea({ titulo: ' ', dias: [], asignados: [] })).toEqual({
      titulo: expect.any(String), dias: expect.any(String), asignados: expect.any(String),
    });
    expect(validarTarea({ titulo: 'Revisar facturas', dias: [1], asignados: [UID] })).toEqual({});
    expect(validarTarea({ titulo: 'Revisar facturas', dias: [1], hora: '09:30', asignados: [UID] })).toEqual({});
    expect(validarTarea({ titulo: 'Revisar facturas', dias: [1], hora: '25:00', asignados: [UID] })).toEqual({ hora: expect.any(String) });
  });

  it('describe los días', () => {
    expect(textoDias([3, 1])).toBe('Lunes, Miércoles');
    expect(textoDias([1, 2, 3, 4, 5])).toBe('Lunes a viernes');
    expect(textoDias([1, 2, 3, 4, 5, 6, 7])).toBe('Todos los días');
  });
});
