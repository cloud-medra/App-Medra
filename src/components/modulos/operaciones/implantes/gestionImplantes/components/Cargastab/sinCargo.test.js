import { describe, it, expect } from 'vitest';
import { camposCambioEstadoCarga, esEstadoCargaCompleto, ESTADO_CARGA_OPTIONS, ESTADO_SIN_CARGO, CODIGO_SIN_OC, getEstadoCargaStyle, codigoParaMostrar } from './cargasHelpers';
import { construirPayloadImputada } from '../../utils/imputadaSync';
import { ordenarPorAdmisionYOC } from '../../../../../administracion/cargasConsolidado/utils/normalizarFila';

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

describe('SIN CARGO: código real en pantalla, datos sin cambios', () => {
  const sinCargo = { ...ITEM, ...camposCambioEstadoCarga(ITEM, ESTADO_SIN_CARGO, RECARGOS) };

  it('la columna Código muestra el código real con la marca de sin cargo', () => {
    expect(codigoParaMostrar(sinCargo)).toEqual({ codigo: '0301001', sinCargo: true });
    expect(codigoParaMostrar(ITEM)).toEqual({ codigo: '0301001', sinCargo: false });
    // Contenido de PAD o lote adicional: sigue mostrando lo guardado.
    expect(codigoParaMostrar({ codigo: CODIGO_SIN_OC, estadoCarga: 'PAD' })).toEqual({ codigo: CODIGO_SIN_OC, sinCargo: false });
    // SIN CARGO sin original (no debería pasar): lo guardado.
    expect(codigoParaMostrar({ codigo: CODIGO_SIN_OC, estadoCarga: ESTADO_SIN_CARGO })).toEqual({ codigo: CODIGO_SIN_OC, sinCargo: true });
  });

  it('sigue con venta 0 y guardando "No lleva OC": la imputada y el Excel no cambian', () => {
    expect(sinCargo).toMatchObject({ codigo: CODIGO_SIN_OC, venta: 0, totalItem: 0, precio: 0 });
    const imputada = construirPayloadImputada(sinCargo, { fecha: '2026-10-20', gestionId: '1', agendaId: '1', admision: '1' }, '2026', 'octubre', 'Ana');
    expect(imputada).toMatchObject({ codigo: CODIGO_SIN_OC, venta: 0, total: 0, precio: 0 });
  });

  it('en Cargas consolidadas sigue en el grupo sin OC (al final de su admisión)', () => {
    const filas = [{ gestionId: '1', codigo: sinCargo.codigo }, { gestionId: '1', codigo: 'COD-9' }];
    expect(ordenarPorAdmisionYOC(filas).map((f) => f.codigo)).toEqual(['COD-9', CODIGO_SIN_OC]);
  });

  it('ida y vuelta: el código se mantiene siempre', () => {
    const vuelta = { ...sinCargo, ...camposCambioEstadoCarga(sinCargo, 'CARGADO', RECARGOS) };
    expect(vuelta.codigo).toBe('0301001');
    const otraVez = { ...vuelta, ...camposCambioEstadoCarga(vuelta, ESTADO_SIN_CARGO, RECARGOS) };
    expect(codigoParaMostrar(otraVez).codigo).toBe('0301001');
  });
});
