import { describe, it, expect } from 'vitest';
import { filasConsignacion, totalesFilas, resumenEmpresas, filtrarFilas, textoPorCentro, ordenarFilas, conDatosProducto } from './consignaciones';

const HOY = '2026-10-16';
const consignacion = {
  id: 'acme', empresaNombre: 'ACME',
  lineas: [
    { productoId: 'p1', productoNombre: 'Stent', codigoMaestro: 'B1', lote: 'L1', vencimiento: '2026-11-01', cantidadConsignada: 10, loteId: 'p1__L1__2026-11-01__C_acme' },
    { productoId: 'p2', productoNombre: 'Balón', codigoMaestro: 'B2', lote: null, vencimiento: null, cantidadConsignada: 3, loteId: 'p2__SL__SV__C_acme' },
  ],
};
const lotes = [
  { id: 'p1__L1__2026-11-01__C_acme', productoId: 'p1', propietarioId: 'acme', propietarioNombre: 'ACME', disponible: 5, transito: 2, transitoPorCentro: { pab: 2 }, enCentro: 1, enCentroPorCentro: { uci: 1 } },
  { id: 'p3__X__SV__C_acme', productoId: 'p3', propietarioId: 'acme', propietarioNombre: 'ACME', lote: 'X', disponible: 4 },
  { id: 'p4__Y__SV__C_acme', productoId: 'p4', propietarioId: 'acme', lote: 'Y', disponible: 0 },
  { id: 'p1__Z__SV__C_otra', productoId: 'p1', propietarioId: 'otra', propietarioNombre: 'OTRA', lote: 'Z', disponible: 1 },
];

describe('stock consignado', () => {
  it('cruza debo tener con el stock real; agrega lotes con stock no registrados', () => {
    const filas = filasConsignacion(consignacion, lotes.filter((l) => l.propietarioId === 'acme'));
    expect(filas.map((f) => [f.productoId, f.cantidadConsignada, f.actual, f.transito, f.enCentro, f.diferencia, f.registrada])).toEqual([
      ['p1', 10, 5, 2, 1, -2, true],
      ['p2', 3, 0, 0, 0, -3, true],
      ['p3', 0, 4, 0, 0, 4, false],
    ]);
  });

  it('totales: faltante, sobrante y próximos a vencer', () => {
    const filas = filasConsignacion(consignacion, lotes.filter((l) => l.propietarioId === 'acme'));
    expect(totalesFilas(filas, { hoy: HOY })).toEqual({ consignada: 13, actual: 9, transito: 2, enCentro: 1, faltante: 5, sobrante: 4, conFaltante: 2, porVencer: 1 });
  });

  it('resumen por empresa: con consignación registrada o solo con lotes', () => {
    const r = resumenEmpresas([consignacion], lotes, { hoy: HOY });
    expect(r.map((e) => [e.empresaId, e.empresaNombre, e.lineas, e.consignada, e.faltante])).toEqual([
      ['acme', 'ACME', 3, 13, 5],
      ['otra', 'OTRA', 1, 0, 0],
    ]);
  });

  it('filtros, orden y texto por centro', () => {
    const filas = filasConsignacion(consignacion, lotes.filter((l) => l.propietarioId === 'acme'));
    expect(filtrarFilas(filas, { soloFaltantes: true }).map((f) => f.productoId)).toEqual(['p1', 'p2']);
    expect(filtrarFilas(filas, { soloPorVencer: true }, { hoy: HOY }).map((f) => f.productoId)).toEqual(['p1']);
    expect(filtrarFilas(filas, { texto: 'balon' }).map((f) => f.productoId)).toEqual(['p2']);
    const conNombres = conDatosProducto(filas, { p3: { nombre: 'Aguja', codigoMaestro: 'B3' } });
    expect(conNombres[2]).toMatchObject({ productoNombre: 'Aguja', codigoMaestro: 'B3' });
    expect(ordenarFilas(conNombres).map((f) => f.productoId)).toEqual(['p3', 'p2', 'p1']);
    expect(textoPorCentro({ uci: 1, pab: 2, x: 0 }, (c) => ({ uci: 'UCI', pab: 'PABELLÓN' }[c]))).toBe('PABELLÓN: 2 · UCI: 1');
  });
});
