import { describe, it, expect } from 'vitest';
import {
  aplanar, combinar, calcularExcepciones, normalizarExcepciones, origenCasilla, valorDe, dejaSinDesarrollador,
  claveMenu, claveVista, claveSeccion, claveElemento, SIN_EXCEPCIONES,
} from '../../../../../functions/permisos/nucleo.mjs';

// Permiso efectivo = plantilla del centro de costo + agregados − quitados
// (functions/permisos/nucleo.mjs: lo usan las Cloud Functions y el editor).

const LAB = '/laboratorio/codigoLaboratorio';
const EMP = '/laboratorio/empresasLaboratorio';
const COD = '/maestros/codigosMaestros';

// Plantilla "Unidad de Laboratorio": Códigos de laboratorio sin "Eliminar".
const plantillaLab = () => ({
  permisos: { laboratorio: [LAB] },
  permisosGranulares: { [LAB]: { tabla: { visible: true, elements: { btn_editar: true, btn_eliminar: false } } } },
});

// Mismo criterio que useGranularPermission / las reglas para una acción.
const puede = (efectivo, ruta, seccion, accion) => {
  const vista = efectivo.permisosGranulares[ruta];
  if (!vista) return false;
  const sec = vista[seccion];
  if (!sec) return true;
  return sec.visible !== false && sec.elements?.[accion] !== false;
};
const enMenu = (efectivo, modulo, ruta) => (efectivo.permisos[modulo] || []).includes(ruta);

