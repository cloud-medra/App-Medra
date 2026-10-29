import { describe, it, expect } from 'vitest';
import { buscarEmpresaMaestro, claveFlexibleEmpresa } from './empresaMaestro';

describe('claveFlexibleEmpresa', () => {
  it('quita puntuación, espacios repetidos y el sufijo societario', () => {
    expect(claveFlexibleEmpresa('SOCIEDAD COMERCIALIZADORA DE INSUMOS MEDICOS CLP S.A.')).toBe('sociedad comercializadora de insumos medicos clp');
    expect(claveFlexibleEmpresa('Médica  Sur, S. A.')).toBe('medica sur');
    expect(claveFlexibleEmpresa('Comercial X SpA')).toBe('comercial x');
    expect(claveFlexibleEmpresa('Comercial X Ltda.')).toBe('comercial x');
    expect(claveFlexibleEmpresa('Comercial X Limitada')).toBe('comercial x');
    expect(claveFlexibleEmpresa('Insumos Y E.I.R.L.')).toBe('insumos y');
  });

  it('no quita el sufijo si es todo el nombre ni lo busca en medio', () => {
    expect(claveFlexibleEmpresa('SpA')).toBe('spa');
    expect(claveFlexibleEmpresa('Spa Clinic Chile')).toBe('spa clinic chile');
  });
});

describe('buscarEmpresaMaestro', () => {
  const EMPRESAS = [
    { id: '1', nombre: 'Médica Sur S.A.', rut: '76.111.111-1' },
    { id: '2', nombre: 'Comercial X SpA', rut: '76.222.222-2' },
    { id: '3', nombre: 'Comercial X Ltda', rut: '76.333.333-3' },
    { id: '4', nombre: 'Insumos Norte Limitada', rut: '' }
  ];

  it('primero busca el nombre exacto, sin mayúsculas ni tildes', () => {
    expect(buscarEmpresaMaestro('MEDICA SUR S.A.', EMPRESAS)?.id).toBe('1');
    expect(buscarEmpresaMaestro('comercial x ltda', EMPRESAS)?.id).toBe('3');
  });

  it('si no hay exacto, usa la clave flexible con una sola coincidencia', () => {
    expect(buscarEmpresaMaestro('MEDICA SUR SA', EMPRESAS)?.id).toBe('1');
    expect(buscarEmpresaMaestro('Insumos Norte Ltda.', EMPRESAS)?.id).toBe('4');
  });

  it('con más de una coincidencia flexible no devuelve ninguna', () => {
    expect(buscarEmpresaMaestro('Comercial X S.A.', EMPRESAS)).toBeNull();
  });

  it('sin coincidencia o sin nombre devuelve null', () => {
    expect(buscarEmpresaMaestro('Otra Empresa', EMPRESAS)).toBeNull();
    expect(buscarEmpresaMaestro('', EMPRESAS)).toBeNull();
    expect(buscarEmpresaMaestro('Médica Sur', [])).toBeNull();
  });
});
