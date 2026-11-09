// Flujo completo de Armado de Kits contra una Firestore en memoria (los
// emuladores no se usan en este equipo). La simulación repite la transacción
// si un documento leído cambió y falla si se lee después de escribir, igual
// que Firestore.
import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'node:module';
import {
  lotesParaKit, lotesFueraDeFEFO, repartoDesde, planCambiosKit, validarCabeceraKit, validarLineasKit, valorRetiro,
  fechasDistintasDelLote, idKit, hoyChile,
} from './nucleo.mjs';
import { aplicarRetornoKit, valorizarMovimiento, sumarLineas, saldoFinalPeriodo, idLote, LINEAS_PERIODO, lineaDeMovimiento } from '../bodega/nucleo.mjs';

const require = createRequire(import.meta.url);
const { guardarKitComo, eliminarKitComo, completarVencimientoComo } = require('./servicio');

const crearDb = (inicial = {}) => {
  const datos = new Map(Object.entries(inicial).map(([k, v]) => [k, structuredClone(v)]));
  const versiones = new Map();
  let auto = 0;
  const snap = (ruta) => ({
    id: ruta.split('/').pop(), ref: { ruta }, exists: datos.has(ruta),
    data: () => (datos.has(ruta) ? structuredClone(datos.get(ruta)) : undefined),
  });
  const doc = (ruta) => ({
    id: ruta.split('/').pop(), ruta,
    collection: (sub) => col(`${ruta}/${sub}`),
    get: async () => snap(ruta),
  });
  const consulta = (nombre, filtros = [], tope = Infinity) => ({
    esConsulta: true, nombre, filtros, tope,
    where: (campo, op, valor) => consulta(nombre, [...filtros, { campo, op, valor }], tope),
    limit: (n) => consulta(nombre, filtros, n),
    rutas: () => [...datos.keys()]
      .filter((r) => r.startsWith(`${nombre}/`) && !r.slice(nombre.length + 1).includes('/'))
      .filter((r) => filtros.every(({ campo, op, valor }) => (op === 'in' ? valor.includes(datos.get(r)[campo]) : datos.get(r)[campo] === valor)))
      .slice(0, tope),
  });
  function col(nombre) {
    return { ...consulta(nombre), doc: (id) => doc(`${nombre}/${id || `auto${++auto}`}`) };
  }
  const db = {
    collection: col,
    runTransaction: async (fn) => {
      for (let intento = 0; intento < 8; intento++) {
        const leidos = new Map();
        const escrituras = [];
        const marcar = (r) => leidos.set(r, versiones.get(r) || 0);
        const t = {
          get: async (x) => {
            if (escrituras.length) throw new Error('Firestore exige leer antes de escribir');
            await Promise.resolve();
            if (x.esConsulta) {
              const rutas = x.rutas();
              rutas.forEach(marcar);
              return { docs: rutas.map(snap), empty: !rutas.length };
            }
            marcar(x.ruta);
            return snap(x.ruta);
          },
          set: (ref, valor, op) => escrituras.push({ ruta: ref.ruta, tipo: op?.merge ? 'update' : 'set', valor }),
          update: (ref, valor) => escrituras.push({ ruta: ref.ruta, tipo: 'update', valor }),
          delete: (ref) => escrituras.push({ ruta: ref.ruta, tipo: 'delete' }),
        };
        const resultado = await fn(t);
        await Promise.resolve();
        if ([...leidos].some(([r, v]) => (versiones.get(r) || 0) !== v)) continue;
        escrituras.forEach(({ ruta, tipo, valor }) => {
          versiones.set(ruta, (versiones.get(ruta) || 0) + 1);
          if (tipo === 'delete') datos.delete(ruta);
          else if (tipo === 'update') datos.set(ruta, { ...(datos.get(ruta) || {}), ...valor });
          else datos.set(ruta, valor);
        });
        return resultado;
      }
      throw new Error('Demasiados reintentos');
    },
  };
  return { db, datos };
};

