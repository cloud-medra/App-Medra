import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import {
  fotoItems, diferenciasContraFoto, hayModificacion, camposModificacionAlGuardar,
  construirFilasModificaciones, libroModificaciones, nombreArchivoModificaciones, tituloModificaciones, MOVIMIENTOS
} from './modificacionesSolicitud';

const item = (id, extra = {}) => ({
  id, codigo: `C${id}`, referencia: `R${id}`, descriptorAuto: `PLACA ${id}`, cantidad: 1, precio: 1000, venta: 1500,
  lote: 'L1', vencimiento: '2027-01-01', tipoVinculado: 'COTIZACION', numCotizacion: 'Q1', estadoCarga: 'CARGADO', ...extra,
});
const SOLICITADO = [item('a'), item('b')];
const FOTO = fotoItems(SOLICITADO);

// Simula varias ediciones guardadas antes de descargar: cada guardado compara
// la versión actual contra la MISMA foto (la de la última descarga).
const editar = (items, ...pasos) => pasos.reduce((acc, paso) => paso(acc), items);

describe('foto de lo solicitado', () => {
  it('guarda solo los campos del Excel, normalizados', () => {
    expect(FOTO[0]).toEqual({
      id: 'a', codigo: 'Ca', referencia: 'Ra', descriptorAuto: 'PLACA a', cantidad: 1, precio: 1000, venta: 1500,
      lote: 'L1', vencimiento: '2027-01-01', tipoVinculado: 'COTIZACION', numCotizacion: 'Q1',
    });
    expect(FOTO[0]).not.toHaveProperty('estadoCarga');
  });
});

describe('comparación contra la foto', () => {
  it('sin cambios no hay modificación (un cambio de estado de carga no cuenta)', () => {
    expect(hayModificacion(FOTO, SOLICITADO)).toBe(false);
    expect(hayModificacion(FOTO, [item('a', { estadoCarga: 'REVISAR' }), item('b')])).toBe(false);
    expect(hayModificacion(FOTO, [item('a', { cantidad: '1' }), item('b')])).toBe(false);
  });

  it('detecta agregados, modificados y eliminados', () => {
    const cambios = diferenciasContraFoto(FOTO, [item('a', { cantidad: 3, venta: 4500 }), item('c')]);
    expect(cambios.map((c) => [c.movimiento, c.id])).toEqual([
      [MOVIMIENTOS.MODIFICADO, 'a'], [MOVIMIENTOS.ELIMINADO, 'b'], [MOVIMIENTOS.AGREGADO, 'c'],
    ]);
    expect(cambios[0].campos).toEqual(['cantidad', 'venta']);
  });

  it('editado dos veces antes de descargar: una sola fila MODIFICADO, del original al valor final', () => {
    const final = editar(SOLICITADO,
      (its) => its.map((it) => (it.id === 'a' ? { ...it, cantidad: 2 } : it)),
      (its) => its.map((it) => (it.id === 'a' ? { ...it, cantidad: 5, precio: 900 } : it)));
    const cambios = diferenciasContraFoto(FOTO, final);
    expect(cambios).toHaveLength(1);
    expect(cambios[0]).toMatchObject({ movimiento: 'MODIFICADO', id: 'a', anterior: { cantidad: 1, precio: 1000 }, nuevo: { cantidad: 5, precio: 900 } });
  });

  it('agregado y luego eliminado: no aparece', () => {
    const final = editar(SOLICITADO, (its) => [...its, item('c')], (its) => its.filter((it) => it.id !== 'c'));
    expect(diferenciasContraFoto(FOTO, final)).toEqual([]);
  });

  it('modificado y luego eliminado: queda como ELIMINADO con los valores de la foto', () => {
    const final = editar(SOLICITADO,
      (its) => its.map((it) => (it.id === 'b' ? { ...it, cantidad: 9 } : it)),
      (its) => its.filter((it) => it.id !== 'b'));
    const cambios = diferenciasContraFoto(FOTO, final);
    expect(cambios).toHaveLength(1);
    expect(cambios[0]).toMatchObject({ movimiento: 'ELIMINADO', id: 'b', anterior: { cantidad: 1 }, nuevo: null });
  });

  it('volver al estado original: sin modificación pendiente', () => {
    const final = editar(SOLICITADO,
      (its) => its.map((it) => (it.id === 'a' ? { ...it, cantidad: 4, lote: 'X' } : it)),
      (its) => its.map((it) => (it.id === 'a' ? { ...it, cantidad: 1, lote: 'L1' } : it)));
    expect(hayModificacion(FOTO, final)).toBe(false);
  });
});

