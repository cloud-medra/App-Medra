import { describe, it, expect } from 'vitest';
import {
  fechaExcelAISO, isoAFechaExcel, periodoARuta, mesDesdeTexto, mesAnterior, periodoAbiertoDe, claveGestion,
  tipoLineaDe, filasDesdeGestiones, catalogoReferencias, listaEmpresas, listaCentros, listaRecargos,
  dimensionar, copiasABorrar, nombreArchivo, fechaISOChile, MINIMO_LIBRES, TIPOS_LINEA, camposEditablesItem,
  dimensionarCatalogos, MINIMO_CATALOGOS,
} from './datosRespaldo.js';

describe('fechas', () => {
  it('convierte AAAA-MM-DD a fecha UTC y descarta textos y fechas imposibles', () => {
    expect(isoAFechaExcel('2026-11-23').toISOString()).toBe('2026-11-23T00:00:00.000Z');
    expect(isoAFechaExcel('Sin fecha')).toBeNull();
    expect(isoAFechaExcel('2026-02-30')).toBeNull();
  });

  it('normaliza lo que entrega Excel a AAAA-MM-DD (para el importador)', () => {
    expect(fechaExcelAISO(new Date(Date.UTC(2026, 10, 23)))).toBe('2026-11-23');
    expect(fechaExcelAISO(46349)).toBe('2026-11-23'); // número de serie de Excel
    expect(fechaExcelAISO('23-11-2026')).toBe('2026-11-23');
    expect(fechaExcelAISO('3/1/2026')).toBe('2026-01-03'); // dd/mm/aaaa
    expect(fechaExcelAISO('2026-11-23')).toBe('2026-11-23');
    expect(fechaExcelAISO('31-02-2026')).toBeNull();
    expect(fechaExcelAISO('mañana')).toBeNull();
  });

  it('fecha de Chile y nombre de archivo', () => {
    // 02:00 UTC del 24 = 23 en Chile (UTC-3).
    expect(fechaISOChile(new Date('2026-11-24T02:00:00Z'))).toBe('2026-11-23');
    expect(nombreArchivo('2026-11-23')).toBe('respaldo_implantes_2026-11-23.xlsx');
  });
});

describe('período', () => {
  it('convierte el mes del período a la ruta y calcula el anterior', () => {
    expect(periodoARuta({ anio: 2026, mes: 'Noviembre' })).toEqual({ anio: '2026', mes: '11' });
    expect(mesDesdeTexto('2026-3')).toEqual({ anio: '2026', mes: '03' });
    expect(() => mesDesdeTexto('2026-13')).toThrow();
    expect(mesAnterior({ anio: '2026', mes: '01' })).toEqual({ anio: '2025', mes: '12' });
    expect(mesAnterior({ anio: '2026', mes: '11' })).toEqual({ anio: '2026', mes: '10' });
  });

  it('elige el período abierto más reciente de implantes', () => {
    const p = periodoAbiertoDe([
      { modulo: 'implantes', anio: '2026', mes: 'octubre', estado: 'REABIERTO' },
      { modulo: 'implantes', anio: '2026', mes: 'noviembre', estado: 'ABIERTO' },
      { modulo: 'consignacion', anio: '2026', mes: 'diciembre', estado: 'ABIERTO' },
    ]);
    expect(p.mes).toBe('noviembre');
    expect(periodoAbiertoDe([])).toBeNull();
  });
});