const POR = { uid: 'u1', nombre: 'Prueba', email: '' };
const P = 'prod1';
const lotesIniciales = () => ({
  [`bodega_lotes/${idLote(P, 'TARDE', '2030-06-01')}`]: { productoId: P, lote: 'TARDE', vencimiento: '2030-06-01', disponible: 10, propietarioId: null },
  [`bodega_lotes/${idLote(P, 'PRONTO', '2029-01-01')}`]: { productoId: P, lote: 'PRONTO', vencimiento: '2029-01-01', disponible: 3, propietarioId: null },
  [`bodega_lotes/${idLote(P, 'MEDIO', '2029-09-01')}`]: { productoId: P, lote: 'MEDIO', vencimiento: '2029-09-01', disponible: 4, propietarioId: null },
  [`bodega_lotes/${idLote(P, 'VIEJO', '2020-01-01')}`]: { productoId: P, lote: 'VIEJO', vencimiento: '2020-01-01', disponible: 9, propietarioId: null },
  [`bodega_lotes/${idLote(P, 'SINFECHA', null)}`]: { productoId: P, lote: 'SINFECHA', vencimiento: null, disponible: 2, propietarioId: null },
  [`bodega_lotes/${idLote(P, 'CONSIG', '2028-01-01', 'emp')}`]: { productoId: P, lote: 'CONSIG', vencimiento: '2028-01-01', disponible: 5, propietarioId: 'emp', propietarioNombre: 'Emp' },
  [`bodega_lotes/${idLote(P, 'CERO', '2027-01-01')}`]: { productoId: P, lote: 'CERO', vencimiento: '2027-01-01', disponible: 0, propietarioId: null },
});
const ID = {
  pronto: idLote(P, 'PRONTO', '2029-01-01'), medio: idLote(P, 'MEDIO', '2029-09-01'), tarde: idLote(P, 'TARDE', '2030-06-01'),
  viejo: idLote(P, 'VIEJO', '2020-01-01'), sinFecha: idLote(P, 'SINFECHA', null), consig: idLote(P, 'CONSIG', '2028-01-01', 'emp'),
};
const productoInicial = () => ({
  id: P, nombre: 'Insumo', codigoMaestro: 'BOD-1', referencia: 'REF-1',
  disponible: 33, transito: 0, enCentro: 0, costoPromedio: 1000.5, valorStock: 33017,
});

let db; let datos;
const lote = (id) => datos.get(`bodega_lotes/${id}`);
const producto = () => datos.get(`bodega_productos/${P}`);
const kit = (id) => datos.get(`kits_armados/${id}`);
const movimientos = () => [...datos.entries()].filter(([r]) => r.startsWith('bodega_movimientos/')).map(([, v]) => v);
const logs = (id) => [...datos.entries()].filter(([r]) => r.startsWith(`kits_armados/${id}/logs/`)).map(([, v]) => v);
const base = (lineas, extra = {}) => ({ familia: 'FLEXIBLE', tipo: 'FLEXIBLE_HOMBRE', codigo: 'KIT-1', lineas, ...extra });
const linea = (loteId, cantidad, extra = {}) => ({ productoId: P, loteId, cantidad, ...extra });

beforeEach(() => {
  ({ db, datos } = crearDb({ [`bodega_productos/${P}`]: productoInicial(), ...lotesIniciales() }));
});

