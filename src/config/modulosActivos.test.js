import { describe, it, expect } from 'vitest';
import {
  normalizarModulosActivos, moduloActivo, itemActivo, vistaActiva, alternarModulo, alternarItem,
  mismaConfig, RUTA_GESTION_MODULOS, CONFIG_TODO_ACTIVO
} from './modulosActivos';
import { MODULES } from './modulesConfig.jsx';
import { subItemsVisibles } from './accesoMenu';

const STOCK = '/inventario/generalInventario';
const EXISTENCIAS = '/inventario/existenciasInventario';

describe('Gestión de módulos: activos/inactivos', () => {
  it('sin documento, todo activo', () => {
    const config = normalizarModulosActivos(null);
    expect(config).toEqual(CONFIG_TODO_ACTIVO);
    expect(moduloActivo(config, 'inventario')).toBe(true);
    expect(itemActivo(config, 'inventario', STOCK)).toBe(true);
    expect(moduloActivo(undefined, 'inventario')).toBe(true);
  });

  it('Administración y Gestión de módulos no se pueden inactivar (ni guardados a mano)', () => {
    const config = normalizarModulosActivos({ modulosInactivos: ['administracion', 'inventario'], itemsInactivos: [RUTA_GESTION_MODULOS] });
    expect(config).toEqual({ modulosInactivos: ['inventario'], itemsInactivos: [] });
    expect(alternarModulo(CONFIG_TODO_ACTIVO, 'administracion')).toBe(CONFIG_TODO_ACTIVO);
    expect(alternarItem(CONFIG_TODO_ACTIVO, RUTA_GESTION_MODULOS)).toBe(CONFIG_TODO_ACTIVO);
  });

  it('inactivar un módulo oculta todos sus ítems; al reactivarlo vuelven con su estado', () => {
    let config = alternarItem(CONFIG_TODO_ACTIVO, EXISTENCIAS);
    config = alternarModulo(config, 'inventario');
    expect(itemActivo(config, 'inventario', STOCK)).toBe(false);
    expect(subItemsVisibles({ rol: 'dev', permisos: {} }, 'inventario', config)).toEqual([]);
    config = alternarModulo(config, 'inventario');
    expect(itemActivo(config, 'inventario', STOCK)).toBe(true);
    expect(itemActivo(config, 'inventario', EXISTENCIAS)).toBe(false);
  });

  it('el sidebar no muestra lo inactivo a nadie, tampoco al Desarrollador', () => {
    const config = alternarItem(CONFIG_TODO_ACTIVO, EXISTENCIAS);
    const operador = { rol: 'operador', permisos: { inventario: [STOCK, EXISTENCIAS] } };
    expect(subItemsVisibles(operador, 'inventario', config).map((s) => s.path)).toEqual([STOCK]);
    expect(subItemsVisibles({ rol: 'dev', permisos: {} }, 'inventario', config).map((s) => s.path)).not.toContain(EXISTENCIAS);
  });

  it('vistaActiva bloquea la ruta del ítem y sus subrutas; las vistas fuera de módulos siempre abren', () => {
    const config = alternarModulo(CONFIG_TODO_ACTIVO, 'laboratorio');
    expect(vistaActiva(config, MODULES, '/laboratorio/ordenLaboratorio')).toBe(false);
    expect(vistaActiva(config, MODULES, '/laboratorio/archivosControlLaboratorio/documentosRecibidos')).toBe(false);
    expect(vistaActiva(config, MODULES, '/maestros/codigosMaestros')).toBe(true);
    expect(vistaActiva(config, MODULES, 'dashboard')).toBe(true);
    expect(vistaActiva(config, MODULES, '/settings/ajusteTema')).toBe(true);
  });

  it('mismaConfig ignora el orden', () => {
    expect(mismaConfig(
      { modulosInactivos: ['a', 'b'], itemsInactivos: [] },
      { modulosInactivos: ['b', 'a'], itemsInactivos: [] }
    )).toBe(true);
    expect(mismaConfig(CONFIG_TODO_ACTIVO, { modulosInactivos: ['a'], itemsInactivos: [] })).toBe(false);
  });
});
