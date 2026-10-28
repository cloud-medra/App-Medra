// Inicio → Resumen de Finanzas: quién ve cada total y que los números sean
// los mismos que calcula Finanzas (totalizar de totalesFinanzas.js).
import { describe, it, expect } from 'vitest';
import { totalizar, modulosDeTotal } from '../../administracion/totalesFinanzas/totalesFinanzas';
import { TOTALES_INICIO, totalesVisibles, modulosDeTotales, valorDeTotal } from './resumenFinanzas';

const CONSUMOS = '/administracion/consumos';
const FACTURAS = '/administracion/facturas';
const BODEGA = '/administracion/valorizacionBodega';

const usuario = (rutas, rol = 'operador') => ({ rol, activo: true, permisos: { administracion: rutas } });
const conDesglose = () => true;
const sinDesglose = () => false;
const ids = (lista) => lista.map((t) => t.id);

describe('Resumen de Finanzas del Inicio — permisos', () => {
  it('el Desarrollador ve los cuatro totales', () => {
    expect(ids(totalesVisibles({ rol: 'dev', activo: true, permisos: {} }, undefined, conDesglose)))
      .toEqual(['consumo', 'laboratorio', 'vacunatorio', 'bodega']);
  });

  it('sin ninguna pantalla de Finanzas no ve ningún total (la sección no se muestra)', () => {
    expect(totalesVisibles(usuario(['/administracion/controlMensual']), undefined, conDesglose)).toEqual([]);
    expect(totalesVisibles({ rol: 'admin', activo: true, permisos: {} }, undefined, conDesglose)).toEqual([]);
  });

  it('cada total depende de su pantalla', () => {
    expect(ids(totalesVisibles(usuario([CONSUMOS]), undefined, conDesglose))).toEqual(['consumo']);
    expect(ids(totalesVisibles(usuario([BODEGA]), undefined, conDesglose))).toEqual(['bodega']);
    expect(ids(totalesVisibles(usuario([FACTURAS]), undefined, conDesglose))).toEqual(['laboratorio', 'vacunatorio']);
    expect(ids(totalesVisibles(usuario([CONSUMOS, BODEGA]), undefined, conDesglose))).toEqual(['consumo', 'bodega']);
  });

  it('Laboratorio y Vacunatorio piden además el desglose de Facturas', () => {
    const vistos = [];
    const hasPermission = (ruta, seccion) => { vistos.push([ruta, seccion]); return false; };
    expect(ids(totalesVisibles(usuario([CONSUMOS, FACTURAS, BODEGA]), undefined, hasPermission))).toEqual(['consumo', 'bodega']);
    expect(vistos).toEqual([[FACTURAS, 'desglose'], [FACTURAS, 'desglose']]);
    expect(ids(totalesVisibles(usuario([CONSUMOS, BODEGA]), undefined, sinDesglose))).toEqual(['consumo', 'bodega']);
  });

  it('un ítem desactivado en Gestión de módulos oculta su total, también al Desarrollador', () => {
    const activos = { itemsInactivos: [BODEGA] };
    expect(ids(totalesVisibles({ rol: 'dev', activo: true, permisos: {} }, activos, conDesglose)))
      .toEqual(['consumo', 'laboratorio', 'vacunatorio']);
  });
});

describe('Resumen de Finanzas del Inicio — números', () => {
  const celdas = [
    { modulo: 'implantes', mes: 'octubre', cantidad: 4, montoTotal: 100000 },
    { modulo: 'consignacion', mes: 'octubre', cantidad: 2, montoTotal: 50000.4 },
    { modulo: 'hemodinamia', mes: 'octubre', cantidad: 1, montoTotal: 36300 },
    { modulo: 'laboratorio', mes: 'octubre', cantidad: 3, montoTotal: 120000 },
    { modulo: 'vacunatorio', mes: 'octubre', cantidad: 1, montoTotal: 30000 },
    { modulo: 'bodega', mes: 'octubre', cantidad: 9, montoTotal: 186300 },
  ];
  const datos = { celdas, cargando: false, errorEstados: null };
  const def = (id) => TOTALES_INICIO.find((t) => t.id === id);

  it('pide a Finanzas exactamente los módulos de sus totales', () => {
    expect(def('consumo').moduloIds).toEqual(modulosDeTotal('consumos'));
    expect(def('bodega').moduloIds).toEqual(modulosDeTotal('bodega'));
    expect([...def('laboratorio').moduloIds, ...def('vacunatorio').moduloIds]).toEqual(modulosDeTotal('facturas'));
    expect(modulosDeTotales(TOTALES_INICIO)).toEqual(['implantes', 'consignacion', 'hemodinamia', 'laboratorio', 'vacunatorio', 'bodega']);
  });

  it('coinciden con el total de Finanzas y con su desglose de Facturas', () => {
    const facturas = totalizar(modulosDeTotal('facturas'), celdas);
    expect(valorDeTotal(def('consumo'), datos)).toEqual({ estado: 'ok', monto: totalizar(modulosDeTotal('consumos'), celdas).montoTotal });
    expect(valorDeTotal(def('laboratorio'), datos).monto).toBe(facturas.porModulo.find((m) => m.moduloId === 'laboratorio').montoTotal);
    expect(valorDeTotal(def('vacunatorio'), datos).monto).toBe(facturas.porModulo.find((m) => m.moduloId === 'vacunatorio').montoTotal);
    expect(valorDeTotal(def('laboratorio'), datos).monto + valorDeTotal(def('vacunatorio'), datos).monto).toBe(facturas.montoTotal);
    expect(valorDeTotal(def('bodega'), datos)).toEqual({ estado: 'ok', monto: totalizar(modulosDeTotal('bodega'), celdas).montoTotal });
  });

  it('una lectura fallida es "no disponible", nunca $0', () => {
    const conError = { ...datos, celdas: [...celdas.filter((c) => c.modulo !== 'bodega'), { modulo: 'bodega', mes: 'octubre', cantidad: 0, montoTotal: 0, error: true }] };
    expect(valorDeTotal(def('bodega'), conError)).toEqual({ estado: 'noDisponible' });
    expect(valorDeTotal(def('consumo'), conError).estado).toBe('ok');
    // Un módulo de Consumos fallido invalida todo el total (no se suma parcial).
    const consumoParcial = { ...datos, celdas: [{ ...celdas[0], error: true }, celdas[1]] };
    expect(valorDeTotal(def('consumo'), consumoParcial)).toEqual({ estado: 'noDisponible' });
    // Sin estados de cierres_periodos todo parecería sin abrir.
    expect(valorDeTotal(def('consumo'), { celdas: [], cargando: false, errorEstados: new Error('x') })).toEqual({ estado: 'noDisponible' });
  });

  it('distingue cargando y mes sin abrir', () => {
    expect(valorDeTotal(def('consumo'), { celdas: [], cargando: true, errorEstados: null })).toEqual({ estado: 'cargando' });
    expect(valorDeTotal(def('vacunatorio'), { celdas: [celdas[0]], cargando: false, errorEstados: null })).toEqual({ estado: 'sinAbrir', monto: 0 });
  });
});
