// Códigos duplicados en Cargas: solo cuentan las filas del ingreso normal
// (ni contenido de PAD ni detalle de lotes), sin mayúsculas ni espacios.
import { describe, it, expect } from 'vitest';
import { normalizarReferencia, esIngresoNormal, referenciasDuplicadas, existeReferenciaNormal } from './cargasHelpers';

const ITEMS = [
  { id: '1', referencia: 'TORNILLO 3.5' },
  { id: '2', referencia: '  tornillo 3.5 ' },
  { id: '3', referencia: 'PLACA', esPad: true },
  { id: '4', referencia: 'PLACA', padPadreId: '3' }, // contenido de PAD
  { id: '5', referencia: 'CLAVO' },
  { id: '6', referencia: 'CLAVO', lotePadreId: '5' }, // detalle de lotes
  { id: '7', referencia: '' },
  { id: '8', referencia: '   ' },
];

describe('duplicados del ingreso normal', () => {
  it('normaliza sin espacios al inicio/final ni mayúsculas', () => {
    expect(normalizarReferencia('  Tornillo 3.5 ')).toBe('tornillo 3.5');
    expect(normalizarReferencia(undefined)).toBe('');
  });

  it('el contenido de PAD y el detalle de lotes no son ingreso normal', () => {
    expect(esIngresoNormal(ITEMS[0])).toBe(true);
    expect(esIngresoNormal(ITEMS[2])).toBe(true); // PAD principal: viene del ingreso normal
    expect(esIngresoNormal(ITEMS[3])).toBe(false);
    expect(esIngresoNormal(ITEMS[5])).toBe(false);
  });

  it('marca solo los códigos repetidos entre filas normales', () => {
    expect([...referenciasDuplicadas(ITEMS)]).toEqual(['tornillo 3.5']);
  });

  it('al quitar una de las filas deja de haber duplicado', () => {
    expect(referenciasDuplicadas(ITEMS.filter(it => it.id !== '2')).size).toBe(0);
  });

  it('existeReferenciaNormal ignora la propia fila y las de PAD/lotes', () => {
    expect(existeReferenciaNormal(ITEMS, 'Tornillo 3.5 ')).toBe(true);
    expect(existeReferenciaNormal(ITEMS, 'CLAVO', '5')).toBe(false); // solo queda su lote
    expect(existeReferenciaNormal(ITEMS, 'PLACA', '3')).toBe(false); // solo queda su contenido
    expect(existeReferenciaNormal(ITEMS, '  ')).toBe(false);
  });
});
