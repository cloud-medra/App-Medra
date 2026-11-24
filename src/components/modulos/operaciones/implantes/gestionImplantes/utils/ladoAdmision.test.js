import { describe, it, expect } from 'vitest';
import {
  ladoAGuardar, valoresAdmision, unirGestionesDeAdmision, gestionesParaPropagarLado,
  ladoDeAdmision, debeLeerAdmisionParaLado, planLadoAlGuardar,
} from './ladoAdmision';

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

describe('Lado al guardar desde el formulario (planLadoAlGuardar)', () => {
  const derecha1 = docDe('implantes_gestiones/a', { lado: 'derecho' });
  const derecha2 = docDe('implantes_gestiones/b', { lado: 'derecho' });
  const sinLado = docDe('implantes_gestiones/c');
  const izquierda = docDe('implantes_gestiones/d', { lado: 'izquierdo' });

  it('gestión nueva con "No especificado" en una admisión con "Derecho": NUNCA sobrescribe las otras y hereda Derecho', () => {
    const plan = planLadoAlGuardar({
      ladoFormulario: 'no_especificado', ladoGuardado: undefined, esNueva: true,
      gestionesAdmision: [derecha1, derecha2, sinLado], rutaGuardada: null,
    });
    expect(plan.propagarA).toEqual([]);
    expect(plan.campoLado).toEqual({ lado: 'derecho' });
    expect(plan.heredado).toBe(true);
  });

  it('gestión nueva con "No especificado" nunca propaga, aunque la admisión tenga lados distintos o ninguno', () => {
    for (const gestiones of [[derecha1, izquierda], [sinLado], [], null]) {
      const plan = planLadoAlGuardar({ ladoFormulario: 'no_especificado', esNueva: true, gestionesAdmision: gestiones });
      expect(plan.propagarA).toEqual([]);
      expect(plan.campoLado).toEqual({});
      expect(plan.heredado).toBe(false);
    }
  });

  it('gestión nueva con un lado elegido: se aplica a todas las de la admisión que tengan otro', () => {
    const plan = planLadoAlGuardar({ ladoFormulario: 'izquierdo', esNueva: true, gestionesAdmision: [derecha1, sinLado, izquierda] });
    expect(plan.campoLado).toEqual({ lado: 'izquierdo' });
    expect(plan.heredado).toBe(false);
    expect(plan.propagarA).toEqual([derecha1, sinLado]);
  });

  it('edición que cambia el lado: propaga a las demás, sin repetir la editada', () => {
    const plan = planLadoAlGuardar({
      ladoFormulario: 'bilateral', ladoGuardado: 'derecho', esNueva: false,
      gestionesAdmision: [derecha1, derecha2], rutaGuardada: 'implantes_gestiones/a',
    });
    expect(plan.campoLado).toEqual({ lado: 'bilateral' });
    expect(plan.propagarA).toEqual([derecha2]);
  });

  it('edición sin cambiar el lado: no escribe ni hereda', () => {
    const plan = planLadoAlGuardar({ ladoFormulario: 'no_especificado', ladoGuardado: undefined, esNueva: false, gestionesAdmision: [derecha1] });
    expect(plan).toEqual({ campoLado: {}, heredado: false, propagarA: [] });
  });

  it('ladoDeAdmision: el único lado especificado; con varios distintos o ninguno, null', () => {
    expect(ladoDeAdmision([derecha1, sinLado, derecha2])).toBe('derecho');
    expect(ladoDeAdmision([derecha1, izquierda])).toBeNull();
    expect(ladoDeAdmision([sinLado])).toBeNull();
  });

  it('debeLeerAdmisionParaLado: si es nueva o cambió el lado, y nunca sin admisión', () => {
    expect(debeLeerAdmisionParaLado({ ladoFormulario: 'no_especificado', esNueva: true, admision: '102' })).toBe(true);
    expect(debeLeerAdmisionParaLado({ ladoFormulario: 'derecho', ladoGuardado: 'izquierdo', esNueva: false, admision: '102' })).toBe(true);
    expect(debeLeerAdmisionParaLado({ ladoFormulario: 'derecho', ladoGuardado: 'derecho', esNueva: false, admision: '102' })).toBe(false);
    expect(debeLeerAdmisionParaLado({ ladoFormulario: 'derecho', esNueva: true, admision: 'SIN_ADMISION' })).toBe(false);
  });
});
