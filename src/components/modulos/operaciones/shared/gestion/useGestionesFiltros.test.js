// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useGestionesFiltros, opcionesPeriodoGestiones, usePeriodoGestiones } from './useGestionesFiltros';
import { fechaISOEnChile } from './rangoFechaGestiones';

const implante = (id, fecha, estado) => ({
  id, gestionId: id, agendaId: id, nombre: `Paciente ${id}`, empresa: 'EmpresaX', fecha, estado
});

const DATASET = [
  implante('1', '2026-01-05', 'PENDIENTE'),
  implante('2', '2026-01-05', 'CARGADO'),
  implante('3', '2026-01-12', 'PENDIENTE'),
  implante('4', '2026-01-20', 'CARGADO'),
  implante('5', '2026-02-03', 'PENDIENTE') // otro mes, para probar que año/mes ya acotan
];

// Deja los filtros en un estado neutro y predecible (sin depender de la
// fecha real del día en que corre el test): año/mes vacíos ("Todos") y
// rango de fecha en "Todos los días", salvo que el test lo pruebe explícitamente.
const enBlanco = (result) => {
  act(() => {
    result.current.setFiltroAnio('');
    result.current.setFiltroMes('');
    result.current.setFiltroRangoFecha('todos');
  });
};

describe('useGestionesFiltros — cascada del filtro de Día', () => {
  it('opcionesDias refleja solo los días de los registros ya filtrados por año/mes (no el universo completo)', () => {
    const { result } = renderHook(() => useGestionesFiltros(DATASET));
    enBlanco(result);

    act(() => { result.current.setFiltroAnio('2026'); result.current.setFiltroMes('01'); });

    // El día 03 (registro 5) es de febrero — no debe aparecer acá.
    expect(result.current.opcionesDias).toEqual(['05', '12', '20']);
  });

  it('al aplicar un filtro de Estado, opcionesDias se recalcula de nuevo (cascada)', () => {
    const { result } = renderHook(() => useGestionesFiltros(DATASET));
    enBlanco(result);
    act(() => { result.current.setFiltroAnio('2026'); result.current.setFiltroMes('01'); });

    act(() => { result.current.toggleFiltroEstado('PENDIENTE'); });

    // El día 20 solo tiene un registro CARGADO — con el filtro de estado
    // PENDIENTE activo, ya no debe ofrecerse como opción de Día.
    expect(result.current.opcionesDias).toEqual(['05', '12']);
  });

  it('seleccionar un solo día filtra la tabla a exactamente ese día', () => {
    const { result } = renderHook(() => useGestionesFiltros(DATASET));
    enBlanco(result);
    act(() => { result.current.setFiltroAnio('2026'); result.current.setFiltroMes('01'); });

    act(() => { result.current.toggleFiltroDia('12'); });

    expect(result.current.implantesFiltrados.map(i => i.id)).toEqual(['3']);
  });

  it('seleccionar varios días (multi-selección) combina los resultados de todos ellos', () => {
    const { result } = renderHook(() => useGestionesFiltros(DATASET));
    enBlanco(result);
    act(() => { result.current.setFiltroAnio('2026'); result.current.setFiltroMes('01'); });

    act(() => {
      result.current.toggleFiltroDia('05');
      result.current.toggleFiltroDia('20');
    });

    expect(result.current.implantesFiltrados.map(i => i.id).sort()).toEqual(['1', '2', '4']);
  });

  it('sin días seleccionados ("Todos"), no restringe por día', () => {
    const { result } = renderHook(() => useGestionesFiltros(DATASET));
    enBlanco(result);
    act(() => { result.current.setFiltroAnio('2026'); result.current.setFiltroMes('01'); });

    expect(result.current.filtrosDias).toEqual([]);
    expect(result.current.implantesFiltrados.map(i => i.id).sort()).toEqual(['1', '2', '3', '4']);
  });

  it('combina Día + Estado a la vez', () => {
    const { result } = renderHook(() => useGestionesFiltros(DATASET));
    enBlanco(result);
    act(() => { result.current.setFiltroAnio('2026'); result.current.setFiltroMes('01'); });

    act(() => {
      result.current.toggleFiltroDia('05');
      result.current.toggleFiltroEstado('CARGADO');
    });

    // Día 05 + estado CARGADO -> solo el registro 2.
    expect(result.current.implantesFiltrados.map(i => i.id)).toEqual(['2']);
  });

  it('deselecciona automáticamente un día que deja de existir al cambiar otro filtro', () => {
    const { result } = renderHook(() => useGestionesFiltros(DATASET));
    enBlanco(result);
    act(() => { result.current.setFiltroAnio('2026'); result.current.setFiltroMes('01'); });

    act(() => { result.current.toggleFiltroDia('20'); }); // día 20: solo CARGADO
    expect(result.current.filtrosDias).toEqual(['20']);

    // Ahora se filtra por PENDIENTE — el día 20 ya no tiene registros PENDIENTE.
    act(() => { result.current.toggleFiltroEstado('PENDIENTE'); });

    expect(result.current.filtrosDias).toEqual([]);
  });

  it('el rango de fecha también forma parte de la cascada: un día futuro no aparece como opción', () => {
    // Días relativos a "hoy" en hora de Chile (la misma referencia que el filtro).
    const hoyISO = fechaISOEnChile();
    const desplazar = (dias) => new Date(Date.parse(`${hoyISO}T12:00:00Z`) + dias * 86400000).toISOString().slice(0, 10);
    const ayer = desplazar(-1);
    const mañana = desplazar(1);

    const dataset = [
      implante('a', ayer, 'PENDIENTE'),
      implante('b', mañana, 'PENDIENTE')
    ];

    const { result } = renderHook(() => useGestionesFiltros(dataset));
    // El rango arranca en "Hasta ayer" por defecto — se deja así a propósito.
    act(() => { result.current.setFiltroAnio(''); result.current.setFiltroMes(''); });

    expect(result.current.opcionesDias).toContain(ayer.slice(8));
    expect(result.current.opcionesDias).not.toContain(mañana.slice(8));
  });

  it('cada rango de fecha filtra contra "hoy" en Chile; sin fecha solo en "Todos los días"', () => {
    const hoyISO = fechaISOEnChile();
    const desplazar = (dias) => new Date(Date.parse(`${hoyISO}T12:00:00Z`) + dias * 86400000).toISOString().slice(0, 10);
    const dataset = [
      implante('ayer', desplazar(-1)),
      implante('hoy', hoyISO),
      implante('manana', desplazar(1)),
      implante('sinFecha', '')
    ];
    const { result } = renderHook(() => useGestionesFiltros(dataset));
    act(() => { result.current.setFiltroAnio(''); result.current.setFiltroMes(''); });
    const ids = () => result.current.implantesFiltrados.map((i) => i.id).sort();

    expect(result.current.filtroRangoFecha).toBe('hastaAyer');
    expect(ids()).toEqual(['ayer']);
    act(() => result.current.setFiltroRangoFecha('hastaHoy'));
    expect(ids()).toEqual(['ayer', 'hoy']);
    act(() => result.current.setFiltroRangoFecha('soloHoy'));
    expect(ids()).toEqual(['hoy']);
    act(() => result.current.setFiltroRangoFecha('desdeManana'));
    expect(ids()).toEqual(['manana']);
    act(() => result.current.setFiltroRangoFecha('todos'));
    expect(ids()).toEqual(['ayer', 'hoy', 'manana', 'sinFecha']);
  });

  it('con filtro de admisión (sinPeriodo) arranca en "Todos los días"', () => {
    const { result } = renderHook(() => useGestionesFiltros(DATASET, { sinPeriodo: true }));
    expect(result.current.filtroRangoFecha).toBe('todos');
  });

  it('limpiarFiltroDias vacía la selección', () => {
    const { result } = renderHook(() => useGestionesFiltros(DATASET));
    enBlanco(result);
    act(() => { result.current.setFiltroAnio('2026'); result.current.setFiltroMes('01'); });

    act(() => { result.current.toggleFiltroDia('05'); result.current.toggleFiltroDia('12'); });
    expect(result.current.filtrosDias).toHaveLength(2);

    act(() => { result.current.limpiarFiltroDias(); });
    expect(result.current.filtrosDias).toEqual([]);
  });
});

