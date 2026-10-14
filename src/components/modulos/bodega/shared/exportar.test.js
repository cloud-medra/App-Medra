import { describe, it, expect } from 'vitest';
import { aTabla, nombreArchivo } from './exportar';

describe('aTabla', () => {
  it('arma filas con los títulos como claves y vacío para null', () => {
    const columnas = [{ titulo: 'Producto', valor: (f) => f.n }, { titulo: 'Cant.', valor: (f) => f.c }];
    expect(aTabla(columnas, [{ n: 'Gasa', c: 3 }, { n: 'X', c: null }])).toEqual([{ Producto: 'Gasa', 'Cant.': 3 }, { Producto: 'X', 'Cant.': '' }]);
  });
});

describe('nombreArchivo', () => {
  it('quita tildes y caracteres raros', () => expect(nombreArchivo('tránsito PABELLÓN/1', 'pdf')).toMatch(/^transito_PABELLON_1_\d{4}-\d{2}-\d{2}\.pdf$/));
});
