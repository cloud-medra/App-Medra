// "Control Procesos" separado en ítems: nadie pierde acceso (mismos datos de
// permisos que antes), el editor sigue asignando el contenedor y lo guardado
// con la ruta antigua (orden, inactivos, atajos) pasa a los ítems.
import { describe, it, expect } from 'vitest';
import { MODULES } from './modulesConfig.jsx';
import { subItemsVisibles, subItemsAsignables, tieneItemAsignado } from './accesoMenu';
import { itemsDelSidebar } from './menuSidebar';
import { normalizarModulosActivos, itemActivo } from './modulosActivos';
import { normalizarAtajosGuardados, resolverAtajos } from './atajosDashboard';
import { construirProcesosControl } from './componentMaps/controlProcesos.js';
import {
  CONTENEDORES_PESTANAS, FASES_CONTROL_PROCESOS, rutasDeContenedor, expandirContenedores, redireccionContenedor,
} from './pestanasControlProcesos';

const CP_LAB = '/laboratorio/archivosControlLaboratorio';
const CP_VAC = '/vacunatorio/archivosControlVacunatorio';
const RECIBIDOS = `${CP_LAB}/documentosRecibidos`;
const IMPUTADOS = `${CP_LAB}/documentosImputados`;
const ORDENES = '/laboratorio/ordenLaboratorio';
const rutas = (u, mod = 'laboratorio') => subItemsVisibles(u, mod).map((s) => s.path);

// Usuario como quedaba al asignarle Control Procesos con 2 de sus 8 pestañas.
const operador = {
  rol: 'operador',
  permisos: { laboratorio: [ORDENES, CP_LAB] },
  permisosGranulares: { [ORDENES]: {}, [CP_LAB]: {}, [RECIBIDOS]: {}, [IMPUTADOS]: {} },
};

describe('Control Procesos: cada pestaña es un ítem del módulo', () => {
  it('Laboratorio y Vacunatorio tienen un ítem por pestaña, con su nombre y la ruta de la pestaña', () => {
    Object.entries(CONTENEDORES_PESTANAS).forEach(([contenedor, { modulo }]) => {
      const items = MODULES[modulo].subItems.filter((s) => s.pestanaDe?.path === contenedor);
      expect(items.map((s) => s.label)).toEqual(FASES_CONTROL_PROCESOS.map((f) => f.label));
      expect(items.map((s) => s.path)).toEqual(rutasDeContenedor(contenedor));
      // Las rutas son las mismas claves de permisos granulares de las pestañas.
      expect(items.map((s) => s.path)).toEqual(Object.keys(construirProcesosControl(contenedor)));
      expect(MODULES[modulo].subItems.some((s) => s.path === contenedor)).toBe(false);
    });
  });

  it('quien tenía Control Procesos ve como ítems las pestañas que tenía habilitadas', () => {
    expect(rutas(operador)).toEqual([ORDENES, RECIBIDOS, IMPUTADOS]);
  });

  it('sin el contenedor en permisos no ve los ítems, aunque tenga la pestaña en granulares', () => {
    expect(rutas({ ...operador, permisos: { laboratorio: [ORDENES] } })).toEqual([ORDENES]);
  });

  it('el Administrador se rige por lo asignado y el Desarrollador ve los 8', () => {
    expect(rutas({ ...operador, rol: 'admin' })).toEqual([ORDENES, RECIBIDOS, IMPUTADOS]);
    expect(rutas({ rol: 'dev', permisos: {} }, 'vacunatorio')).toEqual(expect.arrayContaining(rutasDeContenedor(CP_VAC)));
  });

  it('el editor de permisos sigue asignando "Control Procesos" (una sola vez, en su lugar)', () => {
    const asignables = subItemsAsignables(MODULES.laboratorio);
    expect(asignables.map((s) => s.path)).toEqual([
      '/laboratorio/empresasLaboratorio', '/laboratorio/codigoLaboratorio', ORDENES, '/laboratorio/xmlDocLaboratorio', CP_LAB,
    ]);
    expect(asignables.at(-1).label).toBe('Control Procesos');
  });

  it('tieneItemAsignado (Módulos Visibles) usa el mismo criterio', () => {
    const item = (path) => MODULES.laboratorio.subItems.find((s) => s.path === path);
    expect(tieneItemAsignado(operador, 'laboratorio', item(RECIBIDOS))).toBe(true);
    expect(tieneItemAsignado(operador, 'laboratorio', item(`${CP_LAB}/documentosEdicion`))).toBe(false);
  });
});

describe('Datos guardados con la ruta de Control Procesos', () => {
  it('el orden del menú pone los ítems donde estaba Control Procesos', () => {
    const conOrden = { ...operador, ordenSubItems: { laboratorio: [CP_LAB, ORDENES] } };
    expect(itemsDelSidebar(conOrden, 'laboratorio', null).map((s) => s.path)).toEqual([RECIBIDOS, IMPUTADOS, ORDENES]);
  });

  it('Control Procesos inactivo deja inactivos sus 8 ítems', () => {
    const config = normalizarModulosActivos({ itemsInactivos: [CP_LAB] });
    expect(config.itemsInactivos).toEqual(rutasDeContenedor(CP_LAB));
    expect(itemActivo(config, 'laboratorio', RECIBIDOS)).toBe(false);
    expect(itemActivo(config, 'laboratorio', ORDENES)).toBe(true);
  });

  it('un atajo a Control Procesos pasa al primer ítem y se permite con el contenedor', () => {
    const atajos = normalizarAtajosGuardados({ atajos: [{ modulo: 'laboratorio', path: CP_LAB }] });
    expect(atajos).toEqual([{ modulo: 'laboratorio', path: RECIBIDOS }]);
    expect(resolverAtajos(atajos, MODULES, operador.permisos).map((a) => a.label)).toEqual(['Documentos Recibidos']);
    expect(resolverAtajos(atajos, MODULES, { laboratorio: [ORDENES] })).toEqual([]);
  });

  it('la ruta del contenedor redirige al primer ítem visible (o al primero si no ve ninguno)', () => {
    expect(redireccionContenedor(CP_LAB, [ORDENES, IMPUTADOS])).toBe(IMPUTADOS);
    expect(redireccionContenedor(CP_LAB, [])).toBe(RECIBIDOS);
    expect(redireccionContenedor(ORDENES, [ORDENES])).toBeNull();
    expect(expandirContenedores([ORDENES, CP_VAC]).slice(0, 2)).toEqual([ORDENES, `${CP_VAC}/documentosRecibidos`]);
  });
});
