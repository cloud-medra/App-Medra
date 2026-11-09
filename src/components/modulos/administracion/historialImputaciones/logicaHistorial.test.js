import { describe, it, expect } from 'vitest';
import {
  PESTANAS, aniosSeleccionables, compararComoFirestore, filtrarFilasDelMes, interpretarBusqueda,
  limitesDePrefijo, mesesConsultables, ordenarComoListado, periodoActualChile, pestanasPermitidas,
  sumarTotales, totalesDeUnOrigen, unirPagina,
} from './logicaHistorial';
import { ORIGEN } from '../cargasConsolidado/utils/normalizarFila';

describe('compararComoFirestore', () => {
  it('compara como texto, igual que el índice: "10000" va antes de "9999"', () => {
    expect(compararComoFirestore('10000', '9999')).toBeLessThan(0);
    expect(compararComoFirestore('123', '123')).toBe(0);
    expect(compararComoFirestore('12', '123')).toBeLessThan(0);
  });

  it('ordena por punto de código, no por unidad UTF-16', () => {
    // UTF-16 pondría el emoji (0xD83D) antes de U+FFFD; en UTF-8 va después.
    expect(compararComoFirestore('\u{1F600}', '�')).toBeGreaterThan(0);
  });
});

describe('unirPagina', () => {
  const fuente = (...ordenes) => ({ buffer: ordenes.map((orden, i) => ({ orden, fila: `${orden}-${i}` })) });

  it('une en orden y deja el resto para la página siguiente', () => {
    const a = fuente('1', '4');
    const b = fuente('2', '3');
    expect(unirPagina([a, b], 3).map((x) => x.orden)).toEqual(['1', '2', '3']);
    expect(a.buffer.map((x) => x.orden)).toEqual(['4']);
    expect(b.buffer).toEqual([]);
  });

  it('desempata por la posición de la fuente y conserva el orden interno', () => {
    const a = fuente('5', '5');
    const b = fuente('5');
    expect(unirPagina([a, b], 3).map((x) => x.fila)).toEqual(['5-0', '5-1', '5-0']);
    expect(a.buffer).toEqual([]);
  });

  it('no duplica ni pierde filas al recorrer varias páginas', () => {
    const fuentes = [fuente('1', '1', '3', '7'), fuente('1', '2', '9'), fuente('4')];
    const total = fuentes.flatMap((f) => f.buffer.map((x) => x.orden)).sort();
    const salida = [];
    for (let i = 0; i < 4; i++) salida.push(...unirPagina(fuentes, 3).map((x) => x.orden));
    expect(salida).toEqual(total);
  });
});

describe('búsqueda', () => {
  it('normaliza mayúsculas y espacios', () => {
    expect(interpretarBusqueda('  juan   pe ')).toEqual({ tipo: 'nombre', valor: 'JUAN PE' });
  });

  it('solo dígitos es admisión; lo muy corto no consulta', () => {
    expect(interpretarBusqueda('123456')).toEqual({ tipo: 'admision', valor: '123456' });
    expect(interpretarBusqueda('a').tipo).toBe('ninguna');
    expect(interpretarBusqueda('   ').tipo).toBe('ninguna');
  });

  it('el prefijo no pierde las tildes escritas', () => {
    expect(limitesDePrefijo(interpretarBusqueda('maría').valor)[0]).toBe('MARÍA');
  });

  it('en el mes descargado busca cualquier parte, sin tildes', () => {
    const filas = [
      { paciente: 'JUAN PÉREZ SOTO', gestionId: '100200' },
      { paciente: 'ANA MUÑOZ ROJAS', gestionId: '300400' },
    ];
    expect(filtrarFilasDelMes(filas, 'perez')).toEqual([filas[0]]);
    expect(filtrarFilasDelMes(filas, 'MUNOZ')).toEqual([filas[1]]);
    expect(filtrarFilasDelMes(filas, '0040')).toEqual([filas[1]]);
    expect(filtrarFilasDelMes(filas, '  ')).toEqual(filas);
  });

  it('ordena lo descargado igual que el listado y de forma estable', () => {
    const filas = [{ gestionId: '9999', id: 'a' }, { gestionId: '10000', id: 'b' }, { gestionId: '10000', id: 'c' }];
    expect(ordenarComoListado(filas).map((f) => f.id)).toEqual(['b', 'c', 'a']);
  });
});

describe('períodos', () => {
  const hoy = { anio: 2026, mes: 11 };

  it('no incluye meses futuros', () => {
    expect(mesesConsultables('2026', hoy)).toHaveLength(11);
    expect(mesesConsultables('2026', hoy)).not.toContain('diciembre');
    expect(mesesConsultables('2025', hoy)).toHaveLength(12);
    expect(mesesConsultables('2027', hoy)).toEqual([]);
  });

  it('arma los años desde el primero con datos', () => {
    expect(aniosSeleccionables({ anio: 2028, mes: 1 })).toEqual(['2028', '2027', '2026']);
  });

  it('usa la hora de Chile', () => {
    // 1 de diciembre 01:00 UTC = 30 de noviembre en Chile.
    expect(periodoActualChile(new Date('2026-12-01T01:00:00Z'))).toEqual({ anio: 2026, mes: 11 });
  });
});

describe('totales', () => {
  it('N cuenta todo lo que no tiene venta numérica', () => {
    expect(totalesDeUnOrigen({ cantidad: 58, conVenta: 50, totalCosto: 10, totalVenta: 20 }).sinVenta).toBe(8);
    expect(totalesDeUnOrigen({ cantidad: 5, conVenta: 5 }).sinVenta).toBe(0);
  });

  it('suma por colección', () => {
    const a = totalesDeUnOrigen({ cantidad: 2, conVenta: 1, totalCosto: 10, totalVenta: 20 });
    const b = totalesDeUnOrigen({ cantidad: 3, conVenta: 3, totalCosto: 5, totalVenta: 7 });
    expect(sumarTotales([a, b])).toEqual({ cantidad: 5, totalCosto: 15, totalVenta: 27, sinVenta: 1 });
  });
});

describe('pestanasPermitidas', () => {
  const acceso = (...ids) => (ruta) => ids.some((id) => ruta.endsWith(`/${id}`));

  it('General incluye solo los tipos con pestaña asignada', () => {
    const general = pestanasPermitidas(acceso('general', 'implantes', 'hemodinamia')).find((p) => p.id === 'general');
    expect(general.origenes).toEqual([ORIGEN.IMPLANTES, ORIGEN.HEMODINAMIA]);
  });

  it('General se oculta si no tiene ningún tipo', () => {
    expect(pestanasPermitidas(acceso('general'))).toEqual([]);
  });

  it('sin el permiso de General, los tipos siguen visibles', () => {
    expect(pestanasPermitidas(acceso('consignacion')).map((p) => p.id)).toEqual(['consignacion']);
  });

  it('con acceso total aparecen las cuatro', () => {
    expect(pestanasPermitidas(() => true).map((p) => p.id)).toEqual(PESTANAS.map((p) => p.id));
  });
});
