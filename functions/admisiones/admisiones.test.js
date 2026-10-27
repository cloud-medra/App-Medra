import { describe, it, expect } from 'vitest';
import {
  MARCAS_ADMISION, COLECCION_ADMISIONES, COLECCION_ADMISIONES_CONSIGNACION, ESTADOS_ADMISION,
  resumenGestion, resumenRegistroConsignacion, agregarAdmision,
} from './nucleo.mjs';

// Marca por admisión de Reporte Info: Implantes (por gestión) y
// Consignación (por registro), con el mismo estado agregado.
describe('resumenRegistroConsignacion', () => {
  it('un registro es un ítem: pendiente hasta CARGADO; SOLICITADO = imputado', () => {
    expect(resumenRegistroConsignacion({ estado: 'INGRESADO', fecha: '2026-10-05' })).toEqual({ items: 1, pendientes: 1, imputada: false, fecha: '2026-10-05' });
    expect(resumenRegistroConsignacion({ estado: 'CARGADO' })).toMatchObject({ pendientes: 0, imputada: false });
    expect(resumenRegistroConsignacion({ estado: 'solicitado' })).toMatchObject({ pendientes: 0, imputada: true });
    expect(resumenRegistroConsignacion({})).toMatchObject({ pendientes: 1, imputada: false, fecha: null });
  });

  it('agregarAdmision da gestionada / cargada / imputada como en Implantes', () => {
    const r = (estado) => resumenRegistroConsignacion({ estado });
    expect(agregarAdmision({ a: r('CARGADO'), b: r('PENDIENTE') }).estado).toBe(ESTADOS_ADMISION.GESTIONADA);
    expect(agregarAdmision({ a: r('CARGADO'), b: r('CARGADO') }).estado).toBe(ESTADOS_ADMISION.CARGADA);
    expect(agregarAdmision({ a: r('CARGADO'), b: r('SOLICITADO') }).estado).toBe(ESTADOS_ADMISION.IMPUTADA);
    expect(agregarAdmision({}).estado).toBe(ESTADOS_ADMISION.PENDIENTE);
  });
});

describe('MARCAS_ADMISION', () => {
  it('Implantes conserva su colección y su resumen; Consignación tiene los suyos', () => {
    expect(MARCAS_ADMISION.implantes).toEqual({ coleccion: COLECCION_ADMISIONES, origen: 'implantes_gestiones', resumen: resumenGestion });
    expect(MARCAS_ADMISION.consignacion).toEqual({
      coleccion: COLECCION_ADMISIONES_CONSIGNACION, origen: 'consignacion_registros', resumen: resumenRegistroConsignacion,
    });
    expect(COLECCION_ADMISIONES).toBe('admisiones_gestionadas_implantes');
  });
});
