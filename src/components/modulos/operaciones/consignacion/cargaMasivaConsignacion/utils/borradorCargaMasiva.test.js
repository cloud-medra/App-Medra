// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  guardarBorrador, leerBorrador, borrarBorrador, borrarTodosLosBorradoresCargaMasiva,
  filasDesdeBorrador, claveBorrador, VIGENCIA_BORRADOR_MS
} from './borradorCargaMasiva';
import { crearFilaVacia } from './grillaPortapapeles';

const fila = (valores) => ({ ...crearFilaVacia(), valores: { ...crearFilaVacia().valores, ...valores }, resultado: { estado: 'OK' } });

describe('borradorCargaMasiva', () => {
  beforeEach(() => localStorage.clear());

  it('guarda solo las filas con datos, en orden, sin el resultado de "Cargar", y las lee de vuelta', () => {
    guardarBorrador('u1', { tipo: 'COTIZACION', filas: [fila({ admision: '1', codigo: 'A' }), crearFilaVacia(), fila({ admision: '2' })] }, 1000);
    const guardado = JSON.parse(localStorage.getItem(claveBorrador('u1')));
    expect(guardado.filas).toHaveLength(2);
    expect(JSON.stringify(guardado)).not.toContain('resultado');

    const b = leerBorrador('u1', 2000);
    expect(b.tipo).toBe('COTIZACION');
    expect(b.guardadoEn).toBe(1000);
    expect(b.valores.map((v) => v.admision)).toEqual(['1', '2']);
    expect(b.valores[0].codigo).toBe('A');
  });

  it('cada usuario ve solo su borrador', () => {
    guardarBorrador('u1', { tipo: 'CONSIGNACION', filas: [fila({ admision: '1' })] });
    expect(leerBorrador('u2')).toBeNull();
    expect(leerBorrador('u1')).not.toBeNull();
  });

  it('vence a los 2 días y se borra al leerlo', () => {
    guardarBorrador('u1', { tipo: 'CONSIGNACION', filas: [fila({ admision: '1' })] }, 0);
    expect(leerBorrador('u1', VIGENCIA_BORRADOR_MS)).not.toBeNull();
    expect(leerBorrador('u1', VIGENCIA_BORRADOR_MS + 1)).toBeNull();
    expect(localStorage.getItem(claveBorrador('u1'))).toBeNull();
  });

  it('sin filas con datos no deja borrador; contenido inválido se descarta', () => {
    guardarBorrador('u1', { tipo: 'CONSIGNACION', filas: [fila({ admision: '1' })] });
    guardarBorrador('u1', { tipo: 'CONSIGNACION', filas: [crearFilaVacia()] });
    expect(localStorage.getItem(claveBorrador('u1'))).toBeNull();

    localStorage.setItem(claveBorrador('u1'), '{no es json');
    expect(leerBorrador('u1')).toBeNull();
    expect(guardarBorrador(null, { tipo: 'CONSIGNACION', filas: [fila({ admision: '1' })] })).toBe(false);
  });

  it('al cerrar sesión se borran los borradores de todos los usuarios y nada más', () => {
    guardarBorrador('u1', { tipo: 'CONSIGNACION', filas: [fila({ admision: '1' })] });
    guardarBorrador('u2', { tipo: 'CONSIGNACION', filas: [fila({ admision: '2' })] });
    localStorage.setItem('otra.clave', 'x');
    borrarTodosLosBorradoresCargaMasiva();
    expect(leerBorrador('u1')).toBeNull();
    expect(leerBorrador('u2')).toBeNull();
    expect(localStorage.getItem('otra.clave')).toBe('x');
  });

  it('borrarBorrador y filasDesdeBorrador', () => {
    guardarBorrador('u1', { tipo: 'CONSIGNACION', filas: [fila({ admision: '1' })] });
    borrarBorrador('u1');
    expect(leerBorrador('u1')).toBeNull();

    const filas = filasDesdeBorrador([{ ...crearFilaVacia().valores, admision: '9' }], 3);
    expect(filas).toHaveLength(3);
    expect(filas[0].valores.admision).toBe('9');
    expect(filas[0].resultado).toBeNull();
    expect(new Set(filas.map((f) => f.id)).size).toBe(3);
  });
});
