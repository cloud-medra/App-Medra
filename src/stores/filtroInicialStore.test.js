// @vitest-environment jsdom
// Filtro inicial entre pantallas: se lee al montar y se suelta, así la
// siguiente visita abre sin él.
import { describe, it, expect, afterEach } from 'vitest';
import { renderHook, cleanup } from '@testing-library/react';
import { fijarFiltroInicial, leerFiltroInicial, useFiltroInicial } from './filtroInicialStore';
import { useGestionesFiltros } from '../components/modulos/operaciones/shared/gestion/useGestionesFiltros';

afterEach(cleanup);

describe('filtroInicialStore', () => {
  it('la pantalla lo recibe una vez', () => {
    fijarFiltroInicial('/r', { texto: 'R1' });
    const { result } = renderHook(() => useFiltroInicial('/r'));
    expect(result.current).toEqual({ texto: 'R1' });
    expect(leerFiltroInicial('/r')).toBeNull();
    expect(renderHook(() => useFiltroInicial('/r')).result.current).toBeNull();
  });

  it('sin filtro (null) no deja nada pendiente', () => {
    fijarFiltroInicial('/r', { texto: 'x' });
    fijarFiltroInicial('/r', null);
    expect(leerFiltroInicial('/r')).toBeNull();
  });

  it('Gestión arranca con el filtro pedido y filtra por él', () => {
    const gestiones = [
      { gestionId: '1', fecha: '2020-01-05', estado: 'INCOMPLETO' },
      { gestionId: '2', fecha: '2026-10-01', estado: 'CARGADO' },
    ];
    const { result } = renderHook(() => useGestionesFiltros(gestiones, {
      filtroInicial: { anio: '', mes: '', dias: [], rango: 'todos', estados: ['INCOMPLETO'] },
    }));
    expect(result.current.filtrosEstados).toEqual(['INCOMPLETO']);
    expect(result.current.filtroRangoFecha).toBe('todos');
    expect(result.current.implantesFiltrados.map((g) => g.gestionId)).toEqual(['1']);
  });

  it('el día de "mañana" no se pierde mientras cargan las gestiones', () => {
    const filtroInicial = { anio: '2099', mes: '11', dias: ['01'], rango: 'desdeManana', estados: [] };
    const { result, rerender } = renderHook(({ gestiones }) => useGestionesFiltros(gestiones, { filtroInicial }), { initialProps: { gestiones: [] } });
    expect(result.current.filtrosDias).toEqual(['01']);
    rerender({ gestiones: [{ gestionId: '9', fecha: '2099-11-01' }, { gestionId: '8', fecha: '2099-11-02' }] });
    expect(result.current.filtrosDias).toEqual(['01']);
  });
});