describe('reglas puras', () => {
  const hoy = '2026-11-09';
  const lotes = Object.entries(lotesIniciales()).map(([r, v]) => ({ id: r.split('/')[1], ...v }));

  it('FEFO: orden por vencimiento, sin vencidos, sin consignados, sin stock 0 y sin fecha al final', () => {
    expect(lotesParaKit(lotes, hoy).map((l) => l.lote)).toEqual(['PRONTO', 'MEDIO', 'TARDE', 'SINFECHA']);
  });
  it('un lote que vence hoy sigue vigente', () => {
    expect(lotesParaKit([{ id: 'a', vencimiento: hoy, disponible: 1 }], hoy)).toHaveLength(1);
    expect(lotesParaKit([{ id: 'a', vencimiento: '2026-11-08', disponible: 1 }], hoy)).toHaveLength(0);
  });
  it('fuera de FEFO: solo si queda saldo en uno que vence antes', () => {
    const e = lotesParaKit(lotes, hoy);
    expect(lotesFueraDeFEFO(e, { [ID.pronto]: 1 }).size).toBe(0);
    expect([...lotesFueraDeFEFO(e, { [ID.medio]: 1 })]).toEqual([ID.medio]);
    expect(lotesFueraDeFEFO(e, { [ID.pronto]: 3, [ID.medio]: 1 }).size).toBe(0);
    expect([...lotesFueraDeFEFO(e, { [ID.pronto]: 2, [ID.medio]: 1 })]).toEqual([ID.medio]);
  });
  it('completa con el siguiente lote FEFO y avisa lo que falta', () => {
    const e = lotesParaKit(lotes, hoy);
    expect(repartoDesde(e, ID.pronto, 5).partes.map((p) => [p.lote.lote, p.cantidad])).toEqual([['PRONTO', 3], ['MEDIO', 2]]);
    expect(repartoDesde(e, ID.tarde, 11).partes.map((p) => [p.lote.lote, p.cantidad])).toEqual([['TARDE', 10], ['PRONTO', 1]]);
    expect(repartoDesde(e, ID.pronto, 100).faltante).toBe(81);
  });
  it('valida código, tipo y cantidades', () => {
    expect(validarCabeceraKit({ familia: 'FLEXIBLE', tipo: 'OTRO', codigo: 'A' }).errores[0]).toMatch(/tipo/);
    expect(validarCabeceraKit({ familia: 'FLEXIBLE', tipo: 'FLEXIBLE_MUJER', codigo: ' ' }).errores[0]).toMatch(/código/);
    expect(validarLineasKit([]).errores[0]).toMatch(/insumos/);
    expect(validarLineasKit([linea('a', 1.5)]).errores[0]).toMatch(/entero/);
    expect(validarLineasKit([linea('a', 1), linea('a', 2)]).lineas).toHaveLength(1);
  });
  it('el código no distingue mayúsculas, tildes ni espacios repetidos', () => {
    expect(idKit(' kit  á-1 ')).toBe(idKit('KIT A-1'));
  });
  it('plan de cambios: solo mueve la diferencia', () => {
    const r = planCambiosKit([{ loteId: 'a', cantidad: 3 }, { loteId: 'b', cantidad: 2 }, { loteId: 'c', cantidad: 1 }], [{ loteId: 'a', cantidad: 1 }, { loteId: 'c', cantidad: 4 }]);
    expect(r.retiros.map((x) => [x.linea.loteId, x.cantidad])).toEqual([['a', 2], ['b', 2]]);
    expect(r.asignaciones.map((x) => [x.entrada.loteId, x.cantidad])).toEqual([['c', 3]]);
  });
  it('fechas distintas del mismo lote; un S/L no se compara', () => {
    const l = [{ lote: 'A1', vencimiento: '2030-01-01' }, { lote: 'a1', vencimiento: '2030-01-01' }, { lote: 'A1', vencimiento: '2031-01-01' }, { lote: 'B', vencimiento: '2032-01-01' }, { lote: 'A1', vencimiento: null }];
    expect(fechasDistintasDelLote(l, 'A1', '2031-01-01')).toEqual(['2030-01-01']);
    expect(fechasDistintasDelLote(l, null, '2031-01-01')).toEqual([]);
  });
  it('hoyChile usa la fecha de Chile, no la del servidor', () => {
    expect(hoyChile(new Date('2026-11-10T02:00:00Z'))).toBe('2026-11-09');
  });
  it('retiro parcial proporcional y total exacto', () => {
    expect(valorRetiro({ cantidad: 3, valor: 1000 }, 3)).toBe(1000);
    expect(valorRetiro({ cantidad: 3, valor: 1000 }, 1)).toBe(333);
  });
});

