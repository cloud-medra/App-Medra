// Inventario físico de Bodega (/bodega/inventarioBodega) tras eliminar el módulo
// Inventario (12-11-2026). Su permiso es una SECCIÓN llamada `inventario` dentro
// de la vista de Bodega, no el módulo eliminado: el acceso sale de
// permisos.bodega y las acciones de las Functions revisan esa sección.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { COMPONENT_MAPS } from './index.js';
import { MODULES } from '../modulesConfig.jsx';
import { subItemsVisibles } from '../accesoMenu';
import { CONFIG_TODO_ACTIVO } from '../modulosActivos';
import { ACCIONES, RUTAS } from '../../../functions/bodega/nucleo.mjs';

const RUTA = '/bodega/inventarioBodega';

describe('Inventario físico de Bodega', () => {
  it('sigue en el menú de Bodega y el módulo Inventario ya no existe', () => {
    expect(MODULES.bodega.subItems.map((s) => s.path)).toContain(RUTA);
    expect(MODULES.inventario).toBeUndefined();
    expect(RUTAS.inventario).toBe(RUTA);
  });

  it('cada acción de las Functions sobre el inventario existe en los permisos granulares', () => {
    const acciones = Object.values(ACCIONES).filter(([, ruta]) => ruta === RUTA);
    expect(acciones.length).toBeGreaterThanOrEqual(4);
    acciones.forEach(([modulo, ruta, seccion, elemento]) => {
      expect(modulo).toBe('bodega');
      expect(COMPONENT_MAPS[ruta]?.sections?.[seccion]?.elements?.[elemento], `${seccion}.${elemento}`).toBeTruthy();
    });
    // Los botones de la pantalla (InventarioBodega.jsx y ComparacionInventario.jsx).
    ['btn_iniciar', 'btn_contar', 'btn_cerrar', 'btn_anular', 'btn_exportar'].forEach((el) => {
      expect(COMPONENT_MAPS[RUTA].sections.inventario.elements[el], el).toBeTruthy();
    });
  });

  it('lo ve quien tiene la ruta en permisos.bodega, tenga o no la clave vieja de Inventario', () => {
    const conBodega = { rol: 'operador', permisos: { bodega: [RUTA] } };
    const conAmbas = { rol: 'operador', permisos: { bodega: [RUTA], inventario: ['/inventario/generalInventario'] } };
    expect(subItemsVisibles(conBodega, 'bodega', CONFIG_TODO_ACTIVO).map((s) => s.path)).toContain(RUTA);
    expect(subItemsVisibles(conAmbas, 'bodega', CONFIG_TODO_ACTIVO).map((s) => s.path)).toContain(RUTA);
    // La clave vieja nunca daba acceso a Bodega, y sigue sin darlo.
    const soloInventario = { rol: 'operador', permisos: { inventario: ['/inventario/generalInventario'] } };
    expect(subItemsVisibles(soloInventario, 'bodega', CONFIG_TODO_ACTIVO)).toEqual([]);
  });

  it('el Dashboard sigue montando la pantalla en su ruta', () => {
    const dashboard = fs.readFileSync(path.resolve(__dirname, '../../pages/Dashboard.jsx'), 'utf8');
    expect(dashboard).toContain(`'${RUTA}': <InventarioBodega />`);
    expect(dashboard).not.toMatch(/modulos\/inventario\//);
  });
});
