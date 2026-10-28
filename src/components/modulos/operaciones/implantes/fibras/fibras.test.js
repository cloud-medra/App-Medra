import { describe, it, expect } from 'vitest';
import {
  siguienteNumeroUso, usosConsumidosDe, usosRestantes, estadoVisible, motivoNoUsable, motivoNoPerdible,
  fibraConAlta, fibraConBaja, textoUsoRegistrado, validarNuevaFibra, validarEdicionFibra,
  prepararFibrasNuevas, planFibrasBloque, planFibrasEliminacion, operacionesDePlan, validarUnCambioPorFibra,
  fibrasElegibles, fibrasUsadasEnBloques, ordenarUsos, MOTIVO_ANULACION, ESTADO_USO, TIPO_USO,
  accesosReglas, validarLecturasReglas, fechaUltimoUsoVigente, UBICACION, ubicacionTrasEstado, motivoNoPonerEnUso, siguienteEnBodega,
  opcionesSelectorFibra, idControlEnUso,
} from './fibrasNucleo';
import { aplicarOperacionesFibra, cambiarUbicacionFibra } from './operacionesFibra';

const fibra = (extra = {}) => ({
  id: 'FIB-0001', codigoInterno: 'FIB-0001', referencia: 'FL-365', lote: 'ABC', vencimiento: '2027-01-31',
  usosTotales: 5, usosPrevios: 0, numerosOcupados: [], usosConsumidos: 0, fechasUso: {}, estado: 'ACTIVA',
  ubicacion: 'EN USO', ...extra,
});

// --- Firestore simulado: documentos en memoria y transacciones con control
// de versión (como Firestore: si otra transacción escribió lo que esta leyó,
// se reintenta con los datos nuevos).
const crearBase = (docs) => {
  const datos = new Map(Object.entries(docs));
  const versiones = new Map();
  const ref = (path) => ({ path });
  const refs = {
    fibra: (id) => ref(`fibras/${id}`),
    uso: (fibraId, usoId) => ref(`fibras/${fibraId}/usos/${usoId}`),
    log: (fibraId) => ref(`fibras/${fibraId}/logs/${Math.random()}`),
    control: (id) => ref(`control/${id}`),
  };
  const ejecutarTransaccion = async (fn, { antesDeConfirmar } = {}) => {
    for (let intento = 0; intento < 5; intento++) {
      const leidos = new Map();
      const escrituras = [];
      const t = {
        get: async (r) => {
          leidos.set(r.path, versiones.get(r.path) || 0);
          const d = datos.get(r.path);
          return { exists: () => d !== undefined, data: () => structuredClone(d) };
        },
        set: (r, d) => escrituras.push(['set', r.path, d]),
        update: (r, d) => escrituras.push(['update', r.path, d]),
      };
      const resultado = await fn(t);
      if (antesDeConfirmar && intento === 0) await antesDeConfirmar();
      const conflicto = [...leidos].some(([p, v]) => (versiones.get(p) || 0) !== v);
      if (conflicto) continue;
      escrituras.forEach(([tipo, p, d]) => {
        datos.set(p, tipo === 'set' ? structuredClone(d) : { ...datos.get(p), ...structuredClone(d) });
        versiones.set(p, (versiones.get(p) || 0) + 1);
      });
      return resultado;
    }
    throw new Error('demasiados reintentos');
  };
  return { datos, refs, ejecutarTransaccion };
};

const ctx = (refs) => ({ refs, ahora: 'TS', usuario: { uid: 'u1', nombre: 'Ana' }, hoy: '2026-10-28' });
const gestion = (fecha = '2026-10-20') => ({ gestionId: '115000', paciente: 'PACIENTE', medico: 'MEDICO', empresa: 'EMP', fecha, gestionRefPath: 'g/1' });
const registrar = (usoId, extra = {}) => ({ tipo: 'registrar', fibraId: 'FIB-0001', usoId, datosGestion: gestion(), ...extra });

describe('conteo y números de uso', () => {
  it('el siguiente número es el menor libre después de los usos previos', () => {
    expect(siguienteNumeroUso(fibra())).toBe(1);
    expect(siguienteNumeroUso(fibra({ usosPrevios: 2 }))).toBe(3);
    expect(siguienteNumeroUso(fibra({ numerosOcupados: [1, 3] }))).toBe(2);
    expect(siguienteNumeroUso(fibra({ numerosOcupados: [1, 2, 3, 4, 5] }))).toBeNull();
  });

  it('usos consumidos = previos + vigentes registrados', () => {
    const f = fibra({ usosPrevios: 2, numerosOcupados: [3] });
    expect(usosConsumidosDe(f)).toBe(3);
    expect(usosRestantes(f)).toBe(2);
  });

  it('alta y baja actualizan contador, lista de números, fechas de uso y estado', () => {
    const fechas = { 1: '2026-10-01', 2: '2026-10-02', 3: '2026-10-03', 4: '2026-10-04' };
    const alta = fibraConAlta(fibra({ numerosOcupados: [1, 2, 3, 4], fechasUso: fechas }), 5, 'u5', '2026-10-05');
    expect(alta).toEqual({ numerosOcupados: [1, 2, 3, 4, 5], usosConsumidos: 5, fechasUso: { ...fechas, 5: '2026-10-05' }, estado: 'AGOTADA', ubicacion: 'AGOTADA', ultimoCambio: { tipo: 'ALTA', numero: 5, usoId: 'u5' } });
    const baja = fibraConBaja({ ...fibra(), ...alta }, 2, 'u2');
    expect(baja).toEqual({ numerosOcupados: [1, 3, 4, 5], usosConsumidos: 4, fechasUso: { 1: '2026-10-01', 3: '2026-10-03', 4: '2026-10-04', 5: '2026-10-05' }, estado: 'ACTIVA', ubicacion: 'EN BODEGA', ultimoCambio: { tipo: 'BAJA', numero: 2, usoId: 'u2' } });
    expect(fechaUltimoUsoVigente({ ...fibra(), ...baja })).toBe('2026-10-05');
  });

  it('texto del aviso con el número de uso y el último uso destacado', () => {
    expect(textoUsoRegistrado({ lote: 'ABC', codigoInterno: 'FIB-0001', numeroUso: 2, usosTotales: 5, restantes: 3 }))
      .toBe('Fibra lote ABC (FIB-0001): uso 2/5, quedan 3.');
    expect(textoUsoRegistrado({ lote: 'ABC', numeroUso: 5, usosTotales: 5, restantes: 0 }))
      .toBe('Fibra lote ABC: uso 5/5. Era el último uso: la fibra quedó AGOTADA.');
  });
});

