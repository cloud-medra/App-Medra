import { describe, it, expect } from 'vitest';
import {
  ORIGEN,
  ordenarPorAdmisionYOC,
  filtrarPorBusquedaYOrigen,
  normalizarSolicitudImplantes,
  normalizarSolicitudConsignacion,
  normalizarSolicitudHemodinamia,
  normalizarFilaGestionConsignacion
} from './normalizarFila';

const fila = (gestionId, codigo, origen = ORIGEN.IMPLANTES) => ({ gestionId, codigo, origen });

describe('ordenarPorAdmisionYOC', () => {
  it('agrupa por admisión ascendente en vez de dejarlas mezcladas por fecha', () => {
    const filas = [
      fila('102040', 'COD-1'),
      fila('102030', 'COD-2'),
      fila('102040', 'COD-3'),
      fila('102030', 'COD-4')
    ];

    const resultado = ordenarPorAdmisionYOC(filas).map(f => f.gestionId);

    expect(resultado).toEqual(['102030', '102030', '102040', '102040']);
  });

  it('dentro de la misma admisión, las filas con código de OC van antes que "No lleva OC"', () => {
    const filas = [
      fila('102030', 'No lleva OC'),
      fila('102030', 'COD-1'),
      fila('102030', 'No lleva OC'),
      fila('102030', 'COD-2')
    ];

    const resultado = ordenarPorAdmisionYOC(filas).map(f => f.codigo);

    expect(resultado).toEqual(['COD-1', 'COD-2', 'No lleva OC', 'No lleva OC']);
  });

  it('combina ambos criterios con orígenes mezclados (Implantes/Consignación/Hemodinamia)', () => {
    const filas = [
      fila('102040', 'No lleva OC', ORIGEN.HEMODINAMIA),
      fila('102030', 'COD-9', ORIGEN.CONSIGNACION),
      fila('102040', 'COD-8', ORIGEN.IMPLANTES),
      fila('102030', 'No lleva OC', ORIGEN.IMPLANTES),
      fila('102035', 'COD-7', ORIGEN.HEMODINAMIA)
    ];

    const resultado = ordenarPorAdmisionYOC(filas).map(f => `${f.gestionId}:${f.codigo}`);

    expect(resultado).toEqual([
      '102030:COD-9',
      '102030:No lleva OC',
      '102035:COD-7',
      '102040:COD-8',
      '102040:No lleva OC'
    ]);
  });

  it('trata "P" y vacío/nulo igual que "No lleva OC" (van al final del grupo)', () => {
    const filas = [
      fila('102030', 'P'),
      fila('102030', ''),
      fila('102030', 'COD-1'),
      fila('102030', null)
    ];

    const resultado = ordenarPorAdmisionYOC(filas).map(f => f.codigo);

    expect(resultado[0]).toBe('COD-1');
    expect(resultado.slice(1)).toEqual(expect.arrayContaining(['P', '', null]));
  });

  it('no pierde ni modifica filas, solo reordena', () => {
    const filas = [fila('102040', 'COD-1'), fila('102030', 'COD-2'), fila('102030', 'No lleva OC')];
    const resultado = ordenarPorAdmisionYOC(filas);

    expect(resultado).toHaveLength(filas.length);
    expect(resultado).toEqual(expect.arrayContaining(filas));
  });

  it('no muta el arreglo original', () => {
    const filas = [fila('102040', 'COD-1'), fila('102030', 'COD-2')];
    const copiaOriginal = [...filas];
    ordenarPorAdmisionYOC(filas);

    expect(filas).toEqual(copiaOriginal);
  });
});

const filaConNombre = (gestionId, campos, origen = ORIGEN.IMPLANTES) => ({ gestionId, origen, ...campos });

