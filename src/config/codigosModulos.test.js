// Códigos de módulos: formato, unicidad, cobertura de todo el menú y
// permanencia de los ya publicados.
import { describe, it, expect } from 'vitest';
import { CODIGOS_MODULOS, codigoEntrada } from './codigosModulos';
import { MODULES } from './modulesConfig.jsx';
import { GRUPOS_MENU } from './gruposMenu.jsx';

describe('códigos de módulos', () => {
  it('3 letras mayúsculas y únicos', () => {
    const codigos = Object.values(CODIGOS_MODULOS);
    codigos.forEach((c) => expect(c).toMatch(/^[A-Z]{3}$/));
    expect(new Set(codigos).size).toBe(codigos.length);
  });

  it('todo módulo y grupo del menú tiene código', () => {
    [...Object.keys(MODULES), ...Object.keys(GRUPOS_MENU)].forEach((k) => {
      expect(codigoEntrada(k), `falta el código de "${k}"`).not.toBeNull();
    });
  });

  // Permanentes: si este test falla porque se cambió un código, revertir el
  // cambio (los códigos publicados no se modifican). Uno nuevo se agrega aquí.
  it('los códigos publicados no cambian', () => {
    expect(CODIGOS_MODULOS).toEqual({
      implantes: 'IMP', hemodinamia: 'HEM', consignacion: 'CON', documentos: 'DOC',
      laboratorio: 'LAB', vacunatorio: 'VAC', bodega: 'BOD', inventario: 'INV',
      maestros: 'MAE', finanzas: 'FIN', usuarios: 'USR', administracion: 'HER',
      dashboard: 'DSH', ajustes: 'AJU',
    });
  });
});
