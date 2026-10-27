import { describe, it, expect } from 'vitest';
import { MODULES } from './modulesConfig.jsx';
import {
  entradaDeRuta, moduloDeEntrada, entradasMenu, itemsDeEntrada, etiquetaEntrada,
} from './gruposMenu.jsx';

const rutas = (items) => items.map((s) => s.path);

describe('gruposMenu: Administración repartida en el sidebar', () => {
  it('las rutas y la clave de permiso no cambian', () => {
    const admin = MODULES.administracion.subItems;
    expect(rutas(admin).every((r) => r.startsWith('/administracion/'))).toBe(true);
    expect(moduloDeEntrada('finanzas')).toBe('administracion');
    expect(moduloDeEntrada('usuarios')).toBe('administracion');
    expect(moduloDeEntrada('administracion')).toBe('administracion');
    expect(moduloDeEntrada('bodega')).toBe('bodega');
  });

  it('cada ítem cae en su grupo', () => {
    expect(entradaDeRuta('administracion', '/administracion/controlMensual')).toBe('finanzas');
    expect(entradaDeRuta('administracion', '/administracion/ResumenPeriodoAbierto')).toBe('finanzas');
    expect(entradaDeRuta('administracion', '/administracion/estadisticas')).toBe('finanzas');
    expect(entradaDeRuta('administracion', '/administracion/cargasConsolidado')).toBe('finanzas');
    expect(entradaDeRuta('administracion', '/administracion/crearUsuario')).toBe('usuarios');
    expect(entradaDeRuta('administracion', '/administracion/listadoUsuario')).toBe('usuarios');
    expect(entradaDeRuta('administracion', '/administracion/permisosCentro')).toBe('usuarios');
    expect(entradaDeRuta('administracion', '/administracion/alertas')).toBe('usuarios');
    expect(entradaDeRuta('administracion', '/administracion/gestionModulos')).toBe('administracion');
    expect(entradaDeRuta('bodega', '/bodega/ingresoBodega')).toBe('bodega');
  });

  it('los grupos ocupan el lugar de Administración en el orden', () => {
    expect(entradasMenu(['bodega', 'administracion', 'maestros']))
      .toEqual(['bodega', 'finanzas', 'usuarios', 'administracion', 'maestros']);
  });

  it('reparte los ítems sin perder ni repetir ninguno', () => {
    const admin = MODULES.administracion.subItems;
    const repartidos = ['finanzas', 'usuarios', 'administracion'].flatMap((e) => rutas(itemsDeEntrada(e, admin)));
    expect([...repartidos].sort()).toEqual(rutas(admin).sort());
    expect(rutas(itemsDeEntrada('finanzas', admin))).toEqual([
      '/administracion/controlMensual', '/administracion/ResumenPeriodoAbierto', '/administracion/cargasConsolidado', '/administracion/estadisticas',
      '/administracion/consumos', '/administracion/facturas', '/administracion/valorizacionBodega',
    ]);
    // Respeta el orden recibido (ordenSubItems del usuario).
    const invertidos = [...admin].reverse();
    expect(rutas(itemsDeEntrada('finanzas', invertidos))).toEqual([
      '/administracion/valorizacionBodega', '/administracion/facturas', '/administracion/consumos', '/administracion/estadisticas', '/administracion/cargasConsolidado', '/administracion/ResumenPeriodoAbierto', '/administracion/controlMensual',
    ]);
  });

  it('etiquetas de las entradas', () => {
    expect(etiquetaEntrada('finanzas')).toBe('Finanzas');
    expect(etiquetaEntrada('usuarios')).toBe('Usuarios y accesos');
    expect(etiquetaEntrada('administracion')).toBe('Herramientas');
    expect(etiquetaEntrada('bodega')).toBe('Bodega');
  });
});
