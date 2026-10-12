import { describe, it, expect } from 'vitest';
import {
  fechaEnSantiago, diaSemana, ultimaRepeticion, proximaRepeticion, tareasPendientes, idRealizado,
  puedeRecibirRecordatorios, puedeAdministrarRecordatorios, validarTarea, textoDias, limitarPosicion,
  RUTA_RECORDATORIOS, RUTA_MIS_RECORDATORIOS, RUTA_ADMINISTRAR_RECORDATORIOS,
} from './recordatoriosConfig';

// 2026-10-12 = lunes, 13 = martes, 14 = miércoles, 19 = lunes siguiente.
const UID = 'u1';
const LUNES = { id: 'facturas', titulo: 'Revisar facturas', dias: [1], asignados: [UID], activa: true, desde: '2026-10-12' };
const MARTES = { id: 'lab', titulo: 'Ver laboratorio', dias: [2], asignados: [UID], activa: true, desde: '2026-10-12' };
const MIERCOLES = { id: 'ordenes', titulo: 'Ver órdenes', dias: [3], asignados: [UID, 'u2'], activa: true, desde: '2026-10-12' };
const TAREAS = [LUNES, MARTES, MIERCOLES];
const pendientes = (hoy, realizados = [], tareas = TAREAS, uid = UID) =>
  tareasPendientes(tareas, new Set(realizados), { uid, hoy }).map(({ tarea, fecha, atrasada }) => `${tarea.id}@${fecha}${atrasada ? ' atrasada' : ''}`);

describe('fechas en America/Santiago', () => {
  it('usa el día de Santiago, no el UTC', () => {
    // 02:00 UTC del martes 13 = 23:00 del lunes 12 en Santiago (UTC-3).
    expect(fechaEnSantiago(new Date('2026-10-13T02:00:00Z'))).toBe('2026-10-12');
    expect(fechaEnSantiago(new Date('2026-10-13T04:00:00Z'))).toBe('2026-10-13');
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

  it('recibe solo con la pestaña "Mis recordatorios" (admin y dev siempre)', () => {
    expect(puedeRecibirRecordatorios(conPestanas(RUTA_MIS_RECORDATORIOS))).toBe(true);
    expect(puedeRecibirRecordatorios(conPestanas())).toBe(false);
    expect(puedeRecibirRecordatorios({ uid: UID, rol: 'operador', permisos: {}, permisosGranulares: { [RUTA_MIS_RECORDATORIOS]: {} } })).toBe(false);
    expect(puedeRecibirRecordatorios({ uid: UID, rol: 'operador' })).toBe(false);
    expect(puedeRecibirRecordatorios({ uid: UID, rol: 'admin' })).toBe(true);
  });

  it('administra solo con la pestaña "Administrar tareas" (admin y dev siempre)', () => {
    expect(puedeAdministrarRecordatorios(conPestanas(RUTA_MIS_RECORDATORIOS))).toBe(false);
    expect(puedeAdministrarRecordatorios(conPestanas(RUTA_ADMINISTRAR_RECORDATORIOS))).toBe(true);
    expect(puedeAdministrarRecordatorios({ rol: 'dev' })).toBe(true);
  });
});

describe('formulario y textos', () => {
  it('valida título, días y usuarios', () => {
    expect(validarTarea({ titulo: ' ', dias: [], asignados: [] })).toEqual({
      titulo: expect.any(String), dias: expect.any(String), asignados: expect.any(String),
    });
    expect(validarTarea({ titulo: 'Revisar facturas', dias: [1], asignados: [UID] })).toEqual({});
  });

  it('describe los días', () => {
    expect(textoDias([3, 1])).toBe('Lunes, Miércoles');
    expect(textoDias([1, 2, 3, 4, 5])).toBe('Lunes a viernes');
    expect(textoDias([1, 2, 3, 4, 5, 6, 7])).toBe('Todos los días');
  });
});

describe('posición del recuadro flotante', () => {
  const ventana = { anchoVentana: 1000, altoVentana: 800 };
  const caja = { ancho: 300, alto: 200 };
  it('no deja que se salga de la pantalla', () => {
    expect(limitarPosicion({ x: -50, y: -20 }, caja, ventana)).toEqual({ x: 8, y: 8 });
    expect(limitarPosicion({ x: 900, y: 790 }, caja, ventana)).toEqual({ x: 692, y: 592 });
    expect(limitarPosicion({ x: 400, y: 300 }, caja, ventana)).toEqual({ x: 400, y: 300 });
  });
});
