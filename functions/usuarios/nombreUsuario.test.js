import { describe, it, expect } from 'vitest';
import { errorNombreUsuario, normalizarNombreUsuario, normalizarIdentificador, esCorreo } from './nombreUsuario.mjs';

describe('nombre de usuario', () => {
  it('obligatorio, sin "@" ni espacios, sin caracteres que no sirven de id', () => {
    expect(errorNombreUsuario('jperez')).toBe('');
    expect(errorNombreUsuario('  J.Perez_2-a  ')).toBe('');
    expect(errorNombreUsuario('')).toMatch(/obligatorio/);
    expect(errorNombreUsuario('   ')).toMatch(/obligatorio/);
    expect(errorNombreUsuario(undefined)).toMatch(/obligatorio/);
    expect(errorNombreUsuario('jperez@medra.cl')).toMatch(/"@"/);
    expect(errorNombreUsuario('juan perez')).toMatch(/espacios/);
    expect(errorNombreUsuario('juan\tperez')).toMatch(/espacios/);
    expect(errorNombreUsuario('a/b')).toMatch(/no permitidos/);
    expect(errorNombreUsuario('..')).toMatch(/no permitidos/);
    expect(errorNombreUsuario('__x__')).toMatch(/no permitidos/);
    expect(errorNombreUsuario('a'.repeat(51))).toMatch(/hasta 50/);
  });

  it('se compara sin mayúsculas ni espacios alrededor', () => {
    expect(normalizarNombreUsuario('  JPerez ')).toBe('jperez');
    expect(normalizarIdentificador('  Ana@Medra.CL ')).toBe('ana@medra.cl');
    expect(esCorreo('ana@medra.cl')).toBe(true);
    expect(esCorreo('jperez')).toBe(false);
  });
});
