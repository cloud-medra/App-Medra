import { describe, it, expect } from 'vitest';
import {
  aplicarMovimiento, aplicarMovimientoCentro, validarProducto, validarCatalogo, idLote, normalizarClave,
  codigoAutomatico, idUnico, ErrorStock, stockTotal, bajoMinimo, textoBusquedaProducto,
  diferenciaLinea, resumenInventario, filtrarComparacion, aplicarConteo,
} from './nucleo.mjs';

const VACIO = { disponible: 0, transito: 0, transitoPorCentro: {} };

describe('aplicarMovimiento (stock por lote y totales del producto)', () => {
  it('carga inicial e ingreso suman al disponible', () => {
    const a = aplicarMovimiento(VACIO, { tipo: 'CARGA_INICIAL', cantidad: 5 });
    expect(aplicarMovimiento(a, { tipo: 'INGRESO', cantidad: 3 })).toEqual({ disponible: 8, transito: 0, transitoPorCentro: {} });
  });

  it('salida a tránsito: baja disponible y sube el tránsito del centro', () => {
    const s = aplicarMovimiento({ ...VACIO, disponible: 10 }, { tipo: 'SALIDA_A_TRANSITO', cantidad: 4, centroId: 'pab' });
    expect(s).toEqual({ disponible: 6, transito: 4, transitoPorCentro: { pab: 4 } });
    const s2 = aplicarMovimiento(s, { tipo: 'SALIDA_A_TRANSITO', cantidad: 1, centroId: 'uci' });
    expect(s2).toEqual({ disponible: 5, transito: 5, transitoPorCentro: { pab: 4, uci: 1 } });
  });

  it('entrega: baja el tránsito del centro (sale definitivamente)', () => {
    const s = { disponible: 6, transito: 4, transitoPorCentro: { pab: 4 } };
    expect(aplicarMovimiento(s, { tipo: 'ENTREGA', cantidad: 1, centroId: 'pab' })).toEqual({ disponible: 6, transito: 3, transitoPorCentro: { pab: 3 } });
  });

  it('devolución: baja el tránsito del centro y vuelve al disponible; el centro en 0 desaparece', () => {
    const s = { disponible: 6, transito: 4, transitoPorCentro: { pab: 4 } };
    expect(aplicarMovimiento(s, { tipo: 'DEVOLUCION', cantidad: 4, centroId: 'pab' })).toEqual({ disponible: 10, transito: 0, transitoPorCentro: {} });
  });

  it('ajustes', () => {
    const s = aplicarMovimiento({ ...VACIO, disponible: 3 }, { tipo: 'AJUSTE_NEGATIVO', cantidad: 3 });
    expect(s.disponible).toBe(0);
    expect(aplicarMovimiento(s, { tipo: 'AJUSTE_POSITIVO', cantidad: 2 }).disponible).toBe(2);
  });

  it('nunca deja stock negativo', () => {
    expect(() => aplicarMovimiento({ ...VACIO, disponible: 2 }, { tipo: 'SALIDA_A_TRANSITO', cantidad: 3, centroId: 'pab' })).toThrow(ErrorStock);
    expect(() => aplicarMovimiento({ ...VACIO, disponible: 1 }, { tipo: 'AJUSTE_NEGATIVO', cantidad: 2 })).toThrow(/insuficiente/);
    // Hay tránsito, pero en OTRO centro.
    const s = { disponible: 0, transito: 4, transitoPorCentro: { pab: 4 } };
    expect(() => aplicarMovimiento(s, { tipo: 'ENTREGA', cantidad: 1, centroId: 'uci' })).toThrow(/centro/);
    expect(() => aplicarMovimiento(s, { tipo: 'DEVOLUCION', cantidad: 5, centroId: 'pab' })).toThrow(ErrorStock);
  });

  it('valida tipo, cantidad entera positiva y centro', () => {
    expect(() => aplicarMovimiento(VACIO, { tipo: 'X', cantidad: 1 })).toThrow(/Tipo/);
    [0, -1, 1.5, '2', NaN].forEach((cantidad) => {
      expect(() => aplicarMovimiento(VACIO, { tipo: 'INGRESO', cantidad })).toThrow(/entero/);
    });
    expect(() => aplicarMovimiento({ ...VACIO, disponible: 1 }, { tipo: 'SALIDA_A_TRANSITO', cantidad: 1 })).toThrow(/centro/);
  });

  it('no modifica el saldo recibido', () => {
    const s = { disponible: 5, transito: 0, transitoPorCentro: { a: 1 } };
    aplicarMovimiento(s, { tipo: 'SALIDA_A_TRANSITO', cantidad: 2, centroId: 'a' });
    expect(s).toEqual({ disponible: 5, transito: 0, transitoPorCentro: { a: 1 } });
  });

  it('invariante: el tránsito total es la suma de los centros', () => {
    let s = { ...VACIO, disponible: 20 };
    const pasos = [
      ['SALIDA_A_TRANSITO', 5, 'a'], ['SALIDA_A_TRANSITO', 3, 'b'], ['ENTREGA', 2, 'a'],
      ['DEVOLUCION', 1, 'b'], ['SALIDA_A_TRANSITO', 4, 'b'], ['ENTREGA', 3, 'a'],
    ];
    pasos.forEach(([tipo, cantidad, centroId]) => {
      s = aplicarMovimiento(s, { tipo, cantidad, centroId });
      expect(Object.values(s.transitoPorCentro).reduce((a, b) => a + b, 0)).toBe(s.transito);
    });
    expect(s).toEqual({ disponible: 9, transito: 6, transitoPorCentro: { b: 6 } });
  });
});