describe('opcionesPeriodoGestiones', () => {
  const gestiones = [{ fecha: '2026-09-15' }, { fecha: '2026-03-01' }, { fecha: '2025-12-20' }, { fecha: 'P' }];

  const DOCE_MESES = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];

  it('sin conteos (cargando o fallaron): los 12 meses, para no esconder ninguno con datos', () => {
    expect(opcionesPeriodoGestiones([], { hoyISO: '2026-11-02' }).meses).toEqual(DOCE_MESES);
    expect(opcionesPeriodoGestiones(gestiones, { filtroAnio: '2025', hoyISO: '2026-11-02' }).meses).toEqual(DOCE_MESES);
    expect(opcionesPeriodoGestiones([], { filtroAnio: '2026', hoyISO: '2026-11-02' }).cantidades).toEqual({});
  });

  it('sin conteos: años desde el de respaldo hasta el próximo, más los cargados y el filtro activo', () => {
    expect(opcionesPeriodoGestiones([], { hoyISO: '2026-11-02' }).anios).toEqual(['2027', '2026']);
    expect(opcionesPeriodoGestiones(gestiones, { hoyISO: '2026-11-02' }).anios).toEqual(['2027', '2026', '2025']);
    expect(opcionesPeriodoGestiones([], { filtroAnio: '2024', hoyISO: '2026-11-02' }).anios).toEqual(['2027', '2026', '2024']);
  });

  const conteoAnios = { 2026: 297, 2027: 0 };
  const conteoMeses = { ...Object.fromEntries(DOCE_MESES.map((m) => [m, 0])), '09': 116, '10': 162, 11: 19 };

  it('con conteos: solo años y meses con gestiones, con la cantidad de cada mes', () => {
    const op = opcionesPeriodoGestiones([], { filtroAnio: '2026', filtroMes: '10', hoyISO: '2026-11-02', conteoAnios, conteoMeses });
    expect(op.anios).toEqual(['2026']);
    expect(op.meses).toEqual(['09', '10', '11']);
    expect(op.cantidades).toMatchObject({ '09': 116, '10': 162, 11: 19 });
  });

  it('con conteos: el filtro activo aparece aunque no tenga gestiones', () => {
    const op = opcionesPeriodoGestiones([], { filtroAnio: '2027', filtroMes: '01', hoyISO: '2026-11-02', conteoAnios, conteoMeses: { '01': 0 } });
    expect(op.anios).toEqual(['2027', '2026']);
    expect(op.meses).toEqual(['01']);
  });

  it('el mes elegido muestra en vivo las gestiones cargadas (un mes nuevo aparece al crear su primera gestión)', () => {
    const nuevas = [{ fecha: '2026-12-03' }, { fecha: '2026-12-04' }];
    const op = opcionesPeriodoGestiones(nuevas, { filtroAnio: '2026', filtroMes: '12', hoyISO: '2026-12-03', conteoAnios, conteoMeses });
    expect(op.meses).toEqual(['09', '10', '11', '12']);
    expect(op.cantidades['12']).toBe(2);
  });
});

describe('usePeriodoGestiones', () => {
  it('fijarPeriodoInicial cambia el período solo si el usuario no eligió otro', () => {
    const { result } = renderHook(() => usePeriodoGestiones());
    act(() => result.current.fijarPeriodoInicial('2026', '10'));
    expect([result.current.filtroAnio, result.current.filtroMes]).toEqual(['2026', '10']);
    act(() => result.current.setFiltroMes('09'));
    act(() => result.current.fijarPeriodoInicial('2026', '11'));
    expect(result.current.filtroMes).toBe('09');
  });
});
