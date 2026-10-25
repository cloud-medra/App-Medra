import { describe, it, expect } from 'vitest';
import { tituloPestana } from './tituloPestana';

const titulo = (estado) => tituloPestana({ isAjustesMode: false, activeModule: null, activeView: 'dashboard', ...estado });

describe('tituloPestana', () => {
  it('panel principal: Inicio', () => {
    expect(titulo({})).toBe('Inicio | Medra');
  });

  it('módulo abierto: su nombre, también dentro de un ítem', () => {
    expect(titulo({ activeModule: 'implantes' })).toBe('Implantes | Medra');
    expect(titulo({ activeModule: 'consignacion', activeView: '/consignacion/cargasConsignacion' })).toBe('Consignación | Medra');
  });

  it('grupos de Administración: el nombre del sidebar', () => {
    expect(titulo({ activeModule: 'finanzas', activeView: '/administracion/controlMensual' })).toBe('Finanzas | Medra');
    expect(titulo({ activeModule: 'usuarios' })).toBe('Usuarios y accesos | Medra');
    expect(titulo({ activeModule: 'administracion', activeView: '/administracion/notasAdmin' })).toBe('Administración | Medra');
  });

  it('sin módulo abierto, una vista de módulo usa el módulo de la vista', () => {
    expect(titulo({ activeView: '/administracion/ResumenPeriodoAbierto' })).toBe('Finanzas | Medra');
    expect(titulo({ activeView: '/implantes/reportesInfo/detalle' })).toBe('Implantes | Medra');
  });

  it('Ajustes', () => {
    expect(titulo({ isAjustesMode: true, activeView: '/settings/ajusteTema' })).toBe('Ajustes | Medra');
  });

  it('perfil y políticas: Inicio', () => {
    expect(titulo({ activeView: 'perfil' })).toBe('Inicio | Medra');
    expect(titulo({ activeView: 'privacidad' })).toBe('Inicio | Medra');
  });
});
