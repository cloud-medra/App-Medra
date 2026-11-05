// La copia del portal: lleva solo la lista blanca (nunca médico, admisión ni RUT) y la
// relación con la empresa no adivina. Es lo que separa a un proveedor del resto de los datos.
import { describe, it, expect } from 'vitest';
import {
  CAMPOS_PORTAL_OC, crearIndiceEmpresas, empresaIdDeProveedor, normalizarNombreEmpresa, proyeccionPortalOC,
  cambioVisibleEnPortal, idPortalOC, idsPortalOC, diferenciasCopiaPortal,
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
      'anio', 'cantidad', 'codigo', 'descripcion', 'empresaId', 'estado', 'fecha_cx', 'mes', 'numero_factura', 'numero_guia', 'oc', 'oc_monto', 'paciente', 'precio_u', 'proveedor',
    ]);
    expect(copia).toMatchObject({ oc: '45001', codigo: '510012', cantidad: 2, empresaId: 'e1', anio: '2026', mes: '09', paciente: 'JUANA PÉREZ', precio_u: 1000, oc_monto: 2000 });
  });

  it('nunca lleva médico, admisión, RUT ni otros datos de la fila', () => {
    const conRut = proyeccionPortalOC({ datos: { ...FILA, rut: '11.111.111-1' }, proveedor: FILA.proveedor, empresaId: 'e1', anio: '2026', mes: '09' });
    ['medico', 'admision', 'rut', 'atributo', 'lote', 'fecha_recepcion', 'fecha_cargo', 'fecha_emision', 'fecha_ingreso', 'fecha_vencimiento'].forEach((c) => {
      expect(conRut).not.toHaveProperty(c);
      expect(CAMPOS_PORTAL_OC).not.toContain(c);
    });
    const texto = JSON.stringify(conRut);
    ['SOTO', '114584', '11.111.111-1'].forEach((v) => expect(texto).not.toContain(v));
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
    { id: 'd2', nombre: 'DOBLE  SPA' },
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
    ['estado', 'paciente', 'precio_u', 'oc_monto'].forEach((c) => expect(cambioVisibleEnPortal({ [c]: 'x' })).toBe(true));
    expect(cambioVisibleEnPortal({ medico: 'y', admision: '1', lote: 'z' })).toBe(false);
    expect(cambioVisibleEnPortal(undefined)).toBe(false);
  });
});

describe('diferenciasCopiaPortal', () => {
  const copia = (o = {}) => ({
    ...proyeccionPortalOC({ datos: { ...FILA, fecha_cx: new Date(2026, 8, 15) }, proveedor: FILA.proveedor, empresaId: 'e1', anio: '2026', mes: '09' }),
    ...o,
  });

  it('una copia al día no tiene diferencias, aunque su fecha de escritura sea otra', () => {
    expect(diferenciasCopiaPortal(copia(), copia({ actualizadoEn: new Date() }))).toEqual({ desfasados: [], noAutorizados: [] });
  });

  it('detecta cada campo desfasado', () => {
    expect(diferenciasCopiaPortal(copia(), copia({ estado: 'Otro', numero_factura: 'F9', empresaId: null })).desfasados)
      .toEqual(['estado', 'numero_factura', 'empresaId']);
    expect(diferenciasCopiaPortal(copia(), copia({ cantidad: 3 })).desfasados).toEqual(['cantidad']);
    expect(diferenciasCopiaPortal(copia(), copia({ mes: '10' })).desfasados).toEqual(['mes']);
  });

  it('compara las fechas por instante, sea cual sea su tipo', () => {
    const ms = new Date(2026, 8, 15).getTime();
    expect(diferenciasCopiaPortal(copia(), copia({ fecha_cx: { toMillis: () => ms } })).desfasados).toEqual([]);
    expect(diferenciasCopiaPortal(copia(), copia({ fecha_cx: { toMillis: () => ms + 86400000 } })).desfasados).toEqual(['fecha_cx']);
  });

  it('vacío, null y espacios de más no cuentan como cambio; un 0 sí se distingue de vacío', () => {
    expect(diferenciasCopiaPortal(copia({ numero_guia: null }), copia({ numero_guia: '' })).desfasados).toEqual([]);
    expect(diferenciasCopiaPortal(copia({ descripcion: 'A  B ' }), copia({ descripcion: 'A B' })).desfasados).toEqual([]);
    expect(diferenciasCopiaPortal(copia({ cantidad: 0 }), copia({ cantidad: null })).desfasados).toEqual(['cantidad']);
  });

  it('avisa si la copia guardada trae un campo que no debe tener, como médico', () => {
    expect(diferenciasCopiaPortal(copia(), copia({ medico: 'DR', admision: '1', rut: '1-9' })).noAutorizados).toEqual(['medico', 'admision', 'rut']);
  });

  it('detecta el nombre y los montos desfasados', () => {
    expect(diferenciasCopiaPortal(copia(), copia({ paciente: 'OTRA', precio_u: 1, oc_monto: 2 })).desfasados).toEqual(['paciente', 'precio_u', 'oc_monto']);
  });

  it('una copia inexistente sale con todo desfasado', () => {
    expect(diferenciasCopiaPortal(copia(), undefined).desfasados.length).toBeGreaterThan(5);
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
