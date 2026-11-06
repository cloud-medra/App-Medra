import { describe, it, expect } from 'vitest';
import { fechaCorta, indicadoresUso } from './historialUsoVista';

describe('indicadoresUso', () => {
  it('cuenta una vez cada gestión aunque esté en médico y en descripción', () => {
    expect(indicadoresUso({
      medicos: {
        k1: { nombre: 'A', gestiones: { g1: '2026-11-05', g2: '2026-10-12' } },
        k2: { nombre: 'B', gestiones: { g3: '2026-11-07' } },
      },
      descripciones: { k3: { nombre: 'X', gestiones: { g1: '2026-11-05', g2: '2026-10-12', g3: '2026-11-07' } } },
    })).toEqual({ totalUsos: 3, medicos: 2, descripciones: 1, ultimoUso: '2026-11-07' });
  });

  it('incluye una gestión que solo aportó descripción', () => {
    expect(indicadoresUso({
      medicos: {},
      descripciones: { k1: { nombre: 'X', gestiones: { g1: '2026-11-05' } } },
    })).toEqual({ totalUsos: 1, medicos: 0, descripciones: 1, ultimoUso: '2026-11-05' });
  });

  it('sin datos queda en cero', () => {
    expect(indicadoresUso(null)).toEqual({ totalUsos: 0, medicos: 0, descripciones: 0, ultimoUso: '' });
  });
});

describe('fechaCorta', () => {
  it('muestra dd-mm-aaaa y un guion si no hay fecha', () => {
    expect(fechaCorta('2026-11-05')).toBe('05-11-2026');
    expect(fechaCorta('')).toBe('—');
  });
});
