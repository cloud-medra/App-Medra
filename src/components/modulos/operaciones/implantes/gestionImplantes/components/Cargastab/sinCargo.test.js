import { describe, it, expect } from 'vitest';
import { camposCambioEstadoCarga, esEstadoCargaCompleto, ESTADO_CARGA_OPTIONS, ESTADO_SIN_CARGO, CODIGO_SIN_OC, getEstadoCargaStyle } from './cargasHelpers';

const RECARGOS = [{ desde: 0, hasta: 1000000, vecesCosto: 1.5 }];
const ITEM = { id: 'i1', codigo: '0301001', precio: 10000, cantidad: 2, vecesCosto: 1.5, recargoEncontrado: true, venta: 30000, totalItem: 20000, estadoCarga: 'PENDIENTE' };

describe('Estado Carga "SIN CARGO"', () => {
  it('es una opción nueva que no choca con las existentes y tiene su color', () => {
    expect(ESTADO_CARGA_OPTIONS).toEqual(['PENDIENTE', 'CARGADO', 'REVISAR', 'S/COTIZACION', 'SIN CARGO']);
    expect(getEstadoCargaStyle(ESTADO_SIN_CARGO)).not.toBe(getEstadoCargaStyle('PENDIENTE'));
  });

  it('al marcarla queda como contenido de PAD: "No lleva OC", precio y totales en 0, guardando lo original', () => {
    expect(camposCambioEstadoCarga(ITEM, ESTADO_SIN_CARGO, RECARGOS)).toEqual({
      estadoCarga: 'SIN CARGO', sinCargoOriginal: { codigo: '0301001', precio: 10000 },
      codigo: CODIGO_SIN_OC, precio: 0, vecesCosto: 1, recargoEncontrado: true, venta: 0, totalItem: 0,
    });
  });

  it('al volver a otro estado recupera código y precio y recalcula venta y total', () => {
    const sinCargo = { ...ITEM, ...camposCambioEstadoCarga(ITEM, ESTADO_SIN_CARGO, RECARGOS) };
    expect(camposCambioEstadoCarga(sinCargo, 'CARGADO', RECARGOS)).toEqual({
      estadoCarga: 'CARGADO', codigo: '0301001', precio: 10000, vecesCosto: 1.5, recargoEncontrado: true, venta: 30000, totalItem: 20000, sinCargoOriginal: null,
    });
  });

  it('entre otros estados solo cambia el estado (y volver a marcar SIN CARGO no pisa lo original)', () => {
    expect(camposCambioEstadoCarga(ITEM, 'REVISAR', RECARGOS)).toEqual({ estadoCarga: 'REVISAR' });
    const sinCargo = { ...ITEM, ...camposCambioEstadoCarga(ITEM, ESTADO_SIN_CARGO, RECARGOS) };
    expect(camposCambioEstadoCarga(sinCargo, ESTADO_SIN_CARGO, RECARGOS)).toEqual({ estadoCarga: 'SIN CARGO' });
  });

  it('no suma en los totales (total 0) y cuenta como completo, igual que PAD', () => {
    const filas = [ITEM, { ...ITEM, id: 'i2', ...camposCambioEstadoCarga(ITEM, ESTADO_SIN_CARGO, RECARGOS) }];
    expect(filas.reduce((n, it) => n + (Number(it.totalItem) || 0), 0)).toBe(20000);
    expect(esEstadoCargaCompleto(ESTADO_SIN_CARGO)).toBe(true);
    expect(esEstadoCargaCompleto('PAD')).toBe(true);
    expect(esEstadoCargaCompleto('REVISAR')).toBe(false);
  });
});
