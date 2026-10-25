import { describe, it, expect } from 'vitest';
import {
  FORM_VACIO, LARGO_MAXIMO, normalizarInstitucion, validarInstitucion, idsADesmarcar,
  institucionesActivas, elegirInstitucion, claveSeleccion,
} from './instituciones';

const inst = (id, nombre, extra = {}) => ({ id, nombre, activa: true, predeterminada: false, ...extra });

describe('normalizarInstitucion', () => {
  it('recorta textos y completa los opcionales', () => {
    expect(normalizarInstitucion({ nombre: '  Clínica Norte ', ciudad: ' Arica ' })).toEqual({
      ...FORM_VACIO, nombre: 'Clínica Norte', ciudad: 'Arica',
    });
  });

  it('una inactiva no puede ser la predeterminada', () => {
    expect(normalizarInstitucion({ nombre: 'X', activa: false, predeterminada: true }))
      .toMatchObject({ activa: false, predeterminada: false });
    expect(normalizarInstitucion({ nombre: 'X', predeterminada: true }))
      .toMatchObject({ activa: true, predeterminada: true });
  });
});

describe('validarInstitucion', () => {
  const valida = normalizarInstitucion({ nombre: 'Clínica Norte', email: 'contacto@norte.cl' });

  it('acepta datos completos y solo el nombre', () => {
    expect(validarInstitucion(valida)).toBeNull();
    expect(validarInstitucion(normalizarInstitucion({ nombre: 'Solo nombre' }))).toBeNull();
  });

  it('exige el nombre', () => {
    expect(validarInstitucion(normalizarInstitucion({ nombre: '   ' }))).toBe('El nombre es obligatorio');
  });

  it('respeta los largos máximos de las reglas', () => {
    const largo = normalizarInstitucion({ nombre: 'X', ciudad: 'a'.repeat(LARGO_MAXIMO.ciudad + 1) });
    expect(validarInstitucion(largo)).toMatch(/ciudad/);
  });

  it('revisa el formato del email', () => {
    expect(validarInstitucion(normalizarInstitucion({ nombre: 'X', email: 'sin-arroba' }))).toBe('El email no es válido');
  });

  it('no repite nombres (sin distinguir mayúsculas), salvo la que se edita', () => {
    const existentes = [inst('a', 'Clínica Norte')];
    expect(validarInstitucion(normalizarInstitucion({ nombre: 'clínica norte' }), existentes))
      .toBe('Ya existe una institución con ese nombre');
    expect(validarInstitucion(normalizarInstitucion({ nombre: 'Clínica Norte' }), existentes, 'a')).toBeNull();
  });
});

describe('idsADesmarcar (una sola predeterminada)', () => {
  it('devuelve las demás predeterminadas', () => {
    const lista = [inst('a', 'A', { predeterminada: true }), inst('b', 'B'), inst('c', 'C', { predeterminada: true })];
    expect(idsADesmarcar(lista, 'b')).toEqual(['a', 'c']);
    expect(idsADesmarcar(lista, 'a')).toEqual(['c']);
    expect(idsADesmarcar([inst('a', 'A')], 'a')).toEqual([]);
  });
});

describe('selección del header', () => {
  const lista = [
    inst('z', 'Zeta'),
    inst('p', 'Principal', { predeterminada: true }),
    inst('i', 'Inactiva', { activa: false }),
    inst('a', 'Alfa'),
  ];

  it('ofrece solo las activas, por nombre', () => {
    expect(institucionesActivas(lista).map((i) => i.id)).toEqual(['a', 'p', 'z']);
  });

  it('usa la elegida si sigue activa', () => {
    expect(elegirInstitucion(lista, 'z').id).toBe('z');
  });

  it('sin elección válida: la predeterminada', () => {
    expect(elegirInstitucion(lista, null).id).toBe('p');
    expect(elegirInstitucion(lista, 'i').id).toBe('p');
    expect(elegirInstitucion(lista, 'borrada').id).toBe('p');
  });

  it('sin predeterminada activa: la primera activa; sin activas: null', () => {
    const sinPredeterminada = lista.filter((i) => i.id !== 'p');
    expect(elegirInstitucion(sinPredeterminada, null).id).toBe('a');
    expect(elegirInstitucion([inst('i', 'Inactiva', { activa: false })], null)).toBeNull();
    expect(elegirInstitucion([], null)).toBeNull();
  });

  it('la elección se guarda por usuario', () => {
    expect(claveSeleccion('u1')).toBe('medra.institucion.u1');
  });
});
