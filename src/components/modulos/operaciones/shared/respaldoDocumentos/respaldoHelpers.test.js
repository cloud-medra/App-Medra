import { describe, it, expect } from 'vitest';
import {
  construirNombreRespaldo, validarFilaRespaldo, datosDesdeNombreArchivo, filtrarRespaldos, ordenarRespaldos, fechaValida,
} from './respaldoHelpers';
import { idDesdeNombre, pacienteDesdeNombre, tipoDesdeNombre } from '../documentosAdmision/documentosHelpers';

const pdf = (name = 'a.pdf', size = 1000) => ({ name, size, type: 'application/pdf' });

describe('construirNombreRespaldo', () => {
  it('arma "ID - Nombre - TIPO.pdf" y se lee igual que en Gestión/Carga masiva', () => {
    const n = construirNombreRespaldo({ idAdmision: ' 123456 ', nombre: 'Juan  Pérez', tipo: 'cot' });
    expect(n).toBe('123456 - Juan Pérez - COT.pdf');
    expect([idDesdeNombre(n), pacienteDesdeNombre(n), tipoDesdeNombre(n)]).toEqual(['123456', 'Juan Pérez', 'COT']);
  });
  it('limpia caracteres inválidos y el separador dentro del nombre', () => {
    expect(construirNombreRespaldo({ idAdmision: '12', nombre: 'Ana / Soto - Ruiz #2', tipo: 'DP' }))
      .toBe('12 - Ana _ Soto Ruiz _2 - DP.pdf');
  });
});

describe('validarFilaRespaldo', () => {
  const ok = { file: pdf(), idAdmision: '123', fecha: '2026-10-08', nombre: 'Juan', tipo: 'DP' };
  it('fila completa es válida', () => expect(validarFilaRespaldo(ok)).toEqual({}));
  it('todos los campos son obligatorios', () => {
    expect(Object.keys(validarFilaRespaldo({}))).toEqual(['file', 'idAdmision', 'fecha', 'nombre', 'tipo']);
  });
  it('rechaza no-PDF, más de 20 MB, ID con espacios, fecha inexistente y tipo desconocido', () => {
    expect(validarFilaRespaldo({ ...ok, file: { name: 'a.png', size: 1, type: 'image/png' } }).file).toMatch(/PDF/);
    expect(validarFilaRespaldo({ ...ok, file: pdf('a.pdf', 21 * 1024 * 1024) }).file).toMatch(/20 MB/);
    expect(validarFilaRespaldo({ ...ok, idAdmision: '12 3' }).idAdmision).toBeTruthy();
    expect(validarFilaRespaldo({ ...ok, fecha: '2026-02-30' }).fecha).toBeTruthy();
    expect(validarFilaRespaldo({ ...ok, tipo: 'XYZ' }).tipo).toBeTruthy();
  });
  it('fechaValida', () => {
    expect(fechaValida('2024-02-29')).toBe(true);
    expect(fechaValida('2026-13-01')).toBe(false);
  });
});

describe('datosDesdeNombreArchivo', () => {
  it('lee ID, nombre y tipo de un nombre con el formato de Implantes', () => {
    expect(datosDesdeNombreArchivo('102030 - JOSE PEREZ - COT 1234 - EMPRESA.pdf'))
      .toEqual({ idAdmision: '102030', nombre: 'JOSE PEREZ', tipo: 'COT' });
  });
  it('lo que no se puede leer queda vacío', () => {
    expect(datosDesdeNombreArchivo('escaneo.pdf')).toEqual({ idAdmision: '', nombre: '', tipo: '' });
  });
});

describe('filtrar y ordenar', () => {
  const docs = [
    { id: 'a', idAdmision: '111', nombre: 'José Pérez', tipo: 'DP', fecha: '2026-10-01', subidoEl: { toMillis: () => 1 } },
    { id: 'b', idAdmision: '222', nombre: 'Ana Soto', tipo: 'COT', fecha: '2026-10-05', subidoEl: { toMillis: () => 1 } },
    { id: 'c', idAdmision: '333', nombre: 'Luis', tipo: 'DP', fecha: '2026-10-05', subidoEl: { toMillis: () => 9 } },
  ];
  it('busca por ID o nombre sin tildes y filtra por tipo', () => {
    expect(filtrarRespaldos(docs, { busqueda: 'jose perez' }).map((d) => d.id)).toEqual(['a']);
    expect(filtrarRespaldos(docs, { busqueda: '22' }).map((d) => d.id)).toEqual(['b']);
    expect(filtrarRespaldos(docs, { tipo: 'DP' }).map((d) => d.id)).toEqual(['a', 'c']);
  });
  it('ordena por fecha desc y, a igual fecha, por subida más reciente', () => {
    expect(ordenarRespaldos(docs).map((d) => d.id)).toEqual(['c', 'b', 'a']);
  });
});
