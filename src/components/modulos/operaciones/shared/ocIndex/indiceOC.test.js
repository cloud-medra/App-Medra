import { describe, it, expect } from 'vitest';
import {
  claveCruceOC, mezclarIndiceOC, periodosIndiceOC, agruparIndiceOC, cruzarCodigoOC, cruzarGestionesOC,
  calcularOcPendiente, ocsDeGestion, rangoFechasIndiceOC, textoOCs,
  gestionesDesdeRegistrosConsignacion, cruzarRegistrosConsignacionOC, bloquesOCConsignacion
} from './indiceOC';
import {
  normalizarFecha, normalizarCodigo, normalizarAdmision, empresasCoinciden, palabrasEnComun
} from './normalizacionOC';

const fila = (over = {}) => ({
  id: 'F1', admision: '102345', fecha_cx: new Date(2026, 8, 15), proveedor: 'MEDTRONIC CHILE SPA',
  codigo: '00123', cantidad: 1, oc: '4500001', paciente: 'JUAN PEREZ ROJAS', ...over
});

describe('normalización', () => {
  it('lleva todas las fechas a YYYY-MM-DD', () => {
    expect(normalizarFecha('2026-09-15')).toBe('2026-09-15');
    expect(normalizarFecha('15/09/2026')).toBe('2026-09-15');
    expect(normalizarFecha('5-9-2026')).toBe('2026-09-05');
    expect(normalizarFecha(new Date(2026, 8, 15))).toBe('2026-09-15');
    expect(normalizarFecha(46280)).toBe('2026-09-15'); // serial de Excel
    expect(normalizarFecha({ toDate: () => new Date(2026, 8, 15) })).toBe('2026-09-15');
    expect(normalizarFecha('P')).toBe('');
  });

  it('respeta ceros a la izquierda en códigos y limpia admisiones numéricas', () => {
    expect(normalizarCodigo(' 00123 ')).toBe('00123');
    expect(normalizarCodigo('ab 12')).toBe('AB12');
    expect(normalizarAdmision(102345)).toBe('102345');
    expect(normalizarAdmision('102345.0')).toBe('102345');
  });

  it('reconoce empresas escritas distinto', () => {
    expect(empresasCoinciden('MEDTRONIC CHILE SPA', 'Medtronic')).toBe(true);
    expect(empresasCoinciden('Boston Scientific S.A.', 'BOSTON SCIENTIFIC LTDA.')).toBe(true);
    expect(empresasCoinciden('Comercial Biotécnica Ltda', 'BIOTECNICA')).toBe(true);
    expect(empresasCoinciden('ABBOTT', 'ABB')).toBe(false);
    expect(empresasCoinciden('MEDTRONIC', 'STRYKER')).toBe(false);
  });

  it('compara nombres por palabras en cualquier orden y con una letra de diferencia', () => {
    expect(palabrasEnComun('JUAN PEREZ ROJAS', 'ROJAS JUAN')).toBe(2);
    expect(palabrasEnComun('PÉREZ JUAN', 'juan perez')).toBe(2);
    expect(palabrasEnComun('GONZALEZ', 'GONSALEZ')).toBe(1);
    expect(palabrasEnComun('ANA DIAZ', 'PEDRO SOTO')).toBe(0);
  });
});

describe('mezclarIndiceOC', () => {
  it('agrega, reemplaza y saca filas sin OC', () => {
    const { indice, stats } = mezclarIndiceOC({}, [fila(), fila({ id: 'F2', oc: '' }), fila({ id: 'F3', codigo: '' })]);
    expect(Object.keys(indice)).toEqual(['F1']);
    expect(indice.F1).toMatchObject({ k: '102345|2026-09-15|00123', q: 1 });
    expect(stats).toMatchObject({ conOC: 1, sinOC: 1, incompletas: 1, cambios: 1 });

    const r2 = mezclarIndiceOC(indice, [fila({ oc: '' })]);
    expect(r2.indice).toEqual({});
    expect(r2.stats.cambios).toBe(1);

    const r3 = mezclarIndiceOC(indice, [fila()]);
    expect(r3.stats.cambios).toBe(0);
  });

  it('saca del índice los IDs a eliminar (filas que ya no vienen en el archivo)', () => {
    const { indice } = mezclarIndiceOC({}, [fila(), fila({ id: 'F2' })]);
    const r = mezclarIndiceOC(indice, [fila()], ['F2', 'NO_EXISTE']);
    expect(Object.keys(r.indice)).toEqual(['F1']);
    expect(r.stats).toMatchObject({ eliminadas: 1, cambios: 1 });
  });

  it('lista los meses con OC, del más reciente al más antiguo', () => {
    const { indice } = mezclarIndiceOC({}, [fila(), fila({ id: 'F2', fecha_cx: '2026-01-02' }), fila({ id: 'F3', fecha_cx: '2026-09-30' })]);
    expect(periodosIndiceOC(indice)).toEqual(['2026-09', '2026-01']);
    expect(periodosIndiceOC({})).toEqual([]);
  });

  it('calcula el rango de fechas', () => {
    const { indice } = mezclarIndiceOC({}, [fila(), fila({ id: 'F2', fecha_cx: '2026-01-02' })]);
    expect(rangoFechasIndiceOC(indice)).toEqual({ fechaMin: '2026-01-02', fechaMax: '2026-09-15' });
  });
});