describe('permiso efectivo por centro de costo', () => {
  it('herencia: sin excepciones el usuario tiene exactamente la plantilla', () => {
    const e = combinar(plantillaLab(), SIN_EXCEPCIONES);
    expect(enMenu(e, 'laboratorio', LAB)).toBe(true);
    expect(puede(e, LAB, 'tabla', 'btn_editar')).toBe(true);
    expect(puede(e, LAB, 'tabla', 'btn_eliminar')).toBe(false);
    expect(enMenu(e, 'laboratorio', EMP)).toBe(false);
  });

  it('agregado: una vista y una acción que la plantilla no da', () => {
    const exc = { agregados: [claveMenu('laboratorio', EMP), claveVista(EMP), claveElemento(LAB, 'tabla', 'btn_eliminar')], quitados: [] };
    const e = combinar(plantillaLab(), exc);
    expect(enMenu(e, 'laboratorio', EMP)).toBe(true);
    expect(puede(e, EMP, 'cualquiera', 'x')).toBe(true);
    expect(puede(e, LAB, 'tabla', 'btn_eliminar')).toBe(true);
  });

  it('quitado: una acción y una vista heredadas', () => {
    const e = combinar(plantillaLab(), { agregados: [], quitados: [claveElemento(LAB, 'tabla', 'btn_editar')] });
    expect(puede(e, LAB, 'tabla', 'btn_editar')).toBe(false);
    const sinVista = combinar(plantillaLab(), { agregados: [], quitados: [claveMenu('laboratorio', LAB), claveVista(LAB)] });
    expect(enMenu(sinVista, 'laboratorio', LAB)).toBe(false);
    expect(sinVista.permisosGranulares[LAB]).toBeUndefined();
  });

  it('las excepciones de un usuario no afectan a otro del mismo centro', () => {
    const ana = combinar(plantillaLab(), { agregados: [claveElemento(LAB, 'tabla', 'btn_eliminar')], quitados: [] });
    const luis = combinar(plantillaLab(), SIN_EXCEPCIONES);
    expect(puede(ana, LAB, 'tabla', 'btn_eliminar')).toBe(true);
    expect(puede(luis, LAB, 'tabla', 'btn_eliminar')).toBe(false);
  });

  it('restablecer a la plantilla: sin excepciones vuelve a ser la plantilla', () => {
    const exc = { agregados: [claveElemento(LAB, 'tabla', 'btn_eliminar')], quitados: [claveElemento(LAB, 'tabla', 'btn_editar')] };
    expect(combinar(plantillaLab(), exc)).not.toEqual(combinar(plantillaLab(), SIN_EXCEPCIONES));
    expect(combinar(plantillaLab(), SIN_EXCEPCIONES)).toEqual(combinar(plantillaLab()));
  });

  it('cambio de plantilla: todos los usuarios la reciben y conservan sus excepciones', () => {
    const exc = { agregados: [claveElemento(LAB, 'tabla', 'btn_eliminar')], quitados: [] };
    const nueva = {
      permisos: { laboratorio: [LAB, EMP], maestros: [COD] },
      permisosGranulares: { [LAB]: { tabla: { visible: true, elements: { btn_editar: false, btn_eliminar: false } } }, [EMP]: {}, [COD]: {} },
    };
    const e = combinar(nueva, exc);
    expect(enMenu(e, 'maestros', COD)).toBe(true); // nuevo en la plantilla
    expect(puede(e, LAB, 'tabla', 'btn_editar')).toBe(false); // la plantilla lo quitó
    expect(puede(e, LAB, 'tabla', 'btn_eliminar')).toBe(true); // su excepción se conserva
    expect(puede(combinar(nueva, SIN_EXCEPCIONES), LAB, 'tabla', 'btn_eliminar')).toBe(false);
  });

  it('usuario sin centro de costo: solo sus permisos propios (agregados)', () => {
    const exc = { agregados: [claveMenu('maestros', COD), claveVista(COD)], quitados: [] };
    const e = combinar(null, exc);
    expect(e.permisos).toEqual({ maestros: [COD] });
    expect(Object.keys(e.permisosGranulares)).toEqual([COD]);
    expect(combinar(null, SIN_EXCEPCIONES)).toEqual({ permisos: {}, permisosGranulares: {} });
  });

  it('centro sin plantilla no otorga permisos', () => {
    expect(combinar(undefined)).toEqual({ permisos: {}, permisosGranulares: {} });
  });

  it('ida y vuelta: las excepciones calculadas reproducen lo editado', () => {
    const editado = {
      permisos: { laboratorio: [EMP], maestros: [COD] },
      permisosGranulares: {
        [EMP]: { tabla: { visible: false, elements: { btn_editar: false } } },
        [COD]: { barra: { visible: true, elements: { buscar: true, exportar: false } } },
      },
    };
    const exc = calcularExcepciones(plantillaLab(), editado);
    expect(exc.quitados).toContain(claveMenu('laboratorio', LAB));
    expect(exc.agregados).toContain(claveMenu('maestros', COD));
    const e = combinar(plantillaLab(), exc);
    const pe = aplanar(editado);
    const pr = aplanar(e);
    new Set([...Object.keys(pe), ...Object.keys(pr)]).forEach((k) => {
      if (k[0] === 's' || k[0] === 'e') {
        const ruta = k.split('|')[1];
        if (pe[claveVista(ruta)] !== true) return;
      }
      expect([k, valorDe(pr, k)]).toEqual([k, valorDe(pe, k)]);
    });
    // Y no hay excepciones cuando lo editado es la plantilla.
    expect(calcularExcepciones(plantillaLab(), plantillaLab())).toEqual(SIN_EXCEPCIONES);
  });

  it('origen de cada casilla para el editor', () => {
    const plano = aplanar(plantillaLab());
    const exc = { agregados: [claveElemento(LAB, 'tabla', 'btn_eliminar')], quitados: [claveElemento(LAB, 'tabla', 'btn_editar')] };
    expect(origenCasilla(claveMenu('laboratorio', LAB), plano, exc)).toBe('heredado');
    expect(origenCasilla(claveSeccion(LAB, 'tabla'), plano, exc)).toBe('heredado');
    expect(origenCasilla(claveElemento(LAB, 'tabla', 'btn_eliminar'), plano, exc)).toBe('agregado');
    expect(origenCasilla(claveElemento(LAB, 'tabla', 'btn_editar'), plano, exc)).toBe('quitado');
    expect(origenCasilla(claveMenu('laboratorio', EMP), plano, exc)).toBeNull();
  });

  it('normaliza lo que llega: sin claves inválidas ni repetidas; si está en ambas, gana quitado', () => {
    const n = normalizarExcepciones({
      agregados: ['v|/a', 'v|/a', 'x|malo', 42, claveElemento('/a', 's', 'e')],
      quitados: [claveElemento('/a', 's', 'e'), 'm|sinRuta'],
    });
    expect(n).toEqual({ agregados: ['v|/a'], quitados: [claveElemento('/a', 's', 'e')] });
    expect(normalizarExcepciones(undefined)).toEqual(SIN_EXCEPCIONES);
  });
});

