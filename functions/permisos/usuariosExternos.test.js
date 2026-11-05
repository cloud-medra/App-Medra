// Usuarios externos: tipo, datos válidos, permisos solo de módulos para externos
// y que nada de lo interno les abra acceso, ni con un rol alto en el documento.
import { describe, it, expect } from 'vitest';
import {
  tipoDeUsuario, esExterno, empresaDeUsuario, empresaActiva, errorUsuarioExterno, excepcionesSoloParaExternos, camposUsuarioExterno,
  esDesarrollador, esAdministrador, puedeAdministrar, puedeAccion, puedeAccionEnPestana,
} from './nucleo.mjs';

const EXTERNO = { tipoUsuario: 'externo', empresaId: 'e1', rol: 'operador', permisos: {} };

describe('tipo de usuario', () => {
  it('sin el campo, o con otro valor, es interno', () => {
    expect(tipoDeUsuario({})).toBe('interno');
    expect(tipoDeUsuario(undefined)).toBe('interno');
    expect(tipoDeUsuario({ tipoUsuario: 'raro' })).toBe('interno');
    expect(esExterno(EXTERNO)).toBe(true);
  });

  it('la empresa solo cuenta para un externo', () => {
    expect(empresaDeUsuario(EXTERNO)).toBe('e1');
    expect(empresaDeUsuario({ empresaId: 'e1' })).toBeNull();
    expect(empresaDeUsuario({ tipoUsuario: 'externo' })).toBeNull();
  });

  it('solo ACTIVO es una empresa activa', () => {
    expect(empresaActiva({ estado: 'ACTIVO' })).toBe(true);
    expect(empresaActiva({ estado: 'INACTIVO' })).toBe(false);
    expect(empresaActiva(undefined)).toBe(false);
  });
});

describe('errorUsuarioExterno', () => {
  it('exige empresa y rechaza lo propio de un interno', () => {
    expect(errorUsuarioExterno({ empresaId: 'e1' })).toBe('');
    expect(errorUsuarioExterno({ empresaId: 'e1', rol: 'operador' })).toBe('');
    expect(errorUsuarioExterno({})).toMatch(/empresa es obligatoria/);
    expect(errorUsuarioExterno({ empresaId: '' })).toMatch(/empresa es obligatoria/);
    expect(errorUsuarioExterno({ empresaId: 'e1', rol: 'admin' })).toMatch(/rol Operador/);
    expect(errorUsuarioExterno({ empresaId: 'e1', rol: 'dev' })).toMatch(/rol Operador/);
    expect(errorUsuarioExterno({ empresaId: 'e1', centroCostoId: 'c1' })).toMatch(/centro de costo/);
    expect(errorUsuarioExterno({ empresaId: 'e1', centrosAdministrados: ['c1'] })).toMatch(/administra/);
    expect(errorUsuarioExterno({ empresaId: 'e1', instituciones: ['i1'] })).toMatch(/instituciones/);
  });

  it('listas vacías y centro null son válidos', () => {
    expect(errorUsuarioExterno({ empresaId: 'e1', centroCostoId: null, centrosAdministrados: [], administradoresAsignados: [], instituciones: [] })).toBe('');
  });
});

describe('excepcionesSoloParaExternos', () => {
  it('hoy no hay módulos para externos: solo vale sin excepciones', () => {
    expect(excepcionesSoloParaExternos({ agregados: [], quitados: [] })).toBe(true);
    expect(excepcionesSoloParaExternos({ agregados: ['m|implantes|/implantes/x'], quitados: [] })).toBe(false);
    expect(excepcionesSoloParaExternos({ agregados: ['v|/implantes/x'], quitados: [] })).toBe(false);
    expect(excepcionesSoloParaExternos({ agregados: [], quitados: ['e|/implantes/x|s|a'] })).toBe(false);
  });

  it('con módulos para externos, solo los de esos módulos', () => {
    const modulos = ['externos'];
    expect(excepcionesSoloParaExternos({ agregados: ['m|externos|/externos/a', 'v|/externos/a', 's|/externos/a|s', 'e|/externos/a|s|x'], quitados: [] }, modulos)).toBe(true);
    expect(excepcionesSoloParaExternos({ agregados: ['m|externos|/externos/a', 'm|bodega|/bodega/a'], quitados: [] }, modulos)).toBe(false);
    expect(excepcionesSoloParaExternos({ agregados: ['v|/bodega/a'], quitados: [] }, modulos)).toBe(false);
  });
});

describe('camposUsuarioExterno', () => {
  it('deja rol Operador, sin centro y sin ningún permiso', () => {
    expect(camposUsuarioExterno('e1')).toMatchObject({
      tipoUsuario: 'externo', empresaId: 'e1', rol: 'operador', centroCostoId: null, centrosAdministrados: [], administradoresAsignados: [],
      instituciones: [], permisos: {}, permisosGranulares: {},
    });
  });
});

describe('un externo no pasa ningún control interno', () => {
  // Aunque el documento quedara con un rol alto o con permisos por algún error.
  const conRolDev = { ...EXTERNO, rol: 'dev' };
  const conPermisos = {
    ...EXTERNO, rol: 'admin',
    permisos: { administracion: ['/administracion/listadoUsuario'], bodega: ['/bodega/x'] },
    permisosGranulares: { '/bodega/x': {} },
  };

  it('no es desarrollador ni administrador', () => {
    expect(esDesarrollador(conRolDev)).toBe(false);
    expect(esAdministrador(conPermisos)).toBe(false);
    expect(puedeAdministrar(conRolDev, ['/administracion/listadoUsuario'])).toBe(false);
    expect(puedeAdministrar(conPermisos, ['/administracion/listadoUsuario'])).toBe(false);
  });

  it('no puede ninguna acción de un módulo interno', () => {
    expect(puedeAccion(conRolDev, 'bodega', '/bodega/x', 's', 'a')).toBe(false);
    expect(puedeAccion(conPermisos, 'bodega', '/bodega/x', 's', 'a')).toBe(false);
    expect(puedeAccionEnPestana(conRolDev, 'implantes', '/implantes/x', '/implantes/x/d', 's', 'a')).toBe(false);
  });

  it('los internos siguen igual', () => {
    expect(esDesarrollador({ rol: 'dev' })).toBe(true);
    expect(esDesarrollador({ rol: 'dev', tipoUsuario: 'interno' })).toBe(true);
    expect(esAdministrador({ rol: 'admin' })).toBe(true);
    expect(puedeAccion({ rol: 'dev' }, 'bodega', '/bodega/x', 's', 'a')).toBe(true);
    expect(puedeAccion({ rol: 'operador', permisos: { bodega: ['/bodega/x'] }, permisosGranulares: { '/bodega/x': {} } }, 'bodega', '/bodega/x', 's', 'a')).toBe(true);
    expect(puedeAccion({ rol: 'operador', permisos: {} }, 'bodega', '/bodega/x', 's', 'a')).toBe(false);
  });
});
