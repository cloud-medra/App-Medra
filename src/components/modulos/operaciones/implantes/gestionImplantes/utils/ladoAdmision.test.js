import { describe, it, expect } from 'vitest';
import { ladoAGuardar, valoresAdmision, unirGestionesDeAdmision, gestionesParaPropagarLado } from './ladoAdmision';

const docDe = (path, data = {}) => ({ ref: { path }, data: () => data });

describe('ladoAGuardar', () => {
  it('escribe solo si cambió (sin campo guardado = No especificado)', () => {
    expect(ladoAGuardar('derecho', undefined)).toEqual({ lado: 'derecho' });
    expect(ladoAGuardar('derecho', 'izquierdo')).toEqual({ lado: 'derecho' });
    expect(ladoAGuardar('derecho', 'derecho')).toEqual({});
    expect(ladoAGuardar('no_especificado', undefined)).toEqual({});
    expect(ladoAGuardar('no_especificado', 'bilateral')).toEqual({ lado: 'no_especificado' });
    expect(ladoAGuardar(undefined, 'derecho')).toEqual({});
  });
});

describe('búsqueda por admisión', () => {
  it('valoresAdmision: texto y número si es numérica', () => {
    expect(valoresAdmision(' 102 ')).toEqual(['102', 102]);
    expect(valoresAdmision('A-1')).toEqual(['A-1']);
  });

  it('unirGestionesDeAdmision: solo implantes_gestiones y sin repetir', () => {
    const a = docDe('implantes_gestiones/2026/mes/11/dia/01/admision/102/empresa/X/detalles/1');
    const b = docDe('implantes_gestiones/2026/mes/11/dia/02/admision/102/empresa/Y/detalles/2');
    const h = docDe('hemodinamia_gestiones/2026/mes/11/dia/01/admision/102/empresa/X/detalles/3');
    expect(unirGestionesDeAdmision([a, h], [a, b])).toEqual([a, b]);
  });

  it('gestionesParaPropagarLado: las otras con un lado distinto', () => {
    const guardada = docDe('implantes_gestiones/a', { lado: 'derecho' });
    const igual = docDe('implantes_gestiones/b', { lado: 'derecho' });
    const distinta = docDe('implantes_gestiones/c', { lado: 'izquierdo' });
    const sinLado = docDe('implantes_gestiones/d');
    expect(gestionesParaPropagarLado([guardada, igual, distinta, sinLado], 'derecho', 'implantes_gestiones/a'))
      .toEqual([distinta, sinLado]);
    expect(gestionesParaPropagarLado([sinLado], 'no_especificado', 'x')).toEqual([]);
  });
});
