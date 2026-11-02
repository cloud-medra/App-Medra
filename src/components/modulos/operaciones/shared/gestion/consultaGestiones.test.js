import { describe, it, expect } from 'vitest';
import {
  normalizarMesRuta,
  normalizarAnioRuta,
  periodoConsultaGestiones,
  rangoRutaMesGestiones,
  esRutaDelMes
} from './consultaGestiones';

describe('normalizarMesRuta', () => {
  it('siempre devuelve dos dígitos', () => {
    expect(normalizarMesRuta('1')).toBe('01');
    expect(normalizarMesRuta(9)).toBe('09');
    expect(normalizarMesRuta('09')).toBe('09');
    expect(normalizarMesRuta('12')).toBe('12');
  });

  it('rechaza lo que no es un mes', () => {
    ['', null, undefined, '0', '13', '001', 'sep', '1.5'].forEach(m => expect(normalizarMesRuta(m)).toBeNull());
  });
});

describe('periodoConsultaGestiones', () => {
  it('necesita año y mes válidos', () => {
    expect(periodoConsultaGestiones({ anio: '2026', mes: '9' })).toEqual({ anio: '2026', mes: '09' });
    expect(periodoConsultaGestiones({ anio: '2026', mes: '' })).toBeNull();
    expect(periodoConsultaGestiones({ anio: '', mes: '09' })).toBeNull();
    expect(periodoConsultaGestiones()).toBeNull();
    expect(normalizarAnioRuta('26')).toBeNull();
  });
});

describe('rangoRutaMesGestiones y esRutaDelMes', () => {
  const col = 'implantes_gestiones';
  const ruta = (mes) => `${col}/2026/mes/${mes}/dia/05/admision/123/empresa/X/detalles/abc`;

  it('el rango es del mes con dos dígitos', () => {
    expect(rangoRutaMesGestiones(col, periodoConsultaGestiones({ anio: '2026', mes: '1' })))
      .toEqual({ desde: `${col}/2026/mes/01`, hasta: `${col}/2026/mes/01~` });
  });

  it('descarta segmentos parecidos que el rango de texto dejaría pasar', () => {
    const periodo = { anio: '2026', mes: '01' };
    expect(esRutaDelMes(ruta('01'), col, periodo)).toBe(true);
    expect(esRutaDelMes(ruta('010'), col, periodo)).toBe(false);
    expect(esRutaDelMes(ruta('1'), col, periodo)).toBe(false);
    expect(esRutaDelMes(ruta('01'), 'hemodinamia_gestiones', periodo)).toBe(false);
    expect(esRutaDelMes(`${col}/2025/mes/01/dia/05`, col, periodo)).toBe(false);
  });
});
