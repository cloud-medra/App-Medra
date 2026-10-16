import { describe, it, expect } from 'vitest';
import {
  idLote, aplicarMovimiento, aplicarMovimientoCentro, aplicarAccionTransito, movimientoDeAccion, agruparLineas,
  validarCabecera, validarConsignacion, lotesPropios, stockTotal, datosPropietario, ErrorStock,
} from './nucleo.mjs';

describe('dueño del stock (idLote)', () => {
  it('el stock propio conserva el id de siempre; el consignado lleva la empresa', () => {
    expect(idLote('p1', 'ab 1', '2027-01-31')).toBe('p1__AB1__2027-01-31');
    expect(idLote('p1', 'ab 1', '2027-01-31', null)).toBe('p1__AB1__2027-01-31');
    expect(idLote('p1', 'ab 1', '2027-01-31', 'emp1')).toBe('p1__AB1__2027-01-31__C_emp1');
    expect(idLote('p1', '', '', 'emp1')).toBe('p1__SL__SV__C_emp1');
  });

  it('agruparLineas separa el mismo lote de dos dueños', () => {
    const lineas = agruparLineas([
      { productoId: 'p1', lote: 'A', vencimiento: null, cantidad: 2 },
      { productoId: 'p1', lote: 'A', vencimiento: null, cantidad: 3, propietarioId: 'emp1' },
      { productoId: 'p1', lote: 'A', vencimiento: null, cantidad: 1, propietarioId: 'emp1' },
    ]);
    expect(lineas.map((l) => [l.loteId, l.cantidad])).toEqual([['p1__A__SV', 2], ['p1__A__SV__C_emp1', 4]]);
  });

  it('cabecera: ingreso en consignación y dueño de la carga inicial', () => {
    expect(validarCabecera('INGRESO', { tipoDocumento: 'GUIA', numero: '1', proveedorId: 'e', fecha: '2026-10-16', consignacion: true }).cabecera.consignacion).toBe(true);
    expect(validarCabecera('INGRESO', { tipoDocumento: 'GUIA', numero: '1', proveedorId: 'e', fecha: '2026-10-16' }).cabecera.consignacion).toBe(false);
    expect(validarCabecera('CARGA_INICIAL', { propietarioId: ' emp1 ' }).cabecera.propietarioId).toBe('emp1');
    expect(validarCabecera('CARGA_INICIAL', {}).cabecera.propietarioId).toBeNull();
  });

  it('datosPropietario y lotesPropios', () => {
    expect(datosPropietario(null)).toEqual({ propietarioId: null, propietarioNombre: '' });
    expect(datosPropietario({ propietarioId: 'e', propietarioNombre: 'ACME' })).toEqual({ propietarioId: 'e', propietarioNombre: 'ACME' });
    expect(lotesPropios([{ id: 'a' }, { id: 'b', propietarioId: 'e' }]).map((l) => l.id)).toEqual(['a']);
  });
});

