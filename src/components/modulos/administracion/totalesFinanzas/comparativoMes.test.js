import { describe, it, expect } from 'vitest';
import {
  FUENTES_COMPARATIVO, hoyEnChile, diasDelMes, rangoDelMes, rangosComparativo, periodosAConsultar,
  normalizarRango, diasElegibles, diferencia, porcentajeTexto,
} from './comparativoMes';

const HOY = { anio: 2026, mes: 10, dia: 27 };

describe('Comparativo mensual', () => {
  it('suma Consumos por fecha de la gestión y Facturas por fecha de emisión', () => {
    expect(FUENTES_COMPARATIVO.consumos).toMatchObject({ moduloIds: ['implantes', 'consignacion', 'hemodinamia'], campoFecha: 'fecha' });
    expect(FUENTES_COMPARATIVO.facturas).toMatchObject({ moduloIds: ['laboratorio', 'vacunatorio'], campoFecha: 'fchEmis' });
  });

  it('hoy es el día de Chile', () => {
    expect(hoyEnChile(new Date('2026-11-01T02:00:00Z'))).toEqual({ anio: 2026, mes: 10, dia: 31 });
  });

  it('los mismos días del mes pasado, con el mes de distinto largo llevado a su último día', () => {
    expect(rangosComparativo(HOY, 1, 27)).toMatchObject({
      actual: { inicio: '2026-10-01', fin: '2026-10-27', ajustado: false },
      anterior: { inicio: '2026-09-01', fin: '2026-09-27', ajustado: false },
    });
    // Hasta el 31 contra septiembre (30 días): hasta el 30.
    expect(rangoDelMes({ anio: 2026, mes: 9 }, 1, 31)).toMatchObject({ fin: '2026-09-30', hasta: 30, ajustado: true });
    // Marzo contra febrero no bisiesto / bisiesto.
    expect(rangoDelMes({ anio: 2026, mes: 2 }, 29, 31)).toMatchObject({ inicio: '2026-02-28', fin: '2026-02-28' });
    expect(diasDelMes(2028, 2)).toBe(29);
    // Enero contra diciembre del año anterior.
    expect(rangosComparativo({ anio: 2027, mes: 1, dia: 15 }, 1, 15).anterior).toMatchObject({ inicio: '2026-12-01', fin: '2026-12-15' });
  });

  it('busca en los períodos mes−1, mes y mes+1, sin pasar del mes actual', () => {
    const tope = { anio: 2026, mes: 10 };
    expect(periodosAConsultar({ anio: 2026, mes: 9 }, tope)).toEqual([
      { anio: '2026', mesId: 'agosto' }, { anio: '2026', mesId: 'septiembre' }, { anio: '2026', mesId: 'octubre' },
    ]);
    expect(periodosAConsultar(tope, tope)).toEqual([{ anio: '2026', mesId: 'septiembre' }, { anio: '2026', mesId: 'octubre' }]);
    expect(periodosAConsultar({ anio: 2027, mes: 1 }, { anio: 2027, mes: 1 })[0]).toEqual({ anio: '2026', mesId: 'diciembre' });
  });

  it('no deja elegir días posteriores a hoy ni un "desde" mayor que el "hasta"', () => {
    expect(diasElegibles(HOY)).toHaveLength(27);
    expect(normalizarRango(1, 31, HOY)).toEqual({ desde: 1, hasta: 27 });
    expect(normalizarRango(20, 10, HOY)).toEqual({ desde: 10, hasta: 10 });
    expect(normalizarRango(undefined, undefined, HOY)).toEqual({ desde: 1, hasta: 27 });
  });

  it('diferencia en monto y en %, sin % si el mes pasado fue 0', () => {
    expect(diferencia(120, 100)).toEqual({ monto: 20, porcentaje: 20 });
    expect(diferencia(50, 100).porcentaje).toBe(-50);
    expect(diferencia(10, 0)).toEqual({ monto: 10, porcentaje: null });
    expect(porcentajeTexto(12.345)).toBe('+12,3 %');
    expect(porcentajeTexto(null)).toBe('sin base');
  });
});
