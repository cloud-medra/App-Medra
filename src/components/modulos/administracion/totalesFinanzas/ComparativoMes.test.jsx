// @vitest-environment jsdom
// Comparativo mensual: total del mes pasado, del actual y la diferencia;
// el desglose según su sección granular y los días acotados a hoy.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { subItemsVisibles } from '../../../../config/accesoMenu';
import { COMPONENT_MAPS } from '../../../../config/componentMaps';
import { RUTA_COMPARATIVO_MES } from './comparativoMes';

const permiso = { desglose: true };
vi.mock('../../../../hooks/useGranularPermission', () => ({
  useGranularPermission: () => ({ hasPermission: () => permiso.desglose }),
}));
const estado = { datos: null };
vi.mock('./useComparativoMesData', () => ({ useComparativoMesData: () => estado.datos }));

const { default: ComparativoMes } = await import('./ComparativoMes.jsx');

const fuente = (anterior, actual, porModulo = []) => ({ anterior, actual, porModulo, conError: false });
const mod = (moduloId, a, b) => ({ moduloId, anterior: { cantidad: 1, montoTotal: a }, actual: { cantidad: 1, montoTotal: b }, error: false });

afterEach(cleanup);

describe('Comparativo mensual', () => {
  beforeEach(() => {
    permiso.desglose = true;
    estado.datos = {
      consumos: fuente(100000, 125000, [mod('implantes', 100000, 125000)]),
      facturas: fuente(0, 40000),
    };
  });

  it('es un ítem asignable con mapa de permisos que, sin asignar, solo ve el Desarrollador', () => {
    expect(COMPONENT_MAPS[RUTA_COMPARATIVO_MES]).toBeTruthy();
    expect(subItemsVisibles({ rol: 'dev', permisos: {} }, 'administracion').map((s) => s.path)).toContain(RUTA_COMPARATIVO_MES);
    expect(subItemsVisibles({ rol: 'admin', permisos: {} }, 'administracion').map((s) => s.path)).not.toContain(RUTA_COMPARATIVO_MES);
  });

  it('muestra mes pasado, mes actual y la diferencia en monto y %', () => {
    const { container } = render(<ComparativoMes />);
    const texto = container.textContent;
    expect(texto).toContain('$100.000');
    expect(texto).toContain('$125.000');
    expect(texto).toContain('+$25.000 · +25,0 %');
    // Facturas sin base el mes pasado: monto sin porcentaje.
    expect(texto).toContain('+$40.000 · sin base');
    expect(texto).toContain('Implantes');
  });

  it('sin la sección desglose no muestra los módulos', () => {
    permiso.desglose = false;
    const { container } = render(<ComparativoMes />);
    expect(container.textContent).not.toContain('Implantes');
  });

  it('los días elegibles no pasan de hoy', () => {
    render(<ComparativoMes />);
    const opciones = screen.getByLabelText('Hasta').querySelectorAll('option');
    const dias = [...opciones].map((o) => Number(o.value));
    const hoy = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Santiago', day: 'numeric' }).format(new Date()));
    expect(Math.max(...dias)).toBe(hoy);
  });
});
