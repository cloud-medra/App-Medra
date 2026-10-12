import { describe, it, expect } from 'vitest';
import {
  generarAccesoDesdeConfig,
  completarPermisosGranulares,
  estadoMarcadoVista,
  alternarVistaDelMenu,
  alternarModuloCompleto,
  alternarPestana,
  alternarSeccion,
  alternarElemento,
  establecerElementos,
  completarVistasDelMenu,
  vistasConfigurables,
  resumenRestricciones
} from './permisosGranularesUtils';

const MAPA = {
  '/mod/vista': {
    sections: {
      tabla: { elements: { btn_editar: {}, btn_eliminar: {} } },
      filtros: { elements: {} },
    },
    procesos: {
      '/mod/vista/a': { sections: { tabla: { elements: { btn_ver: {} } } } },
      '/mod/vista/b': { sections: {} },
    },
  },
  '/mod/otra': { sections: { header: { elements: { btn: {} } } } },
};

describe('generarAccesoDesdeConfig', () => {
  it('todo en true o todo en false', () => {
    expect(generarAccesoDesdeConfig(MAPA['/mod/vista'], false)).toEqual({
      tabla: { visible: false, elements: { btn_editar: false, btn_eliminar: false } },
      filtros: { visible: false, elements: {} },
    });
    expect(generarAccesoDesdeConfig(MAPA['/mod/otra']).header).toEqual({ visible: true, elements: { btn: true } });
  });
});

describe('completarPermisosGranulares', () => {
  it('completa acciones nuevas en true sin pisar las que tienen valor', () => {
    const r = completarPermisosGranulares({
      '/mod/vista': { tabla: { visible: true, elements: { btn_eliminar: false } } },
      '/mod/vista/a': {},
    }, MAPA);
    expect(r['/mod/vista'].tabla.elements).toEqual({ btn_editar: true, btn_eliminar: false });
    expect(r['/mod/vista'].filtros).toEqual({ visible: true, elements: {} });
    expect(r['/mod/vista/a'].tabla.elements.btn_ver).toBe(true);
  });

  it('una pestaña quitada a propósito no se vuelve a agregar', () => {
    const r = completarPermisosGranulares({ '/mod/vista': {}, '/mod/vista/a': {} }, MAPA);
    expect(r['/mod/vista/b']).toBeUndefined();
  });

  it('usuario anterior a las pestañas (ninguna incluida) recibe todas', () => {
    const r = completarPermisosGranulares({ '/mod/vista': {} }, MAPA);
    expect(r['/mod/vista/a']).toBeDefined();
    expect(r['/mod/vista/b']).toBeDefined();
  });

  it('no crea vistas que el usuario no tiene', () => {
    expect(completarPermisosGranulares({}, MAPA)).toEqual({});
  });
});

describe('estadoMarcadoVista', () => {
  const config = MAPA['/mod/vista'];
  it('todo / nada / parcial', () => {
    expect(estadoMarcadoVista(generarAccesoDesdeConfig(config, true), config)).toBe('todo');
    expect(estadoMarcadoVista(generarAccesoDesdeConfig(config, false), config)).toBe('nada');
    expect(estadoMarcadoVista({ tabla: { visible: true, elements: { btn_editar: false } } }, config)).toBe('parcial');
  });
});

