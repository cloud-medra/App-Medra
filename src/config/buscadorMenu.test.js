// Buscador del sidebar: índice solo con lo visible, búsqueda sin tildes ni
// mayúsculas, código de módulo (todos sus ítems) y código exacto de ítem.
import { describe, it, expect } from 'vitest';
import { indiceMenu, buscarEnMenu, normalizarBusqueda } from './buscadorMenu';
import { entradasDelSidebar, itemsDelSidebar } from './menuSidebar';
import { etiquetaEntrada } from './gruposMenu.jsx';
import { AJUSTES_ITEMS } from './modulesConfig.jsx';

const LAB = '/laboratorio/archivosControlLaboratorio';
// Usuario con solo dos ítems de Laboratorio (ni Implantes ni Finanzas).
const usuario = {
  uid: 'u1', rol: 'operador',
  permisos: { laboratorio: ['/laboratorio/ordenLaboratorio', LAB] },
  permisosGranulares: { [`${LAB}/iniciarProcesos`]: {}, [`${LAB}/vinculacionCodigos`]: {} },
};
const indiceDe = (u, activos = null) => indiceMenu({
  entradas: entradasDelSidebar(u, activos),
  itemsDe: (e) => itemsDelSidebar(u, e, activos),
  etiquetaDe: etiquetaEntrada,
  ajustes: AJUSTES_ITEMS.filter((i) => !i.soloDesarrollador),
});
const codigos = (lista) => lista.map((r) => r.codigo);

describe('buscador del menú', () => {
  it('normaliza mayúsculas, tildes y espacios', () => {
    expect(normalizarBusqueda('  Vinculación   de CÓDIGOS ')).toBe('vinculacion de codigos');
  });

  it('el índice tiene solo lo que el usuario ve en su menú', () => {
    const indice = indiceDe(usuario);
    expect(codigos(indice.filter((r) => r.entrada === 'laboratorio'))).toEqual(['LAB', 'LABORD', 'LABFOL', 'LABVCO']);
    expect(indice.some((r) => r.entrada === 'implantes' || r.entrada === 'finanzas')).toBe(false);
  });

  it('busca por nombre sin tildes ni mayúsculas, con el módulo de cada ítem', () => {
    const res = buscarEnMenu(indiceDe(usuario), 'vinculacion');
    expect(res).toEqual([expect.objectContaining({ codigo: 'LABVCO', nombre: 'Vinculación de Códigos', modulo: 'Laboratorio', tipo: 'item' })]);
  });

  it('código exacto de ítem primero (Enter lo abre), sin importar mayúsculas', () => {
    expect(buscarEnMenu(indiceDe(usuario), 'labfol')[0]).toMatchObject({ codigo: 'LABFOL', ruta: `${LAB}/iniciarProcesos` });
  });

  it('código de módulo: el módulo y todos sus ítems visibles', () => {
    expect(codigos(buscarEnMenu(indiceDe(usuario), 'LAB'))).toEqual(['LAB', 'LABORD', 'LABFOL', 'LABVCO']);
  });

  it('nunca revela ítems sin acceso, ni por su código exacto', () => {
    const indice = indiceDe(usuario);
    expect(buscarEnMenu(indice, 'LABDIF')).toEqual([]);
    expect(buscarEnMenu(indice, 'Solicitud Diferencias')).toEqual([]);
    expect(buscarEnMenu(indice, 'IMPGES')).toEqual([]);
    expect(buscarEnMenu(indice, 'IMP')).toEqual([]);
  });

  it('un ítem inactivo (Gestión de módulos) tampoco aparece', () => {
    const activos = { modulosInactivos: [], itemsInactivos: ['/laboratorio/ordenLaboratorio'] };
    const indice = indiceDe(usuario, activos);
    expect(buscarEnMenu(indice, 'LABORD')).toEqual([]);
  });

  it('incluye Ajustes y el Dashboard', () => {
    const indice = indiceDe(usuario);
    expect(buscarEnMenu(indice, 'AJUDAT')[0]).toMatchObject({ nombre: 'Datos Personales', modulo: 'Ajustes Sistema' });
    expect(buscarEnMenu(indice, 'DSH')[0]).toMatchObject({ entrada: 'dashboard', tipo: 'modulo' });
    expect(buscarEnMenu(indice, 'AJUATA')).toEqual([]); // Atajos: solo Desarrollador
  });
});
