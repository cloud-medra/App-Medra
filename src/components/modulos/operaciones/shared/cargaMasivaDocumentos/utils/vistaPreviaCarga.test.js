import { describe, it, expect } from 'vitest';
import {
  construirVistaPrevia,
  agruparPorAdmision,
  idsPorVerificar,
  idAdmisionValido,
  esSubible,
  rechazoDeFila
} from './vistaPreviaCarga';

const pdf = (name, size = 1000) => ({ name, size, type: 'application/pdf', lastModified: 1 });
const item = (file) => ({ key: file.name, file });

// Escenario de prueba: 3 admisiones existentes (102030, 102031, 102032),
// una inexistente (999999), un archivo mal nombrado, un no-PDF y duplicados
// (uno contra lo que ya hay en Storage y otro dentro de la misma tanda).
const items = [
  item(pdf('102030 - JOSE PEREZ - DP.pdf')),
  item(pdf('102030 - JOSE PEREZ - RP.pdf')),
  item(pdf('102031 - ANA SOTO - COT 123 - EMPRESA.pdf')),
  item(pdf('102031 - ANA SOTO - COT 123 - EMPRESA.pdf')),
  item(pdf('102032 - LUIS ROJAS - INF 55 - EMPRESA.pdf')),
  item(pdf('102032 - PEDRO DIAZ - EXAMEN.pdf')),
  item(pdf('999999 - X - DP.pdf')),
  item(pdf('escaneo sin nombre.pdf')),
  item({ name: '102030 - JOSE PEREZ - foto.png', size: 10, type: 'image/png', lastModified: 1 }),
  item(pdf('P - PENDIENTE - DP.pdf')),
  item(pdf('102030 - JOSE PEREZ - INF 1 - E.pdf', 25 * 1024 * 1024)),
];

const cache = {
  admisiones: new Map([
    ['102030', { nombre: 'José Pérez' }],
    ['102031', { nombre: 'ANA SOTO' }],
    ['102032', { nombre: 'LUIS ROJAS' }],
    ['999999', null],
  ]),
  listados: new Map([
    ['102030', [{ nombre: '102030 - JOSE PEREZ - RP.pdf' }]],
    ['102031', []],
    ['102032', []],
  ]),
  idsConError: new Set(),
};

describe('construirVistaPrevia', () => {
  const filas = construirVistaPrevia(items, cache);
  const estado = (nombre, i = 0) => filas.filter(f => f.nombre === nombre)[i].estado;

  it('marca listos, duplicados (Storage y misma tanda) y rechazados', () => {
    expect(estado('102030 - JOSE PEREZ - DP.pdf')).toBe('LISTO');
    expect(estado('102030 - JOSE PEREZ - RP.pdf')).toBe('DUPLICADO');
    expect(estado('102031 - ANA SOTO - COT 123 - EMPRESA.pdf', 0)).toBe('LISTO');
    expect(estado('102031 - ANA SOTO - COT 123 - EMPRESA.pdf', 1)).toBe('DUPLICADO');
    expect(estado('102032 - LUIS ROJAS - INF 55 - EMPRESA.pdf')).toBe('LISTO');
    expect(estado('999999 - X - DP.pdf')).toBe('NO_ENCONTRADA');
    expect(estado('escaneo sin nombre.pdf')).toBe('NOMBRE_INVALIDO');
    expect(estado('102030 - JOSE PEREZ - foto.png')).toBe('NO_PDF');
    expect(estado('P - PENDIENTE - DP.pdf')).toBe('NOMBRE_INVALIDO');
    expect(estado('102030 - JOSE PEREZ - INF 1 - E.pdf')).toBe('MUY_GRANDE');
  });

  it('tipo sin reconocer se sube igual; advierte paciente distinto sin bloquear', () => {
    const f = filas.find(x => x.nombre === '102032 - PEDRO DIAZ - EXAMEN.pdf');
    expect(f.estado).toBe('LISTO');
    expect(f.tipo).toBeNull();
    expect(f.advertencia).toMatch(/PEDRO DIAZ.*LUIS ROJAS/);
  });

  it('no advierte si el paciente coincide ignorando tildes/mayúsculas', () => {
    expect(filas.find(x => x.nombre === '102030 - JOSE PEREZ - DP.pdf').advertencia).toBeNull();
  });

  it('solo LISTO y DUPLICADO son subibles', () => {
    expect(filas.filter(esSubible).length).toBe(6);
  });

  it('sin verificar o con error no se sube', () => {
    const [pendiente] = construirVistaPrevia([item(pdf('555555 - A - DP.pdf'))], { ...cache, idsConError: new Set() });
    expect(pendiente.estado).toBe('VERIFICANDO');
    const [conError] = construirVistaPrevia([item(pdf('555555 - A - DP.pdf'))], { ...cache, idsConError: new Set(['555555']) });
    expect(conError.estado).toBe('ERROR_VERIFICACION');
    expect(rechazoDeFila(conError).motivo).toMatch(/No se pudo verificar la admisión 555555/);
  });

  it('comparación exacta del id', () => {
    const [f] = construirVistaPrevia([item(pdf('1020300 - JOSE PEREZ - DP.pdf'))], cache);
    expect(f.idAdmision).toBe('1020300');
    expect(f.estado).toBe('VERIFICANDO'); // 1020300 no se confunde con 102030
  });
});

describe('idsPorVerificar', () => {
  it('ids únicos, válidos, de PDF y no pedidos antes', () => {
    expect(idsPorVerificar(items, new Set(['102031']))).toEqual(['102030', '102032', '999999']);
  });
});

describe('idAdmisionValido', () => {
  it('descarta marcadores de ID pendiente', () => {
    expect(idAdmisionValido('P - X - DP.pdf')).toBe('');
    expect(idAdmisionValido('sin_admision - X - DP.pdf')).toBe('');
    expect(idAdmisionValido('102030 - X - DP.pdf')).toBe('102030');
  });
});

describe('agruparPorAdmision', () => {
  it('agrupa por id en orden numérico y deja los sin id al final', () => {
    const filas = construirVistaPrevia(items, cache);
    expect(agruparPorAdmision(filas).map(([id]) => id)).toEqual(['102030', '102031', '102032', '999999', '']);
  });
});