describe('bloqueo de fibras agotadas o vencidas', () => {
  it('agotada: no se puede usar ni perder', () => {
    const f = fibra({ numerosOcupados: [1, 2, 3, 4, 5] });
    expect(motivoNoUsable(f, '2026-10-20')).toMatch(/agotada/);
    expect(motivoNoPerdible(f)).toMatch(/agotada/);
  });

  it('agotada por usos previos', () => {
    expect(motivoNoUsable(fibra({ usosPrevios: 5 }), '2026-10-20')).toMatch(/agotada/);
  });

  it('vencida para la fecha de la cirugía (el mismo día de vencimiento sí sirve)', () => {
    const f = fibra({ vencimiento: '2026-10-20' });
    expect(motivoNoUsable(f, '2026-10-20')).toBeNull();
    expect(motivoNoUsable(f, '2026-10-21')).toMatch(/vence el 2026-10-20/);
  });

  it('sin fecha de cirugía válida no se registra', () => {
    expect(motivoNoUsable(fibra(), 'P')).toMatch(/fecha de cirugía/);
  });

  it('estado visible: agotada manda sobre vencida', () => {
    expect(estadoVisible(fibra({ vencimiento: '2026-01-01' }), '2026-10-28')).toBe('VENCIDA');
    expect(estadoVisible(fibra({ vencimiento: '2026-01-01', numerosOcupados: [1, 2, 3, 4, 5] }), '2026-10-28')).toBe('AGOTADA');
    expect(estadoVisible(fibra(), '2026-10-28')).toBe('ACTIVA');
  });

  it('el selector solo ofrece fibras usables, sin las ya usadas en la admisión, por vencimiento', () => {
    const lista = [
      fibra({ id: 'B', codigoInterno: 'FIB-0002', vencimiento: '2027-05-01' }),
      fibra({ id: 'A', codigoInterno: 'FIB-0001', vencimiento: '2027-02-01' }),
      fibra({ id: 'V', vencimiento: '2026-01-01' }),
      fibra({ id: 'G', numerosOcupados: [1, 2, 3, 4, 5] }),
      fibra({ id: 'U' }),
    ];
    expect(fibrasElegibles(lista, '2026-10-20', new Set(['U'])).map((f) => f.id)).toEqual(['A', 'B']);
  });

  it('fibras usadas en los bloques de la admisión', () => {
    const bloques = [{ cotizaciones: [{ items: [{ fibra: { id: 'A' } }, { referencia: 'X' }] }] }, { cotizaciones: [] }];
    expect([...fibrasUsadasEnBloques(bloques)]).toEqual(['A']);
  });
});