describe('filtrarPorBusquedaYOrigen', () => {
  const filas = [
    filaConNombre('102030', { nombre: 'Juan Pérez' }, ORIGEN.IMPLANTES),
    filaConNombre('102040', { paciente: 'María López' }, ORIGEN.CONSIGNACION),
    filaConNombre('305000', { nombre: 'Pedro Soto' }, ORIGEN.HEMODINAMIA)
  ];

  it('sin filtros, devuelve todo tal cual (equivalente a "Todas")', () => {
    const resultado = filtrarPorBusquedaYOrigen(filas, {});
    expect(resultado).toHaveLength(3);
  });

  it('busca por admisión, parcial', () => {
    const resultado = filtrarPorBusquedaYOrigen(filas, { busqueda: '1020' });
    expect(resultado.map(f => f.gestionId)).toEqual(['102030', '102040']);
  });

  it('busca por nombre (campo `nombre` en Gestión o `paciente` en Solicitudes/Imputadas), parcial y sin distinguir mayúsculas', () => {
    const resultado = filtrarPorBusquedaYOrigen(filas, { busqueda: 'lópez' });
    expect(resultado.map(f => f.gestionId)).toEqual(['102040']);

    const resultado2 = filtrarPorBusquedaYOrigen(filas, { busqueda: 'PEDRO' });
    expect(resultado2.map(f => f.gestionId)).toEqual(['305000']);
  });

  it('origen vacío = sin restricción ("Todas")', () => {
    const resultado = filtrarPorBusquedaYOrigen(filas, { origenesSeleccionados: [] });
    expect(resultado).toHaveLength(3);
  });

  it('un origen individual filtra solo esa colección', () => {
    const resultado = filtrarPorBusquedaYOrigen(filas, { origenesSeleccionados: [ORIGEN.CONSIGNACION] });
    expect(resultado.map(f => f.gestionId)).toEqual(['102040']);
  });

  it('dos orígenes combinados filtran ambas colecciones', () => {
    const resultado = filtrarPorBusquedaYOrigen(filas, { origenesSeleccionados: [ORIGEN.IMPLANTES, ORIGEN.HEMODINAMIA] });
    expect(resultado.map(f => f.gestionId)).toEqual(['102030', '305000']);
  });

  it('combina búsqueda y origen a la vez', () => {
    const resultado = filtrarPorBusquedaYOrigen(filas, { busqueda: '1020', origenesSeleccionados: [ORIGEN.CONSIGNACION] });
    expect(resultado.map(f => f.gestionId)).toEqual(['102040']);

    const sinCoincidencia = filtrarPorBusquedaYOrigen(filas, { busqueda: '1020', origenesSeleccionados: [ORIGEN.HEMODINAMIA] });
    expect(sinCoincidencia).toHaveLength(0);
  });
});

