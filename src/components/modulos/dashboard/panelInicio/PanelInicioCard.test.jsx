// @vitest-environment jsdom
// Panel del Inicio: con los mismos datos de useTotalesFinanzasData, el
// resumen muestra el mismo monto que la pantalla de Finanzas; sin permisos
// no aparece, y una lectura fallida dice "No disponible" (nunca $0).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

const permiso = { desglose: true };
vi.mock('../../../../hooks/useGranularPermission', () => ({
  useGranularPermission: () => ({ hasPermission: () => permiso.desglose }),
}));
vi.mock('../../../../stores/modulosActivosStore', () => ({ useModulosActivos: () => ({}) }));
const datos = { celdas: [], estadosModulos: {}, errorEstados: null, cargando: false };
const pedidos = [];
vi.mock('../../administracion/totalesFinanzas/useTotalesFinanzasData', () => ({
  useTotalesFinanzasData: (args) => { pedidos.push(args); return datos; },
}));

const { default: PanelInicioCard } = await import('./PanelInicioCard.jsx');
const { default: TotalFinanzas } = await import('../../administracion/totalesFinanzas/TotalFinanzas.jsx');
const { mesActualEnChile } = await import('../../administracion/totalesFinanzas/totalesFinanzas');

afterEach(cleanup);

const dev = { rol: 'dev', activo: true, permisos: {} };
const operador = (rutas) => ({ rol: 'operador', activo: true, permisos: { administracion: rutas } });
const tarjeta = (etiqueta) => screen.getByText(etiqueta).parentElement.textContent;

const CELDAS = [
  { modulo: 'implantes', mes: 'octubre', cantidad: 4, montoTotal: 100000 },
  { modulo: 'consignacion', mes: 'octubre', cantidad: 2, montoTotal: 50000 },
  { modulo: 'hemodinamia', mes: 'octubre', cantidad: 1, montoTotal: 36300 },
  { modulo: 'laboratorio', mes: 'octubre', cantidad: 3, montoTotal: 120000 },
  { modulo: 'vacunatorio', mes: 'octubre', cantidad: 1, montoTotal: 30000 },
  { modulo: 'bodega', mes: 'octubre', cantidad: 9, montoTotal: 186300 },
];

describe('Inicio — Resumen del mes (Finanzas)', () => {
  beforeEach(() => {
    permiso.desglose = true;
    pedidos.length = 0;
    Object.assign(datos, { celdas: CELDAS, estadosModulos: {}, errorEstados: null, cargando: false });
  });

  it('pide el mes en curso y muestra a qué mes corresponde', () => {
    render(<PanelInicioCard userData={dev} />);
    const { anio, mesId } = mesActualEnChile();
    expect(pedidos.at(-1)).toMatchObject({ anio, mes: mesId });
    expect(screen.getByLabelText('Resumen de Finanzas').textContent).toContain(anio);
  });

  it('los montos son los mismos que en las pantallas de Finanzas, en formato chileno', () => {
    render(<PanelInicioCard userData={dev} />);
    expect(tarjeta('Consumo')).toContain('$186.300');
    expect(tarjeta('Laboratorio')).toContain('$120.000');
    expect(tarjeta('Vacunatorio')).toContain('$30.000');
    expect(tarjeta('Valorización de bodega')).toContain('$186.300');
    const inicio = {
      consumos: tarjeta('Consumo'),
      bodega: tarjeta('Valorización de bodega'),
    };
    cleanup();
    // Misma fuente de datos en la pantalla de Finanzas.
    permiso.desglose = false;
    Object.entries(inicio).forEach(([tipo, texto]) => {
      const { container, unmount } = render(<TotalFinanzas tipo={tipo} />);
      expect(container.textContent).toContain(texto.match(/\$[\d.]+/)[0]);
      unmount();
    });
  });

  it('sin permisos de Finanzas no se muestra el panel', () => {
    const { container } = render(<PanelInicioCard userData={operador(['/administracion/controlMensual'])} />);
    expect(container.innerHTML).toBe('');
    expect(pedidos).toEqual([]);
  });

  it('solo muestra los totales permitidos', () => {
    render(<PanelInicioCard userData={operador(['/administracion/consumos'])} />);
    expect(screen.getByText('Consumo')).toBeTruthy();
    expect(screen.queryByText('Laboratorio')).toBeNull();
    expect(screen.queryByText('Valorización de bodega')).toBeNull();
    expect(pedidos.at(-1).moduloIds).toEqual(['implantes', 'consignacion', 'hemodinamia']);
  });

  it('una lectura fallida muestra "No disponible" con aviso, nunca $0', () => {
    datos.celdas = [...CELDAS.filter((c) => c.modulo !== 'bodega'), { modulo: 'bodega', mes: 'octubre', cantidad: 0, montoTotal: 0, error: true }];
    render(<PanelInicioCard userData={dev} />);
    expect(tarjeta('Valorización de bodega')).toContain('No disponible');
    expect(tarjeta('Valorización de bodega')).not.toContain('$0');
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(tarjeta('Consumo')).toContain('$186.300');
  });

  it('si no se pudieron leer los estados de los períodos, nada es $0', () => {
    Object.assign(datos, { celdas: [], errorEstados: new Error('sin permiso') });
    const { container } = render(<PanelInicioCard userData={dev} />);
    expect(container.textContent).not.toContain('$0');
    expect(screen.getAllByText('No disponible')).toHaveLength(4);
  });
});
