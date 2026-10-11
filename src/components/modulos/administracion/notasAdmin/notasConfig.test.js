import { describe, it, expect, vi } from 'vitest';

vi.mock('firebase/firestore', () => ({ where: (...a) => ({ where: a }) }));
const {
  consultaNotas, rolesDeNota, veTodasLasNotas, normalizarEstilo, estiloVisualNota,
  contraste, contrasteEstilo, CONTRASTE_MINIMO,
} = await import('./notasConfig');

describe('consulta por rol', () => {
  it('Desarrollador: sin filtro; el resto filtra por su rol (sin rol = operador)', () => {
    expect(consultaNotas({ rol: 'dev' })).toEqual({ clave: 'todas', restricciones: [] });
    expect(consultaNotas({ rol: 'encargado' })).toEqual({
      clave: 'rol:encargado', restricciones: [{ where: ['rolesVisibles', 'array-contains', 'encargado'] }],
    });
    expect(consultaNotas({}).clave).toBe('rol:operador');
    expect(veTodasLasNotas({ rol: 'admin' })).toBe(false);
  });

  it('rolesDeNota: en orden fijo; sin campo (nota vieja) = todos', () => {
    expect(rolesDeNota({ rolesVisibles: ['encargado', 'admin'] })).toEqual(['admin', 'encargado']);
    expect(rolesDeNota({})).toEqual(['admin', 'operador', 'encargado']);
  });
});

describe('estilo', () => {
  it('sin estilo: aspecto de siempre (sin estilos inline)', () => {
    expect(estiloVisualNota({})).toEqual({ fondoPropio: false, textoPropio: false, negrita: false, contenedor: {}, texto: {} });
    expect(contrasteEstilo(undefined)).toBeNull();
  });

  it('normaliza colores inválidos a null y negrita a booleano', () => {
    expect(normalizarEstilo({ fondo: 'red', texto: '#abcdef', negrita: 'si' })).toEqual({ fondo: null, texto: '#ABCDEF', negrita: false });
  });

  it('fondo oscuro sin color de texto: texto blanco automático', () => {
    const v = estiloVisualNota({ estilo: { fondo: '#1E3A8A' } });
    expect(v.contenedor.backgroundColor).toBe('#1E3A8A');
    expect(v.texto.color).toBe('#FFFFFF');
  });

  it('solo color de texto: fija el fondo claro (legible también en modo oscuro)', () => {
    const v = estiloVisualNota({ estilo: { texto: '#1D4ED8', negrita: true } });
    expect(v.contenedor.backgroundColor).toBe('#F9FAFB');
    expect(v.texto).toEqual({ color: '#1D4ED8', fontWeight: 700 });
  });

  it('contraste WCAG: negro/blanco 21:1; amarillo sobre blanco bajo el mínimo', () => {
    expect(contraste('#000000', '#FFFFFF')).toBeCloseTo(21, 0);
    expect(contrasteEstilo({ fondo: '#FFFFFF', texto: '#FDE68A' })).toBeLessThan(CONTRASTE_MINIMO);
    expect(contrasteEstilo({ fondo: '#FEF3C7', texto: '#111827' })).toBeGreaterThan(CONTRASTE_MINIMO);
  });
});
