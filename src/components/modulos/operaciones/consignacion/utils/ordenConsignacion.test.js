import { describe, it, expect } from 'vitest';
import {
  normalizarOrdenManual, camposOrdenManual, ordenesDeRegistro, esOrdenSincronizada
} from './registroConsignacionService';

// Debe calzar con firestore.rules (ordenConsignacionNuevaValida).
const FORMATO_REGLAS = /^[0-9]+(, [0-9]+)*$/;

describe('orden escrita a mano', () => {
  it('acepta números y varias separadas por coma, normalizadas como en las reglas', () => {
    expect(normalizarOrdenManual(' 12345 ')).toEqual({ ok: true, valor: '12345' });
    expect(normalizarOrdenManual('12345,12356')).toEqual({ ok: true, valor: '12345, 12356' });
    expect(normalizarOrdenManual('12345 ,  12356, 12345')).toEqual({ ok: true, valor: '12345, 12356' });
    ['12345', '12345, 12356'].forEach(v => expect(v).toMatch(FORMATO_REGLAS));
  });

  it('vacía = sin orden', () => {
    expect(normalizarOrdenManual('   ')).toEqual({ ok: true, valor: '' });
    expect(camposOrdenManual('')).toEqual({ orden: '', ordenOrigen: '' });
    expect(camposOrdenManual('12345')).toEqual({ orden: '12345', ordenOrigen: 'manual' });
  });

  it('rechaza texto libre, comas sueltas y otros separadores', () => {
    ['OC 12345', '12345a', 'pendiente', '12345,', ',12345', '12345;12356', '12-345', '12345,,12356'].forEach((v) => {
      expect(normalizarOrdenManual(v)).toMatchObject({ ok: false });
    });
  });
});

describe('orden de un registro', () => {
  it('reconoce la orden sincronizada', () => {
    expect(esOrdenSincronizada({ orden: '4500001', ordenOrigen: 'oc' })).toBe(true);
    expect(esOrdenSincronizada({ orden: '4500001', ordenOrigen: 'manual' })).toBe(false);
    expect(esOrdenSincronizada({ orden: '4500001' })).toBe(false);
  });

  it('lista sus órdenes sin repetir', () => {
    expect(ordenesDeRegistro({ orden: '12345, 12356, 12345' })).toEqual(['12345', '12356']);
    expect(ordenesDeRegistro({ orden: '' })).toEqual([]);
    expect(ordenesDeRegistro({})).toEqual([]);
  });
});
