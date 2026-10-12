// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSeguimientoFiltros } from './useSeguimientoFiltros';

const fila = (overrides) => ({ id: '1', admision: '500100', proveedor: 'Empresa A', ...overrides });

describe('useSeguimientoFiltros', () => {
  it('sin filtro de empresa, devuelve todas las filas', () => {
    const filas = [fila({ id: '1' }), fila({ id: '2', proveedor: 'Empresa B' })];
    const { result } = renderHook(() => useSeguimientoFiltros(filas));
    expect(result.current.filasFiltradas).toHaveLength(2);
    expect(result.current.opcionesEmpresas).toEqual(['Empresa A', 'Empresa B']);
  });

  it('filtra por empresa seleccionada', () => {
    const filas = [fila({ id: '1', proveedor: 'Empresa A' }), fila({ id: '2', proveedor: 'Empresa B' })];
    const { result } = renderHook(() => useSeguimientoFiltros(filas));
    act(() => result.current.setEmpresa('Empresa B'));
    expect(result.current.filasFiltradas.map(f => f.id)).toEqual(['2']);
  });

  it('deselecciona la empresa si deja de existir tras cambiar el período o el tipo de seguimiento', () => {
    const { result, rerender } = renderHook(
      ({ filas }) => useSeguimientoFiltros(filas),
      { initialProps: { filas: [fila({ id: '1', proveedor: 'Empresa A' })] } }
    );
    act(() => result.current.setEmpresa('Empresa A'));
    rerender({ filas: [fila({ id: '2', proveedor: 'Empresa B' })] });
    expect(result.current.empresa).toBe('');
  });

  it('pagina en bloques de 50 y resetea a la página 1 al cambiar de empresa', () => {
    const muchasFilas = Array.from({ length: 60 }, (_, i) => fila({ id: String(i) }));
    const { result } = renderHook(() => useSeguimientoFiltros(muchasFilas));
    act(() => result.current.setPagina(2));
    expect(result.current.pagina).toBe(2);
    act(() => result.current.setEmpresa('Empresa A'));
    expect(result.current.pagina).toBe(1);
  });

  describe('total de Monto OC y búsqueda', () => {
    const base = [
      fila({ id: '1', proveedor: 'Empresa A', oc: '4501', oc_monto: 1000000, lote: 'LT-9', atributo: 'Estéril' }),
      fila({ id: '2', proveedor: 'Empresa A', oc: '4502', oc_monto: '$ 250.000', lote: 'LT-1' }),
      fila({ id: '3', proveedor: 'Empresa B', oc: '4503', oc_monto: '' }),
      fila({ id: '4', proveedor: 'Empresa B', oc: '4504', oc_monto: 'x', precio_u: 12990 }),
      fila({ id: '5', proveedor: 'Empresa C', oc: '4505', oc_monto: 75000, fecha_vencimiento: new Date(2028, 0, 9) })
    ];

    it('sin filtros, suma todo (vacíos/texto sin NaN)', () => {
      const { result } = renderHook(() => useSeguimientoFiltros(base));
      expect(result.current.resumen.total).toBe(1325000);
      expect(result.current.resumen.registros).toBe(5);
    });

    it('se recalcula con empresa + búsqueda combinadas', () => {
      const { result } = renderHook(() => useSeguimientoFiltros(base));
      act(() => result.current.setEmpresa('Empresa A'));
      expect(result.current.resumen).toMatchObject({ total: 1250000, registros: 2 });
      act(() => result.current.setBusqueda('lt-9'));
      expect(result.current.resumen).toMatchObject({ total: 1000000, registros: 1 });
      act(() => result.current.setEmpresa(''));
      expect(result.current.resumen).toMatchObject({ total: 1000000, registros: 1 });
    });

    it('la búsqueda incluye las columnas nuevas (atributo, lote, vencimiento, montos con y sin formato)', () => {
      const { result } = renderHook(() => useSeguimientoFiltros(base));
      const buscar = (t) => { act(() => result.current.setBusqueda(t)); return result.current.filasFiltradas.map((f) => f.id); };
      expect(buscar('esteril')).toEqual(['1']);
      expect(buscar('LT-1')).toEqual(['2']);
      expect(buscar('09-01-2028')).toEqual(['5']);
      expect(buscar('$ 1.000.000')).toEqual(['1']);
      expect(buscar('250000')).toEqual(['2']);
      expect(buscar('12.990')).toEqual(['4']);
      expect(buscar('')).toHaveLength(5);
    });

    it('suma TODAS las filas filtradas, no solo la página visible', () => {
      const muchas = Array.from({ length: 120 }, (_, i) => fila({ id: String(i), oc: `OC${i}`, oc_monto: 1000 }));
      const { result } = renderHook(() => useSeguimientoFiltros(muchas));
      expect(result.current.filasPagina).toHaveLength(50);
      expect(result.current.totalPaginas).toBe(3);
      expect(result.current.resumen).toMatchObject({ total: 120000, registros: 120 });
      act(() => result.current.setPagina(3));
      expect(result.current.filasPagina).toHaveLength(20);
      expect(result.current.resumen.total).toBe(120000);
    });

    it('buscar vuelve a la página 1', () => {
      const muchas = Array.from({ length: 60 }, (_, i) => fila({ id: String(i) }));
      const { result } = renderHook(() => useSeguimientoFiltros(muchas));
      act(() => result.current.setPagina(2));
      act(() => result.current.setBusqueda('500100'));
      expect(result.current.pagina).toBe(1);
    });
  });
});