describe('al guardar la edición de un bloque SOLICITADO', () => {
  it('con foto: compara contra ella y la conserva', () => {
    const r = camposModificacionAlGuardar({ fotoGuardada: FOTO, itemsAntes: [], itemsDespues: [item('a')] });
    expect(r).toEqual({ itemsSolicitados: FOTO, modificacionPendiente: true });
  });
  it('bloque solicitado antes del cambio (sin foto): la base es el documento antes de esta edición', () => {
    const r = camposModificacionAlGuardar({ fotoGuardada: undefined, itemsAntes: SOLICITADO, itemsDespues: SOLICITADO });
    expect(r).toEqual({ itemsSolicitados: FOTO, modificacionPendiente: false });
    const r2 = camposModificacionAlGuardar({ fotoGuardada: undefined, itemsAntes: SOLICITADO, itemsDespues: [item('a')] });
    expect(r2.modificacionPendiente).toBe(true);
  });
});

describe('Excel de modificaciones', () => {
  const BLOQUE = {
    gestionId: '500', nombre: 'JUAN', medico: 'DR X', fecha: '2026-10-05', empresa: 'ACME', periodo: 'Octubre 2026',
    fechaSolicitud: new Date('2026-10-10T12:00:00'), itemsSolicitados: FOTO,
    items: [item('a', { cantidad: 3, venta: 4500 }), item('c', { cantidad: 2, venta: 3000 })],
  };

  it('solo las filas que cambiaron, con anterior y nuevo, y diferencias con signo', () => {
    const filas = construirFilasModificaciones([BLOQUE], '26-10-2026');
    expect(filas.map((f) => f.MOVIMIENTO)).toEqual(['MODIFICADO', 'ELIMINADO', 'AGREGADO']);
    const [mod, elim, agr] = filas;
    expect(mod).toMatchObject({ 'CANTIDAD ANTERIOR': 1, 'CANTIDAD': 3, 'DIFERENCIA CANTIDAD': 2, 'VENTA ANTERIOR': 1500, 'VENTA': 4500, 'DIFERENCIA VENTA': 3000 });
    expect(elim).toMatchObject({ 'CANTIDAD ANTERIOR': 1, 'CANTIDAD': '', 'DIFERENCIA CANTIDAD': -1, 'DIFERENCIA VENTA': -1500 });
    expect(agr).toMatchObject({ 'CANTIDAD ANTERIOR': '', 'CANTIDAD': 2, 'DIFERENCIA CANTIDAD': 2, 'DIFERENCIA VENTA': 3000 });
    filas.forEach((f) => expect(f).toMatchObject({ 'FECHA SOLICITUD ORIGINAL': '10-10-2026', 'PERIODO IMPUTACION': 'Octubre 2026', ID: '500' }));
  });

  it('nombre, hoja y título dejan claro que es una modificación (y COPIA en la segunda descarga)', () => {
    expect(nombreArchivoModificaciones('solicitud_implantes', '2026-10-26')).toBe('MODIFICACIONES_solicitud_implantes_2026-10-26.xlsx');
    expect(nombreArchivoModificaciones('solicitud_implantes', '2026-10-26', { copia: true })).toMatch(/^MODIFICACIONES_COPIA_/);
    expect(tituloModificaciones('Implantes')).toMatch(/solo cambios sobre solicitudes ya enviadas. No reemplaza ni duplica la solicitud original/i);
    expect(tituloModificaciones('Implantes', { copia: true })).toMatch(/^COPIA/);

    const filas = construirFilasModificaciones([BLOQUE], '26-10-2026');
    const libro = libroModificaciones({ filas, titulo: tituloModificaciones('Implantes'), subtitulo: 'Generado' });
    expect(libro.SheetNames).toEqual(['Modificaciones']);
    const hoja = libro.Sheets.Modificaciones;
    expect(hoja.A1.v).toMatch(/^MODIFICACIONES DE SOLICITUDES DE IMPLANTES/);
    expect(hoja.A4.v).toBe('MOVIMIENTO');
    const datos = XLSX.utils.sheet_to_json(hoja, { range: 3 });
    expect(datos).toHaveLength(4); // 3 movimientos + fila de totales
    expect(datos[3]).toMatchObject({ MOVIMIENTO: 'TOTAL DIFERENCIAS', 'DIFERENCIA CANTIDAD': 3, 'DIFERENCIA VENTA': 4500 });
  });
});