describe('aplicarMovimientoCentro (bodega_transito_centros)', () => {
  it('suma y resta por producto y cuenta productos distintos', () => {
    let c = aplicarMovimientoCentro({}, { tipo: 'SALIDA_A_TRANSITO', cantidad: 3, productoId: 'p1' });
    c = aplicarMovimientoCentro(c, { tipo: 'SALIDA_A_TRANSITO', cantidad: 2, productoId: 'p2' });
    expect(c).toEqual({ unidades: 5, productos: { p1: 3, p2: 2 }, productosDistintos: 2 });
    c = aplicarMovimientoCentro(c, { tipo: 'ENTREGA', cantidad: 3, productoId: 'p1' });
    expect(c).toEqual({ unidades: 2, productos: { p2: 2 }, productosDistintos: 1 });
  });
  it('rechaza movimientos que no son de tránsito o que dejan negativo', () => {
    expect(() => aplicarMovimientoCentro({}, { tipo: 'INGRESO', cantidad: 1, productoId: 'p' })).toThrow(ErrorStock);
    expect(() => aplicarMovimientoCentro({ unidades: 1, productos: { p: 1 } }, { tipo: 'DEVOLUCION', cantidad: 2, productoId: 'p' })).toThrow(ErrorStock);
  });
});

describe('validarProducto', () => {
  const base = { nombre: '  Guante   nitrilo M ', unidadId: 'u1', manejaLote: true };
  it('normaliza y completa por defecto', () => {
    const { errores, producto } = validarProducto({ ...base, codigoMaestro: ' gn-01 ', ubicacion: 'est a1', stockMinimo: '10' });
    expect(errores).toEqual([]);
    expect(producto).toMatchObject({
      nombre: 'Guante nitrilo M', codigoMaestro: 'GN-01', ubicacion: 'EST A1', stockMinimo: 10,
      manejaLote: true, manejaVencimiento: false, activo: true, categoriaId: null, maestroCodigoId: null,
    });
  });
  it('código maestro vacío = automático; stock mínimo vacío = sin mínimo', () => {
    const { producto } = validarProducto(base);
    expect(producto.codigoMaestro).toBe('');
    expect(producto.stockMinimo).toBeNull();
  });
  it('errores: nombre, unidad, código con caracteres inválidos, mínimo no entero', () => {
    const { errores } = validarProducto({ nombre: '', unidadId: '', codigoMaestro: 'A/B', stockMinimo: '1.5' });
    expect(errores).toHaveLength(4);
  });
});

describe('validarCatalogo', () => {
  it('nombre en mayúsculas, tipo válido', () => {
    expect(validarCatalogo({ tipo: 'UNIDAD', nombre: ' caja ' })).toEqual({ errores: [], catalogo: { tipo: 'UNIDAD', nombre: 'CAJA', activo: true } });
    expect(validarCatalogo({ tipo: 'OTRO', nombre: '' }).errores).toHaveLength(2);
  });
});