describe('formularios', () => {
  it('nueva fibra: usos 5 o 10, previos menores al total', () => {
    const base = { referencia: 'FL-365', lote: 'a1', vencimiento: '2027-01-01', usosTotales: 5, usosPrevios: 0, cantidad: 1 };
    expect(validarNuevaFibra(base)).toEqual({});
    expect(validarNuevaFibra({ ...base, usosTotales: 7 })).toHaveProperty('usosTotales');
    expect(validarNuevaFibra({ ...base, usosPrevios: 5 })).toHaveProperty('usosPrevios');
    expect(validarNuevaFibra({ ...base, vencimiento: '01/01/2027' })).toHaveProperty('vencimiento');
  });

  it('corregir usos totales tras el primer uso: de 5 a 10 sí; por debajo de lo consumido o de un número ocupado, no', () => {
    const f = fibra({ numerosOcupados: [1, 2, 3] });
    expect(validarEdicionFibra(f, { lote: 'ABC', vencimiento: '2027-01-31', usosTotales: 10 }))
      .toEqual({ errores: {}, cambios: { usosTotales: 10 } });
    const g = fibra({ usosTotales: 10, numerosOcupados: [1, 2, 3, 4, 5, 6] });
    expect(validarEdicionFibra(g, { lote: 'ABC', vencimiento: '2027-01-31', usosTotales: 5 }).errores.usosTotales).toMatch(/menor/);
    const h = fibra({ usosTotales: 10, numerosOcupados: [1, 7] });
    expect(validarEdicionFibra(h, { lote: 'ABC', vencimiento: '2027-01-31', usosTotales: 5 }).errores.usosTotales).toMatch(/número 7/);
  });

  it('bajar a 5 usos con 5 consumidos deja la fibra agotada', () => {
    const f = fibra({ usosTotales: 10, numerosOcupados: [1, 2, 3, 4, 5] });
    expect(validarEdicionFibra(f, { lote: 'ABC', vencimiento: '2027-01-31', usosTotales: 5 }).cambios).toEqual({ usosTotales: 5, estado: 'AGOTADA' });
  });

  it('usos previos: se corrigen con usos registrados si no chocan con un número ocupado ni pasan del total', () => {
    const f = fibra({ usosTotales: 10, usosPrevios: 2, numerosOcupados: [3, 4], usosConsumidos: 4, fechasUso: { 3: 'a', 4: 'b' } });
    const v = (usosPrevios, usosTotales = 10) => validarEdicionFibra(f, { lote: 'ABC', vencimiento: '2027-01-31', usosTotales, usosPrevios });
    expect(v(1)).toEqual({ errores: {}, cambios: { usosPrevios: 1, usosConsumidos: 3 } });
    expect(v(3).errores.usosPrevios).toMatch(/número 3/);
    expect(v(-1).errores.usosPrevios).toMatch(/entero/);
    // Sin usos registrados: hasta el total (deja la fibra agotada).
    const g = fibra({ usosTotales: 5 });
    expect(validarEdicionFibra(g, { lote: 'ABC', vencimiento: '2027-01-31', usosTotales: 5, usosPrevios: 2 }).cambios).toEqual({ usosPrevios: 2, usosConsumidos: 2 });
    expect(validarEdicionFibra(g, { lote: 'ABC', vencimiento: '2027-01-31', usosTotales: 5, usosPrevios: 5 }).cambios).toEqual({ usosPrevios: 5, usosConsumidos: 5, estado: 'AGOTADA' });
    expect(validarEdicionFibra(g, { lote: 'ABC', vencimiento: '2027-01-31', usosTotales: 5, usosPrevios: 6 }).errores.usosPrevios).toMatch(/pasarían del total/);
    // Junto con subir el total: 5 → 10 y previos 7.
    expect(validarEdicionFibra(g, { lote: 'ABC', vencimiento: '2027-01-31', usosTotales: 10, usosPrevios: 7 }).cambios).toEqual({ usosPrevios: 7, usosConsumidos: 7, usosTotales: 10 });
  });

  it('el lote no se cambia con usos registrados', () => {
    const { errores } = validarEdicionFibra(fibra({ numerosOcupados: [1], fechasUso: { 1: '2026-10-01' } }), { lote: 'OTRO', vencimiento: '2027-01-31', usosTotales: 5 });
    expect(Object.keys(errores)).toEqual(['lote']);
  });

  it('vencimiento con usos: se corrige si no queda antes de ningún uso vigente', () => {
    const f = fibra({ numerosOcupados: [1, 2], fechasUso: { 1: '2026-09-10', 2: '2026-10-20' } });
    const valores = (vencimiento) => ({ lote: 'ABC', vencimiento, usosTotales: 5 });
    expect(validarEdicionFibra(f, valores('2026-12-31'))).toEqual({ errores: {}, cambios: { vencimiento: '2026-12-31' } });
    expect(validarEdicionFibra(f, valores('2026-10-20')).cambios).toEqual({ vencimiento: '2026-10-20' });
    expect(validarEdicionFibra(f, valores('2026-10-19')).errores.vencimiento).toMatch(/2026-10-20/);
    expect(validarEdicionFibra(f, valores('31/12/2026')).errores.vencimiento).toMatch(/Ingresa/);
  });

  it('un uso anulado ya no limita el vencimiento', () => {
    const f = fibra({ numerosOcupados: [1, 2], fechasUso: { 1: '2026-09-10', 2: '2026-10-20' } });
    const sinEl2 = { ...f, ...fibraConBaja(f, 2, 'u2') };
    expect(validarEdicionFibra(sinEl2, { lote: 'ABC', vencimiento: '2026-10-01', usosTotales: 5 }).errores).toEqual({});
  });
});

