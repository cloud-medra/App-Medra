import { describe, it, expect } from 'vitest';
import { formatoPesos } from './formato';

describe('formatoPesos', () => {
  it('signo antes del peso', () => {
    expect(formatoPesos(1234.4)).toBe('$1.234');
    expect(formatoPesos(-500)).toBe('-$500');
  });
});
