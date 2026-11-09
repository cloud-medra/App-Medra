import { describe, it, expect } from 'vitest';
import { lotesVisibles, propuestaAgregar, agregarPartes, quitarLineaKit, marcarConfirmados, lineasParaGuardar, fechaCorta, unirPagina } from './lineasKit';

const HOY = '2026-11-09';
const lotes = [
  { id: 'tarde', lote: 'TARDE', vencimiento: '2030-01-01', disponible: 10 },
  { id: 'pronto', lote: 'PRONTO', vencimiento: '2028-01-01', disponible: 3 },
  { id: 'vencido', lote: 'VENCIDO', vencimiento: '2025-01-01', disponible: 5 },
  { id: 'sf', lote: 'SF', vencimiento: null, disponible: 2 },
  { id: 'cero', lote: 'CERO', vencimiento: '2027-01-01', disponible: 0 },
];
const producto = { id: 'p', nombre: 'Insumo', referencia: 'R1' };

describe('lotesVisibles', () => {
  it('ordena por FEFO, oculta vencidos y sin stock y deja el sin fecha al final', () => {
    expect(lotesVisibles(lotes, [], [], HOY).map((l) => l.id)).toEqual(['pronto', 'tarde', 'sf']);
  });
  it('descuenta lo ya agregado a la lista: no se puede repetir el mismo stock', () => {
    const v = lotesVisibles(lotes, [{ loteId: 'pronto', cantidad: 3 }, { loteId: 'tarde', cantidad: 4 }], [], HOY);
    expect(v.map((l) => [l.id, l.disponible])).toEqual([['tarde', 6], ['sf', 2]]);
  });
  it('al editar, lo que el kit ya tiene guardado cuenta como libre', () => {
    const original = [{ loteId: 'pronto', cantidad: 2 }];
    expect(lotesVisibles(lotes, original, original, HOY)[0]).toMatchObject({ id: 'pronto', disponible: 3 });
    expect(lotesVisibles(lotes, [], original, HOY)[0]).toMatchObject({ id: 'pronto', disponible: 5 });
  });
});

describe('propuestaAgregar', () => {
  const v = lotesVisibles(lotes, [], [], HOY);
  it('dentro del primer lote: sin avisos', () => {
    expect(propuestaAgregar(v, 'pronto', 2)).toMatchObject({ completa: false, faltante: 0, fueraDeFEFO: [], sinVencimiento: [] });
  });
  it('supera el primer lote: propone completar con el siguiente', () => {
    const r = propuestaAgregar(v, 'pronto', 5);
    expect(r.completa).toBe(true);
    expect(r.partes.map((p) => [p.lote.id, p.cantidad])).toEqual([['pronto', 3], ['tarde', 2]]);
    expect(r.fueraDeFEFO).toEqual([]);
  });
  it('supera todo lo disponible: informa lo que falta', () => {
    expect(propuestaAgregar(v, 'pronto', 16).faltante).toBe(1);
  });
  it('lote distinto al primero: fuera de FEFO', () => {
    expect(propuestaAgregar(v, 'tarde', 1).fueraDeFEFO.map((p) => p.lote.id)).toEqual(['tarde']);
  });
  it('lote sin vencimiento: pide las dos confirmaciones', () => {
    const r = propuestaAgregar(v, 'sf', 1);
    expect(r.sinVencimiento.map((p) => p.lote.id)).toEqual(['sf']);
    expect(r.fueraDeFEFO.map((p) => p.lote.id)).toEqual(['sf']);
  });
});

describe('líneas', () => {
  const v = lotesVisibles(lotes, [], [], HOY);
  it('agrega, suma el mismo lote y arrastra las confirmaciones', () => {
    const r1 = propuestaAgregar(v, 'tarde', 1);
    let lista = agregarPartes([], producto, r1.partes, { fueraDeFEFO: new Set(['tarde']) });
    lista = agregarPartes(lista, producto, r1.partes);
    expect(lista).toHaveLength(1);
    expect(lista[0]).toMatchObject({ cantidad: 2, referencia: 'R1', confirmarFueraFEFO: true, confirmarSinVencimiento: false });
  });
  it('un sin fecha queda confirmado al agregarlo', () => {
    expect(agregarPartes([], producto, propuestaAgregar(v, 'sf', 1).partes)[0]).toMatchObject({ vencimiento: null, confirmarSinVencimiento: true });
  });
  it('quitar y marcar confirmados', () => {
    const lista = [{ loteId: 'a', cantidad: 1 }, { loteId: 'b', cantidad: 1 }];
    expect(quitarLineaKit(lista, 'a')).toEqual([{ loteId: 'b', cantidad: 1 }]);
    expect(marcarConfirmados(lista, 'fuera-fefo', ['b'])[1].confirmarFueraFEFO).toBe(true);
    expect(marcarConfirmados(lista, 'sin-vencimiento', ['a'])[0].confirmarSinVencimiento).toBe(true);
  });
  it('solo envía lo que necesita la Function', () => {
    expect(lineasParaGuardar([{ productoId: 'p', loteId: 'a', cantidad: 2, lote: 'X', productoNombre: 'Y' }])).toEqual([{ productoId: 'p', loteId: 'a', cantidad: 2, confirmarFueraFEFO: false, confirmarSinVencimiento: false }]);
  });
  it('fecha corta y paginación sin repetidos', () => {
    expect(fechaCorta('2029-03-15')).toBe('15-03-2029');
    expect(fechaCorta(null)).toBe('');
    expect(unirPagina([{ id: 'a' }], [{ id: 'a' }, { id: 'b' }]).map((k) => k.id)).toEqual(['a', 'b']);
  });
});