describe('plan al guardar la gestión', () => {
  const lineaFibra = (id, usoId, fibraId = 'FIB-0001') => ({ id, referencia: 'FL-365', fibra: { id: fibraId, codigoInterno: fibraId, ...(usoId ? { usoId } : {}) } });

  it('las líneas nuevas reciben usoId sobre una copia (el estado original no cambia)', () => {
    const original = [{ id: 'c', items: [lineaFibra('i1'), { id: 'i2' }] }];
    const { cotizaciones, nuevas } = prepararFibrasNuevas(original, () => 'U1');
    expect(nuevas).toHaveLength(1);
    expect(cotizaciones[0].items[0].fibra.usoId).toBe('U1');
    expect(original[0].items[0].fibra.usoId).toBeUndefined();
  });

  it('registra las nuevas, anula las eliminadas y no toca las que siguen', () => {
    const antes = [lineaFibra('i1', 'U1'), lineaFibra('i2', 'U2', 'FIB-0002')];
    const despues = [lineaFibra('i1', 'U1'), lineaFibra('i3', 'U3', 'FIB-0003')];
    const plan = planFibrasBloque({ itemsAntes: antes, itemsDespues: despues });
    expect(plan.registrar.map((i) => i.id)).toEqual(['i3']);
    expect(plan.anular).toEqual([{ item: antes[1], motivo: MOTIVO_ANULACION.LINEA_ELIMINADA }]);
    expect(plan.actualizar).toEqual([]);
  });

  it('referencia cambiada (la línea pierde la fibra) anula el uso', () => {
    const antes = [lineaFibra('i1', 'U1')];
    const plan = planFibrasBloque({ itemsAntes: antes, itemsDespues: [{ id: 'i1', referencia: 'OTRA' }] });
    expect(plan.anular[0].motivo).toBe(MOTIVO_ANULACION.REFERENCIA_CAMBIADA);
  });

  it('con datos de la gestión cambiados (ruta, paciente…) actualiza los usos vigentes', () => {
    const antes = [lineaFibra('i1', 'U1')];
    expect(planFibrasBloque({ itemsAntes: antes, itemsDespues: antes, cambiaGestion: true }).actualizar).toHaveLength(1);
  });

  it('una línea de fibra sin preparar es un error', () => {
    expect(() => planFibrasBloque({ itemsDespues: [lineaFibra('i1')] })).toThrow(/sin preparar/);
  });

  it('eliminar la gestión anula todos sus usos', () => {
    const plan = planFibrasEliminacion([lineaFibra('i1', 'U1'), { id: 'x' }]);
    expect(operacionesDePlan(plan, null)).toEqual([{ tipo: 'anular', fibraId: 'FIB-0001', usoId: 'U1', motivo: MOTIVO_ANULACION.GESTION_ELIMINADA }]);
  });

  it('lecturas de las reglas: 3 líneas de fibra, o 2 si alguna cambia de ubicación (margen de 4 sobre 20)', () => {
    const registrar = (n, cambian = 0) => Array.from({ length: n }, (_, i) => ({ tipo: 'registrar', fibraId: `F${i}`, cambiaUbicacion: i < cambian }));
    expect(accesosReglas(registrar(3))).toBe(14);
    expect(accesosReglas(registrar(2, 2))).toBe(14);
    expect(accesosReglas([{ tipo: 'anular', fibraId: 'A' }, { tipo: 'anular', fibraId: 'B' }])).toBe(8);
    expect(validarLecturasReglas(registrar(3))).toBeNull();
    expect(validarLecturasReglas(registrar(4))).toMatch(/demasiados cambios/);
    expect(validarLecturasReglas(registrar(2, 2))).toBeNull();
    expect(validarLecturasReglas(registrar(3, 1))).toBeNull();
    expect(validarLecturasReglas(registrar(3, 2))).toMatch(/demasiados cambios/);
    // Antes de leer, solo cuentan las elegidas de bodega (ponerEnUso).
    const conBodega = (n) => registrar(3).map((op, i) => ({ ...op, cambiaUbicacion: undefined, ponerEnUso: i < n }));
    expect(validarUnCambioPorFibra(conBodega(1))).toBeNull();
    expect(validarUnCambioPorFibra(conBodega(2))).toMatch(/demasiados cambios/);
  });

  it('transacción: 3 líneas donde 2 agotan su fibra en uso se rechazan sin escribir', async () => {
    const casi = (id) => fibra({ id, codigoInterno: id, referencia: `R-${id}`, numerosOcupados: [1, 2, 3, 4], usosConsumidos: 4, fechasUso: { 1: 'a', 2: 'b', 3: 'c', 4: 'd' } });
    const { datos, refs, ejecutarTransaccion } = crearBase({ 'fibras/A': casi('A'), 'fibras/B': casi('B'), 'fibras/C': fibra({ id: 'C', codigoInterno: 'C' }) });
    const ops = ['A', 'B', 'C'].map((id) => ({ tipo: 'registrar', fibraId: id, usoId: `U${id}`, datosGestion: gestion() }));
    await expect(ejecutarTransaccion((t) => aplicarOperacionesFibra(t, ops, ctx(refs)))).rejects.toThrow(/demasiados cambios/);
    expect(datos.get('fibras/A').usosConsumidos).toBe(4);
  });

  it('una fibra no puede tener dos altas o bajas en el mismo guardado', () => {
    expect(validarUnCambioPorFibra([{ tipo: 'anular', fibraId: 'F' }, { tipo: 'registrar', fibraId: 'F' }])).toMatch(/guarda primero/);
    expect(validarUnCambioPorFibra([{ tipo: 'registrar', fibraId: 'F' }, { tipo: 'registrar', fibraId: 'F' }])).toMatch(/más de una línea/);
    expect(validarUnCambioPorFibra([{ tipo: 'registrar', fibraId: 'F' }, { tipo: 'actualizar', fibraId: 'F' }])).toBeNull();
  });
});