describe('gestiones e ítems', () => {
  it('la clave sigue la ruta del sistema (SIN_ADMISION si no hay admisión)', () => {
    expect(claveGestion({ admision: '00123', empresa: ' ACME ', fecha: '2026-11-02' })).toBe('00123|ACME|2026-11-02');
    expect(claveGestion({ admision: 'P', empresa: 'ACME', fecha: '2026-11-02' })).toBe('SIN_ADMISION|ACME|2026-11-02');
  });

  it('reconoce el tipo de cada línea', () => {
    expect(tipoLineaDe({ esPad: true })).toBe(TIPOS_LINEA.PAD_PADRE);
    expect(tipoLineaDe({ padPadreId: 'x' })).toBe(TIPOS_LINEA.CONTENIDO_PAD);
    expect(tipoLineaDe({ lotePadreId: 'x' })).toBe(TIPOS_LINEA.LOTE_ADICIONAL);
    expect(tipoLineaDe({})).toBe(TIPOS_LINEA.NORMAL);
  });

  it('numera las líneas y enlaza la línea padre del PAD y de los lotes', () => {
    const gestiones = [
      {
        refPath: 'implantes_gestiones/2026/mes/11/dia/05/admision/2/empresa/B/detalles/b', gestionId: '2', empresa: 'B', fecha: '2026-11-05',
        cotizaciones: [{ items: [{ id: 'n', referencia: 'R1', lote: 'L1', vencimiento: 'Sin fecha' }, { id: 'l', lotePadreId: 'n', referencia: 'R1' }] }],
      },
      {
        refPath: 'implantes_gestiones/2026/mes/11/dia/01/admision/1/empresa/A/detalles/a', gestionId: '1', empresa: 'A', fecha: '2026-11-01', lado: 'derecho', costo: 1000,
        cotizaciones: [{ items: [{ id: 'p', esPad: true, referencia: 'PAD1' }, { id: 'c', padPadreId: 'p', referencia: 'C1' }, { referencia: 'SIN-ID' }] }],
      },
    ];
    const { filasGestiones, filasItems, ultimaLinea } = filasDesdeGestiones(gestiones);
    // Ordenadas por fecha: primero la del 01.
    expect(filasGestiones.map((g) => g.clave)).toEqual(['1|A|2026-11-01', '2|B|2026-11-05']);
    expect(filasGestiones[0]).toMatchObject({ lado: 'Derecho', totalCotizacion: 1000, solicitud: 'PENDIENTE', idSistema: gestiones[1].refPath });
    expect(filasGestiones[0].fecha.toISOString()).toBe('2026-11-01T00:00:00.000Z');
    const porId = Object.fromEntries(filasItems.map((f) => [f.idSistema, f]));
    expect(porId.p).toMatchObject({ linea: 1, tipo: 'PAD PADRE', lineaPadre: '' });
    expect(porId.c).toMatchObject({ linea: 2, tipo: 'CONTENIDO PAD', lineaPadre: 1 });
    expect(porId.n).toMatchObject({ linea: 4, vencimiento: 'Sin fecha' });
    expect(porId.l).toMatchObject({ linea: 5, tipo: 'LOTE ADICIONAL', lineaPadre: 4 });
    // El ítem sin id recibe un número propio, sin chocar con los demás.
    const lineas = filasItems.map((f) => f.linea);
    expect(new Set(lineas).size).toBe(lineas.length);
    expect(ultimaLinea).toBe(Math.max(...lineas));
  });
});

describe('campos editables de un ítem del sistema', () => {
  it('sigue las restricciones de Cargas', () => {
    expect(camposEditablesItem({ tipo: 'NORMAL' })).toEqual(['cantidad', 'lote', 'vencimiento', 'estadoCarga']);
    expect(camposEditablesItem({ tipo: 'LOTE ADICIONAL' })).toEqual(['cantidad', 'lote', 'vencimiento', 'estadoCarga']);
    expect(camposEditablesItem({ tipo: 'NORMAL', sinCodigo: true })).toEqual(['cantidad', 'lote', 'vencimiento']);
    expect(camposEditablesItem({ tipo: 'PAD PADRE' })).toEqual(['cantidad']);
    expect(camposEditablesItem({ tipo: 'CONTENIDO PAD' })).toEqual(['cantidad', 'lote', 'vencimiento']);
  });
});

