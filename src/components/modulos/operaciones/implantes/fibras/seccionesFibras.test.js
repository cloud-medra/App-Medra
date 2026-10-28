import { describe, it, expect } from 'vitest';
import { seccionesFibras, alertaFibra, coincideBusqueda } from './seccionesFibras';

const HOY = '2026-10-28';
const fibra = (id, extra = {}) => ({
  id, codigoInterno: id, referencia: 'FL-365', descriptor: 'FIBRA LASER 365', lote: 'L1', vencimiento: '2028-01-01',
  usosTotales: 5, usosPrevios: 0, numerosOcupados: [], fechasUso: {}, usosConsumidos: 0, estado: 'ACTIVA', ubicacion: 'EN BODEGA', ...extra,
});

describe('alertaFibra', () => {
  it('rojo si está vencida; ámbar con 1 uso o si vence en 30 días; nada si no', () => {
    expect(alertaFibra(fibra('A', { vencimiento: '2026-10-27' }), HOY)).toBe('rojo');
    expect(alertaFibra(fibra('A', { usosPrevios: 4, usosConsumidos: 4 }), HOY)).toBe('ambar');
    expect(alertaFibra(fibra('A', { vencimiento: '2026-11-27' }), HOY)).toBe('ambar');
    expect(alertaFibra(fibra('A', { vencimiento: '2026-11-28' }), HOY)).toBeNull();
  });
});

describe('seccionesFibras', () => {
  const lista = [
    fibra('FIB-0003', { ubicacion: 'EN USO', usosPrevios: 1, usosConsumidos: 1 }),
    fibra('FIB-0005', { vencimiento: '2027-06-01' }),
    fibra('FIB-0006', { vencimiento: '2026-01-01' }),
    fibra('FIB-0001', { referencia: 'FL-550', descriptor: 'FIBRA LASER 550', vencimiento: '2030-10-14' }),
    fibra('FIB-0007', { ubicacion: 'AGOTADA', estado: 'AGOTADA', fechasUso: { 1: '2026-09-01', 2: '2026-10-20' } }),
    fibra('FIB-0008', { ubicacion: 'AGOTADA', estado: 'AGOTADA', fechasUso: { 1: '2026-10-25' } }),
    fibra('FIB-0009', { ubicacion: 'AGOTADA', estado: 'AGOTADA', referencia: 'FL-1000' }),
  ];

  it('una tarjeta por referencia: con la fibra en uso, o vacía si solo hay en bodega', () => {
    const { enUso, totalEnUso } = seccionesFibras(lista, HOY);
    expect(enUso.map((t) => [t.referencia, t.fibra?.id || null, t.enBodega])).toEqual([
      ['FL-365', 'FIB-0003', 2],
      ['FL-550', null, 1],
    ]);
    expect(totalEnUso).toBe(1);
    // La tarjeta vacía ofrece la siguiente de bodega (vigente, vence primero).
    expect(enUso[1].siguiente.id).toBe('FIB-0001');
  });

  it('una referencia con solo agotadas no tiene tarjeta', () => {
    expect(seccionesFibras(lista, HOY).enUso.some((t) => t.referencia === 'FL-1000')).toBe(false);
  });

  it('en bodega: por referencia y vencimiento (las vencidas incluidas)', () => {
    expect(seccionesFibras(lista, HOY).bodega.map((f) => f.id)).toEqual(['FIB-0006', 'FIB-0005', 'FIB-0001']);
  });

  it('agotadas: por último uso, la más reciente primero; sin usos registrados al final', () => {
    const { agotadas } = seccionesFibras(lista, HOY);
    expect(agotadas.map((f) => [f.id, f.ultimoUso])).toEqual([['FIB-0008', '2026-10-25'], ['FIB-0007', '2026-10-20'], ['FIB-0009', '']]);
  });

  it('la búsqueda se aplica a las tres secciones', () => {
    const r = seccionesFibras(lista, HOY, 'fl-550');
    expect(r.enUso.map((t) => t.referencia)).toEqual(['FL-550']);
    expect(r.bodega.map((f) => f.id)).toEqual(['FIB-0001']);
    expect(r.agotadas).toEqual([]);
    expect(coincideBusqueda(fibra('X', { lote: 'A241544' }), 'a2415')).toBe(true);
  });
});
