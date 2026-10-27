import { describe, it, expect } from 'vitest';
import {
  TODO_EL_ANIO, modulosDeTotal, mesActualEnChile, aniosSeleccionables, celdasAConsultar, totalizar,
} from './totalesFinanzas';

describe('Totales de Finanzas', () => {
  it('cada total usa los módulos de su grupo de Control Mensual', () => {
    expect(modulosDeTotal('consumos')).toEqual(['implantes', 'consignacion', 'hemodinamia']);
    expect(modulosDeTotal('facturas')).toEqual(['laboratorio', 'vacunatorio']);
    expect(modulosDeTotal('bodega')).toEqual(['bodega']);
  });

  it('el mes actual es el de Chile, no el de UTC', () => {
    // 1 de noviembre 02:00 UTC = 31 de octubre en Santiago.
    expect(mesActualEnChile(new Date('2026-11-01T02:00:00Z'))).toEqual({ anio: '2026', mesId: 'octubre' });
    expect(aniosSeleccionables('2026', 3)).toEqual(['2026', '2025', '2024']);
  });

  it('solo se consultan los meses que se abrieron alguna vez', () => {
    const estados = {
      implantes: { enero: { estado: 'CERRADO' }, febrero: { estado: 'ABIERTO' } },
      hemodinamia: { febrero: { estado: 'REABIERTO' } },
    };
    const modulos = ['implantes', 'consignacion', 'hemodinamia'];
    expect(celdasAConsultar(modulos, estados, 'febrero')).toEqual([
      { modulo: 'implantes', mes: 'febrero', estado: 'ABIERTO' },
      { modulo: 'hemodinamia', mes: 'febrero', estado: 'REABIERTO' },
    ]);
    expect(celdasAConsultar(modulos, estados, TODO_EL_ANIO).map((c) => `${c.modulo}:${c.mes}`))
      .toEqual(['implantes:enero', 'implantes:febrero', 'hemodinamia:febrero']);
    expect(celdasAConsultar(modulos, {}, 'marzo')).toEqual([]);
  });

  it('totaliza por módulo y en total, marcando los errores', () => {
    const t = totalizar(['laboratorio', 'vacunatorio'], [
      { modulo: 'laboratorio', mes: 'enero', cantidad: 2, montoTotal: 1000 },
      { modulo: 'laboratorio', mes: 'febrero', cantidad: 1, montoTotal: 500.4 },
      { modulo: 'vacunatorio', mes: 'enero', cantidad: 0, montoTotal: 0, error: true },
    ]);
    expect(t.montoTotal).toBeCloseTo(1500.4);
    expect(t.cantidad).toBe(3);
    expect(t.porModulo.map((m) => [m.nombre, m.montoTotal, m.meses, m.conError])).toEqual([
      ['Laboratorio', 1500.4, 2, false],
      ['Vacunatorio', 0, 1, true],
    ]);
    expect(t.conError).toBe(true);
  });
});
