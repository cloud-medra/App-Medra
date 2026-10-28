import { describe, it, expect } from 'vitest';
import {
  siguienteNumeroUso, usosConsumidosDe, usosRestantes, estadoVisible, motivoNoUsable, motivoNoPerdible,
  fibraConAlta, fibraConBaja, textoUsoRegistrado, validarNuevaFibra, validarEdicionFibra,
  prepararFibrasNuevas, planFibrasBloque, planFibrasEliminacion, operacionesDePlan, validarUnCambioPorFibra,
  fibrasElegibles, fibrasUsadasEnBloques, ordenarUsos, MOTIVO_ANULACION, ESTADO_USO, TIPO_USO,
  accesosReglas, fechaUltimoUsoVigente,
} from './fibrasNucleo';
import { aplicarOperacionesFibra } from './operacionesFibra';

const fibra = (extra = {}) => ({
  id: 'FIB-0001', codigoInterno: 'FIB-0001', referencia: 'FL-365', lote: 'ABC', vencimiento: '2027-01-31',
  usosTotales: 5, usosPrevios: 0, numerosOcupados: [], usosConsumidos: 0, fechasUso: {}, estado: 'ACTIVA', ...extra,
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

const ctx = (refs) => ({ refs, ahora: 'TS', usuario: { uid: 'u1', nombre: 'Ana' } });
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
    expect(alta).toEqual({ numerosOcupados: [1, 2, 3, 4, 5], usosConsumidos: 5, fechasUso: { ...fechas, 5: '2026-10-05' }, estado: 'AGOTADA', ultimoCambio: { tipo: 'ALTA', numero: 5, usoId: 'u5' } });
    const baja = fibraConBaja({ ...fibra(), ...alta }, 2, 'u2');
    expect(baja).toEqual({ numerosOcupados: [1, 3, 4, 5], usosConsumidos: 4, fechasUso: { 1: '2026-10-01', 3: '2026-10-03', 4: '2026-10-04', 5: '2026-10-05' }, estado: 'ACTIVA', ultimoCambio: { tipo: 'BAJA', numero: 2, usoId: 'u2' } });
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
      .toEqual({ errores: {}, cambios: { usosTotales: 10, estado: 'ACTIVA' } });
    const g = fibra({ usosTotales: 10, numerosOcupados: [1, 2, 3, 4, 5, 6] });
    expect(validarEdicionFibra(g, { lote: 'ABC', vencimiento: '2027-01-31', usosTotales: 5 }).errores.usosTotales).toMatch(/menor/);
    const h = fibra({ usosTotales: 10, numerosOcupados: [1, 7] });
    expect(validarEdicionFibra(h, { lote: 'ABC', vencimiento: '2027-01-31', usosTotales: 5 }).errores.usosTotales).toMatch(/número 7/);
  });

  it('bajar a 5 usos con 5 consumidos deja la fibra agotada', () => {
    const f = fibra({ usosTotales: 10, numerosOcupados: [1, 2, 3, 4, 5] });
    expect(validarEdicionFibra(f, { lote: 'ABC', vencimiento: '2027-01-31', usosTotales: 5 }).cambios).toEqual({ usosTotales: 5, estado: 'AGOTADA' });
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

  it('lecturas de las reglas: hasta 4 líneas de fibra por guardado (límite de 20 por transacción)', () => {
    const registrar = (n) => Array.from({ length: n }, (_, i) => ({ tipo: 'registrar', fibraId: `F${i}` }));
    expect(accesosReglas(registrar(2))).toBe(10);
    expect(accesosReglas([{ tipo: 'anular', fibraId: 'A' }, { tipo: 'anular', fibraId: 'B' }])).toBe(8);
    expect(validarUnCambioPorFibra(registrar(4))).toBeNull();
    expect(validarUnCambioPorFibra(registrar(5))).toMatch(/demasiados cambios/);
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
    expect(res).toEqual([{ tipo: 'USO', fibraId: 'FIB-0001', codigoInterno: 'FIB-0001', lote: 'ABC', numeroUso: 1, usosTotales: 5, restantes: 4 }]);
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
