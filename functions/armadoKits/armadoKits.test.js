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

import { crearDb } from '../testutils/firestoreMemoria.mjs';

const require = createRequire(import.meta.url);
const { guardarKitComo, eliminarKitComo, completarVencimientoComo } = require('./servicio');

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
const base = (lineas, extra = {}) => ({ familia: 'FLEXIBLE', referencia: 'KFH', lineas, ...extra });
const contador = () => datos.get('bodega_control/kits_correlativos');
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
  it('valida referencia y cantidades', () => {
    expect(validarCabeceraKit({ familia: 'FLEXIBLE', referencia: 'OTRA' }).errores[0]).toMatch(/referencia/);
    expect(validarCabeceraKit({ familia: 'FLEXIBLE' }).errores[0]).toMatch(/referencia/);
    expect(validarCabeceraKit({ familia: 'FLEXIBLE', referencia: 'constructor' }).errores[0]).toMatch(/referencia/);
    expect(validarCabeceraKit({ familia: 'NO', referencia: 'KFH' }).errores[0]).toMatch(/no existe/);
    expect(validarCabeceraKit({ familia: 'FLEXIBLE', referencia: 'KFM' }).cabecera).toEqual({ familia: 'FLEXIBLE', referencia: 'KFM', tipo: 'FLEXIBLE_MUJER' });
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
    expect(k).toMatchObject({ codigo: 'F001', referencia: 'KFH', tipo: 'FLEXIBLE_HOMBRE', cantidadLineas: 2, totalUnidades: 4, lineasSinVencimiento: 0 });
    expect(k.lineas[0]).toMatchObject({ referencia: 'REF-1', productoNombre: 'Insumo', lote: 'PRONTO', vencimiento: '2029-01-01', cantidad: 3, fueraDeFEFO: false });
    const movs = movimientos();
    expect(movs).toHaveLength(2);
    expect(movs[0]).toMatchObject({ tipo: 'ASIGNACION_KIT', linea: 'salidaKits', kitId: r.id, documentoRef: { tipo: 'KIT', numero: 'F001' } });
    expect(logs(r.id)[0].accion).toBe('CREADO');
  });

  it('no permite exceder el lote y entonces no guarda ni descuenta nada', async () => {
    await expect(guardarKitComo(db, POR, base([linea(ID.pronto, 4)]))).rejects.toThrow(/PRONTO.*insuficiente/);
    expect(kit('F001')).toBeUndefined();
    expect(lote(ID.pronto).disponible).toBe(3);
    expect(producto().disponible).toBe(33);
    expect(movimientos()).toHaveLength(0);
  });

  it('atómico: si falla una línea, las válidas tampoco se aplican', async () => {
    await expect(guardarKitComo(db, POR, base([linea(ID.pronto, 1), linea(ID.medio, 99, { confirmarFueraFEFO: true })]))).rejects.toThrow(/insuficiente/);
    expect(lote(ID.pronto).disponible).toBe(3);
    expect(movimientos()).toHaveLength(0);
  });

  it('rechaza vencidos y consignados', async () => {
    await expect(guardarKitComo(db, POR, base([linea(ID.viejo, 1, { confirmarFueraFEFO: true })]))).rejects.toThrow(/vencido/);
    await expect(guardarKitComo(db, POR, base([linea(ID.consig, 1, { confirmarFueraFEFO: true })]))).rejects.toThrow(/consignado/);
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
      guardarKitComo(db, POR, base([linea(ID.pronto, 3)])),
      guardarKitComo(db, { ...POR, uid: 'u2' }, base([linea(ID.pronto, 3)])),
    ]);
    expect(res.map((x) => x.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect(lote(ID.pronto).disponible).toBe(0);
    expect(producto().disponible).toBe(30);
    expect(movimientos()).toHaveLength(1);
  });

  it('bloquea si hay un inventario abierto que incluye el producto', async () => {
    datos.set('bodega_control/estado', { inventarioAbierto: { id: 'i', categorias: [] } });
    await expect(guardarKitComo(db, POR, base([linea(ID.pronto, 1)]))).rejects.toThrow(/inventario abierto/);
    expect(movimientos()).toHaveLength(0);
  });
});

