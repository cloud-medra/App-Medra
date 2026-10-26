// @vitest-environment jsdom
// Códigos en Maestros y en Implantes: misma pantalla y datos, acceso y
// permisos granulares independientes por módulo.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, renderHook } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

let usuario = null;
vi.mock('../../../../context/UserContext', () => ({ useUser: () => ({ userData: usuario }) }));
vi.mock('firebase/firestore', () => ({ doc: vi.fn(), onSnapshot: () => () => {} }));
vi.mock('../../../../firebaseConfig', () => ({ db: {} }));
// Los contadores de las pestañas leen el catálogo en memoria.
vi.mock('../../../../hooks/useCatalogo', () => ({ useCatalogo: () => ({ datos: [], cargado: true, cargando: false }) }));
// Las pestañas leen Firestore: acá solo importa qué ruta reciben.
const tab = (nombre) => ({ default: ({ rutaVista }) => <div data-testid={nombre}>{rutaVista}</div> });
vi.mock('./tabs/TabPendientesV2', () => tab('pendientes'));
vi.mock('./tabs/TabConCodigoV2', () => tab('conCodigo'));
vi.mock('./tabs/TabVistaGeneralV2', () => tab('vistaGeneral'));

const { default: CodigosMaestros } = await import('./CodigosMaestrosV2');
const { RUTA_CODIGOS_IMPLANTES, RUTA_CODIGOS_MAESTROS, RUTA_CODIGOS_HEMODINAMIA } = await import('../shared/codigos/rutasCodigos');
const { subItemsVisibles, subItemsAsignables } = await import('../../../../config/accesoMenu');
const { MODULES } = await import('../../../../config/modulesConfig.jsx');
const { COMPONENT_MAPS } = await import('../../../../config/componentMaps/index.js');
const { useGranularPermission } = await import('../../../../hooks/useGranularPermission');
const { completarPermisosGranulares, completarVistasDelMenu } = await import('../../administracion/usuarios/permisosGranularesUtils');

afterEach(() => { cleanup(); usuario = null; });

const soloImplantes = () => ({
  rol: 'operador',
  permisos: { implantes: [RUTA_CODIGOS_IMPLANTES] },
  permisosGranulares: {
    [RUTA_CODIGOS_IMPLANTES]: {},
    [`${RUTA_CODIGOS_IMPLANTES}/conCodigo`]: { tabla_datos: { visible: true, elements: { action_eliminar: false } } },
  },
});
const soloMaestros = () => ({
  rol: 'operador',
  permisos: { maestros: [RUTA_CODIGOS_MAESTROS] },
  permisosGranulares: { [RUTA_CODIGOS_MAESTROS]: {}, [`${RUTA_CODIGOS_MAESTROS}/pendientes`]: {} },
});

