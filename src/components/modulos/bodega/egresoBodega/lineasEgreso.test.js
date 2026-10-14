import { describe, it, expect } from 'vitest';
import { agregarLineaEgreso, reservadoPorLote, resumenPorCentro } from './lineasEgreso';
import { lotesFEFO } from '../../../../../functions/bodega/nucleo.mjs';

const P = { id: 'p1', nombre: 'Sonda' };
const L1 = { id: 'p1__A__2027-01-01', lote: 'A', vencimiento: '2027-01-01' };
const PAB = { id: 'pab', nombre: 'PABELLÓN' };
const UCI = { id: 'uci', nombre: 'UCI' };

describe('líneas de egreso', () => {
  it('suma el mismo lote al mismo centro; otro centro es otra línea', () => {
    let r = agregarLineaEgreso([], { producto: P, lote: L1, cantidad: 2, centro: PAB });
    r = agregarLineaEgreso(r.lineas, { producto: P, lote: L1, cantidad: 1, centro: PAB });
    expect(r).toMatchObject({ sumada: true, lineas: [{ cantidad: 3, centroNombre: 'PABELLÓN' }] });
    r = agregarLineaEgreso(r.lineas, { producto: P, lote: L1, cantidad: 1, centro: UCI });
    expect(r.lineas).toHaveLength(2);
    expect(reservadoPorLote(r.lineas)).toEqual({ [L1.id]: 4 });
    expect(resumenPorCentro(r.lineas)).toEqual([
      { centroId: 'pab', nombre: 'PABELLÓN', lineas: 1, unidades: 3 },
      { centroId: 'uci', nombre: 'UCI', lineas: 1, unidades: 1 },
    ]);
  });

  it('FEFO: vence primero, sin vencimiento al final, solo con disponible', () => {
    const lotes = [
      { id: 'a', lote: 'A', vencimiento: '', disponible: 5 },
      { id: 'b', lote: 'B', vencimiento: '2028-01-01', disponible: 1 },
      { id: 'c', lote: 'C', vencimiento: '2027-01-01', disponible: 2 },
      { id: 'd', lote: 'D', vencimiento: '2026-01-01', disponible: 0 },
    ];
    expect(lotesFEFO(lotes).map((l) => l.id)).toEqual(['c', 'b', 'a']);
  });
});
