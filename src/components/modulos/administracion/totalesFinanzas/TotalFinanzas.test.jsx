// @vitest-environment jsdom
// Totales de Finanzas: por defecto solo los ve el Desarrollador, el
// desglose depende de su sección granular y "Todo el año" no aplica a Bodega.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { subItemsVisibles, subItemsAsignables } from '../../../../config/accesoMenu';
import { MODULES } from '../../../../config/modulesConfig.jsx';
import { COMPONENT_MAPS } from '../../../../config/componentMaps';
import { TOTALES_FINANZAS } from './totalesFinanzas';

const permiso = { desglose: true };
vi.mock('../../../../hooks/useGranularPermission', () => ({
  useGranularPermission: () => ({ hasPermission: () => permiso.desglose }),
}));
const datos = { celdas: [], estadosModulos: {}, cargando: false };
vi.mock('./useTotalesFinanzasData', () => ({ useTotalesFinanzasData: () => datos }));

const { default: TotalFinanzas } = await import('./TotalFinanzas.jsx');

afterEach(cleanup);

const RUTAS = Object.values(TOTALES_FINANZAS).map((t) => t.ruta);
const visibles = (u) => subItemsVisibles(u, 'administracion').map((s) => s.path);

describe('Finanzas: Consumos, Facturas y Valorización de bodega', () => {
  beforeEach(() => {
    permiso.desglose = true;
    Object.assign(datos, { celdas: [], estadosModulos: {}, cargando: false });
  });

  it('son ítems de Finanzas asignables con mapa de permisos, y sin asignar solo los ve el Desarrollador', () => {
    const items = MODULES.administracion.subItems.filter((s) => RUTAS.includes(s.path));
    expect(items.map((s) => [s.label, s.grupo])).toEqual([
      ['Consumos', 'finanzas'], ['Facturas', 'finanzas'], ['Valorización de bodega', 'finanzas'],
    ]);
    expect(subItemsAsignables(MODULES.administracion).map((s) => s.path)).toEqual(expect.arrayContaining(RUTAS));
    RUTAS.forEach((r) => expect(COMPONENT_MAPS[r], r).toBeTruthy());
    expect(visibles({ rol: 'dev', permisos: {} })).toEqual(expect.arrayContaining(RUTAS));
    expect(visibles({ rol: 'admin', permisos: {} }).filter((r) => RUTAS.includes(r))).toEqual([]);
    expect(visibles({ rol: 'operador', permisos: { administracion: ['/administracion/facturas'] } })).toEqual(['/administracion/facturas']);
  });

  it('muestra el total y el desglose por módulo de las celdas leídas', () => {
    datos.celdas = [
      { modulo: 'laboratorio', mes: 'octubre', cantidad: 3, montoTotal: 120000 },
      { modulo: 'vacunatorio', mes: 'octubre', cantidad: 1, montoTotal: 30000 },
    ];
    const { container } = render(<TotalFinanzas tipo="facturas" />);
    expect(container.textContent).toContain('$150.000');
    expect(container.textContent).toContain('Laboratorio');
    expect(screen.getByRole('option', { name: 'Todo el año' })).toBeTruthy();
  });

  it('sin la sección desglose solo se ve el total', () => {
    permiso.desglose = false;
    datos.celdas = [{ modulo: 'implantes', mes: 'octubre', cantidad: 2, montoTotal: 5000 }];
    const { container } = render(<TotalFinanzas tipo="consumos" />);
    expect(container.textContent).toContain('$5.000');
    expect(container.textContent).not.toContain('Implantes');
  });

  it('Valorización de bodega es por mes (sin "Todo el año") y avisa si el mes no se abrió', () => {
    const { container } = render(<TotalFinanzas tipo="bodega" />);
    expect(screen.queryByRole('option', { name: 'Todo el año' })).toBeNull();
    expect(container.textContent).toContain('no está abierto');
  });
});
