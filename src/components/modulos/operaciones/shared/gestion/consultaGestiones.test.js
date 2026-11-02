import { describe, it, expect } from 'vitest';
import {
  normalizarMesRuta,
  normalizarAnioRuta,
  periodoConsultaGestiones,
  rangoRutaMesGestiones,
  esRutaDelMes,
  rangoRutaAnioGestiones,
  rangoRutaGestionesReales,
  anioDeRutaGestion,
  aniosAContar,
  anioMasRecienteConDatos,
  mesMasRecienteConDatos,
  ANIO_RESPALDO_GESTIONES
} from './consultaGestiones';

describe('años y meses con gestiones', () => {
  const col = 'implantes_gestiones';

  it('rangos por ruta: año completo y gestiones reales (sin la ruta de respaldo 0000)', () => {
    expect(rangoRutaAnioGestiones(col, '2026')).toEqual({ desde: `${col}/2026`, hasta: `${col}/2026~` });
    expect(rangoRutaGestionesReales(col).desde).toBe(`${col}/2000`);
  });

  it('año de la gestión más antigua desde su ruta', () => {
    expect(anioDeRutaGestion(`${col}/2026/mes/09/dia/01/admision/1/empresa/X/detalles/a`, col)).toBe(2026);
    expect(anioDeRutaGestion(`hemodinamia_gestiones/2026/mes/09`, col)).toBeNull();
  });

  it('años a contar: desde el más antiguo (o el de respaldo) hasta el próximo', () => {
    expect(aniosAContar(2025, 2026)).toEqual(['2025', '2026', '2027']);
    expect(aniosAContar(null, 2026)).toEqual([String(ANIO_RESPALDO_GESTIONES), '2027']);
  });

  it('año más reciente con gestiones: el actual, si no el anterior más cercano, si no el siguiente', () => {
    expect(anioMasRecienteConDatos({ 2025: 3, 2026: 5 }, 2026)).toBe(2026);
    expect(anioMasRecienteConDatos({ 2024: 3, 2025: 1, 2026: 0 }, 2026)).toBe(2025);
    expect(anioMasRecienteConDatos({ 2026: 0, 2027: 4 }, 2026)).toBe(2027);
    expect(anioMasRecienteConDatos({ 2026: 0 }, 2026)).toBeNull();
  });

  it('mes inicial: el actual si tiene gestiones; si no, el más reciente', () => {
    const conteo = { '09': 116, '10': 162, 11: 19 };
    expect(mesMasRecienteConDatos(conteo, '11')).toBe('11');
    expect(mesMasRecienteConDatos({ '09': 116, '10': 162 }, '11')).toBe('10');
    expect(mesMasRecienteConDatos({ '12': 3 }, '11')).toBe('12');
    expect(mesMasRecienteConDatos(conteo, '12')).toBe('11');
    expect(mesMasRecienteConDatos(conteo, '00')).toBe('09');
    expect(mesMasRecienteConDatos({}, '11')).toBeNull();
  });
});

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