describe('transacción de usos (Firestore simulado)', () => {
  it('registra uso 1/5, escribe el número en la línea y avisa los restantes', async () => {
    const { datos, refs, ejecutarTransaccion } = crearBase({ 'fibras/FIB-0001': fibra() });
    const item = { id: 'i1', fibra: { id: 'FIB-0001', usoId: 'U1' } };
    const res = await ejecutarTransaccion((t) => aplicarOperacionesFibra(t, [registrar('U1', { item })], ctx(refs)));
    expect(res).toEqual([{ tipo: 'USO', fibraId: 'FIB-0001', codigoInterno: 'FIB-0001', referencia: 'FL-365', lote: 'ABC', numeroUso: 1, usosTotales: 5, restantes: 4, puestaEnUso: false, devuelta: null }]);
    expect(item.fibra).toMatchObject({ numeroUso: 1, usosTotales: 5 });
    expect(datos.get('fibras/FIB-0001')).toMatchObject({ usosConsumidos: 1, numerosOcupados: [1], fechasUso: { 1: '2026-10-20' }, estado: 'ACTIVA' });
    expect(datos.get('fibras/FIB-0001/usos/U1')).toMatchObject({ tipo: 'USO', estado: 'VIGENTE', numeroUso: 1, paciente: 'PACIENTE', medico: 'MEDICO', gestionId: '115000', itemId: 'i1', registradoPor: { uid: 'u1', nombre: 'Ana' } });
  });

  it('el quinto uso deja la fibra agotada y el sexto se rechaza sin escribir', async () => {
    const { datos, refs, ejecutarTransaccion } = crearBase({ 'fibras/FIB-0001': fibra({ numerosOcupados: [1, 2, 3, 4], usosConsumidos: 4 }) });
    const [r] = await ejecutarTransaccion((t) => aplicarOperacionesFibra(t, [registrar('U5')], ctx(refs)));
    expect(r.restantes).toBe(0);
    expect(datos.get('fibras/FIB-0001').estado).toBe('AGOTADA');
    await expect(ejecutarTransaccion((t) => aplicarOperacionesFibra(t, [registrar('U6')], ctx(refs)))).rejects.toThrow(/agotada/);
    expect(datos.has('fibras/FIB-0001/usos/U6')).toBe(false);
  });

  it('fibra vencida para la fecha de la cirugía: se rechaza', async () => {
    const { refs, ejecutarTransaccion } = crearBase({ 'fibras/FIB-0001': fibra({ vencimiento: '2026-10-01' }) });
    await expect(ejecutarTransaccion((t) => aplicarOperacionesFibra(t, [registrar('U1')], ctx(refs)))).rejects.toThrow(/vence/);
  });

  it('pérdida: descuenta un uso, queda con motivo y log', async () => {
    const { datos, refs, ejecutarTransaccion } = crearBase({ 'fibras/FIB-0001': fibra({ numerosOcupados: [1] }) });
    const [r] = await ejecutarTransaccion((t) => aplicarOperacionesFibra(t, [{ tipo: 'registrar', fibraId: 'FIB-0001', usoId: 'P1', perdida: { motivo: 'Se dañó', fecha: '2026-10-28' } }], ctx(refs)));
    expect(r).toMatchObject({ tipo: TIPO_USO.PERDIDA, numeroUso: 2, restantes: 3 });
    expect(datos.get('fibras/FIB-0001/usos/P1')).toMatchObject({ tipo: 'PERDIDA', motivo: 'Se dañó', fecha: '2026-10-28', numeroUso: 2 });
    expect([...datos.keys()].some((k) => k.startsWith('fibras/FIB-0001/logs/'))).toBe(true);
  });

  it('anular un uso intermedio: libera su número, queda en el historial y el siguiente uso lo toma (sin números repetidos)', async () => {
    const { datos, refs, ejecutarTransaccion } = crearBase({ 'fibras/FIB-0001': fibra() });
    for (const id of ['U1', 'U2', 'U3']) {
      await ejecutarTransaccion((t) => aplicarOperacionesFibra(t, [registrar(id)], ctx(refs)));
    }
    await ejecutarTransaccion((t) => aplicarOperacionesFibra(t, [{ tipo: 'anular', fibraId: 'FIB-0001', usoId: 'U2', motivo: MOTIVO_ANULACION.LINEA_ELIMINADA }], ctx(refs)));
    expect(datos.get('fibras/FIB-0001')).toMatchObject({ usosConsumidos: 2, numerosOcupados: [1, 3] });
    expect(datos.get('fibras/FIB-0001/usos/U2')).toMatchObject({ estado: ESTADO_USO.ANULADO, motivoAnulacion: 'LINEA_ELIMINADA', numeroUso: 2 });
    // U1 y U3 conservan su número: las etiquetas de sus gestiones no cambian.
    expect(datos.get('fibras/FIB-0001/usos/U3').numeroUso).toBe(3);
    const [r] = await ejecutarTransaccion((t) => aplicarOperacionesFibra(t, [registrar('U4')], ctx(refs)));
    expect(r.numeroUso).toBe(2);
    const vigentes = [...datos].filter(([k, v]) => k.includes('/usos/') && v.estado === 'VIGENTE').map(([, v]) => v.numeroUso).sort();
    expect(vigentes).toEqual([1, 2, 3]);
  });

  it('anular dos veces el mismo uso no descuenta dos veces', async () => {
    const { datos, refs, ejecutarTransaccion } = crearBase({ 'fibras/FIB-0001': fibra() });
    await ejecutarTransaccion((t) => aplicarOperacionesFibra(t, [registrar('U1')], ctx(refs)));
    const anular = { tipo: 'anular', fibraId: 'FIB-0001', usoId: 'U1', motivo: MOTIVO_ANULACION.GESTION_ELIMINADA };
    await ejecutarTransaccion((t) => aplicarOperacionesFibra(t, [anular], ctx(refs)));
    await ejecutarTransaccion((t) => aplicarOperacionesFibra(t, [anular], ctx(refs)));
    expect(datos.get('fibras/FIB-0001').usosConsumidos).toBe(0);
  });

  it('anular una pérdida devuelve el uso; solo pérdidas por esa vía', async () => {
    const { datos, refs, ejecutarTransaccion } = crearBase({ 'fibras/FIB-0001': fibra() });
    await ejecutarTransaccion((t) => aplicarOperacionesFibra(t, [registrar('U1')], ctx(refs)));
    await ejecutarTransaccion((t) => aplicarOperacionesFibra(t, [{ tipo: 'registrar', fibraId: 'FIB-0001', usoId: 'P1', perdida: { motivo: 'x', fecha: '2026-10-28' } }], ctx(refs)));
    const anularPerdida = (usoId) => ({ tipo: 'anular', fibraId: 'FIB-0001', usoId, motivo: MOTIVO_ANULACION.PERDIDA_ANULADA, detalle: 'error', soloPerdida: true });
    await expect(ejecutarTransaccion((t) => aplicarOperacionesFibra(t, [anularPerdida('U1')], ctx(refs)))).rejects.toThrow(/Solo se pueden anular pérdidas/);
    await ejecutarTransaccion((t) => aplicarOperacionesFibra(t, [anularPerdida('P1')], ctx(refs)));
    expect(datos.get('fibras/FIB-0001/usos/P1')).toMatchObject({ estado: 'ANULADO', detalleAnulacion: 'error' });
    expect(datos.get('fibras/FIB-0001').usosConsumidos).toBe(1);
  });

  it('actualizar copia los datos nuevos de la gestión y rechaza una fecha posterior al vencimiento', async () => {
    const { datos, refs, ejecutarTransaccion } = crearBase({ 'fibras/FIB-0001': fibra() });
    await ejecutarTransaccion((t) => aplicarOperacionesFibra(t, [registrar('U1')], ctx(refs)));
    await ejecutarTransaccion((t) => aplicarOperacionesFibra(t, [{ tipo: 'actualizar', fibraId: 'FIB-0001', usoId: 'U1', datosGestion: { ...gestion(), paciente: 'OTRO' } }], ctx(refs)));
    expect(datos.get('fibras/FIB-0001/usos/U1').paciente).toBe('OTRO');
    // Sin cambio de fecha, la fibra no se toca.
    expect(datos.get('fibras/FIB-0001').ultimoCambio.tipo).toBe('ALTA');
    await ejecutarTransaccion((t) => aplicarOperacionesFibra(t, [{ tipo: 'actualizar', fibraId: 'FIB-0001', usoId: 'U1', datosGestion: gestion('2026-11-15') }], ctx(refs)));
    expect(datos.get('fibras/FIB-0001')).toMatchObject({ fechasUso: { 1: '2026-11-15' }, ultimoCambio: { tipo: 'FECHA', numero: 1, usoId: 'U1' } });
    expect(datos.get('fibras/FIB-0001/usos/U1').fecha).toBe('2026-11-15');
    await expect(ejecutarTransaccion((t) => aplicarOperacionesFibra(t, [{ tipo: 'actualizar', fibraId: 'FIB-0001', usoId: 'U1', datosGestion: gestion('2027-03-01') }], ctx(refs)))).rejects.toThrow(/nueva fecha/);
  });

  it('dos personas toman el último uso a la vez: una lo registra y la otra recibe "agotada" sin escribir', async () => {
    const { datos, refs, ejecutarTransaccion } = crearBase({ 'fibras/FIB-0001': fibra({ numerosOcupados: [1, 2, 3, 4], usosConsumidos: 4 }) });
    // La transacción A lee la fibra; antes de que confirme, B registra el
    // último uso. Al confirmar, A detecta el conflicto y se reintenta.
    const a = ejecutarTransaccion(
      (t) => aplicarOperacionesFibra(t, [registrar('UA')], ctx(refs)),
      { antesDeConfirmar: () => ejecutarTransaccion((t) => aplicarOperacionesFibra(t, [registrar('UB')], ctx(refs))) }
    );
    await expect(a).rejects.toThrow(/agotada/);
    expect(datos.get('fibras/FIB-0001')).toMatchObject({ usosConsumidos: 5, numerosOcupados: [1, 2, 3, 4, 5], estado: 'AGOTADA' });
    expect(datos.has('fibras/FIB-0001/usos/UB')).toBe(true);
    expect(datos.has('fibras/FIB-0001/usos/UA')).toBe(false);
  });

  it('dos usos simultáneos con usos de sobra: ambos quedan, con números distintos', async () => {
    const { datos, refs, ejecutarTransaccion } = crearBase({ 'fibras/FIB-0001': fibra() });
    await ejecutarTransaccion(
      (t) => aplicarOperacionesFibra(t, [registrar('UA')], ctx(refs)),
      { antesDeConfirmar: () => ejecutarTransaccion((t) => aplicarOperacionesFibra(t, [registrar('UB')], ctx(refs))) }
    );
    expect(datos.get('fibras/FIB-0001/usos/UB').numeroUso).toBe(1);
    expect(datos.get('fibras/FIB-0001/usos/UA').numeroUso).toBe(2);
    expect(datos.get('fibras/FIB-0001').usosConsumidos).toBe(2);
  });
});

