import { describe, it, expect } from 'vitest';
import { parsearGS1, gtinValido, fechaGS1aISO, interpretarLectura, normalizarCodigoLeido, idVinculo, GS } from './gs1.mjs';

const GTIN = '07612345678900';

describe('gtinValido', () => {
  it('acepta GTIN-8/12/13/14 con dígito verificador correcto', () => {
    expect(gtinValido(GTIN)).toBe(true);
    expect(gtinValido('4006381333931')).toBe(true); // EAN-13
    expect(gtinValido('96385074')).toBe(true); // EAN-8
  });
  it('rechaza dígito incorrecto o largo inválido', () => {
    expect(gtinValido('07612345678901')).toBe(false);
    expect(gtinValido('123')).toBe(false);
    expect(gtinValido('')).toBe(false);
  });
});

describe('fechaGS1aISO', () => {
  it('convierte AAMMDD', () => expect(fechaGS1aISO('261231')).toBe('2026-12-31'));
  it('día 00 = último día del mes (también bisiesto)', () => {
    expect(fechaGS1aISO('270200')).toBe('2027-02-28');
    expect(fechaGS1aISO('280200')).toBe('2028-02-29');
  });
  it('fechas imposibles -> vacío', () => {
    expect(fechaGS1aISO('261301')).toBe('');
    expect(fechaGS1aISO('260231')).toBe('');
    expect(fechaGS1aISO('abc')).toBe('');
  });
});

describe('parsearGS1', () => {
  it('con paréntesis: GTIN, vencimiento, lote, serie y fabricación', () => {
    const r = parsearGS1(`(01)${GTIN}(11)250101(17)261231(10)ABC123(21)S-9`);
    expect(r).toMatchObject({ esGS1: true, gtin: GTIN, lote: 'ABC123', vencimiento: '2026-12-31', fabricacion: '2025-01-01', serie: 'S-9' });
  });
  it('crudo con separador GS después del lote', () => {
    const r = parsearGS1(`01${GTIN}17261231` + `10LOTE-7${GS}21SERIE1`);
    expect(r).toMatchObject({ gtin: GTIN, lote: 'LOTE-7', vencimiento: '2026-12-31', serie: 'SERIE1' });
  });
  it('crudo con prefijo de simbología (DataMatrix ]d2, GS1-128 ]C1, QR ]Q3)', () => {
    ['d2', 'C1', 'Q3'].forEach((p) => {
      expect(parsearGS1(`]${p}01${GTIN}10L1`)).toMatchObject({ esGS1: true, gtin: GTIN, lote: 'L1' });
    });
  });
  it('lote al final sin GS: se lee hasta el final', () => {
    expect(parsearGS1(`01${GTIN}10ABC17261231`).lote).toBe('ABC17261231');
  });
  it('GTIN con dígito verificador inválido: no es GS1', () => {
    expect(parsearGS1('(01)07612345678901(10)A').esGS1).toBe(false);
  });
  it('EAN-13 suelto o código interno: no es GS1', () => {
    expect(parsearGS1('7801234567893').esGS1).toBe(false);
    expect(parsearGS1('INS-0001').esGS1).toBe(false);
    expect(parsearGS1('17261231').esGS1).toBe(false); // crudo ambiguo sin GTIN
  });
  it('segundo código solo con lote/vencimiento (paréntesis, prefijo o GS)', () => {
    expect(parsearGS1('(17)270630(10)XYZ')).toMatchObject({ esGS1: true, gtin: '', lote: 'XYZ', vencimiento: '2027-06-30' });
    expect(parsearGS1(']C117270630' + `10XYZ${GS}`)).toMatchObject({ esGS1: true, gtin: '', lote: 'XYZ' });
    expect(parsearGS1(`17270630${GS}10XYZ`)).toMatchObject({ esGS1: true, lote: 'XYZ' });
  });
  it('AI de medida (31xx) se salta por su largo fijo', () => {
    expect(parsearGS1(`01${GTIN}3103000250` + '10L9').lote).toBe('L9');
  });
  it('vacío', () => expect(parsearGS1('').esGS1).toBe(false));
});

describe('interpretarLectura', () => {
  it('GS1: la clave es el GTIN', () => {
    const r = interpretarLectura(`  (01)${GTIN}(10)L1 \n`);
    expect(r).toMatchObject({ clave: GTIN, soloDatosLote: false });
    expect(r.gs1.lote).toBe('L1');
  });
  it('no GS1: la clave es el código leído', () => {
    expect(interpretarLectura('7801234567893')).toMatchObject({ codigo: '7801234567893', clave: '7801234567893' });
  });
  it('solo lote/vencimiento: sin clave', () => {
    expect(interpretarLectura('(10)ABC')).toMatchObject({ clave: '', soloDatosLote: true });
  });
  it('vacío -> null', () => expect(interpretarLectura('  ')).toBeNull());
  it('normaliza caracteres de control salvo GS', () => {
    expect(normalizarCodigoLeido(`\u0002AB${GS}C\r`)).toBe(`AB${GS}C`);
  });
});

describe('idVinculo', () => {
  it('id válido en Firestore', () => {
    expect(idVinculo('A/B')).toBe('A%2FB');
    expect(idVinculo('.')).toBe('%2E');
    expect(idVinculo('__x__')).toBe('cb___x__');
    expect(idVinculo('  ')).toBe('');
  });
});
