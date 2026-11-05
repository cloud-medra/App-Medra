// Estados de Consignación: FINALIZADO sigue imputado (con candado), solo una
// carga SOLICITADO se finaliza al recibir la orden, y qué ítems toma
// "Marcar todos como Cargado".
import { describe, it, expect } from 'vitest';
import { estaImputadoConsignacion, estadoAlAsignarOrden, esElegibleCargaMasiva, ESTADO_BADGE, ESTADO_PUNTO } from './estadosConsignacion';

describe('estaImputadoConsignacion', () => {
  it('SOLICITADO y FINALIZADO están imputados; el resto no', () => {
    expect(estaImputadoConsignacion({ estado: 'SOLICITADO' })).toBe(true);
    expect(estaImputadoConsignacion({ estado: 'finalizado ' })).toBe(true);
    expect(estaImputadoConsignacion({ estado: 'CARGADO' })).toBe(false);
    expect(estaImputadoConsignacion({})).toBe(false); // sin estado = INGRESADO
  });
});

describe('estadoAlAsignarOrden', () => {
  it('solo SOLICITADO pasa a FINALIZADO; otro estado se conserva', () => {
    expect(estadoAlAsignarOrden({ estado: 'SOLICITADO' })).toBe('FINALIZADO');
    for (const estado of ['INGRESADO', 'CARGADO', 'REVISAR', 'PENDIENTE', 'FINALIZADO', undefined]) {
      expect(estadoAlAsignarOrden({ estado })).toBeNull();
    }
    expect(estadoAlAsignarOrden(undefined)).toBeNull();
  });
});

describe('esElegibleCargaMasiva', () => {
  it('toma los pendientes con código; deja fuera imputados, CARGADO, REVISAR y sin código', () => {
    expect(esElegibleCargaMasiva({ estado: 'INGRESADO', codigo: 'C1' })).toBe(true);
    expect(esElegibleCargaMasiva({ estado: 'PENDIENTE', codigo: 'C1' })).toBe(true);
    expect(esElegibleCargaMasiva({ codigo: 'C1' })).toBe(true);
    expect(esElegibleCargaMasiva({ estado: 'REVISAR', codigo: 'C1' })).toBe(false);
    expect(esElegibleCargaMasiva({ estado: 'CARGADO', codigo: 'C1' })).toBe(false);
    expect(esElegibleCargaMasiva({ estado: 'SOLICITADO', codigo: 'C1' })).toBe(false);
    expect(esElegibleCargaMasiva({ estado: 'FINALIZADO', codigo: 'C1' })).toBe(false);
    expect(esElegibleCargaMasiva({ estado: 'INGRESADO', codigo: ' ' })).toBe(false);
  });
});

it('FINALIZADO tiene su propio color, distinto de SOLICITADO y CARGADO', () => {
  expect(ESTADO_BADGE.FINALIZADO).toMatch(/cyan/);
  expect(ESTADO_PUNTO.FINALIZADO).toMatch(/cyan/);
  expect(ESTADO_BADGE.FINALIZADO).not.toBe(ESTADO_BADGE.SOLICITADO);
});