describe('identificadores', () => {
  it('idLote es determinista y normaliza el lote', () => {
    expect(idLote('p1', ' ab 12 ', '2026-01-31')).toBe(idLote('p1', 'AB12', '2026-01-31'));
    expect(idLote('p1', '', '')).toBe('p1__SL__SV');
    expect(idLote('p1', 'A/1', 'x')).toBe('p1__A%2F1__SV');
  });
  it('código automático y candados de unicidad', () => {
    expect(codigoAutomatico(7)).toBe('BOD-00007');
    expect(idUnico.codigoMaestro(' bod-1 ')).toBe('codigo__BOD-1');
    expect(idUnico.catalogo('UNIDAD', 'Caja')).toBe(idUnico.catalogo('UNIDAD', ' CAJA '));
  });
  it('normalizarClave quita tildes y espacios', () => {
    expect(normalizarClave('  Catéter  único ')).toBe('CATETER UNICO');
  });
});

describe('helpers de stock', () => {
  it('total, bajo mínimo y texto de búsqueda', () => {
    const p = { nombre: 'Sonda', codigoMaestro: 'S1', disponible: 2, transito: 3, stockMinimo: 5, codigosBarra: ['780'] };
    expect(stockTotal(p)).toBe(5);
    expect(bajoMinimo(p)).toBe(true);
    expect(bajoMinimo({ ...p, stockMinimo: null })).toBe(false);
    expect(textoBusquedaProducto(p)).toContain('780');
  });
});

describe('inventario físico', () => {
  const L = [
    { id: 'a', teorico: 10, contado: 8, precio: 100 },
    { id: 'b', teorico: 5, contado: 7, precio: 0 },
    { id: 'c', teorico: 3, contado: null, precio: 50 },
    { id: 'd', teorico: 0, contado: 2, agregado: true, precio: 10 },
    { id: 'e', teorico: 4, contado: 4 },
  ];
  it('diferencia por línea; no contados según la opción del cierre', () => {
    expect(diferenciaLinea(L[0])).toEqual({ contadoFinal: 8, diferencia: -2 });
    expect(diferenciaLinea(L[2])).toEqual({ contadoFinal: 3, diferencia: 0 });
    expect(diferenciaLinea(L[2], 'CERO')).toEqual({ contadoFinal: 0, diferencia: -3 });
  });
  it('resumen: sobrantes, faltantes, unidades y valor', () => {
    expect(resumenInventario(L)).toMatchObject({
      lineas: 5, contadas: 4, noContadas: 1, agregadas: 1, sobrantes: 2, faltantes: 1,
      unidadesSobrantes: 4, unidadesFaltantes: 2, valorSobrante: 20, valorFaltante: 200, conPrecio: true,
    });
    expect(resumenInventario(L, 'CERO')).toMatchObject({ faltantes: 2, unidadesFaltantes: 5, valorFaltante: 350 });
  });
  it('filtros de la comparación', () => {
    const ids = (f, n) => filtrarComparacion(L, f, n).map((l) => l.id);
    expect(ids('diferencias')).toEqual(['a', 'b', 'd']);
    expect(ids('faltantes')).toEqual(['a']);
    expect(ids('faltantes', 'CERO')).toEqual(['a', 'c']);
    expect(ids('sobrantes')).toEqual(['b', 'd']);
    expect(ids('noContados')).toEqual(['c']);
    expect(ids('todos')).toHaveLength(5);
  });
  it('conteo: sumar (escaneo) o reemplazar (corrección, admite 0)', () => {
    expect(aplicarConteo(null, { cantidad: 1, modo: 'sumar' })).toBe(1);
    expect(aplicarConteo(3, { cantidad: 2, modo: 'sumar' })).toBe(5);
    expect(aplicarConteo(3, { cantidad: 0, modo: 'reemplazar' })).toBe(0);
    expect(() => aplicarConteo(3, { cantidad: 0, modo: 'sumar' })).toThrow();
    expect(() => aplicarConteo(3, { cantidad: -1, modo: 'reemplazar' })).toThrow();
  });
});
