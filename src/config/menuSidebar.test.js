import { describe, it, expect } from 'vitest';
import { entradasDelSidebar, itemsDelSidebar } from './menuSidebar';

const rutas = (items) => items.map((s) => s.path);

describe('sidebar: permisos de Administración repartidos en grupos', () => {
  it('con acceso solo a Control Mensual ve únicamente Finanzas, con ese ítem', () => {
    const usuario = {
      rol: 'operador',
      activo: true,
      permisos: { administracion: ['/administracion/controlMensual'] },
    };
    expect(entradasDelSidebar(usuario, null)).toEqual(['finanzas']);
    expect(rutas(itemsDelSidebar(usuario, 'finanzas', null))).toEqual(['/administracion/controlMensual']);
    expect(itemsDelSidebar(usuario, 'usuarios', null)).toEqual([]);
    expect(itemsDelSidebar(usuario, 'administracion', null)).toEqual([]);
  });

  it('Cargas consolidadas va en Finanzas con el permiso que ya tenía (sin reasignar ni migrar)', () => {
    const usuario = {
      rol: 'operador',
      activo: true,
      permisos: { administracion: ['/administracion/cargasConsolidado'] },
    };
    expect(entradasDelSidebar(usuario, null)).toEqual(['finanzas']);
    expect(rutas(itemsDelSidebar(usuario, 'finanzas', null))).toEqual(['/administracion/cargasConsolidado']);
    expect(itemsDelSidebar(usuario, 'administracion', null)).toEqual([]);
  });

  it('un Administrador con el mismo permiso además recibe Alertas en Usuarios y accesos', () => {
    const admin = {
      rol: 'admin',
      activo: true,
      permisos: { administracion: ['/administracion/controlMensual'] },
    };
    expect(entradasDelSidebar(admin, null)).toEqual(['finanzas', 'usuarios']);
    expect(rutas(itemsDelSidebar(admin, 'usuarios', null))).toEqual(['/administracion/alertas']);
  });

  it('respeta el orden de módulos guardado y los ítems inactivos', () => {
    const usuario = {
      rol: 'operador',
      activo: true,
      permisos: {
        administracion: ['/administracion/controlMensual', '/administracion/listadoUsuario'],
        bodega: ['/bodega/ingresoBodega'],
      },
      ordenModulos: ['bodega', 'administracion'],
    };
    expect(entradasDelSidebar(usuario, null)).toEqual(['bodega', 'finanzas', 'usuarios']);
    const activos = { modulosInactivos: [], itemsInactivos: ['/administracion/listadoUsuario'] };
    expect(entradasDelSidebar(usuario, activos)).toEqual(['bodega', 'finanzas']);
  });
});
