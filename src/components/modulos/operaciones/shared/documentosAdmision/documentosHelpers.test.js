import { describe, it, expect } from 'vitest';
import {
  idDesdeNombre,
  idCoincide,
  tipoDesdeNombre,
  esPdf,
  nombreParaStorage,
  nombreDisponible,
  clasificarArchivos,
  ordenarDocumentos
} from './documentosHelpers';

const pdf = (name) => ({ name, type: 'application/pdf' });

describe('idDesdeNombre / idCoincide', () => {
  it('lee el id antes del primer " - "', () => {
    expect(idDesdeNombre('102030 - JOSE PEREZ - DP.pdf')).toBe('102030');
    expect(idDesdeNombre('  102030   -   JOSE PEREZ - DP.pdf')).toBe('102030');
  });

  it("'' si no hay separador o el id viene vacío", () => {
    expect(idDesdeNombre('escaneo.pdf')).toBe('');
    expect(idDesdeNombre(' - JOSE PEREZ - DP.pdf')).toBe('');
    expect(idDesdeNombre('102030-JOSE PEREZ.pdf')).toBe('');
  });

  it('comparación exacta, ignorando solo espacios', () => {
    expect(idCoincide('102030 - JOSE PEREZ - DP.pdf', '102030')).toBe(true);
    expect(idCoincide(' 102030  -  JOSE PEREZ - DP.pdf', ' 102030 ')).toBe(true);
    expect(idCoincide('104030 - JOSE PEREZ - DP.pdf', '102030')).toBe(false);
    expect(idCoincide('1020300 - JOSE PEREZ - DP.pdf', '102030')).toBe(false);
    expect(idCoincide('02030 - JOSE PEREZ - DP.pdf', '102030')).toBe(false);
    expect(idCoincide('escaneo.pdf', '102030')).toBe(false);
  });
});

describe('tipoDesdeNombre', () => {
  it('reconoce DP, RP, INF y COT sin distinguir mayúsculas y con espacios extra', () => {
    expect(tipoDesdeNombre('102030 - JOSE PEREZ - DP.pdf')).toBe('DP');
    expect(tipoDesdeNombre('102030 - JOSE PEREZ -   rp.pdf')).toBe('RP');
    expect(tipoDesdeNombre('102030 - JOSE PEREZ - inf 12345678 - EMPRESA.pdf')).toBe('INF');
    expect(tipoDesdeNombre('102030 - JOSE PEREZ - COT12345678 - EMPRESA.PDF')).toBe('COT');
    expect(tipoDesdeNombre('102030 - JOSE PEREZ - RP (2).pdf')).toBe('RP');
  });

  it('no confunde palabras que solo empiezan igual ni la empresa', () => {
    expect(tipoDesdeNombre('102030 - JOSE PEREZ - DPTO.pdf')).toBeNull();
    expect(tipoDesdeNombre('102030 - JOSE PEREZ - COT 1 - RP MEDICAL.pdf')).toBe('COT');
  });

  it('respeta apellidos con guion', () => {
    expect(tipoDesdeNombre('102030 - JOSE PEREZ-SOTO - DP.pdf')).toBe('DP');
  });

  it('null si no hay tipo reconocible', () => {
    expect(tipoDesdeNombre('102030 - JOSE PEREZ - EXAMEN.pdf')).toBeNull();
    expect(tipoDesdeNombre('102030 - JOSE PEREZ.pdf')).toBeNull();
  });
});

describe('esPdf', () => {
  it('exige extensión .pdf y MIME application/pdf', () => {
    expect(esPdf({ name: 'a.PDF', type: 'application/pdf' })).toBe(true);
    expect(esPdf({ name: 'a.pdf', type: 'image/png' })).toBe(false);
    expect(esPdf({ name: 'a.png', type: 'application/pdf' })).toBe(false);
    expect(esPdf(null)).toBe(false);
  });
});

describe('nombreParaStorage', () => {
  it('mantiene el nombre original y normaliza la extensión', () => {
    expect(nombreParaStorage('102030 - JOSE PEREZ - COT 12345678 - EMPRESA.PDF'))
      .toBe('102030 - JOSE PEREZ - COT 12345678 - EMPRESA.pdf');
  });

  it('reemplaza caracteres que rompen la ruta', () => {
    expect(nombreParaStorage('102030 - A - COT 1 - MEDI#CAL [CL]*?.pdf')).toBe('102030 - A - COT 1 - MEDI_CAL _CL___.pdf');
  });
});

describe('nombreDisponible', () => {
  it('usa el nombre tal cual si no existe', () => {
    expect(nombreDisponible('102030 - JOSE PEREZ - RP.pdf', [])).toBe('102030 - JOSE PEREZ - RP.pdf');
  });

  it('agrega (2), (3)... sin sobrescribir, sin distinguir mayúsculas', () => {
    const existentes = ['102030 - JOSE PEREZ - RP.pdf', '102030 - jose perez - rp (2).pdf'];
    expect(nombreDisponible('102030 - JOSE PEREZ - RP.pdf', existentes)).toBe('102030 - JOSE PEREZ - RP (3).pdf');
  });
});

describe('clasificarArchivos', () => {
  it('separa válidos y rechazados con su motivo', () => {
    const { validos, rechazados } = clasificarArchivos([
      pdf('102030 - JOSE PEREZ - DP.pdf'),
      pdf('104030 - JOSE PEREZ - DP.pdf'),
      pdf('escaneo.pdf'),
      { name: 'foto.png', type: 'image/png' },
      pdf('102030 - JOSE PEREZ - EXAMEN.pdf'),
    ], '102030');

    expect(validos.map(f => f.name)).toEqual(['102030 - JOSE PEREZ - DP.pdf', '102030 - JOSE PEREZ - EXAMEN.pdf']);
    expect(rechazados.map(r => r.nombre)).toEqual(['104030 - JOSE PEREZ - DP.pdf', 'escaneo.pdf', 'foto.png']);
    expect(rechazados[0].motivo).toBe("El archivo '104030 - JOSE PEREZ - DP.pdf' no corresponde a la admisión 102030. No se subió.");
    // PDF con id distinto o ilegible se pueden enviar al respaldo; un no-PDF no.
    expect(rechazados.map(r => Boolean(r.respaldable))).toEqual([true, true, false]);
  });
});

describe('ordenarDocumentos', () => {
  it('ordena DP, RP, INF, COT, Sin tipo; numérico dentro del tipo', () => {
    const lista = [
      { nombre: 'x - y - COT 1 - E (10).pdf', tipo: 'COT' },
      { nombre: 'otro.pdf', tipo: null },
      { nombre: 'x - y - INF 1 - E.pdf', tipo: 'INF' },
      { nombre: 'x - y - COT 1 - E (2).pdf', tipo: 'COT' },
      { nombre: 'x - y - RP.pdf', tipo: 'RP' },
      { nombre: 'x - y - DP.pdf', tipo: 'DP' },
    ];
    expect(ordenarDocumentos(lista).map(d => d.nombre)).toEqual([
      'x - y - DP.pdf',
      'x - y - RP.pdf',
      'x - y - INF 1 - E.pdf',
      'x - y - COT 1 - E (2).pdf',
      'x - y - COT 1 - E (10).pdf',
      'otro.pdf',
    ]);
  });
});
