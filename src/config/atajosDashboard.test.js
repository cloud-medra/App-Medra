import { describe, it, expect } from 'vitest';
import {
  ATAJOS_POR_DEFECTO, resolverAtajos, normalizarAtajosGuardados, alternarAtajo, moverAtajo, estaSeleccionado, puedeConfigurarAtajos
} from './atajosDashboard';
import { MODULES } from './modulesConfig.jsx';

const todosLosPermisos = () => ATAJOS_POR_DEFECTO.reduce((acc, a) => {
  acc[a.modulo] = [...(acc[a.modulo] || []), a.path];
  return acc;
}, {});

describe('ATAJOS_POR_DEFECTO', () => {
  it('cada atajo apunta a un ítem que existe en el sidebar', () => {
    ATAJOS_POR_DEFECTO.forEach((a) => {
      expect(MODULES[a.modulo]?.subItems?.some((s) => s.path === a.path), `${a.modulo} ${a.path}`).toBe(true);
    });
  });
});

describe('resolverAtajos', () => {
  it('toma nombre, módulo e ícono del sidebar', () => {
    const [gestion] = resolverAtajos(ATAJOS_POR_DEFECTO, MODULES, todosLosPermisos());
    expect(gestion).toMatchObject({ modulo: 'implantes', path: '/implantes/gestionImplantes', label: 'Gestion', moduloLabel: 'Implantes' });
    expect(gestion.icon).toBeTruthy();
  });

  it('oculta los atajos sin permiso para el ítem o el módulo', () => {
    const permisos = { consignacion: ['/consignacion/cargasConsignacion'], implantes: ['/implantes/solicitudImplantes'] };
    expect(resolverAtajos(ATAJOS_POR_DEFECTO, MODULES, permisos).map((a) => a.path)).toEqual(['/consignacion/cargasConsignacion']);
    expect(resolverAtajos(ATAJOS_POR_DEFECTO, MODULES, undefined)).toEqual([]);
  });

  it('ignora atajos a ítems que ya no existen y respeta label/icon propios', () => {
    const atajos = [{ modulo: 'maestros', path: '/maestros/noExiste' }, { modulo: 'maestros', path: '/maestros/codigosMaestros', label: 'Códigos' }];
    const permisos = { maestros: ['/maestros/noExiste', '/maestros/codigosMaestros'] };
    expect(resolverAtajos(atajos, MODULES, permisos).map((a) => a.label)).toEqual(['Códigos']);
  });

  it('los ítems de Administración muestran su grupo del sidebar, con el mismo permiso', () => {
    const atajos = [
      { modulo: 'administracion', path: '/administracion/controlMensual' },
      { modulo: 'administracion', path: '/administracion/listadoUsuario' },
      { modulo: 'administracion', path: '/administracion/notasAdmin' },
    ];
    const permisos = { administracion: atajos.map((a) => a.path) };
    expect(resolverAtajos(atajos, MODULES, permisos).map((a) => a.moduloLabel))
      .toEqual(['Finanzas', 'Usuarios y accesos', 'Herramientas']);
    expect(resolverAtajos(atajos, MODULES, { finanzas: ['/administracion/controlMensual'] })).toEqual([]);
  });
});

describe('normalizarAtajosGuardados', () => {
  it('sin documento o con formato inesperado usa los atajos por defecto', () => {
    expect(normalizarAtajosGuardados(null)).toBe(ATAJOS_POR_DEFECTO);
    expect(normalizarAtajosGuardados({ atajos: 'x' })).toBe(ATAJOS_POR_DEFECTO);
  });

  it('respeta una lista vacía y descarta entradas inválidas o repetidas', () => {
    expect(normalizarAtajosGuardados({ atajos: [] })).toEqual([]);
    expect(normalizarAtajosGuardados({ atajos: [
      { modulo: 'maestros', path: '/maestros/codigosMaestros', extra: 1 },
      { modulo: 'maestros', path: '/maestros/codigosMaestros' },
      { modulo: 'maestros' },
      null
    ] })).toEqual([{ modulo: 'maestros', path: '/maestros/codigosMaestros' }]);
  });
});

describe('alternarAtajo / moverAtajo', () => {
  const a = { modulo: 'implantes', path: '/implantes/gestionImplantes' };
  const b = { modulo: 'maestros', path: '/maestros/codigosMaestros' };
  const c = { modulo: 'documentos', path: '/documentos/reportesInfo' };

  it('marcar agrega al final y desmarcar quita', () => {
    const conC = alternarAtajo([a, b], c);
    expect(conC).toEqual([a, b, c]);
    expect(estaSeleccionado(conC, c)).toBe(true);
    expect(alternarAtajo(conC, a)).toEqual([b, c]);
  });

  it('mueve dentro de los límites y no cambia nada fuera de ellos', () => {
    expect(moverAtajo([a, b, c], 2, 0)).toEqual([c, a, b]);
    expect(moverAtajo([a, b, c], 0, 1)).toEqual([b, a, c]);
    const lista = [a, b];
    expect(moverAtajo(lista, 0, -1)).toBe(lista);
    expect(moverAtajo(lista, 1, 2)).toBe(lista);
  });
});

describe('puedeConfigurarAtajos', () => {
  it('solo el Desarrollador (activo)', () => {
    expect(puedeConfigurarAtajos({ rol: 'admin' })).toBe(false);
    expect(puedeConfigurarAtajos({ rol: 'dev', activo: false })).toBe(false);
    expect(puedeConfigurarAtajos({ rol: 'dev' })).toBe(true);
    expect(puedeConfigurarAtajos({ rol: 'encargado' })).toBe(false);
    expect(puedeConfigurarAtajos(null)).toBe(false);
  });
});
