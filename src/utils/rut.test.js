import { describe, it, expect } from 'vitest';
import { formatearRut } from './rut';

describe('formatearRut', () => {
  it('agrega puntos y guion, con el dígito verificador en mayúscula', () => {
    expect(formatearRut('123456789')).toBe('12.345.678-9');
    expect(formatearRut('7654321k')).toBe('7.654.321-K');
  });

  it('deja igual un RUT ya formateado y limpia espacios u otros caracteres', () => {
    expect(formatearRut('12.345.678-9')).toBe('12.345.678-9');
    expect(formatearRut(' 76 543 210-k ')).toBe('76.543.210-K');
  });

  it('vacío o de un carácter queda tal cual', () => {
    expect(formatearRut('')).toBe('');
    expect(formatearRut(null)).toBe('');
    expect(formatearRut('5')).toBe('5');
  });
});
