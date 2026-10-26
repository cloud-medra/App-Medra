import { describe, it, expect } from 'vitest';
import { subItemsVisibles, puedeAbrirVista, subItemsAsignables, esAdministrador, esDesarrollador } from './accesoMenu';
import { MODULES } from './modulesConfig.jsx';

const RUTA = '/administracion/permisosCentro';
const LISTADO = '/administracion/listadoUsuario';
const ALERTAS = '/administracion/alertas';
const TICKETS = '/administracion/tickets';
const GESTION_MODULOS = '/administracion/gestionModulos';
const rutas = (u) => subItemsVisibles(u, 'administracion').map((s) => s.path);

describe('Menú: el Administrador ve solo lo asignado; el Desarrollador, todo', () => {
  it('Administrador sin Administración asignada: solo ve Alertas (automático), no Permisos por centro ni Gestionar tickets', () => {
    expect(rutas({ rol: 'admin', permisos: {} })).toEqual([ALERTAS]);
    expect(subItemsVisibles({ rol: 'admin', permisos: { laboratorio: ['/laboratorio/ordenLaboratorio'] } }, 'laboratorio').map((s) => s.path))
      .toEqual(['/laboratorio/ordenLaboratorio']);
  });

  it('Permisos por centro se asigna como cualquier ítem', () => {
    expect(rutas({ rol: 'admin', permisos: { administracion: [RUTA] } })).toEqual([ALERTAS, RUTA]);
    expect(subItemsAsignables(MODULES.administracion).map((s) => s.path)).toContain(RUTA);
  });

  it('Desarrollador: todos los ítems, aunque no estén en sus permisos', () => {
    expect(rutas({ rol: 'dev', permisos: {} })).toEqual(MODULES.administracion.subItems.map((s) => s.path));
    expect(rutas({ rol: 'dev', permisos: {}, activo: false })).toEqual([]);
  });

  it('operador y encargado: lo asignado; nunca Alertas, aunque figure en sus permisos', () => {
    expect(rutas({ rol: 'operador', permisos: { administracion: [LISTADO, RUTA, ALERTAS] } })).toEqual([LISTADO, RUTA]);
    expect(puedeAbrirVista({ rol: 'operador', permisos: {} }, LISTADO)).toBe(true);
    expect(puedeAbrirVista({ rol: 'encargado', permisos: {} }, ALERTAS)).toBe(false);
    expect(puedeAbrirVista({ rol: 'admin', permisos: {} }, ALERTAS)).toBe(true);
  });

  it('Gestión de módulos: solo el Desarrollador la ve y la abre; no se asigna', () => {
    expect(rutas({ rol: 'dev', permisos: {} })).toContain(GESTION_MODULOS);
    expect(rutas({ rol: 'admin', permisos: { administracion: [GESTION_MODULOS] } })).not.toContain(GESTION_MODULOS);
    expect(rutas({ rol: 'operador', permisos: { administracion: [GESTION_MODULOS] } })).not.toContain(GESTION_MODULOS);
    expect(puedeAbrirVista({ rol: 'dev', permisos: {} }, GESTION_MODULOS)).toBe(true);
    expect(puedeAbrirVista({ rol: 'admin', permisos: {} }, GESTION_MODULOS)).toBe(false);
    expect(puedeAbrirVista({ rol: 'dev', permisos: {}, activo: false }, GESTION_MODULOS)).toBe(false);
    expect(subItemsAsignables(MODULES.administracion).map((s) => s.path)).not.toContain(GESTION_MODULOS);
  });

  it('Alertas no se asigna desde el editor de permisos', () => {
    expect(subItemsAsignables(MODULES.administracion).map((s) => s.path)).not.toContain(ALERTAS);
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

describe('Gestionar tickets', () => {
  const rutasDe = (u) => subItemsVisibles(u, 'administracion').map((s) => s.path);
  it('se asigna en el editor de permisos como cualquier ítem', () => {
    expect(subItemsAsignables(MODULES.administracion).map((s) => s.path)).toContain(TICKETS);
  });
  it('siempre lo tiene el Desarrollador; los demás (también el Administrador) solo si se les asigna', () => {
    expect(rutasDe({ rol: 'dev', permisos: {} })).toContain(TICKETS);
    expect(rutasDe({ rol: 'admin', permisos: {} })).not.toContain(TICKETS);
    expect(rutasDe({ rol: 'admin', permisos: { administracion: [TICKETS] } })).toContain(TICKETS);
    expect(rutasDe({ rol: 'operador', permisos: {} })).not.toContain(TICKETS);
    expect(rutasDe({ rol: 'operador', permisos: { administracion: [TICKETS] } })).toContain(TICKETS);
  });
});