describe('catálogos', () => {
  it('excluye inactivas y cuenta referencias repetidas', () => {
    const { filas, referenciasUnicas, resumen } = catalogoReferencias([
      { referencia: 'B1', empresa: 'X', codigo: '1', precioNeto: '1500' },
      { referencia: 'a1', empresa: 'Y', codigo: '2' },
      { referencia: 'A1', empresa: 'X', codigo: '3' },
      { referencia: 'Z', empresa: 'X', estado: 'INACTIVO' },
      { referencia: '', empresa: 'X' },
    ]);
    expect(filas.map((f) => f.clave)).toEqual(['a1|Y', 'A1|X', 'B1|X']);
    expect(filas.find((f) => f.referencia === 'B1')).toMatchObject({ precio: 1500, repeticiones: 1 });
    expect(filas.find((f) => f.referencia === 'A1').repeticiones).toBe(2);
    expect(referenciasUnicas).toEqual(['a1', 'B1']);
    expect(resumen).toEqual({ usables: 3, inactivas: 1, referenciasRepetidas: 1, clavesRepetidas: 0 });
  });

  it('empresas, centros y recargos con los filtros de la app', () => {
    expect(listaEmpresas([{ nombre: 'B' }, { nombre: 'A' }, { nombre: 'C', estado: 'INACTIVO' }, { nombre: 'A' }, {}])).toEqual(['A', 'B']);
    expect(listaCentros([{ nombre: 'PABELLON' }, { nombre: 'OTRO', usarEnGestiones: false }])).toEqual(['PABELLON']);
    expect(listaRecargos([
      { desde: 100, hasta: 200, vecesCosto: 1.5, estado: 'ACTIVO' },
      { desde: 0, hasta: 99, vecesCosto: 2, estado: 'ACTIVO' },
      { desde: 0, hasta: 99, vecesCosto: 9, estado: 'INACTIVO' },
    ])).toEqual([{ desde: 0, hasta: 99, vecesCosto: 2 }, { desde: 100, hasta: 200, vecesCosto: 1.5 }]);
  });
});

describe('tamaño de los catálogos', () => {
  it('deja margen sobre lo que trae y respeta el mínimo de la plantilla', () => {
    expect(dimensionarCatalogos({})).toEqual(MINIMO_CATALOGOS);
    expect(dimensionarCatalogos({ referencias: 5000, empresas: 10 })).toMatchObject({ referencias: 7500, empresas: MINIMO_CATALOGOS.empresas });
  });
});

describe('tamaño y copias', () => {
  it('deja al menos el doble del volumen del mes (o del anterior, si fue mayor)', () => {
    expect(dimensionar({ gestionesMes: 300, itemsMes: 1200 })).toEqual({ gestionesLibres: 600, itemsLibres: 2400 });
    // Comienzo de mes: manda el mes anterior, con la proporción de ítems del actual.
    expect(dimensionar({ gestionesMes: 10, itemsMes: 30, gestionesMesAnterior: 400 })).toEqual({ gestionesLibres: 800, itemsLibres: 2400 });
    expect(dimensionar({ gestionesMes: 0, itemsMes: 0 })).toEqual({
      gestionesLibres: MINIMO_LIBRES.gestiones, itemsLibres: MINIMO_LIBRES.items,
    });
  });

  it('borra solo las copias más antiguas con el nombre exacto del respaldo', () => {
    const nombres = [
      'respaldo_implantes_2026-11-20.xlsx', 'respaldo_implantes_2026-11-23.xlsx', 'respaldo_implantes_2026-11-21.xlsx',
      'respaldo_implantes_2026-11-22.xlsx', 'respaldo_implantes_2026-11-19.xlsx', 'otro.xlsx', 'respaldo_implantes_copia.xlsx',
    ];
    expect(copiasABorrar(nombres)).toEqual(['respaldo_implantes_2026-11-20.xlsx', 'respaldo_implantes_2026-11-19.xlsx']);
    expect(copiasABorrar(nombres.slice(0, 2))).toEqual([]);
  });
});