describe('cruzarCodigoOC', () => {
  const clave = claveCruceOC({ admision: '102345', fecha: '2026-09-15', codigo: '00123' });
  const cruzarItemOC = (args, mapa) => cruzarCodigoOC({ cantidadesImplantes: [1], ...args }, mapa);

  it('asigna con empresa equivalente y marca revisar nombre si no comparten palabras', () => {
    const mapa = agruparIndiceOC(mezclarIndiceOC({}, [fila()]).indice);
    expect(cruzarItemOC({ clave, empresa: 'MEDTRONIC', nombre: 'PEREZ JUAN' }, mapa))
      .toMatchObject({ tipo: 'ASIGNADA', oc: '4500001', revisarNombre: false });
    expect(cruzarItemOC({ clave, empresa: 'MEDTRONIC', nombre: 'ANA SOTO' }, mapa))
      .toMatchObject({ tipo: 'ASIGNADA', revisarNombre: true });
  });

  it('reporta empresa no reconocida con el valor del Excel', () => {
    const mapa = agruparIndiceOC(mezclarIndiceOC({}, [fila()]).indice);
    expect(cruzarItemOC({ clave, empresa: 'STRYKER', nombre: 'JUAN' }, mapa))
      .toEqual({ tipo: 'EMPRESA_NO_RECONOCIDA', empresasExcel: ['MEDTRONIC CHILE SPA'] });
  });

  it('desempata por nombre y si no se puede, deja ambigua', () => {
    const indice = mezclarIndiceOC({}, [fila(), fila({ id: 'F2', oc: '4500002', paciente: 'ANA SOTO' })]).indice;
    const mapa = agruparIndiceOC(indice);
    expect(cruzarItemOC({ clave, empresa: 'MEDTRONIC', nombre: 'SOTO ANA' }, mapa))
      .toMatchObject({ tipo: 'ASIGNADA', oc: '4500002' });
    expect(cruzarItemOC({ clave, empresa: 'MEDTRONIC', nombre: 'PEDRO LARA' }, mapa))
      .toEqual({ tipo: 'AMBIGUA', ocs: ['4500001', '4500002'] });
  });

  it('misma OC repetida en varias filas no es ambigua', () => {
    const mapa = agruparIndiceOC(mezclarIndiceOC({}, [fila(), fila({ id: 'F2' })]).indice);
    expect(cruzarItemOC({ clave, empresa: 'MEDTRONIC', nombre: 'JUAN' }, mapa).tipo).toBe('ASIGNADA');
  });
});

describe('cantidades por código', () => {
  const clave = claveCruceOC({ admision: '102345', fecha: '2026-09-15', codigo: '00123' });

  it('suma las filas repetidas del Excel contra la suma de Implantes', () => {
    const mapa = agruparIndiceOC(mezclarIndiceOC({}, [fila({ id: 'A' }), fila({ id: 'B' }), fila({ id: 'C' })]).indice);
    expect(cruzarCodigoOC({ clave, empresa: 'MEDTRONIC', nombre: 'JUAN', cantidadesImplantes: [3] }, mapa).tipo).toBe('ASIGNADA');
    expect(cruzarCodigoOC({ clave, empresa: 'MEDTRONIC', nombre: 'JUAN', cantidadesImplantes: [1, 2] }, mapa).tipo).toBe('ASIGNADA');
  });

  it('calza ítem por ítem aunque la suma no coincida', () => {
    const mapa = agruparIndiceOC(mezclarIndiceOC({}, [fila({ id: 'A', cantidad: 2 }), fila({ id: 'B', cantidad: 1 })]).indice);
    expect(cruzarCodigoOC({ clave, empresa: 'MEDTRONIC', nombre: 'JUAN', cantidadesImplantes: [2], cantidadesPendientes: [2] }, mapa).tipo).toBe('ASIGNADA');
  });

  it('informa cantidad distinta con ambos totales', () => {
    const mapa = agruparIndiceOC(mezclarIndiceOC({}, [fila({ id: 'A', cantidad: 2 })]).indice);
    expect(cruzarCodigoOC({ clave, empresa: 'MEDTRONIC', nombre: 'JUAN', cantidadesImplantes: [5] }, mapa))
      .toEqual({ tipo: 'CANTIDAD_DISTINTA', cantidadExcel: 2, cantidadImplantes: 5 });
  });

  it('en la gestión, todos los ítems repetidos del mismo código reciben la misma OC', () => {
    const mapa = agruparIndiceOC(mezclarIndiceOC({}, [fila({ id: 'A', cantidad: 2 }), fila({ id: 'B', cantidad: 1 })]).indice);
    const g = {
      refPath: 'implantes_gestiones/x', gestionId: '102345', nombre: 'JUAN', fecha: '2026-09-15', empresa: 'MEDTRONIC',
      cotizaciones: [{ items: [{ id: 'i1', codigo: '123', cantidad: 1 }, { id: 'i2', codigo: '00123', cantidad: 1 }, { id: 'i3', codigo: '00123', cantidad: 1 }] }]
    };
    const r = cruzarGestionesOC([g], mapa);
    expect(r.actualizaciones[0].asignaciones).toEqual({ i2: '4500001', i3: '4500001' });
    expect(r.contadores).toMatchObject({ asignadas: 2, sinCoincidencia: 1 });
  });
});