describe('referencia e ID automático', () => {
  const crearUno = (extra = {}) => guardarKitComo(db, POR, base([linea(ID.pronto, 1)], extra));

  it('KFH y KFM guardan su referencia y el tipo correcto', async () => {
    const h = await crearUno({ referencia: 'KFH' });
    const m = await crearUno({ referencia: 'KFM' });
    expect(kit(h.id)).toMatchObject({ referencia: 'KFH', tipo: 'FLEXIBLE_HOMBRE' });
    expect(kit(m.id)).toMatchObject({ referencia: 'KFM', tipo: 'FLEXIBLE_MUJER' });
    expect(h.referencia).toBe('KFH');
  });

  it('el tipo y el código que envíe la pantalla se ignoran', async () => {
    const r = await crearUno({ referencia: 'KFM', tipo: 'FLEXIBLE_HOMBRE', codigo: 'PRUEBA-001', codigoNormalizado: 'X', numero: 500 });
    expect(r.codigo).toBe('F001');
    expect(kit('F001')).toMatchObject({ tipo: 'FLEXIBLE_MUJER', codigo: 'F001', codigoNormalizado: 'F001', numero: 1 });
    expect(kit('PRUEBA-001')).toBeUndefined();
  });

  it('una referencia inválida se rechaza sin consumir número ni stock', async () => {
    await expect(Promise.resolve().then(() => crearUno({ referencia: 'KFX' }))).rejects.toThrow(/referencia/);
    await expect(Promise.resolve().then(() => crearUno({ referencia: undefined, tipo: 'FLEXIBLE_HOMBRE' }))).rejects.toThrow(/referencia/);
    expect(contador()).toBeUndefined();
    expect(producto().disponible).toBe(33);
    expect(movimientos()).toHaveLength(0);
  });

  it('correlativo único para la familia, sin importar la referencia', async () => {
    expect((await crearUno({ referencia: 'KFH' })).codigo).toBe('F001');
    expect((await crearUno({ referencia: 'KFM' })).codigo).toBe('F002');
    expect((await crearUno({ referencia: 'KFH' })).codigo).toBe('F003');
    expect(contador()).toEqual({ FLEXIBLE: 3 });
  });

  it('después de F999 sigue F1000', async () => {
    datos.set('bodega_control/kits_correlativos', { FLEXIBLE: 998 });
    expect((await crearUno()).codigo).toBe('F999');
    expect((await crearUno()).codigo).toBe('F1000');
    expect(kit('F1000')).toMatchObject({ numero: 1000, codigoNormalizado: 'F1000' });
  });

  it('dos usuarios creando a la vez: no se repite el ID', async () => {
    const res = await Promise.all([
      guardarKitComo(db, POR, base([linea(ID.pronto, 1)])),
      guardarKitComo(db, { ...POR, uid: 'u2' }, base([linea(ID.pronto, 1)], { referencia: 'KFM' })),
      guardarKitComo(db, { ...POR, uid: 'u3' }, base([linea(ID.pronto, 1)])),
    ]);
    expect(res.map((r) => r.codigo).sort()).toEqual(['F001', 'F002', 'F003']);
    expect(contador()).toEqual({ FLEXIBLE: 3 });
    expect(lote(ID.pronto).disponible).toBe(0);
  });

  it('un guardado fallido no consume número y no deja stock descontado', async () => {
    await expect(guardarKitComo(db, POR, base([linea(ID.pronto, 99)]))).rejects.toThrow(/insuficiente/);
    await expect(guardarKitComo(db, POR, base([linea(ID.medio, 1)]))).rejects.toMatchObject({ details: { motivo: 'fuera-fefo' } });
    expect(contador()).toBeUndefined();
    expect(lote(ID.pronto).disponible).toBe(3);
    expect(producto().disponible).toBe(33);
    expect(movimientos()).toHaveLength(0);
    expect((await crearUno()).codigo).toBe('F001');
  });

  it('un kit eliminado no libera su número', async () => {
    const { id } = await crearUno();
    await eliminarKitComo(db, POR, { familia: 'FLEXIBLE', kitId: id });
    expect(kit('F001')).toBeUndefined();
    expect((await crearUno()).codigo).toBe('F002');
  });

  it('editar el contenido no cambia el ID ni la referencia, aunque se envíen otros', async () => {
    const { id } = await crearUno({ referencia: 'KFM' });
    const r = await guardarKitComo(db, POR, { familia: 'FLEXIBLE', kitId: id, referencia: 'KFH', tipo: 'FLEXIBLE_HOMBRE', codigo: 'F777', lineas: [linea(ID.pronto, 2)] });
    expect(r).toMatchObject({ id: 'F001', codigo: 'F001', referencia: 'KFM' });
    expect(kit('F001')).toMatchObject({ codigo: 'F001', referencia: 'KFM', tipo: 'FLEXIBLE_MUJER', numero: 1, totalUnidades: 2 });
    expect(contador()).toEqual({ FLEXIBLE: 1 });
  });

  it('si el documento del número ya existiera, no lo sobrescribe', async () => {
    datos.set('kits_armados/F001', { familia: 'FLEXIBLE', codigo: 'F001', lineas: [] });
    await expect(crearUno()).rejects.toThrow(/ya existe/);
    expect(producto().disponible).toBe(33);
    expect(contador()).toBeUndefined();
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
    const { id: a } = await guardarKitComo(db, POR, base([linea(ID.pronto, 3), linea(ID.medio, 4), linea(ID.tarde, 10), linea(ID.sinFecha, 1, { confirmarSinVencimiento: true })]));
    const { id: b } = await guardarKitComo(db, POR, base([linea(ID.sinFecha, 1, { confirmarSinVencimiento: true })]));
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