describe('dejar en centro', () => {
  const enTransito = { disponible: 5, transito: 4, transitoPorCentro: { pab: 4 } };

  it('DEJADO_EN_CENTRO pasa de tránsito a en centro (mismo centro)', () => {
    const s = aplicarMovimiento(enTransito, { tipo: 'DEJADO_EN_CENTRO', cantidad: 3, centroId: 'pab' });
    expect(s).toEqual({ disponible: 5, transito: 1, transitoPorCentro: { pab: 1 }, enCentro: 3, enCentroPorCentro: { pab: 3 } });
    expect(stockTotal(s)).toBe(9);
  });

  it('desde el centro: entregar sale del stock, devolver vuelve al disponible', () => {
    const s = aplicarMovimiento(enTransito, { tipo: 'DEJADO_EN_CENTRO', cantidad: 3, centroId: 'pab' });
    expect(aplicarMovimiento(s, { tipo: 'ENTREGA_DESDE_CENTRO', cantidad: 1, centroId: 'pab' })).toMatchObject({ disponible: 5, enCentro: 2, enCentroPorCentro: { pab: 2 } });
    expect(aplicarMovimiento(s, { tipo: 'DEVOLUCION_DESDE_CENTRO', cantidad: 3, centroId: 'pab' })).toEqual({ disponible: 8, transito: 1, transitoPorCentro: { pab: 1 }, enCentro: 0, enCentroPorCentro: {} });
    expect(() => aplicarMovimiento(s, { tipo: 'ENTREGA_DESDE_CENTRO', cantidad: 1, centroId: 'uci' })).toThrow(ErrorStock);
    expect(() => aplicarMovimiento(s, { tipo: 'DEVOLUCION_DESDE_CENTRO', cantidad: 4, centroId: 'pab' })).toThrow(ErrorStock);
  });

  it('totales del centro: unidades en tránsito y dejadas por separado', () => {
    let c = aplicarMovimientoCentro({}, { tipo: 'SALIDA_A_TRANSITO', cantidad: 4, productoId: 'p1' });
    c = aplicarMovimientoCentro(c, { tipo: 'DEJADO_EN_CENTRO', cantidad: 3, productoId: 'p1' });
    expect(c).toEqual({ unidades: 1, productos: { p1: 1 }, productosDistintos: 1, enCentro: 3, productosEnCentro: { p1: 3 } });
    c = aplicarMovimientoCentro(c, { tipo: 'ENTREGA_DESDE_CENTRO', cantidad: 3, productoId: 'p1' });
    expect(c).toEqual({ unidades: 1, productos: { p1: 1 }, productosDistintos: 1, enCentro: 0, productosEnCentro: {} });
  });

  it('registro de tránsito: sigue abierto mientras quede algo en tránsito o en el centro', () => {
    let t = { pendiente: 4, entregado: 0, devuelto: 0, estado: 'ABIERTO' };
    t = aplicarAccionTransito(t, { accion: 'DEJAR_EN_CENTRO', cantidad: 4 });
    expect(t).toMatchObject({ pendiente: 0, enCentro: 4, estado: 'ABIERTO' });
    t = aplicarAccionTransito(t, { accion: 'ENTREGAR', cantidad: 1, desde: 'CENTRO' });
    expect(t).toMatchObject({ pendiente: 0, enCentro: 3, entregado: 1, estado: 'ABIERTO' });
    expect(() => aplicarAccionTransito(t, { accion: 'DEVOLVER', cantidad: 1 })).toThrow(/en tránsito/);
    t = aplicarAccionTransito(t, { accion: 'DEVOLVER', cantidad: 3, desde: 'CENTRO' });
    expect(t).toMatchObject({ enCentro: 0, devuelto: 3, estado: 'CERRADO' });
  });

  it('movimiento del kardex de cada acción', () => {
    expect(movimientoDeAccion('ENTREGAR')).toBe('ENTREGA');
    expect(movimientoDeAccion('DEVOLVER', 'TRANSITO')).toBe('DEVOLUCION');
    expect(movimientoDeAccion('ENTREGAR', 'CENTRO')).toBe('ENTREGA_DESDE_CENTRO');
    expect(movimientoDeAccion('DEVOLVER', 'CENTRO')).toBe('DEVOLUCION_DESDE_CENTRO');
    expect(movimientoDeAccion('DEJAR_EN_CENTRO')).toBe('DEJADO_EN_CENTRO');
    expect(movimientoDeAccion('NOTA')).toBeNull();
  });
});

describe('validarConsignacion', () => {
  const productos = {
    p1: { nombre: 'Stent', codigoMaestro: 'BOD-1', manejaLote: true, manejaVencimiento: true },
    p2: { nombre: 'Guía', codigoMaestro: 'BOD-2', manejaLote: false, manejaVencimiento: false },
  };

  it('normaliza lote/vencimiento según el producto y calcula el lote del dueño', () => {
    const r = validarConsignacion({ empresaId: 'emp1', lineas: [
      { productoId: 'p1', lote: ' ab 1', vencimiento: '2027-01-31', cantidadConsignada: '5' },
      { productoId: 'p2', lote: 'X', vencimiento: '2027-01-31', cantidadConsignada: 0 },
    ] }, productos);
    expect(r.errores).toEqual([]);
    expect(r.lineas).toEqual([
      { productoId: 'p1', productoNombre: 'Stent', codigoMaestro: 'BOD-1', lote: 'AB1', vencimiento: '2027-01-31', cantidadConsignada: 5, loteId: 'p1__AB1__2027-01-31__C_emp1' },
      { productoId: 'p2', productoNombre: 'Guía', codigoMaestro: 'BOD-2', lote: null, vencimiento: null, cantidadConsignada: 0, loteId: 'p2__SL__SV__C_emp1' },
    ]);
  });

  it('rechaza empresa vacía, repetidos, cantidades y fechas inválidas', () => {
    expect(validarConsignacion({ lineas: [] }, productos).errores).toContain('Elige la empresa consignante.');
    const r = validarConsignacion({ empresaId: 'e', lineas: [
      { productoId: 'p1', lote: 'A', cantidadConsignada: 1 },
      { productoId: 'p1', lote: 'a', cantidadConsignada: 2 },
      { productoId: 'p1', lote: 'B', vencimiento: '2027-02-30', cantidadConsignada: -1 },
      { productoId: 'zz', cantidadConsignada: 1 },
    ] }, productos);
    expect(r.errores.join(' ')).toMatch(/repetido/);
    expect(r.errores.join(' ')).toMatch(/fecha válida/);
    expect(r.errores.join(' ')).toMatch(/mayor o igual a cero/);
    expect(r.errores.join(' ')).toMatch(/ya no existe/);
  });
});