describe('cruzarGestionesOC', () => {
  const gestion = {
    refPath: 'implantes_gestiones/2026/mes/09/dia/15/admision/102345/empresa/MEDTRONIC/detalles/abc',
    gestionId: '102345', nombre: 'JUAN PEREZ', fecha: '2026-09-15', empresa: 'MEDTRONIC',
    cotizaciones: [{ items: [
      { id: 'i1', codigo: '00123', cantidad: 1 },
      { id: 'i2', codigo: '999', cantidad: 2 },
      { id: 'i3', codigo: '', sinCodigo: true, cantidad: 1 }
    ] }]
  };

  it('asigna por ítem y deja pendiente lo que no cruzó', () => {
    const mapa = agruparIndiceOC(mezclarIndiceOC({}, [fila()]).indice);
    const r = cruzarGestionesOC([gestion], mapa);
    expect(r.actualizaciones).toEqual([{ refPath: gestion.refPath, asignaciones: { i1: '4500001' }, ocPendiente: true }]);
    expect(r.contadores).toMatchObject({ asignadas: 1, sinCoincidencia: 1 });
    expect(r.detalle[0]).toMatchObject({ codigo: '999', tipo: 'SIN_COINCIDENCIA' });
  });

  it('no escribe nada si no asignó y siguen pendientes', () => {
    const r = cruzarGestionesOC([gestion], new Map());
    expect(r.actualizaciones).toEqual([]);
  });

  it('limpia el flag si ya no quedan ítems pendientes', () => {
    const r = cruzarGestionesOC([{ ...gestion, ocPorItem: { i1: 'A', i2: 'B' } }], new Map());
    expect(r.actualizaciones).toEqual([{ refPath: gestion.refPath, asignaciones: {}, ocPendiente: false }]);
  });
});

describe('helpers de gestión', () => {
  it('calcularOcPendiente y ocsDeGestion', () => {
    const items = [{ id: 'a', codigo: '1' }, { id: 'b', codigo: '2' }, { id: 'c', sinCodigo: true }];
    expect(calcularOcPendiente(items, { a: 'X' })).toBe(true);
    expect(calcularOcPendiente(items, { a: 'X', b: 'Y' })).toBe(false);
    expect(calcularOcPendiente([], {})).toBe(false);
    expect(ocsDeGestion({ cotizaciones: [{ items }], ocPorItem: { a: 'X', b: 'X', zz: 'Z' } })).toEqual(['X']);
  });
});

