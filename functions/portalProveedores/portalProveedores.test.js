// La copia del portal: nunca lleva datos de pacientes y la relación con la empresa no
// adivina. Es lo que separa a un proveedor de los datos clínicos.
import { describe, it, expect } from 'vitest';
import {
  CAMPOS_PORTAL_OC, crearIndiceEmpresas, empresaIdDeProveedor, normalizarNombreEmpresa, proyeccionPortalOC,
  cambioVisibleEnPortal, idPortalOC, idsPortalOC,
} from './nucleo.mjs';

const FILA = {
  admision: '114584', paciente: 'JUANA PÉREZ', medico: 'DR. SOTO', fecha_cx: new Date(2026, 8, 15), proveedor: 'ARENYS MED S.A.',
  codigo: '510012', descripcion: 'TROCAR', cantidad: 2, precio_u: 1000, atributo: 'CONSIGNACION', oc: '45001', oc_monto: 2000,
  estado: 'Facturado', fecha_recepcion: new Date(), fecha_cargo: new Date(), numero_guia: 'G1', numero_factura: 'F1',
  fecha_emision: new Date(), fecha_ingreso: new Date(), lote: 'L1', fecha_vencimiento: new Date(),
};

describe('proyeccionPortalOC', () => {
  const copia = proyeccionPortalOC({ datos: FILA, proveedor: FILA.proveedor, empresaId: 'e1', anio: '2026', mes: '09' });

  it('lleva exactamente los campos autorizados', () => {
    expect(Object.keys(copia).sort()).toEqual([
      'anio', 'cantidad', 'codigo', 'descripcion', 'empresaId', 'estado', 'fecha_cx', 'mes', 'numero_factura', 'numero_guia', 'oc', 'proveedor',
    ]);
    expect(copia).toMatchObject({ oc: '45001', codigo: '510012', cantidad: 2, empresaId: 'e1', anio: '2026', mes: '09' });
  });

  it('nunca lleva datos del paciente, del médico, la admisión ni montos', () => {
    ['paciente', 'medico', 'admision', 'precio_u', 'oc_monto'].forEach((c) => {
      expect(copia).not.toHaveProperty(c);
      expect(CAMPOS_PORTAL_OC).not.toContain(c);
    });
    const texto = JSON.stringify(copia);
    ['JUANA', 'PÉREZ', 'SOTO', '114584'].forEach((v) => expect(texto).not.toContain(v));
  });

  it('un campo faltante queda null, no se pierde la forma del documento', () => {
    expect(proyeccionPortalOC({ datos: {}, proveedor: null, empresaId: undefined, anio: 2026, mes: '01' }))
      .toMatchObject({ oc: null, proveedor: null, empresaId: null, anio: '2026' });
  });
});

describe('relación con el Maestro de Empresas', () => {
  const indice = crearIndiceEmpresas([
    { id: 'a', nombre: 'ARENYS MED S.A.' },
    { id: 'm', nombre: 'MEDILAND S A' },
    { id: 'd1', nombre: 'DOBLE SPA' },
    { id: 'd2', nombre: 'Doble S.P.A' === 'x' ? '' : 'DOBLE  SPA' },
    { id: 'v', nombre: '' },
  ]);

  it('reconoce el nombre sin importar tildes, mayúsculas ni signos', () => {
    expect(empresaIdDeProveedor(indice, 'arenys med s.a.')).toBe('a');
    expect(empresaIdDeProveedor(indice, 'Arenys  Mèd S A')).toBe('a');
    expect(normalizarNombreEmpresa('  S.A. ')).toBe('S A');
  });

  it('otro tipo de sociedad NO es la misma empresa: MEDILAND SPA queda sin empresa', () => {
    expect(empresaIdDeProveedor(indice, 'MEDILAND S A')).toBe('m');
    expect(empresaIdDeProveedor(indice, 'MEDILAND SPA')).toBeNull();
  });

  it('un nombre repetido en el Maestro no se adivina', () => {
    expect(empresaIdDeProveedor(indice, 'DOBLE SPA')).toBeNull();
  });

  it('sin nombre o desconocido queda sin empresa', () => {
    expect(empresaIdDeProveedor(indice, '')).toBeNull();
    expect(empresaIdDeProveedor(indice, null)).toBeNull();
    expect(empresaIdDeProveedor(indice, 'OTRA SPA')).toBeNull();
  });
});

describe('cambioVisibleEnPortal', () => {
  it('solo los campos autorizados obligan a reescribir la copia', () => {
    expect(cambioVisibleEnPortal({ estado: 'x' })).toBe(true);
    expect(cambioVisibleEnPortal({ paciente: 'x', medico: 'y', precio_u: 1, lote: 'z' })).toBe(false);
    expect(cambioVisibleEnPortal(undefined)).toBe(false);
  });
});

describe('idPortalOC', () => {
  const ID = '114584_20260915_medtronic_510012_1';

  it('no revela la admisión ni la fecha, y siempre da lo mismo', async () => {
    const h = await idPortalOC(ID);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toContain('114584');
    expect(await idPortalOC(ID)).toBe(h);
    expect(await idPortalOC(`${ID}x`)).not.toBe(h);
  });

  it('idsPortalOC resuelve varios sin repetir', async () => {
    const m = await idsPortalOC(['a', 'b', 'a']);
    expect(m.size).toBe(2);
    expect(m.get('a')).toBe(await idPortalOC('a'));
  });
});