describe('ubicación (en uso / en bodega)', () => {
  const hoy = '2026-10-28';

  it('agotarse saca de uso; volver a tener usos deja en bodega', () => {
    expect(ubicacionTrasEstado('EN USO', 'AGOTADA')).toBe('AGOTADA');
    expect(ubicacionTrasEstado('EN BODEGA', 'AGOTADA')).toBe('AGOTADA');
    expect(ubicacionTrasEstado('AGOTADA', 'ACTIVA')).toBe('EN BODEGA');
    expect(ubicacionTrasEstado('EN USO', 'ACTIVA')).toBe('EN USO');
  });

  it('no se pone en uso una agotada, una vencida ni una ya en uso', () => {
    const bodega = fibra({ ubicacion: 'EN BODEGA' });
    expect(motivoNoPonerEnUso(bodega, hoy)).toBeNull();
    expect(motivoNoPonerEnUso(fibra({ ubicacion: 'EN BODEGA', vencimiento: hoy }), hoy)).toBeNull();
    expect(motivoNoPonerEnUso({ ...bodega, numerosOcupados: [1, 2, 3, 4, 5] }, hoy)).toMatch(/agotada/);
    expect(motivoNoPonerEnUso({ ...bodega, vencimiento: '2026-10-27' }, hoy)).toMatch(/vencida/);
    expect(motivoNoPonerEnUso(fibra(), hoy)).toMatch(/ya está en uso/);
  });

  it('siguiente en bodega: misma referencia, usable, la de vencimiento más próximo', () => {
    const lista = [
      fibra({ id: 'A', codigoInterno: 'FIB-0001', ubicacion: 'EN BODEGA', vencimiento: '2028-01-01' }),
      fibra({ id: 'B', codigoInterno: 'FIB-0002', ubicacion: 'EN BODEGA', vencimiento: '2027-06-01' }),
      fibra({ id: 'V', ubicacion: 'EN BODEGA', vencimiento: '2026-01-01' }),
      fibra({ id: 'O', ubicacion: 'EN BODEGA', referencia: 'FL-550', vencimiento: '2026-11-01' }),
      fibra({ id: 'U' }),
    ];
    expect(siguienteEnBodega(lista, 'FL-365', hoy, 'U').id).toBe('B');
    expect(siguienteEnBodega(lista, 'FL-1000', hoy)).toBeNull();
  });

  it('selector: solo EN USO; si ninguna sirve, las de bodega y cuál está en uso', () => {
    const enUso = fibra({ id: 'U' });
    const bodega = fibra({ id: 'B', ubicacion: 'EN BODEGA' });
    expect(opcionesSelectorFibra([enUso, bodega], '2026-10-20')).toMatchObject({ opciones: [enUso], desdeBodega: false });
    // La en uso ya se usó en la admisión: se ofrecen las de bodega.
    expect(opcionesSelectorFibra([enUso, bodega], '2026-10-20', new Set(['U']))).toMatchObject({ opciones: [bodega], desdeBodega: true, enUsoActual: enUso });
    // Sin ninguna en uso.
    expect(opcionesSelectorFibra([bodega], '2026-10-20')).toMatchObject({ opciones: [bodega], desdeBodega: true, enUsoActual: null });
  });

  it('id del control "en uso" por referencia', () => {
    expect(idControlEnUso(' fl-365 ')).toBe('enUso__FL-365');
    expect(idControlEnUso('AB/12')).toBe('enUso__AB_12');
  });

  it('último uso de la fibra en uso: queda AGOTADA, la referencia sin fibra en uso y con log', async () => {
    const { datos, refs, ejecutarTransaccion } = crearBase({ 'fibras/FIB-0001': fibra({ numerosOcupados: [1, 2, 3, 4], usosConsumidos: 4, fechasUso: { 1: 'a', 2: 'b', 3: 'c', 4: 'd' } }) });
    await ejecutarTransaccion((t) => aplicarOperacionesFibra(t, [registrar('U5')], ctx(refs)));
    expect(datos.get('fibras/FIB-0001')).toMatchObject({ estado: 'AGOTADA', ubicacion: 'AGOTADA', ubicacionDesde: { fecha: 'TS', por: { uid: 'u1', nombre: 'Ana' } } });
    expect(datos.get('control/enUso__FL-365')).toEqual({ referencia: 'FL-365', fibraId: null, origen: 'FIB-0001', actualizadoEl: 'TS' });
    const logs = [...datos].filter(([k]) => k.startsWith('fibras/FIB-0001/logs/')).map(([, v]) => v.accion);
    expect(logs).toContain('SALIDA_DE_USO');
  });

  it('uso normal con la fibra en uso: no toca ubicación ni control', async () => {
    const { datos, refs, ejecutarTransaccion } = crearBase({ 'fibras/FIB-0001': fibra() });
    await ejecutarTransaccion((t) => aplicarOperacionesFibra(t, [registrar('U1')], ctx(refs)));
    expect(datos.get('fibras/FIB-0001').ubicacionDesde).toBeUndefined();
    expect(datos.has('control/enUso__FL-365')).toBe(false);
  });

  it('Cargas: elegida de bodega pasa a EN USO y la que estaba en uso vuelve a bodega, en el mismo guardado', async () => {
    const { datos, refs, ejecutarTransaccion } = crearBase({
      'fibras/FIB-0001': fibra({ ubicacion: 'EN BODEGA' }),
      'fibras/FIB-0002': fibra({ id: 'FIB-0002', codigoInterno: 'FIB-0002' }),
      'control/enUso__FL-365': { referencia: 'FL-365', fibraId: 'FIB-0002', origen: 'FIB-0002' },
    });
    const item = { id: 'i1', fibra: { id: 'FIB-0001', usoId: 'U1', ponerEnUso: true, devolver: 'FIB-0002' } };
    const [r] = await ejecutarTransaccion((t) => aplicarOperacionesFibra(t, [registrar('U1', { item, ponerEnUso: true, devolver: 'FIB-0002' })], ctx(refs)));
    expect(r).toMatchObject({ puestaEnUso: true, devuelta: 'FIB-0002', numeroUso: 1 });
    expect(datos.get('fibras/FIB-0001').ubicacion).toBe('EN USO');
    expect(datos.get('fibras/FIB-0002').ubicacion).toBe('EN BODEGA');
    expect(datos.get('control/enUso__FL-365')).toMatchObject({ fibraId: 'FIB-0001', origen: 'FIB-0001' });
    // Las marcas no quedan en la línea de la gestión.
    expect(item.fibra).toEqual({ id: 'FIB-0001', usoId: 'U1', numeroUso: 1, usosTotales: 5 });
  });

  it('Cargas: si mientras editabas se puso en uso otra fibra, no guarda nada', async () => {
    const { datos, refs, ejecutarTransaccion } = crearBase({
      'fibras/FIB-0001': fibra({ ubicacion: 'EN BODEGA' }),
      'control/enUso__FL-365': { referencia: 'FL-365', fibraId: 'FIB-0009', origen: 'FIB-0009' },
    });
    await expect(ejecutarTransaccion((t) => aplicarOperacionesFibra(t, [registrar('U1', { ponerEnUso: true, devolver: null })], ctx(refs)))).rejects.toThrow(/otra fibra/);
    expect(datos.get('fibras/FIB-0001').ubicacion).toBe('EN BODEGA');
  });

  it('Cargas: una de bodega con un solo uso pasa directo a AGOTADA y la referencia queda sin fibra en uso', async () => {
    const { datos, refs, ejecutarTransaccion } = crearBase({
      'fibras/FIB-0001': fibra({ ubicacion: 'EN BODEGA', numerosOcupados: [1, 2, 3, 4], usosConsumidos: 4, fechasUso: { 1: 'a', 2: 'b', 3: 'c', 4: 'd' } }),
      'fibras/FIB-0002': fibra({ id: 'FIB-0002', codigoInterno: 'FIB-0002' }),
      'control/enUso__FL-365': { referencia: 'FL-365', fibraId: 'FIB-0002', origen: 'FIB-0002' },
    });
    await ejecutarTransaccion((t) => aplicarOperacionesFibra(t, [registrar('U5', { ponerEnUso: true, devolver: 'FIB-0002' })], ctx(refs)));
    expect(datos.get('fibras/FIB-0001').ubicacion).toBe('AGOTADA');
    expect(datos.get('fibras/FIB-0002').ubicacion).toBe('EN BODEGA');
    expect(datos.get('control/enUso__FL-365')).toMatchObject({ fibraId: null, origen: 'FIB-0001' });
  });

  it('anular un uso de una agotada: vuelve a tener usos y queda EN BODEGA', async () => {
    const { datos, refs, ejecutarTransaccion } = crearBase({
      'fibras/FIB-0001': fibra({ ubicacion: 'AGOTADA', estado: 'AGOTADA', numerosOcupados: [1, 2, 3, 4, 5], usosConsumidos: 5, fechasUso: { 1: 'a', 2: 'b', 3: 'c', 4: 'd', 5: 'e' } }),
      'fibras/FIB-0001/usos/U5': { tipo: 'USO', estado: 'VIGENTE', numeroUso: 5 },
    });
    await ejecutarTransaccion((t) => aplicarOperacionesFibra(t, [{ tipo: 'anular', fibraId: 'FIB-0001', usoId: 'U5', motivo: MOTIVO_ANULACION.LINEA_ELIMINADA }], ctx(refs)));
    expect(datos.get('fibras/FIB-0001')).toMatchObject({ estado: 'ACTIVA', ubicacion: 'EN BODEGA' });
  });

  it('pantalla: poner en uso devuelve a bodega la anterior; devolver deja la referencia sin fibra en uso', async () => {
    const { datos, refs, ejecutarTransaccion } = crearBase({
      'fibras/FIB-0001': fibra({ ubicacion: 'EN BODEGA' }),
      'fibras/FIB-0002': fibra({ id: 'FIB-0002', codigoInterno: 'FIB-0002' }),
      'control/enUso__FL-365': { referencia: 'FL-365', fibraId: 'FIB-0002', origen: 'FIB-0002' },
    });
    const r = await ejecutarTransaccion((t) => cambiarUbicacionFibra(t, 'FIB-0001', UBICACION.EN_USO, ctx(refs)));
    expect(r).toEqual({ devuelta: 'FIB-0002' });
    expect(datos.get('fibras/FIB-0001').ubicacion).toBe('EN USO');
    expect(datos.get('fibras/FIB-0002').ubicacion).toBe('EN BODEGA');
    expect(datos.get('control/enUso__FL-365').fibraId).toBe('FIB-0001');
    await ejecutarTransaccion((t) => cambiarUbicacionFibra(t, 'FIB-0001', UBICACION.EN_BODEGA, ctx(refs)));
    expect(datos.get('fibras/FIB-0001').ubicacion).toBe('EN BODEGA');
    expect(datos.get('control/enUso__FL-365').fibraId).toBeNull();
    const acciones = [...datos].filter(([k]) => k.startsWith('fibras/FIB-0001/logs/')).map(([, v]) => v.accion).sort();
    expect(acciones).toEqual(['DEVUELTA_A_BODEGA', 'PUESTA_EN_USO']);
  });

  it('pantalla: no pone en uso una agotada ni una vencida', async () => {
    const { refs, ejecutarTransaccion } = crearBase({
      'fibras/A': fibra({ ubicacion: 'AGOTADA', estado: 'AGOTADA', usosPrevios: 5, usosConsumidos: 5 }),
      'fibras/V': fibra({ ubicacion: 'EN BODEGA', vencimiento: '2026-01-01' }),
    });
    await expect(ejecutarTransaccion((t) => cambiarUbicacionFibra(t, 'A', UBICACION.EN_USO, ctx(refs)))).rejects.toThrow(/agotada/);
    await expect(ejecutarTransaccion((t) => cambiarUbicacionFibra(t, 'V', UBICACION.EN_USO, ctx(refs)))).rejects.toThrow(/vencida/);
  });

  it('dos personas ponen en uso fibras distintas de la misma referencia: queda una sola EN USO', async () => {
    const { datos, refs, ejecutarTransaccion } = crearBase({
      'fibras/FIB-0001': fibra({ ubicacion: 'EN BODEGA' }),
      'fibras/FIB-0002': fibra({ id: 'FIB-0002', codigoInterno: 'FIB-0002', ubicacion: 'EN BODEGA' }),
    });
    await ejecutarTransaccion(
      (t) => cambiarUbicacionFibra(t, 'FIB-0001', UBICACION.EN_USO, ctx(refs)),
      { antesDeConfirmar: () => ejecutarTransaccion((t) => cambiarUbicacionFibra(t, 'FIB-0002', UBICACION.EN_USO, ctx(refs))) }
    );
    const enUso = ['FIB-0001', 'FIB-0002'].filter((id) => datos.get(`fibras/${id}`).ubicacion === 'EN USO');
    expect(enUso).toEqual(['FIB-0001']);
    expect(datos.get('control/enUso__FL-365').fibraId).toBe('FIB-0001');
  });
});

describe('detalle', () => {
  it('ordena por número y, con el mismo número, el anulado primero (más antiguo)', () => {
    const usos = [
      { id: 'c', numeroUso: 2, registradoEl: 30 },
      { id: 'a', numeroUso: 1, registradoEl: 10 },
      { id: 'b', numeroUso: 2, registradoEl: 20, estado: 'ANULADO' },
    ];
    expect(ordenarUsos(usos).map((u) => u.id)).toEqual(['a', 'b', 'c']);
  });
});
