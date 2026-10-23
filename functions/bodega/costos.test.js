import { describe, it, expect } from 'vitest';
import {
  TIPOS_MOVIMIENTO, LINEAS_PERIODO, lineaDeMovimiento, costoDe, costoEntrada, aplicarCosto, valorizarMovimiento, costoEnCentro,
  periodoVigente, periodoSiguiente, sumarLineas, saldoFinalPeriodo, valorConSigno,
} from './nucleo.mjs';

const producto = (extra = {}) => ({ id: 'p', disponible: 0, transito: 0, maestroCodigo: { precioNeto: 1000 }, ...extra });

describe('periodos: clasificación de movimientos', () => {
  it('ingresos y egresos según el alcance Bodega General + tránsito', () => {
    expect(lineaDeMovimiento('CARGA_INICIAL')).toBe('cargaInicial');
    expect(lineaDeMovimiento('INGRESO')).toBe('ingresos');
    expect(lineaDeMovimiento('DEVOLUCION_DESDE_CENTRO')).toBe('retornosCentros');
    expect(lineaDeMovimiento('ENTREGA')).toBe('consumo');
    expect(lineaDeMovimiento('DEJADO_EN_CENTRO')).toBe('salidaCentros');
    expect(lineaDeMovimiento('REPOSICION_CAJA')).toBe('salidaCajas');
    expect(lineaDeMovimiento('AJUSTE_POSITIVO')).toBe('ajustePositivo');
    expect(lineaDeMovimiento('AJUSTE_NEGATIVO')).toBe('ajusteNegativo');
    // Internos o fuera del alcance: no cambian el valor.
    ['SALIDA_A_TRANSITO', 'DEVOLUCION', 'ENTREGA_DESDE_CENTRO'].forEach((t) => expect(lineaDeMovimiento(t)).toBeNull());
  });

  it('el signo de cada línea coincide con lo que el movimiento suma a disponible + tránsito', () => {
    Object.entries(TIPOS_MOVIMIENTO).forEach(([tipo, def]) => {
      const linea = lineaDeMovimiento(tipo);
      expect(def.disponible + def.transito, tipo).toBe(linea ? LINEAS_PERIODO[linea].signo : 0);
    });
  });
});

describe('costo promedio ponderado', () => {
  it('sin costoPromedio usa el precio neto como respaldo', () => {
    expect(costoDe(producto({ disponible: 3, transito: 2 }))).toEqual({ costoPromedio: 1000, valorStock: 5000 });
    expect(costoDe(producto({ disponible: 3, transito: 2, costoPromedio: 700, valorStock: 3500 }))).toEqual({ costoPromedio: 700, valorStock: 3500 });
    expect(costoDe({ disponible: 1 })).toEqual({ costoPromedio: 0, valorStock: 0 });
  });

  it('costo de entrada: línea del documento, precio neto o costo de lo dejado en el centro', () => {
    const costo = { costoPromedio: 800, valorStock: 0 };
    expect(costoEntrada('CARGA_INICIAL', { producto: producto(), costo, precioLinea: 1200 })).toBe(1200);
    expect(costoEntrada('INGRESO', { producto: producto(), costo, precioLinea: null })).toBe(1000);
    expect(costoEntrada('INGRESO', { producto: producto(), costo, precioLinea: 0 })).toBe(0);
    expect(costoEntrada('AJUSTE_POSITIVO', { producto: producto(), costo })).toBe(1000);
    expect(costoEntrada('AJUSTE_POSITIVO', { producto: {}, costo })).toBe(800);
    expect(costoEntrada('DEVOLUCION_DESDE_CENTRO', { producto: producto(), costo, costoCentro: 900 })).toBe(900);
    expect(costoEntrada('DEVOLUCION_DESDE_CENTRO', { producto: producto(), costo })).toBe(800);
  });

  it('entradas recalculan el promedio, salidas salen al promedio y la última se lleva el resto', () => {
    const p = producto();
    let costo = costoDe(p);
    let r = valorizarMovimiento(costo, { disponible: 0, transito: 0 }, p, { tipo: 'CARGA_INICIAL', cantidad: 10 }, { precioLinea: 1200 });
    expect(r.valorizado).toEqual({ linea: 'cargaInicial', costoUnitario: 1200, valor: 12000 });
    costo = r.costo;
    r = valorizarMovimiento(costo, { disponible: 10, transito: 0 }, p, { tipo: 'INGRESO', cantidad: 10 });
    expect(r.valorizado.valor).toBe(10000);
    expect(r.costo).toEqual({ costoPromedio: 1100, valorStock: 22000 });
    costo = r.costo;
    r = aplicarCosto(costo, { disponible: 15, transito: 5 }, { tipo: 'ENTREGA', cantidad: 5 });
    expect(r.valorizado).toEqual({ linea: 'consumo', costoUnitario: 1100, valor: 5500 });
    expect(r.costo.valorStock).toBe(16500);
    costo = r.costo;
    // Movimiento interno: valor 0, el costo no cambia.
    const interno = aplicarCosto(costo, { disponible: 15, transito: 0 }, { tipo: 'SALIDA_A_TRANSITO', cantidad: 3 });
    expect(interno.valorizado).toEqual({ linea: null, costoUnitario: 1100, valor: 0 });
    expect(interno.costo).toEqual(costo);
    // Sale todo lo que queda: se lleva el valor completo y el stock queda en 0.
    r = aplicarCosto({ costoPromedio: 1000 / 3, valorStock: 1000 }, { disponible: 3, transito: 0 }, { tipo: 'AJUSTE_NEGATIVO', cantidad: 3 });
    expect(r.valorizado.valor).toBe(1000);
    expect(r.costo.valorStock).toBe(0);
  });

  it('lo dejado en el centro guarda su costo promedio para el retorno', () => {
    expect(costoEnCentro({ enCentro: 0 }, 2, 300)).toBe(300);
    expect(costoEnCentro({ enCentro: 2, costoUnitarioCentro: 100 }, 2, 200)).toBe(150);
  });
});

describe('periodos: vigente, siguiente y cuadratura', () => {
  it('periodo vigente: el abierto más reciente; sin abierto, null', () => {
    expect(periodoVigente([{ anio: '2026', mes: 'octubre' }, { anio: 2026, mes: 'noviembre' }])).toBe('2026_noviembre');
    expect(periodoVigente([])).toBeNull();
    expect(periodoSiguiente('2026', 'octubre')).toEqual({ anio: '2026', mes: 'noviembre' });
    expect(periodoSiguiente('2026', 'diciembre')).toEqual({ anio: '2027', mes: 'enero' });
  });

  it('saldo inicial + carga inicial + ingresos − egresos = saldo final', () => {
    const movimientos = [
      { linea: 'cargaInicial', cantidad: 10, valor: 12000 },
      { tipo: 'INGRESO', cantidad: 10, valor: 10000 },
      { linea: 'consumo', cantidad: 5, valor: 5500 },
      { linea: null, tipo: 'SALIDA_A_TRANSITO', cantidad: 3, valor: 0 },
    ];
    const lineas = sumarLineas(movimientos);
    expect(lineas.cargaInicial).toEqual({ unidades: 10, valor: 12000 });
    expect(lineas.ingresos).toEqual({ unidades: 10, valor: 10000 });
    expect(lineas.consumo).toEqual({ unidades: 5, valor: 5500 });
    expect(saldoFinalPeriodo(1000, lineas)).toBe(17500);
    expect(movimientos.reduce((n, m) => n + valorConSigno(m), 0)).toBe(16500);
  });
});
