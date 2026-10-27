import { describe, it, expect } from 'vitest';
import {
  ZONAS, ID_ZONAS, normalizarDescripcion, esDescripcionValida, idDescripcion, sugerirZonas, ladoEfectivo, ladosAResaltar,
} from '../../../../functions/bodymap/nucleo.mjs';
import { formasDe, resaltada, cajaZona } from './geometriaCuerpo';

describe('normalización de la descripción', () => {
  it('mayúsculas, sin tildes ni espacios extra; mismo id para variantes de formato', () => {
    expect(normalizarDescripcion('  Ruptura   manguito  rotadóres ')).toBe('RUPTURA MANGUITO ROTADORES');
    expect(idDescripcion('ruptura manguito rotadores')).toBe(idDescripcion('RUPTURA  MANGUITO ROTADORES'));
    expect(idDescripcion('EPIFISIODESIS(FEMUR Y/O TIBIA)')).not.toContain('/');
  });
  it('excluye "P", vacías y rellenos', () => {
    ['P', ' p ', '', null, undefined, '-', 'Cargando...'].forEach((v) => expect(esDescripcionValida(v)).toBe(false));
    expect(esDescripcionValida('RODILLA')).toBe(true);
  });
});

describe('sugerencias por palabras clave', () => {
  const zonas = (t) => sugerirZonas(t).zonas;
  it('casos reales', () => {
    expect(zonas('RUPTURA MANGUITO ROTADORES')).toEqual(['hombro']);
    expect(zonas('MENISCECTOMIA U OTRAS INTERVENCIONES')).toEqual(['rodilla']);
    expect(zonas('FRACTURA DE MANO O PIE C/U')).toEqual(['mano', 'pie']);
    expect(zonas('FRACTURA DE CUELLO DE FEMUR')).toEqual(['cadera']);
    expect(zonas('EPIFISIODESIS(FEMUR Y/O TIBIA)')).toEqual(['muslo', 'pierna']);
    expect(zonas('FRACTURAS CONDILEAS DE PLATILLOS TIBIALE')).toEqual(['rodilla']);
    expect(zonas('URETERO-LITOTOMIA ENDOSCOPICA')).toEqual(['abdomen', 'pelvis']);
    expect(zonas('ARTROSCOPIA DIAGNOSTICA C/S BIOPSIA')).toEqual([]);
  });
  it('por palabra completa o inicio de palabra, no por subcadena', () => {
    expect(zonas('OSTEOSINTESIS RADIO')).toEqual(['antebrazo']);
    expect(zonas('ABLACION POR RADIOFRECUENCIA')).toEqual([]);
    expect(zonas('LESION DE MENISCO')).toEqual(['rodilla']); // MENISC al inicio
    expect(zonas('PIEL')).toEqual([]); // PIE$ es palabra completa
  });
  it('columna: CERVICAL, DORSAL/TORACICA o lumbar si va sola', () => {
    expect(zonas('ARTRODESIS COLUMNA')).toEqual(['columna_lumbar']);
    expect(zonas('ARTRODESIS COLUMNA CERVICAL')).toEqual(['columna_cervical']);
    expect(zonas('FRACTURA COLUMNA TORACICA')).toEqual(['columna_dorsal']);
    expect(zonas('COLUMNA DORSAL')).toEqual(['columna_dorsal']);
  });
  it('lateralidad si la descripción la dice', () => {
    expect(sugerirZonas('LUXACION HOMBRO DERECHO').lado).toBe('derecho');
    expect(sugerirZonas('RODILLA IZQUIERDA').lado).toBe('izquierdo');
    expect(sugerirZonas('RODILLA DERECHA E IZQUIERDA').lado).toBe('bilateral');
    expect(sugerirZonas('RODILLA').lado).toBe('no_especificado');
  });
  it('lado efectivo: el de la gestión manda; sin especificar, ambos lados', () => {
    expect(ladoEfectivo('izquierdo', 'derecho')).toBe('izquierdo');
    expect(ladoEfectivo('no_especificado', 'derecho')).toBe('derecho');
    expect(ladoEfectivo(undefined, undefined)).toBe('no_especificado');
    expect(ladosAResaltar('derecho')).toEqual(['der']);
    expect(ladosAResaltar('no_especificado')).toEqual(['der', 'izq']);
    expect(ladosAResaltar('bilateral')).toEqual(['der', 'izq']);
  });
});

describe('geometría del cuerpo', () => {
  it('las 20 zonas están dibujadas, las laterales con lado derecho e izquierdo', () => {
    const formas = [...formasDe('anterior'), ...formasDe('posterior')];
    expect(new Set(formas.map((f) => f.zona))).toEqual(new Set(ID_ZONAS));
    ZONAS.filter((z) => z.lateral).forEach((z) => {
      expect(new Set(formasDe('anterior').filter((f) => f.zona === z.id).map((f) => f.lado))).toEqual(new Set(['der', 'izq']));
    });
  });
  it('de frente el lado derecho del paciente queda a la izquierda del lienzo; de espaldas, a la derecha', () => {
    const hombroDer = (vista) => formasDe(vista).find((f) => f.zona === 'hombro' && f.lado === 'der');
    expect(hombroDer('anterior').reflejada).toBe(false);
    expect(hombroDer('posterior').reflejada).toBe(true);
  });
  it('resalta solo el lado pedido; la cara no se ve de espaldas', () => {
    const hombros = formasDe('anterior').filter((f) => f.zona === 'hombro');
    expect(hombros.filter((f) => resaltada(f, ['hombro'], 'derecho')).map((f) => f.lado)).toEqual(['der']);
    expect(hombros.filter((f) => resaltada(f, ['hombro'], 'no_especificado'))).toHaveLength(2);
    expect(cajaZona('posterior', 'cara', 'no_especificado')).toBeNull();
    expect(cajaZona('anterior', 'rodilla', 'derecho')).toHaveLength(4);
  });
});

describe('"Sin zona específica"', () => {
  it('tiene nombre propio, no es una zona del cuerpo y nunca se sugiere', async () => {
    const n = await import('../../../../functions/bodymap/nucleo.mjs');
    expect(n.nombreZona(n.SIN_ZONA_ESPECIFICA)).toBe('Sin zona específica');
    expect(n.nombreZona('rodilla')).toBe('Rodilla');
    expect(n.ID_ZONAS).not.toContain(n.SIN_ZONA_ESPECIFICA);
    expect(n.esSinZonaEspecifica(['sin_zona_especifica'])).toBe(true);
    expect(n.esSinZonaEspecifica([])).toBe(false);
    expect(n.sugerirZonas('BIOPSIA SIN ZONA ESPECIFICA').zonas).toEqual([]);
  });
});