describe('normalizarSolicitudImplantes / Hemodinamia / Consignacion (Solicitudes, nivel ítem)', () => {
  it('Implantes: expande un bloque con N ítems en N filas, leyendo cotizaciones[0].items (no bloque.items)', () => {
    const bloque = {
      refPath: 'implantes_gestiones/2026/.../detalles/abc',
      gestionId: '500100',
      nombre: 'Ana Ríos',
      medico: 'Dr. Soto',
      fecha: '2026-09-20',
      empresa: 'EmpresaX',
      atributo: 'IMPLANTES',
      fechaRegistro: 'ts-creacion',
      fechaRegistroAdmision: 'ts-admision',
      // bloque.items (top-level) NO existe en el doc real — solo debe leer
      // cotizaciones[0].items. Si el código leyera bloque.items por error,
      // esto debería dar 1 fila "vacía", no 2.
      cotizaciones: [{ numCotizacion: 'COT-1', items: [
        { id: 'it1', codigo: 'COD-A', referencia: 'Ref A', descriptorAuto: 'Desc A', cantidad: 2, precio: 1000, lote: 'L1', vencimiento: '2027-01-01' },
        { id: 'it2', codigo: 'COD-B', referencia: 'Ref B', cantidad: 1, precio: 500, numCotizacion: 'COT-2' }
      ] }]
    };

    const filas = normalizarSolicitudImplantes(bloque);

    expect(filas).toHaveLength(2);
    expect(filas.every(f => f.origen === ORIGEN.IMPLANTES)).toBe(true);
    // selectId es el bloque (exportación es por gestión completa, no por ítem).
    expect(filas.every(f => f.selectId === bloque.refPath)).toBe(true);
    // ids de fila distintos entre sí, para keys de React.
    expect(new Set(filas.map(f => f.id)).size).toBe(2);

    // Descripción = descriptorAuto (no la referencia), igual que el Excel.
    expect(filas[0]).toMatchObject({ codigo: 'COD-A', descripcion: 'Desc A', cantidad: 2, precio: 1000, lote: 'L1', numGuia: 'COT-1' });
    // El segundo ítem trae su propio numCotizacion — debe primar sobre el de la cotización.
    expect(filas[1]).toMatchObject({ codigo: 'COD-B', numGuia: 'COT-2' });
    // Fecha de Registro = cuándo se ingresó el ID de admisión, no la creación.
    expect(filas.every(f => f.fechaRegistro === 'ts-admision')).toBe(true);
    // Atributo viene del bloque (mismo campo/nombre en las 3 colecciones).
    expect(filas.every(f => f.atributo === 'IMPLANTES')).toBe(true);
  });

  it('Implantes: bloque sin ítems produce 1 fila con placeholders, no 0 filas', () => {
    const bloque = { refPath: 'implantes_gestiones/.../vacio', gestionId: '1', fechaRegistro: 'ts-creacion', cotizaciones: [{ items: [] }] };
    const filas = normalizarSolicitudImplantes(bloque);
    expect(filas).toHaveLength(1);
    expect(filas[0].codigo).toBe('-');
    // Sin fechaRegistroAdmision (registro antiguo o sin ID) → vacío, no la de creación.
    expect(filas[0].fechaRegistro).toBeNull();
  });

  it('Hemodinamia: mismo comportamiento que Implantes (bloque con cotizaciones[0].items anidado)', () => {
    const doc = {
      id: 'h1',
      refPath: 'hemodinamia_gestiones/.../detalles/h1',
      gestionId: '600200',
      nombre: 'Pedro Gómez',
      atributo: 'HEMODINAMIA',
      fechaRegistro: 'ts-creacion',
      fechaRegistroAdmision: 'ts-admision',
      cotizaciones: [{ numCotizacion: 'COT-9', items: [
        { id: 'it1', codigo: 'COD-Z', referencia: 'Ref Z', cantidad: 5, precio: 200, lote: 'L9', vencimiento: '2026-12-31' }
      ] }]
    };

    const filas = normalizarSolicitudHemodinamia(doc);

    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({
      origen: ORIGEN.HEMODINAMIA,
      selectId: doc.refPath,
      codigo: 'COD-Z',
      descripcion: 'Ref Z',
      cantidad: 5,
      precio: 200,
      numGuia: 'COT-9',
      atributo: 'HEMODINAMIA',
      fechaRegistro: 'ts-admision'
    });
  });

  it('Consignación: sigue siendo 1 ítem = 1 fila, con selectId = id propio (no el bloque)', () => {
    const item = {
      id: 'c1',
      refPath: 'consignacion_registros/.../detalles/c1',
      gestionId: '700300',
      nombre: 'Laura Díaz',
      codigo: 'COD-C',
      descripcion: 'Desc C',
      cantidad: 3,
      costo: 150,
      atributo: 'PABELLON',
      numeroGuia: '12345',
      lote: 'L2',
      vencimiento: '2026-10-10'
    };

    const filas = normalizarSolicitudConsignacion(item);

    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({
      origen: ORIGEN.CONSIGNACION,
      selectId: item.id,
      id: item.id,
      codigo: 'COD-C',
      precio: 150,
      numGuia: '12345',
      esFilaGuia: false
    });
  });

  it('Consignación: preserva esFilaGuia para las filas de desglose de guía (sin documento propio)', () => {
    const filaGuia = {
      id: 'guia-DELIVERY1-0',
      ref: null,
      esFilaGuia: true,
      gestionId: '700300',
      codigo: 'No lleva OC',
      cantidad: 4,
      numeroGuia: 0
    };

    const filas = normalizarSolicitudConsignacion(filaGuia);

    expect(filas[0].esFilaGuia).toBe(true);
    expect(filas[0].refPath).toBeNull();
    expect(filas[0].selectId).toBe('guia-DELIVERY1-0');
  });
});

describe('normalizarFilaGestionConsignacion', () => {
  it('FINALIZADO conserva su estado y figura como ya solicitado', () => {
    const fila = normalizarFilaGestionConsignacion({ id: 'a', estado: 'FINALIZADO' });
    expect(fila.estado).toBe('FINALIZADO');
    expect(fila.solicitud).toBe('SOLICITADO');
    expect(normalizarFilaGestionConsignacion({ id: 'b', estado: 'CARGADO' }).solicitud).toBe('PENDIENTE');
  });
});
