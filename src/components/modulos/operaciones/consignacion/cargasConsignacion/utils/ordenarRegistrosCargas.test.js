import { describe, it, expect } from 'vitest';
import { ordenarRegistrosCargas, milisDeFecha } from './ordenarRegistrosCargas';

const ts = (ms) => ({ toMillis: () => ms });
const ids = (lista) => lista.map((r) => r.id);

describe('ordenarRegistrosCargas', () => {
  it('carga masiva nueva: respeta el orden de ingreso y junta cada admisión', () => {
    const t = ts(1000);
    // Llegan como los devuelve Firestore (por id aleatorio).
    const registros = [
      { id: 'z', gestionId: '200', posicionCarga: 1, fechaRegistro: t },
      { id: 'a', gestionId: '100', posicionCarga: 0, fechaRegistro: t },
      { id: 'm', gestionId: '100', posicionCarga: 2, fechaRegistro: t },
      { id: 'b', gestionId: '300', posicionCarga: 3, fechaRegistro: t },
      { id: 'c', gestionId: '200', posicionCarga: 4, fechaRegistro: t }
    ];
    // 100 (pos 0, 2), 200 (pos 1, 4), 300 (pos 3).
    expect(ids(ordenarRegistrosCargas(registros))).toEqual(['a', 'm', 'z', 'c', 'b']);
  });

  it('las cargas van de la más nueva a la más antigua, sin mezclarse', () => {
    const registros = [
      { id: 'viejo1', gestionId: '100', posicionCarga: 0, fechaRegistro: ts(1000) },
      { id: 'nuevo2', gestionId: '100', posicionCarga: 1, fechaRegistro: ts(2000) },
      { id: 'individual', gestionId: '500', fechaRegistro: ts(1500) },
      { id: 'nuevo1', gestionId: '900', posicionCarga: 0, fechaRegistro: ts(2000) }
    ];
    expect(ids(ordenarRegistrosCargas(registros))).toEqual(['nuevo1', 'nuevo2', 'individual', 'viejo1']);
  });

  it('cargas antiguas sin posicionCarga: por admisión (numérica) y luego por id', () => {
    const t = ts(1000);
    const registros = [
      { id: 'q', gestionId: '1000', fechaRegistro: t },
      { id: 'k', gestionId: '99', fechaRegistro: t },
      { id: 'b', gestionId: '1000', fechaRegistro: t },
      { id: 'x', gestionId: '99', fechaRegistro: t }
    ];
    expect(ids(ordenarRegistrosCargas(registros))).toEqual(['k', 'x', 'b', 'q']);
  });

  it('no modifica el arreglo recibido y tolera registros sin admisión ni fecha', () => {
    const registros = [{ id: '2' }, { id: '1', gestionId: '' }];
    const copia = [...registros];
    expect(ordenarRegistrosCargas(registros)).toHaveLength(2);
    expect(registros).toEqual(copia);
  });
});

describe('milisDeFecha', () => {
  it('acepta Timestamp, Date, { seconds } y vacío', () => {
    expect(milisDeFecha(ts(5))).toBe(5);
    expect(milisDeFecha(new Date(7))).toBe(7);
    expect(milisDeFecha({ seconds: 2, nanoseconds: 5e6 })).toBe(2005);
    expect(milisDeFecha(null)).toBe(0);
  });
});
