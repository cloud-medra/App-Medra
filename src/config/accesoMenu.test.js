import { describe, it, expect } from 'vitest';
import { subItemsVisibles, puedeAbrirVista, subItemsAsignables, esAdministrador, esDesarrollador } from './accesoMenu';
import { MODULES } from './modulesConfig.jsx';

const RUTA = '/administracion/permisosCentro';
const LISTADO = '/administracion/listadoUsuario';
const rutas = (u) => subItemsVisibles(u, 'administracion').map((s) => s.path);

describe('Menú: el Administrador ve solo lo asignado; el Desarrollador, todo', () => {
  it('Administrador sin Administración asignada: no ve ningún ítem (tampoco Permisos por centro)', () => {
    expect(rutas({ rol: 'admin', permisos: {} })).toEqual([]);
    expect(subItemsVisibles({ rol: 'admin', permisos: { laboratorio: ['/laboratorio/ordenLaboratorio'] } }, 'laboratorio').map((s) => s.path))
      .toEqual(['/laboratorio/ordenLaboratorio']);
  });

  it('Permisos por centro se asigna como cualquier ítem', () => {
    expect(rutas({ rol: 'admin', permisos: { administracion: [RUTA] } })).toEqual([RUTA]);
    expect(subItemsAsignables(MODULES.administracion).map((s) => s.path)).toContain(RUTA);
  });

  it('Desarrollador: todos los ítems, aunque no estén en sus permisos', () => {
    expect(rutas({ rol: 'dev', permisos: {} })).toEqual(MODULES.administracion.subItems.map((s) => s.path));
    expect(rutas({ rol: 'dev', permisos: {}, activo: false })).toEqual([]);
  });

  it('operador y encargado: lo asignado', () => {
    expect(rutas({ rol: 'operador', permisos: { administracion: [LISTADO, RUTA] } })).toEqual([LISTADO, RUTA]);
    expect(puedeAbrirVista({ rol: 'operador', permisos: {} }, LISTADO)).toBe(true);
  });

  it('roles', () => {
    expect(esAdministrador({ rol: 'admin' })).toBe(true);
    expect(esAdministrador({ rol: 'dev' })).toBe(true);
    expect(esAdministrador({ rol: 'admin', activo: false })).toBe(false);
    expect(esAdministrador(undefined)).toBe(false);
    expect(esDesarrollador({ rol: 'admin' })).toBe(false);
    expect(esDesarrollador({ rol: 'dev' })).toBe(true);
  });
});