describe('operaciones del árbol (compartidas por Crear Usuario y Listado Usuario)', () => {
  const base = { permisos: { mod: ['/mod/vista'] }, permisosGranulares: { '/mod/vista': generarAccesoDesdeConfig(MAPA['/mod/vista']), '/mod/vista/a': {} } };

  it('alternarVistaDelMenu quita la vista y sus pestañas, y al volver la incluye completa', () => {
    const q = alternarVistaDelMenu(base, 'mod', '/mod/vista', MAPA);
    expect(q.quitada).toBe(true);
    expect(q.estado.permisos.mod).toEqual([]);
    expect(q.estado.permisosGranulares).toEqual({});
    const v = alternarVistaDelMenu(q.estado, 'mod', '/mod/vista', MAPA);
    expect(v.estado.permisosGranulares['/mod/vista/b']).toBeDefined();
    expect(v.rutas).toEqual(['/mod/vista', '/mod/vista/a', '/mod/vista/b']);
  });

  it('alternarModuloCompleto informa las rutas recién creadas sin pisar lo configurado', () => {
    const subItems = [{ path: '/mod/vista' }, { path: '/mod/otra' }];
    const r = alternarModuloCompleto(base, 'mod', subItems, MAPA);
    expect(r.quitado).toBe(false);
    expect(r.rutasAgregadas).toEqual(['/mod/otra']);
    expect(r.estado.permisosGranulares['/mod/vista']).toBe(base.permisosGranulares['/mod/vista']);
  });

  it('pestaña, sección y elementos', () => {
    let g = alternarPestana(base.permisosGranulares, '/mod/vista/a', MAPA['/mod/vista'].procesos['/mod/vista/a']);
    expect(g['/mod/vista/a']).toBeUndefined();
    g = alternarSeccion(g, '/mod/vista', 'tabla');
    expect(g['/mod/vista'].tabla.visible).toBe(false);
    g = alternarElemento(g, '/mod/vista', 'tabla', 'btn_editar');
    expect(g['/mod/vista'].tabla.elements.btn_editar).toBe(false);
    g = establecerElementos(g, '/mod/vista', 'tabla', ['btn_editar', 'btn_eliminar'], true);
    expect(g['/mod/vista'].tabla.elements).toEqual({ btn_editar: true, btn_eliminar: true });
    expect(base.permisosGranulares['/mod/vista'].tabla.visible).toBe(true); // no muta el original
  });

  it('completarVistasDelMenu crea las vistas del menú sin configuración y las informa', () => {
    const r = completarVistasDelMenu({ mod: ['/mod/vista', '/mod/otra'] }, { '/mod/vista': {} }, MAPA);
    expect(r.agregadas).toEqual(['/mod/otra']);
    expect(r.permisosGranulares['/mod/otra'].header.elements.btn).toBe(true);
    expect(r.permisosGranulares['/mod/vista']).toEqual({});
  });

  it('vistasConfigurables cuenta solo las pestañas incluidas', () => {
    expect(vistasConfigurables(base.permisos, base.permisosGranulares, MAPA)).toEqual(['/mod/vista', '/mod/vista/a']);
  });

  it('resumenRestricciones separa pestañas, secciones, acciones y columnas', () => {
    const mapa = { '/v': { sections: { t: { elements: { btn: {}, col_a: {}, col_b: {} } }, f: { elements: {} } }, procesos: { '/v/p': { sections: {} } } } };
    const r = resumenRestricciones({ m: ['/v'] }, { '/v': { t: { visible: true, elements: { btn: false, col_a: false } }, f: { visible: false, elements: {} } } }, mapa);
    expect(r).toEqual({ pestanas: 1, secciones: 1, acciones: 1, columnas: 1, total: 4 });
  });
});

describe('pestañas con porDefecto: false (ej. Recordatorios → Administrar tareas)', () => {
  const MAPA = {
    '/administracion/recordatorios': {
      sections: {},
      procesos: {
        '/administracion/recordatorios/mis': { sections: {} },
        '/administracion/recordatorios/administrar': { porDefecto: false, sections: {} },
      },
    },
  };
  const VACIO = { permisos: {}, permisosGranulares: {} };

  it('al marcar la vista se incluye "Mis recordatorios" pero no "Administrar tareas"', () => {
    const { estado } = alternarVistaDelMenu(VACIO, 'administracion', '/administracion/recordatorios', MAPA);
    expect(Object.keys(estado.permisosGranulares).sort()).toEqual(['/administracion/recordatorios', '/administracion/recordatorios/mis']);
    const { estado: modulo, rutasAgregadas } = alternarModuloCompleto(VACIO, 'administracion', [{ path: '/administracion/recordatorios' }], MAPA);
    expect(modulo.permisosGranulares['/administracion/recordatorios/administrar']).toBeUndefined();
    expect(rutasAgregadas).not.toContain('/administracion/recordatorios/administrar');
  });

  it('se puede marcar a mano, y la migración perezosa no la agrega sola', () => {
    const conAdministrar = alternarPestana({}, '/administracion/recordatorios/administrar', MAPA['/administracion/recordatorios'].procesos['/administracion/recordatorios/administrar']);
    expect(conAdministrar['/administracion/recordatorios/administrar']).toEqual({});
    const completado = completarPermisosGranulares({ '/administracion/recordatorios': {} }, MAPA);
    expect(completado['/administracion/recordatorios/mis']).toEqual({});
    expect(completado['/administracion/recordatorios/administrar']).toBeUndefined();
  });
});
