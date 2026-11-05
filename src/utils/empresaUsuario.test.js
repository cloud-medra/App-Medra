import { describe, it, expect, vi } from 'vitest';

vi.mock('firebase/firestore', () => ({
  where: (campo, op, valor) => ({ campo, op, valor }),
  query: (coleccion, ...restricciones) => ({ coleccion, restricciones }),
}));

const { filtroEmpresa, consultaDeEmpresa } = await import('./empresaUsuario');

const EXTERNO = { tipoUsuario: 'externo', empresaId: 'e1' };

describe('filtroEmpresa', () => {
  it('un externo siempre filtra por su empresa, aunque pida otra', () => {
    expect(filtroEmpresa(EXTERNO)).toEqual([{ campo: 'empresaId', op: '==', valor: 'e1' }]);
    expect(filtroEmpresa(EXTERNO, { empresaId: 'e2' })).toEqual([{ campo: 'empresaId', op: '==', valor: 'e1' }]);
  });

  it('un externo sin empresa da error en vez de consultar sin filtro', () => {
    expect(() => filtroEmpresa({ tipoUsuario: 'externo' })).toThrow(/no tiene una empresa/);
  });

  it('un interno no filtra, salvo que elija una empresa', () => {
    expect(filtroEmpresa({ rol: 'operador' })).toEqual([]);
    expect(filtroEmpresa({ rol: 'operador', empresaId: 'e9' })).toEqual([]);
    expect(filtroEmpresa({ rol: 'operador' }, { empresaId: 'e2' })).toEqual([{ campo: 'empresaId', op: '==', valor: 'e2' }]);
  });
});

describe('consultaDeEmpresa', () => {
  it('pone el filtro de empresa antes de las demás restricciones', () => {
    const consulta = consultaDeEmpresa('coleccion', EXTERNO, 'orden');
    expect(consulta).toEqual({ coleccion: 'coleccion', restricciones: [{ campo: 'empresaId', op: '==', valor: 'e1' }, 'orden'] });
  });
});
