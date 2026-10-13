// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useGestionesFiltros, opcionesPeriodoGestiones } from './useGestionesFiltros';

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
// "Hasta hoy" apagado, salvo que el propio test lo pruebe explícitamente.
const enBlanco = (result) => {
  act(() => {
    result.current.setFiltroAnio('');
    result.current.setFiltroMes('');
    result.current.setFiltroSoloHastaHoy(false);
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

  it('"Hasta hoy" también forma parte de la cascada: un día futuro no aparece como opción', () => {
    const hoy = new Date();
    const formatoISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const ayer = new Date(hoy);
    ayer.setDate(hoy.getDate() - 1);
    const mañana = new Date(hoy);
    mañana.setDate(hoy.getDate() + 1);

    const dataset = [
      implante('a', formatoISO(ayer), 'PENDIENTE'),
      implante('b', formatoISO(mañana), 'PENDIENTE')
    ];

    const { result } = renderHook(() => useGestionesFiltros(dataset));
    // filtroSoloHastaHoy arranca en true por defecto — se deja así a propósito.
    act(() => { result.current.setFiltroAnio(''); result.current.setFiltroMes(''); });

    const diaAyer = String(ayer.getDate()).padStart(2, '0');
    const diaMañana = String(mañana.getDate()).padStart(2, '0');

    expect(result.current.opcionesDias).toContain(diaAyer);
    expect(result.current.opcionesDias).not.toContain(diaMañana);
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

  it('solo períodos con datos: años del más reciente al más antiguo, meses cronológicos del año elegido', () => {
    expect(opcionesPeriodoGestiones(gestiones)).toEqual({ anios: ['2026', '2025'], meses: ['03', '09', '12'] });
    expect(opcionesPeriodoGestiones(gestiones, { filtroAnio: '2026' }).meses).toEqual(['03', '09']);
    expect(opcionesPeriodoGestiones(gestiones, { filtroAnio: '2025' }).meses).toEqual(['12']);
  });

  it('incluye el filtro activo aunque no tenga datos', () => {
    expect(opcionesPeriodoGestiones(gestiones, { filtroAnio: '2026', filtroMes: '10' }).meses).toEqual(['03', '09', '10']);
  });
});
