import { describe, it, expect } from 'vitest';
import { diasEnTransito, filtrarTransitos, construirAcciones } from './transitos';

describe('tránsitos', () => {
  it('días en tránsito', () => {
    const ahora = new Date('2026-10-14T12:00:00Z');
    expect(diasEnTransito({ toDate: () => new Date('2026-10-11T13:00:00Z') }, ahora)).toBe(2);
    expect(diasEnTransito(new Date('2026-10-14T08:00:00Z'), ahora)).toBe(0);
    expect(diasEnTransito(null, ahora)).toBeNull();
  });
  it('filtra por varias palabras sin tildes', () => {
    const t = [{ productoNombre: 'Sonda Foley', lote: 'L1', centroNombre: 'PABELLÓN', salidaNumero: 7 }, { productoNombre: 'Gasa', centroNombre: 'UCI' }];
    expect(filtrarTransitos(t, 'pabellon sonda')).toHaveLength(1);
    expect(filtrarTransitos(t, ' ')).toHaveLength(2);
    expect(filtrarTransitos(t, '7')).toHaveLength(1);
  });
  it('ID y observación comunes, con valor por línea si se cambió', () => {
    const lineas = [{ transito: { id: 'a' }, cantidad: '2', idEntrega: '', observacion: '' }, { transito: { id: 'b' }, cantidad: 1, idEntrega: 'X-9', observacion: 'otra' }];
    expect(construirAcciones('ENTREGAR', lineas, { idEntrega: 'C-1', observacion: 'común' })).toEqual([
      { transitoId: 'a', accion: 'ENTREGAR', cantidad: 2, idEntrega: 'C-1', observacion: 'común', nota: '' },
      { transitoId: 'b', accion: 'ENTREGAR', cantidad: 1, idEntrega: 'X-9', observacion: 'otra', nota: '' },
    ]);
    expect(construirAcciones('NOTA', lineas.slice(0, 1), { nota: 'seguir' })[0]).toMatchObject({ accion: 'NOTA', cantidad: null, nota: 'seguir', idEntrega: '' });
  });
});