describe('Códigos en Maestros y en Implantes', () => {
  it('son dos ítems de menú distintos, con el mismo ícono, ambos asignables en el editor de permisos', () => {
    const implantes = MODULES.implantes.subItems.find((s) => s.path === RUTA_CODIGOS_IMPLANTES);
    const maestros = MODULES.maestros.subItems.find((s) => s.path === RUTA_CODIGOS_MAESTROS);
    expect(implantes.label).toBe('Códigos');
    expect(implantes.icon.type).toBe(maestros.icon.type);
    expect(subItemsAsignables(MODULES.implantes).map((s) => s.path)).toContain(RUTA_CODIGOS_IMPLANTES);
    // Mismo mapa de permisos (secciones, acciones, columnas) con rutas propias.
    const mi = COMPONENT_MAPS[RUTA_CODIGOS_IMPLANTES];
    const mm = COMPONENT_MAPS[RUTA_CODIGOS_MAESTROS];
    expect(Object.keys(mi.procesos)).toEqual(Object.keys(mm.procesos).map((r) => r.replace(RUTA_CODIGOS_MAESTROS, RUTA_CODIGOS_IMPLANTES)));
    expect(mi.procesos[`${RUTA_CODIGOS_IMPLANTES}/conCodigo`]).toEqual(mm.procesos[`${RUTA_CODIGOS_MAESTROS}/conCodigo`]);
  });

  it('acceso a Implantes → Códigos sin Maestros → Códigos, y viceversa (menú)', () => {
    const rutas = (u, m) => subItemsVisibles(u, m).map((s) => s.path);
    expect(rutas(soloImplantes(), 'implantes')).toEqual([RUTA_CODIGOS_IMPLANTES]);
    expect(rutas(soloImplantes(), 'maestros')).toEqual([]);
    expect(rutas(soloMaestros(), 'maestros')).toEqual([RUTA_CODIGOS_MAESTROS]);
    expect(rutas(soloMaestros(), 'implantes')).toEqual([]);
    // admin/dev: ambos (acceso total).
    expect(rutas({ rol: 'admin', permisos: { implantes: [RUTA_CODIGOS_IMPLANTES], maestros: [RUTA_CODIGOS_MAESTROS] } }, 'implantes')).toContain(RUTA_CODIGOS_IMPLANTES);
  });

  it('los permisos granulares son independientes por módulo', () => {
    usuario = soloImplantes();
    const { result } = renderHook(() => useGranularPermission());
    expect(result.current.hasAccesoProceso(`${RUTA_CODIGOS_IMPLANTES}/conCodigo`)).toBe(true);
    expect(result.current.hasAccesoProceso(`${RUTA_CODIGOS_MAESTROS}/conCodigo`)).toBe(false);
    expect(result.current.hasPermission(`${RUTA_CODIGOS_IMPLANTES}/conCodigo`, 'tabla_datos', 'action_eliminar')).toBe(false);
    expect(result.current.hasPermission(`${RUTA_CODIGOS_IMPLANTES}/conCodigo`, 'tabla_datos', 'action_editar')).toBe(true);
    expect(result.current.hasPermission(`${RUTA_CODIGOS_MAESTROS}/conCodigo`, 'tabla_datos', 'action_editar')).toBe(false);
  });

  it('la pantalla en Implantes usa las rutas de Implantes (pestañas y permisos), y en Maestros las de Maestros', () => {
    usuario = soloImplantes();
    render(<CodigosMaestros rutaBase={RUTA_CODIGOS_IMPLANTES} />);
    expect(screen.getByTestId('conCodigo')).toHaveTextContent(`${RUTA_CODIGOS_IMPLANTES}/conCodigo`);
    expect(screen.queryByText('Sin código')).not.toBeInTheDocument(); // pestaña no otorgada
    cleanup();
    render(<CodigosMaestros />); // Maestros, mismo usuario: sin acceso
    expect(screen.getByText('Acceso insuficiente')).toBeInTheDocument();
    cleanup();
    usuario = soloMaestros();
    render(<CodigosMaestros />);
    expect(screen.getByTestId('pendientes')).toHaveTextContent(`${RUTA_CODIGOS_MAESTROS}/pendientes`);
  });

  it('nadie recibe Implantes → Códigos automáticamente (por tener Maestros → Códigos)', () => {
    const u = soloMaestros();
    const completados = completarPermisosGranulares(u.permisosGranulares, COMPONENT_MAPS);
    expect(Object.keys(completados).some((r) => r.startsWith(RUTA_CODIGOS_IMPLANTES))).toBe(false);
    expect(completarVistasDelMenu(u.permisos, completados, COMPONENT_MAPS).agregadas).toEqual([]);
  });
});

describe('Códigos en Hemodinamia (igual que Implantes)', () => {
  it('ítem propio, mismo ícono y mismo mapa de permisos con rutas de Hemodinamia', () => {
    const hemo = MODULES.hemodinamia.subItems.find((s) => s.path === RUTA_CODIGOS_HEMODINAMIA);
    const maestros = MODULES.maestros.subItems.find((s) => s.path === RUTA_CODIGOS_MAESTROS);
    expect(hemo.label).toBe('Códigos');
    expect(hemo.icon.type).toBe(maestros.icon.type);
    expect(subItemsAsignables(MODULES.hemodinamia).map((s) => s.path)).toContain(RUTA_CODIGOS_HEMODINAMIA);
    const mh = COMPONENT_MAPS[RUTA_CODIGOS_HEMODINAMIA];
    const mm = COMPONENT_MAPS[RUTA_CODIGOS_MAESTROS];
    expect(Object.keys(mh.procesos)).toEqual(Object.keys(mm.procesos).map((r) => r.replace(RUTA_CODIGOS_MAESTROS, RUTA_CODIGOS_HEMODINAMIA)));
    expect(mh.procesos[`${RUTA_CODIGOS_HEMODINAMIA}/conCodigo`]).toEqual(mm.procesos[`${RUTA_CODIGOS_MAESTROS}/conCodigo`]);
  });

  it('la pantalla en Hemodinamia usa sus propias rutas de pestañas y permisos', () => {
    usuario = {
      rol: 'operador',
      permisos: { hemodinamia: [RUTA_CODIGOS_HEMODINAMIA] },
      permisosGranulares: { [RUTA_CODIGOS_HEMODINAMIA]: {}, [`${RUTA_CODIGOS_HEMODINAMIA}/conCodigo`]: {} },
    };
    render(<CodigosMaestros rutaBase={RUTA_CODIGOS_HEMODINAMIA} />);
    expect(screen.getByTestId('conCodigo')).toHaveTextContent(`${RUTA_CODIGOS_HEMODINAMIA}/conCodigo`);
  });
});