// Columna ORDEN: el cruce de punta a punta (índice -> asignación -> texto de
// la celda), para una fila de Gestiones (admisión + empresa + día) y para la
// misma admisión en Consignación (un registro por ítem).
describe('columna ORDEN después del cruce', () => {
  const OC1 = '4500001';
  const OC2 = '4500002';
  const filasExcel = (...ocs) => ocs.map(([codigo, oc], i) => fila({ id: `F${i}`, codigo, oc }));
  const mapaDe = (...ocs) => agruparIndiceOC(mezclarIndiceOC({}, filasExcel(...ocs)).indice);

  describe('Gestiones', () => {
    const gestion = (...codigos) => ({
      refPath: 'implantes_gestiones/2026/mes/09/dia/15/admision/102345/empresa/MEDTRONIC/detalles/g1',
      gestionId: '102345', nombre: 'JUAN PEREZ', fecha: '2026-09-15', empresa: 'MEDTRONIC',
      cotizaciones: [{ items: codigos.map((codigo, i) => ({ id: `i${i}`, codigo, cantidad: 1 })) }]
    });
    // Lo que queda guardado tras sincronizar (ocPorItem) -> texto de la celda.
    const ordenTrasSincronizar = (g, mapa) => {
      const { actualizaciones } = cruzarGestionesOC([g], mapa);
      const ocPorItem = Object.assign({}, ...actualizaciones.map(a => a.asignaciones));
      return textoOCs(ocsDeGestion({ ...g, ocPorItem }));
    };

    it('una orden', () => {
      expect(ordenTrasSincronizar(gestion('00123'), mapaDe(['00123', OC1]))).toBe(OC1);
    });

    it('dos órdenes en la misma fila, separadas por coma', () => {
      expect(ordenTrasSincronizar(gestion('00123', '00456'), mapaDe(['00123', OC1], ['00456', OC2]))).toBe(`${OC1}, ${OC2}`);
    });

    it('orden repetida en varios ítems aparece una sola vez', () => {
      expect(ordenTrasSincronizar(gestion('00123', '00456', '00789'), mapaDe(['00123', OC1], ['00456', OC1], ['00789', OC1]))).toBe(OC1);
    });

    it('fila sin orden queda vacía', () => {
      expect(ordenTrasSincronizar(gestion('00999'), mapaDe(['00123', OC1]))).toBe('');
      expect(textoOCs(ocsDeGestion(gestion('00123')))).toBe('');
    });
  });

  describe('Consignación', () => {
    const registro = (id, codigo, extra = {}) => ({
      refPath: `consignacion_registros/2026/mes/septiembre/dia/15/detalles/${id}`,
      gestionId: '102345', nombre: 'JUAN PEREZ', fecha: '2026-09-15', empresa: 'MEDTRONIC',
      codigo, cantidad: 1, orden: '', ...extra
    });
    // `orden` escrito tras sincronizar -> texto por empresa + fecha.
    const ordenTrasSincronizar = (registros, mapa) => {
      const { asignaciones } = cruzarRegistrosConsignacionOC(registros, mapa);
      const porRuta = Object.fromEntries(asignaciones.map(a => [a.refPath, a.oc]));
      const actualizados = registros.map(r => ({ ...r, orden: porRuta[r.refPath] ?? r.orden }));
      return { asignaciones, actualizados, textos: bloquesOCConsignacion(actualizados).ocsPorBloque.map(textoOCs) };
    };

    it('una orden: se escribe en el campo orden del registro', () => {
      const r = ordenTrasSincronizar([registro('a', '00123')], mapaDe(['00123', OC1]));
      expect(r.asignaciones).toEqual([{ refPath: registro('a').refPath, oc: OC1 }]);
      expect(r.textos).toEqual([OC1]);
    });

    it('dos órdenes en la misma admisión + empresa + día', () => {
      const r = ordenTrasSincronizar([registro('a', '00123'), registro('b', '00456')], mapaDe(['00123', OC1], ['00456', OC2]));
      expect(r.actualizados.map(x => x.orden)).toEqual([OC1, OC2]);
      expect(r.textos).toEqual([`${OC1}, ${OC2}`]);
    });

    it('orden repetida aparece una sola vez; registros del mismo código suman cantidad', () => {
      const excel = [fila({ id: 'A', codigo: '00123', oc: OC1, cantidad: 2 }), fila({ id: 'B', codigo: '00456', oc: OC1 })];
      const mapa = agruparIndiceOC(mezclarIndiceOC({}, excel).indice);
      const r = ordenTrasSincronizar([registro('a', '00123'), registro('b', '00123'), registro('c', '00456')], mapa);
      expect(r.actualizados.map(x => x.orden)).toEqual([OC1, OC1, OC1]);
      expect(r.textos).toEqual([OC1]);
    });

    it('registro sin orden queda vacío y se informa en el detalle', () => {
      const r = ordenTrasSincronizar([registro('a', '00999')], mapaDe(['00123', OC1]));
      expect(r.asignaciones).toEqual([]);
      expect(r.textos).toEqual(['']);
      expect(cruzarRegistrosConsignacionOC([registro('a', '00999')], mapaDe(['00123', OC1])).detalle[0])
        .toMatchObject({ admision: '102345', codigo: '00999', tipo: 'SIN_COINCIDENCIA' });
    });

    it('no reescribe un orden ya puesto (a mano) y separa por empresa y día', () => {
      const registros = [
        registro('a', '00123', { orden: 'MANUAL-1' }),
        registro('b', '00123', { empresa: 'STRYKER' }),
        registro('c', '00123', { fecha: '2026-09-16' })
      ];
      expect(gestionesDesdeRegistrosConsignacion(registros)).toHaveLength(3);
      const { asignaciones } = cruzarRegistrosConsignacionOC(registros, mapaDe(['00123', OC1]));
      expect(asignaciones).toEqual([]);
    });
  });
});
