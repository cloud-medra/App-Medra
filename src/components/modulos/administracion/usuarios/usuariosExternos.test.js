import { describe, it, expect } from 'vitest';
import { opcionesEmpresa, datosEmpresa } from './usuariosExternos';

const EMPRESAS = [
  { id: 'b', nombre: 'BETA', estado: 'ACTIVO' },
  { id: 'a', nombre: 'ALFA', estado: 'ACTIVO' },
  { id: 'i', nombre: 'INACTIVA', estado: 'INACTIVO' },
];

describe('opcionesEmpresa', () => {
  it('solo activas, por nombre, con la opción vacía primero', () => {
    expect(opcionesEmpresa(EMPRESAS, '').map((o) => o.value)).toEqual(['', 'a', 'b']);
  });

  it('mantiene a la vista la asignada si está inactiva o eliminada', () => {
    expect(opcionesEmpresa(EMPRESAS, 'i').at(-1)).toEqual({ value: 'i', label: 'INACTIVA (empresa inactiva)' });
    expect(opcionesEmpresa(EMPRESAS, 'x').at(-1)).toEqual({ value: 'x', label: 'Empresa eliminada (eliminada)' });
  });

  it('sin catálogo no falla', () => {
    expect(opcionesEmpresa(undefined, '')).toHaveLength(1);
  });
});

describe('datosEmpresa', () => {
  it('nombre y aviso según el estado', () => {
    expect(datosEmpresa(EMPRESAS, 'a')).toEqual({ nombre: 'ALFA', aviso: '' });
    expect(datosEmpresa(EMPRESAS, 'i')).toEqual({ nombre: 'INACTIVA', aviso: 'Empresa inactiva' });
    expect(datosEmpresa(EMPRESAS, 'x')).toEqual({ nombre: 'Empresa eliminada', aviso: 'Eliminada' });
  });
});
