// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, cleanup } from '@testing-library/react';

let usuario = null;
vi.mock('../context/UserContext', () => ({ useUser: () => ({ userData: usuario }) }));

const { useColumnasPermitidas, filtrarFilasExport } = await import('./useColumnasPermitidas');

afterEach(cleanup);

const RUTA = '/modulo/vista';
const COLUMNAS = [
  { key: 'sel', fija: true },
  { key: 'codigo' },
  { key: 'precio' },
  { key: 'nueva' },
];

const keys = (cols) => cols.map((c) => c.key);

describe('useColumnasPermitidas', () => {
  it('oculta las columnas desmarcadas; las sin configurar y las fijas se ven', () => {
    usuario = { rol: 'operador', permisosGranulares: { [RUTA]: { tabla: { visible: true, elements: { col_precio: false, col_codigo: true } } } } };
    const { result } = renderHook(() => useColumnasPermitidas(RUTA, 'tabla', COLUMNAS));
    expect(keys(result.current.columnasVisibles)).toEqual(['sel', 'codigo', 'nueva']);
    expect(result.current.ver('precio')).toBe(false);
    expect(result.current.ver('nueva')).toBe(true); // usuario existente: columna nueva permitida por defecto
  });

  it('sección oculta: solo quedan las fijas', () => {
    usuario = { rol: 'operador', permisosGranulares: { [RUTA]: { tabla: { visible: false, elements: {} } } } };
    const { result } = renderHook(() => useColumnasPermitidas(RUTA, 'tabla', COLUMNAS));
    expect(keys(result.current.columnasVisibles)).toEqual(['sel']);
  });

  it('Desarrollador ve todas; el Administrador, según sus permisos', () => {
    usuario = { rol: 'dev' };
    const { result } = renderHook(() => useColumnasPermitidas(RUTA, 'tabla', COLUMNAS));
    expect(keys(result.current.columnasVisibles)).toEqual(['sel', 'codigo', 'precio', 'nueva']);
    usuario = { rol: 'admin' };
    const { result: admin } = renderHook(() => useColumnasPermitidas(RUTA, 'tabla', COLUMNAS));
    expect(keys(admin.current.columnasVisibles)).toEqual(['sel']);
  });

  it('mantiene la misma referencia mientras no cambian los permisos', () => {
    usuario = { rol: 'operador', permisosGranulares: { [RUTA]: {} } };
    const { result, rerender } = renderHook(() => useColumnasPermitidas(RUTA, 'tabla', COLUMNAS));
    const primera = result.current.columnasVisibles;
    rerender();
    expect(result.current.columnasVisibles).toBe(primera);
  });
});

describe('filtrarFilasExport', () => {
  it('quita los encabezados de columnas no visibles y deja los que no tienen columna', () => {
    const filas = [{ CODIGO: 'A', PRECIO: 10, OBSERVACION: 'x' }];
    const ver = (k) => k !== 'precio';
    expect(filtrarFilasExport(filas, { CODIGO: 'codigo', PRECIO: 'precio' }, ver)).toEqual([{ CODIGO: 'A', OBSERVACION: 'x' }]);
  });
});