describe('crear un kit', () => {
  it('varios lotes: descuenta por lote y producto, valoriza y deja el movimiento con el kit', async () => {
    const r = await guardarKitComo(db, POR, base([linea(ID.pronto, 3), linea(ID.medio, 1)]));
    expect(lote(ID.pronto).disponible).toBe(0);
    expect(lote(ID.medio).disponible).toBe(3);
    expect(producto().disponible).toBe(29);
    const k = kit(r.id);
    expect(k).toMatchObject({ codigo: 'KIT-1', tipo: 'FLEXIBLE_HOMBRE', cantidadLineas: 2, totalUnidades: 4, lineasSinVencimiento: 0 });
    expect(k.lineas[0]).toMatchObject({ referencia: 'REF-1', productoNombre: 'Insumo', lote: 'PRONTO', vencimiento: '2029-01-01', cantidad: 3, fueraDeFEFO: false });
    const movs = movimientos();
    expect(movs).toHaveLength(2);
    expect(movs[0]).toMatchObject({ tipo: 'ASIGNACION_KIT', linea: 'salidaKits', kitId: r.id, documentoRef: { tipo: 'KIT', numero: 'KIT-1' } });
    expect(logs(r.id)[0].accion).toBe('CREADO');
  });

  it('no permite exceder el lote y entonces no guarda ni descuenta nada', async () => {
    await expect(guardarKitComo(db, POR, base([linea(ID.pronto, 4)]))).rejects.toThrow(/PRONTO.*insuficiente/);
    expect(kit(idKit('KIT-1'))).toBeUndefined();
    expect(lote(ID.pronto).disponible).toBe(3);
    expect(producto().disponible).toBe(33);
    expect(movimientos()).toHaveLength(0);
  });

  it('atómico: si falla una línea, las válidas tampoco se aplican', async () => {
    await expect(guardarKitComo(db, POR, base([linea(ID.pronto, 1), linea(ID.medio, 99, { confirmarFueraFEFO: true })]))).rejects.toThrow(/insuficiente/);
    expect(lote(ID.pronto).disponible).toBe(3);
    expect(movimientos()).toHaveLength(0);
  });

  it('rechaza vencidos, consignados y un código repetido', async () => {
    await expect(guardarKitComo(db, POR, base([linea(ID.viejo, 1, { confirmarFueraFEFO: true })]))).rejects.toThrow(/vencido/);
    await expect(guardarKitComo(db, POR, base([linea(ID.consig, 1, { confirmarFueraFEFO: true })]))).rejects.toThrow(/consignado/);
    await guardarKitComo(db, POR, base([linea(ID.pronto, 1)]));
    await expect(guardarKitComo(db, POR, base([linea(ID.pronto, 1)], { codigo: 'kit-1' }))).rejects.toThrow(/Ya existe/);
  });

  it('fuera de FEFO: exige confirmación y deja la marca', async () => {
    await expect(guardarKitComo(db, POR, base([linea(ID.medio, 1)]))).rejects.toMatchObject({ details: { motivo: 'fuera-fefo', loteIds: [ID.medio] } });
    const r = await guardarKitComo(db, POR, base([linea(ID.medio, 1, { confirmarFueraFEFO: true })]));
    expect(kit(r.id).lineas[0].fueraDeFEFO).toBe(true);
  });

  it('sin vencimiento: exige confirmación, deja la marca y cuenta en el kit', async () => {
    const usar = [linea(ID.pronto, 3), linea(ID.medio, 4), linea(ID.tarde, 10), linea(ID.sinFecha, 1)];
    await expect(guardarKitComo(db, POR, base(usar))).rejects.toMatchObject({ details: { motivo: 'sin-vencimiento', loteIds: [ID.sinFecha] } });
    usar[3].confirmarSinVencimiento = true;
    const r = await guardarKitComo(db, POR, base(usar));
    expect(kit(r.id).lineasSinVencimiento).toBe(1);
    expect(kit(r.id).lineas[3]).toMatchObject({ sinVencimiento: true, vencimiento: null });
  });

  it('dos usuarios a la vez: solo uno se lleva el stock', async () => {
    const res = await Promise.allSettled([
      guardarKitComo(db, POR, base([linea(ID.pronto, 3)], { codigo: 'A' })),
      guardarKitComo(db, { ...POR, uid: 'u2' }, base([linea(ID.pronto, 3)], { codigo: 'B' })),
    ]);
    expect(res.map((x) => x.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect(lote(ID.pronto).disponible).toBe(0);
    expect(producto().disponible).toBe(30);
    expect(movimientos()).toHaveLength(1);
  });

  it('dos usuarios con el mismo código: solo uno lo crea', async () => {
    const res = await Promise.allSettled([
      guardarKitComo(db, POR, base([linea(ID.pronto, 1)])),
      guardarKitComo(db, POR, base([linea(ID.pronto, 1)])),
    ]);
    expect(res.map((x) => x.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect(producto().disponible).toBe(32);
  });

  it('bloquea si hay un inventario abierto que incluye el producto', async () => {
    datos.set('bodega_control/estado', { inventarioAbierto: { id: 'i', categorias: [] } });
    await expect(guardarKitComo(db, POR, base([linea(ID.pronto, 1)]))).rejects.toThrow(/inventario abierto/);
    expect(movimientos()).toHaveLength(0);
  });
});

describe('editar y eliminar', () => {
  it('quitar una línea la devuelve al stock; bajar la cantidad, solo la diferencia', async () => {
    const { id } = await guardarKitComo(db, POR, base([linea(ID.pronto, 3), linea(ID.medio, 2)]));
    await guardarKitComo(db, POR, { familia: 'FLEXIBLE', kitId: id, lineas: [linea(ID.pronto, 1)] });
    expect(lote(ID.pronto).disponible).toBe(2);
    expect(lote(ID.medio).disponible).toBe(4);
    expect(producto().disponible).toBe(32);
    expect(kit(id).lineas).toHaveLength(1);
    expect(kit(id).lineas[0].cantidad).toBe(1);
    expect(movimientos().filter((m) => m.tipo === 'RETORNO_KIT').map((m) => [m.lote, m.cantidad]).sort()).toEqual([['MEDIO', 2], ['PRONTO', 2]]);
    expect(logs(id).map((l) => l.accion).sort()).toEqual(['CREADO', 'EDITADO']);
  });

  it('sin cambios no mueve nada', async () => {
    const { id } = await guardarKitComo(db, POR, base([linea(ID.pronto, 1)]));
    const r = await guardarKitComo(db, POR, { familia: 'FLEXIBLE', kitId: id, lineas: [linea(ID.pronto, 1)] });
    expect(r.sinCambios).toBe(true);
    expect(movimientos()).toHaveLength(1);
  });

  it('una línea vigente ya guardada se conserva aunque su lote haya vencido', async () => {
    const { id } = await guardarKitComo(db, POR, base([linea(ID.pronto, 1)]));
    datos.set(`bodega_lotes/${ID.pronto}`, { ...lote(ID.pronto), vencimiento: '2020-01-01' });
    await guardarKitComo(db, POR, { familia: 'FLEXIBLE', kitId: id, lineas: [linea(ID.pronto, 1), linea(ID.tarde, 1, { confirmarFueraFEFO: true })] });
    expect(kit(id).totalUnidades).toBe(2);
  });

  it('eliminar devuelve todo, deja stock, costo y valor exactamente iguales', async () => {
    const antes = { ...producto() };
    const { id } = await guardarKitComo(db, POR, base([linea(ID.pronto, 3), linea(ID.medio, 1)]));
    expect(producto().valorStock).toBeLessThan(antes.valorStock);
    await eliminarKitComo(db, POR, { familia: 'FLEXIBLE', kitId: id });
    expect(kit(id)).toBeUndefined();
    expect(lote(ID.pronto).disponible).toBe(3);
    expect(lote(ID.medio).disponible).toBe(4);
    expect(producto().disponible).toBe(antes.disponible);
    expect(producto().costoPromedio).toBe(antes.costoPromedio);
    expect(producto().valorStock).toBe(antes.valorStock);
    expect(logs(id).at(-1).accion).toBe('ELIMINADO');
  });

  it('los movimientos del kit cuadran en el cierre del período', async () => {
    const { id } = await guardarKitComo(db, POR, base([linea(ID.pronto, 3)]));
    await eliminarKitComo(db, POR, { familia: 'FLEXIBLE', kitId: id });
    const lineas = sumarLineas(movimientos());
    expect(lineas.salidaKits.valor).toBe(lineas.retornoKits.valor);
    expect(lineas.salidaKits.unidades).toBe(3);
    expect(saldoFinalPeriodo(1000, lineas)).toBe(1000);
  });
});

describe('completar vencimiento', () => {
  const FECHA = '2031-03-15';
  const nuevo = idLote(P, 'SINFECHA', FECHA);
  const completar = async (id, extra = {}) => completarVencimientoComo(db, POR, { familia: 'FLEXIBLE', kitId: id, loteId: ID.sinFecha, vencimiento: FECHA, ...extra });
  const conSinFecha = () => guardarKitComo(db, POR, base([linea(ID.pronto, 3), linea(ID.medio, 4), linea(ID.tarde, 10, { confirmarFueraFEFO: true }), linea(ID.sinFecha, 2, { confirmarSinVencimiento: true, confirmarFueraFEFO: true })]));

  it('cambia la línea, no mueve stock ni valor y audita fecha anterior, nueva, usuario y momento', async () => {
    const { id } = await conSinFecha();
    const antes = { ...producto() };
    const movs = movimientos().length;
    await completar(id);
    const l = kit(id).lineas[3];
    expect(l).toMatchObject({ loteId: nuevo, vencimiento: FECHA, sinVencimiento: false, vencimientoCompletado: true, cantidad: 2 });
    expect(kit(id).lineasSinVencimiento).toBe(0);
    expect(producto()).toEqual(antes);
    expect(movimientos()).toHaveLength(movs);
    expect(lote(nuevo)).toMatchObject({ productoId: P, lote: 'SINFECHA', vencimiento: FECHA, disponible: 0 });
    const log = logs(id).find((x) => x.accion === 'COMPLETAR_VENCIMIENTO');
    expect(log).toMatchObject({ usuario: 'Prueba', usuarioUid: 'u1', detalle: { vencimientoAnterior: null, vencimientoNuevo: FECHA } });
    expect(log.fecha).toBeTruthy();
  });

  it('caso pedido: completar, retirar la línea y verificar el lote con fecha, sin cambiar el valor total', async () => {
    const antes = { ...producto() };
    const { id } = await conSinFecha();
    await completar(id);
    const valorLinea = kit(id).lineas[3].valor;
    const valorAntes = producto().valorStock;
    await guardarKitComo(db, POR, { familia: 'FLEXIBLE', kitId: id, lineas: [linea(ID.pronto, 3), linea(ID.medio, 4), linea(ID.tarde, 10)] });
    expect(lote(nuevo).disponible).toBe(2);
    expect(lote(ID.sinFecha).disponible).toBe(0);
    expect(producto().valorStock).toBe(valorAntes + valorLinea);
    const m = movimientos().find((x) => x.tipo === 'RETORNO_KIT');
    expect(m).toMatchObject({ loteId: nuevo, vencimiento: FECHA, cantidad: 2, valor: valorLinea });
    await eliminarKitComo(db, POR, { familia: 'FLEXIBLE', kitId: id });
    expect(producto().valorStock).toBe(antes.valorStock);
    expect(producto().costoPromedio).toBe(antes.costoPromedio);
    expect(producto().disponible).toBe(antes.disponible);
    expect([...datos.keys()].filter((r) => r.includes('SINFECHA'))).toHaveLength(2);
  });

  it('si el lote ya existe con otra fecha, no guarda sin confirmación explícita', async () => {
    datos.set(`bodega_lotes/${idLote(P, 'SINFECHA', '2030-01-01')}`, { productoId: P, lote: 'SINFECHA', vencimiento: '2030-01-01', disponible: 1 });
    const { id } = await conSinFecha();
    await expect(completar(id)).rejects.toMatchObject({ details: { motivo: 'fecha-distinta', fechasExistentes: ['2030-01-01'] } });
    expect(kit(id).lineas[3].vencimiento).toBeNull();
    expect(lote(nuevo)).toBeUndefined();
    await completar(id, { confirmarFechaDistinta: true });
    expect(kit(id).lineas[3].vencimiento).toBe(FECHA);
    expect(logs(id).find((x) => x.accion === 'COMPLETAR_VENCIMIENTO').detalle).toMatchObject({ fechasExistentes: ['2030-01-01'], confirmoFechaDistinta: true });
  });

  it('la misma fecha que ya existe no pide confirmación y usa ese lote', async () => {
    datos.set(`bodega_lotes/${nuevo}`, { productoId: P, lote: 'SINFECHA', vencimiento: FECHA, disponible: 7 });
    const { id } = await conSinFecha();
    await completar(id);
    expect(lote(nuevo).disponible).toBe(7);
    await eliminarKitComo(db, POR, { familia: 'FLEXIBLE', kitId: id });
    expect(lote(nuevo).disponible).toBe(9);
  });

  it('una segunda línea de otro kit ve la fecha ya completada', async () => {
    const { id: a } = await guardarKitComo(db, POR, base([linea(ID.pronto, 3), linea(ID.medio, 4), linea(ID.tarde, 10), linea(ID.sinFecha, 1, { confirmarSinVencimiento: true })], { codigo: 'A' }));
    const { id: b } = await guardarKitComo(db, POR, base([linea(ID.sinFecha, 1, { confirmarSinVencimiento: true })], { codigo: 'B' }));
    await completar(a);
    await expect(completarVencimientoComo(db, POR, { familia: 'FLEXIBLE', kitId: b, loteId: ID.sinFecha, vencimiento: '2032-01-01' }))
      .rejects.toMatchObject({ details: { motivo: 'fecha-distinta', fechasExistentes: [FECHA] } });
  });

  it('rechaza una fecha inválida y una línea que ya tiene fecha', async () => {
    const { id } = await conSinFecha();
    await expect(completar(id, { vencimiento: '2031-13-45' })).rejects.toThrow(/válida/);
    await expect(completar(id, { loteId: ID.pronto })).rejects.toThrow(/ya tiene fecha/);
  });
});

describe('costos del retorno', () => {
  it('las líneas nuevas existen con su signo', () => {
    expect(LINEAS_PERIODO.salidaKits.signo).toBe(-1);
    expect(LINEAS_PERIODO.retornoKits.signo).toBe(1);
    expect(lineaDeMovimiento('ASIGNACION_KIT')).toBe('salidaKits');
    expect(lineaDeMovimiento('RETORNO_KIT')).toBe('retornoKits');
  });

  it('con el promedio sin cambios, lo conserva exacto aunque el valor sea entero', () => {
    const costo = { costoPromedio: 1000.5, valorStock: 33017 };
    const saldo = { disponible: 33, transito: 0 };
    const salida = valorizarMovimiento(costo, saldo, {}, { tipo: 'ASIGNACION_KIT', cantidad: 3 });
    const retorno = aplicarRetornoKit(salida.costo, { disponible: 30, transito: 0 }, { cantidad: 3, valor: salida.valorizado.valor, costoSalida: salida.valorizado.costoUnitario });
    expect(retorno.costo).toEqual(costo);
  });

  it('si el kit se llevó todas las unidades, vuelve al mismo promedio y valor', () => {
    const costo = { costoPromedio: 333.33, valorStock: 1000 };
    const salida = valorizarMovimiento(costo, { disponible: 3, transito: 0 }, {}, { tipo: 'ASIGNACION_KIT', cantidad: 3 });
    expect(salida.costo.valorStock).toBe(0);
    const retorno = aplicarRetornoKit(salida.costo, { disponible: 0, transito: 0 }, { cantidad: 3, valor: salida.valorizado.valor, costoSalida: salida.valorizado.costoUnitario });
    expect(retorno.costo).toEqual(costo);
  });

  it('con un ingreso entre la salida y el retorno: devuelve lo que salió y el valor total cuadra', () => {
    // 10 u. a $1.000 = $10.000. El kit se lleva 4 ($4.000): quedan 6 u. y $6.000.
    const inicial = { costoPromedio: 1000, valorStock: 10000 };
    const salida = valorizarMovimiento(inicial, { disponible: 10, transito: 0 }, {}, { tipo: 'ASIGNACION_KIT', cantidad: 4 });
    expect(salida.valorizado.valor).toBe(4000);
    // Ingreso de 6 u. a $2.000: 12 u., $18.000, promedio $1.500.
    const ingreso = valorizarMovimiento(salida.costo, { disponible: 6, transito: 0 }, { maestroCodigo: {} }, { tipo: 'INGRESO', cantidad: 6 }, { precioLinea: 2000 });
    expect(ingreso.costo).toEqual({ costoPromedio: 1500, valorStock: 18000 });
    // Vuelven 4 u. con sus $4.000: 16 u., $22.000, promedio $1.375.
    const retorno = aplicarRetornoKit(ingreso.costo, { disponible: 12, transito: 0 }, { cantidad: 4, valor: 4000, costoSalida: salida.valorizado.costoUnitario });
    expect(retorno.valorizado.valor).toBe(4000);
    expect(retorno.costo).toEqual({ costoPromedio: 1375, valorStock: 22000 });
    expect(retorno.costo.costoPromedio * 16).toBe(retorno.costo.valorStock);
    // Cuadratura: 10.000 − 4.000 + 12.000 + 4.000 = 22.000.
    expect(10000 - salida.valorizado.valor + ingreso.valorizado.valor + retorno.valorizado.valor).toBe(retorno.costo.valorStock);
  });
});