describe('protección contra quedarse sin desarrollador', () => {
  const yo = { id: 'yo', rol: 'dev' };

  it('el último desarrollador no puede quitarse el rol ni inactivarse', () => {
    const usuarios = [yo, { id: 'op', rol: 'operador' }, { id: 'a', rol: 'admin' }];
    expect(dejaSinDesarrollador(usuarios, 'yo', { rol: 'admin' })).toBe(true);
    expect(dejaSinDesarrollador(usuarios, 'yo', { activo: false })).toBe(true);
  });

  it('con otro desarrollador activo sí puede (un administrador no cuenta)', () => {
    expect(dejaSinDesarrollador([yo, { id: 'd', rol: 'dev' }], 'yo', { activo: false })).toBe(false);
    expect(dejaSinDesarrollador([yo, { id: 'd', rol: 'dev', activo: false }], 'yo', { rol: 'encargado' })).toBe(true);
  });

  it('cambios que no quitan el rol no se bloquean; quitar el de un administrador, tampoco', () => {
    expect(dejaSinDesarrollador([yo], 'yo', {})).toBe(false);
    expect(dejaSinDesarrollador([yo], 'yo', { rol: undefined, activo: undefined })).toBe(false);
    expect(dejaSinDesarrollador([yo, { id: 'a', rol: 'admin' }], 'a', { rol: 'operador' })).toBe(false);
  });
});


describe('roles y plantilla por centro + rol', async () => {
  const { ROLES, ROLES_CON_PLANTILLA, esRolAccesoTotal, idPlantilla, idPlantillaDeUsuario, labelRol } = await import('../../../../../functions/permisos/nucleo.mjs');

  it('lista final de roles: solo dev acceso total; admin/dev sin plantilla; Operador y Encargado de centro con plantilla', () => {
    expect(ROLES.map((r) => [r.value, r.label, r.accesoTotal, r.sinPlantilla])).toEqual([
      ['admin', 'Administrador del sistema', false, true],
      ['dev', 'Desarrollador', true, true],
      ['encargado', 'Encargado de centro', false, false],
      ['operador', 'Operador', false, false],
    ]);
    expect(ROLES_CON_PLANTILLA).toEqual(['operador', 'encargado']);
    expect(esRolAccesoTotal('dev')).toBe(true);
    expect(esRolAccesoTotal('admin')).toBe(false);
    expect(esRolAccesoTotal('encargado')).toBe(false);
    expect(labelRol('encargado')).toBe('Encargado de centro');
  });

  it('cada usuario usa la plantilla de su centro y su rol; admin/dev y sin centro, ninguna', () => {
    expect(idPlantilla('lab', 'encargado')).toBe('lab__encargado');
    expect(idPlantillaDeUsuario('lab', 'operador')).toBe('lab__operador');
    expect(idPlantillaDeUsuario('lab', undefined)).toBe('lab__operador'); // sin rol = operador
    expect(idPlantillaDeUsuario('lab', 'admin')).toBeNull();
    expect(idPlantillaDeUsuario(null, 'operador')).toBeNull();
  });
});
