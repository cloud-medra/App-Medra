// Revisión de devolución, reposición del centro y rearmado de kits, contra una
// Firestore en memoria: lo devuelto vuelve al mismo lote con su valor, lo
// usado queda como consumo del centro, lo repuesto entra como stock nuevo al
// valor con que salió lo usado, y nada se descuenta ni retorna dos veces.
import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'node:module';
import { crearDb } from '../testutils/firestoreMemoria.mjs';
import { conRecetaQueCalza } from '../testutils/recetaQueCalza.mjs';
import { idLote, sumarLineas, TIPOS_CONSUMO_CENTRO } from '../bodega/nucleo.mjs';
import { consultaKits, planDevolucion, planReposicion, pendientePorComponente, tieneReposicionPendiente, ESTADOS_KIT_POR_DEFECTO } from './nucleo.mjs';

const require = createRequire(import.meta.url);
const servicio = require('./servicio');
const { reponerKitComo, guardarKit } = servicio;
const guardarKitComo = conRecetaQueCalza(servicio.guardarKitComo, () => datos);
const { gestionarTransitoKit, despacharKitComo, recibirKitComo, devolverKitComo, revisarDevolucionComo } = require('./transito');

const POR = { uid: 'dev', nombre: 'Dev', email: '' };
const A = 'prodA';
const B = 'prodB';
const C = 'prodC';
const LA1 = idLote(A, 'A1', '2029-01-01');
const LA2 = idLote(A, 'A2', '2030-01-01');
const LB = idLote(B, 'B1', '2029-06-01');
const LR = idLote(A, 'R1', '2031-01-01');

const inicial = () => ({
  [`bodega_productos/${A}`]: { nombre: 'Insumo A', referencia: 'REF-A', codigoMaestro: 'BOD-1', activo: true, disponible: 10, transito: 0, enCentro: 0, costoPromedio: 1000, valorStock: 10000 },
  [`bodega_productos/${B}`]: { nombre: 'Insumo B', referencia: 'REF-B', codigoMaestro: 'BOD-2', activo: true, disponible: 4, transito: 0, enCentro: 0, costoPromedio: 500, valorStock: 2000 },
  [`bodega_productos/${C}`]: { nombre: 'Insumo C', referencia: 'REF-C', codigoMaestro: 'BOD-3', activo: true, disponible: 0, transito: 0, enCentro: 0, costoPromedio: 0, valorStock: 0 },
  [`bodega_lotes/${LA1}`]: { productoId: A, lote: 'A1', vencimiento: '2029-01-01', disponible: 3 },
  [`bodega_lotes/${LA2}`]: { productoId: A, lote: 'A2', vencimiento: '2030-01-01', disponible: 7 },
  [`bodega_lotes/${LB}`]: { productoId: B, lote: 'B1', vencimiento: '2029-06-01', disponible: 4 },
  'maestros_centros/c1': { nombre: 'Pabellón 1', estado: 'ACTIVO' },
  'usuarios/dev': { rol: 'dev', activo: true, nombreCompleto: 'Dev' },
  'usuarios/sin': { rol: 'operador', activo: true, permisos: { bodega: ['/bodega/maestroBodega'] } },
});

let db; let datos;
const kit = (id = 'F001') => datos.get(`kits_armados/${id}`);
const producto = (id) => datos.get(`bodega_productos/${id}`);
const lote = (id) => datos.get(`bodega_lotes/${id}`);
const movimientos = (tipo) => [...datos.entries()].filter(([r]) => /^bodega_movimientos\/[^/]+$/.test(r)).map(([, v]) => v).filter((m) => !tipo || m.tipo === tipo);
const logs = (id = 'F001') => [...datos.entries()].filter(([r]) => r.startsWith(`kits_armados/${id}/logs/`)).map(([, v]) => v);
const foto = () => JSON.stringify({ a: producto(A), b: producto(B), c: producto(C), l: [lote(LA1), lote(LA2), lote(LB)] });

// F001: A lote A1 ×3 ($3.000), A lote A2 ×2 ($2.000), B ×1 ($500) = 6 u. / $5.500.
const armar = () => guardarKitComo(db, POR, {
  familia: 'FLEXIBLE', referencia: 'KFH',
  lineas: [{ productoId: A, loteId: LA1, cantidad: 3 }, { productoId: A, loteId: LA2, cantidad: 2 }, { productoId: B, loteId: LB, cantidad: 1 }],
});
const despachar = () => despacharKitComo(db, POR, { kitId: 'F001', versionImpresa: 1, centroId: 'c1', confirmarAdvertencias: true });
const revisar = (devueltos, extra = {}) => revisarDevolucionComo(db, POR, { kitId: 'F001', devueltos, ...extra });
// Vuelve A2 ×2 y B ×1; se usaron las 3 de A1.
const parcial = () => revisar([{ loteId: LA1, devuelto: 0 }, { loteId: LA2, devuelto: 2 }, { loteId: LB, devuelto: 1 }], { observacion: 'Sin usar' });
// Receta vigente para la reposición: c0 (A, o C como alternativa) y c1 (B).
const recetaReposicion = () => datos.set('kits_configuracion/FLEXIBLE', {
  familia: 'FLEXIBLE', version: 2,
  modelos: [{ referencia: 'KFH', nombre: 'Kit Flexible Hombre', genero: 'HOMBRE', vaina: 'NORMAL', activo: true }],
  componentes: [
    { id: 'c0', nombre: 'Guía', orden: 1, cantidad: 5, porVariante: false, referencias: [{ referencia: 'REF-A', productoId: A, nombre: 'Insumo A' }, { referencia: 'REF-C', productoId: C, nombre: 'Insumo C' }] },
    { id: 'c1', nombre: 'Vaina', orden: 2, cantidad: 1, porVariante: false, referencias: [{ referencia: 'REF-B', productoId: B, nombre: 'Insumo B' }] },
  ],
});
const reponer = (items, extra = {}) => reponerKitComo(db, POR, { familia: 'FLEXIBLE', kitId: 'F001', items, ...extra });
const guia = (cantidad, extra = {}) => ({ componenteId: 'c0', productoId: A, lote: 'R1', vencimiento: '2031-01-01', cantidad, ...extra });

beforeEach(async () => {
  ({ db, datos } = crearDb(inicial()));
  await armar();
  await despachar();
});

describe('revisar devolución', () => {
  it('parcial: lo devuelto vuelve al mismo lote con su valor y lo usado queda como consumo del centro', async () => {
    const r = await parcial();
    expect(r).toMatchObject({ estado: 'ENTREGADO_PARCIAL', resultado: 'PARCIAL', devuelto: 3, usado: 3, valorDevuelto: 2500, valorUsado: 3000 });
    // Stock: A 5 → 7 (lote A2 5 → 7); B 3 → 4. Valor: lo mismo con que salió.
    expect(producto(A)).toMatchObject({ disponible: 7, valorStock: 7000, costoPromedio: 1000 });
    expect(producto(B)).toMatchObject({ disponible: 4, valorStock: 2000, costoPromedio: 500 });
    expect(lote(LA2).disponible).toBe(7);
    expect(lote(LA1).disponible).toBe(0);
    const retornos = movimientos('RETORNO_KIT');
    expect(retornos.map((m) => [m.loteId, m.cantidad, m.valor, m.linea])).toEqual([[LA2, 2, 2000, 'retornoKits'], [LB, 1, 500, 'retornoKits']]);
    // Consumo por centro: solo lo usado (A1 ×3, $3.000), con el centro.
    const entregas = movimientos('ENTREGA_KIT');
    expect(entregas.map((m) => [m.loteId, m.cantidad, m.valor, m.centroId, m.linea])).toEqual([[LA1, 3, 3000, 'c1', null]]);
    expect(TIPOS_CONSUMO_CENTRO).toContain('ENTREGA_KIT');
    // El kit queda cerrado con el detalle y la reposición pendiente.
    expect(kit()).toMatchObject({ estado: 'ENTREGADO_PARCIAL', reposicionPendiente: true, consumo: { usado: 3, repuesto: 0, pendiente: 3, valorUsado: 3000 }, devolucion: { devuelto: 3, usado: 3, observacion: 'Sin usar', usuario: POR } });
    expect(kit().lineas.map((l) => [l.loteId, l.usado, l.devuelto, l.valorUsado, l.valorDevuelto])).toEqual([[LA1, 3, 0, 3000, 0], [LA2, 0, 2, 0, 2000], [LB, 0, 1, 0, 500]]);
    expect(logs().find((l) => l.accion === 'DEVOLUCION_REVISADA')).toMatchObject({ usuario: 'Dev', detalle: { devuelto: 3, usado: 3, observacion: 'Sin usar' } });
    expect(logs().find((l) => l.accion === 'DEVOLUCION_REVISADA').detalle.lineas).toHaveLength(3);
  });

  it('todo devuelto: equivale a rechazar (vuelve a Armado sin mover stock)', async () => {
    const antes = foto();
    const r = await revisar([{ loteId: LA1, devuelto: 3 }, { loteId: LA2, devuelto: 2 }, { loteId: LB, devuelto: 1 }]);
    expect(r).toMatchObject({ estado: 'ARMADO', resultado: 'TODO_DEVUELTO' });
    expect(foto()).toBe(antes);
    expect(kit()).toMatchObject({ estado: 'ARMADO', despacho: null });
    expect(kit().ultimaDevolucion.motivo).toMatch(/volvió todo/);
    expect(movimientos('RETORNO_KIT')).toHaveLength(0);
    expect(movimientos('ENTREGA_KIT')).toHaveLength(0);
  });

  it('sin devolución: equivale a recibir (Entregado, todo como consumo)', async () => {
    const antes = foto();
    const r = await revisar([]);
    expect(r).toMatchObject({ estado: 'ENTREGADO', resultado: 'NADA_DEVUELTO' });
    expect(foto()).toBe(antes);
    expect(movimientos('ENTREGA_KIT').map((m) => m.cantidad)).toEqual([3, 2, 1]);
    expect(kit()).toMatchObject({ estado: 'ENTREGADO', reposicionPendiente: true, consumo: { usado: 6, pendiente: 6, valorUsado: 5500 } });
  });

  it('devolver más de lo despachado se rechaza sin escribir', async () => {
    const antes = foto();
    await expect(Promise.resolve().then(() => revisar([{ loteId: LA2, devuelto: 3 }]))).rejects.toThrow(/se despacharon 2 y no pueden volver 3/);
    await expect(Promise.resolve().then(() => revisar([{ loteId: LA2, devuelto: -1 }]))).rejects.toThrow(/número entero/);
    expect(foto()).toBe(antes);
    expect(kit().estado).toBe('EN_TRANSITO');
  });

  it('dos usuarios revisando el mismo kit a la vez: solo uno lo logra, sin doble retorno', async () => {
    const r = await Promise.allSettled([parcial(), revisarDevolucionComo(db, { ...POR, uid: 'u2' }, { kitId: 'F001', devueltos: [{ loteId: LA2, devuelto: 2 }, { loteId: LB, devuelto: 1 }] })]);
    expect(r.map((x) => x.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect(movimientos('RETORNO_KIT')).toHaveLength(2);
    expect(movimientos('ENTREGA_KIT')).toHaveLength(1);
    expect(producto(A)).toMatchObject({ disponible: 7, valorStock: 7000 });
  });

  it('después de cerrarlo no se revisa, recibe, rechaza ni anula otra vez', async () => {
    await parcial();
    const antes = foto();
    await expect(parcial()).rejects.toMatchObject({ details: { motivo: 'estado', estado: 'ENTREGADO_PARCIAL' } });
    await expect(recibirKitComo(db, POR, { kitId: 'F001' })).rejects.toThrow(/entregado parcial/);
    await expect(devolverKitComo(db, POR, { kitId: 'F001', accion: 'ANULAR', motivo: 'x' })).rejects.toThrow(/entregado parcial/);
    expect(foto()).toBe(antes);
    expect(movimientos('RETORNO_KIT')).toHaveLength(2);
  });

  it('el valor devuelto más el usado es el valor de cada línea, también con cantidades que no dividen exacto', () => {
    const lineas = [{ loteId: 'x', productoNombre: 'X', cantidad: 3, valor: 1000 }];
    const { lineas: [l] } = planDevolucion(lineas, [{ loteId: 'x', devuelto: 1 }]);
    expect(l.valorDevuelto + l.valorUsado).toBe(1000);
    expect([l.valorDevuelto, l.valorUsado]).toEqual([333, 667]);
  });

  it('permisos: la Function exige la acción de Tránsito', async () => {
    await expect(gestionarTransitoKit(db, 'sin', { accion: 'REVISAR_DEVOLUCION', kitId: 'F001', devueltos: [] })).rejects.toThrow(/permiso/);
    await expect(gestionarTransitoKit(db, 'dev', { accion: 'REVISAR_DEVOLUCION', kitId: 'F001', devueltos: [{ loteId: LB, devuelto: 1 }] })).resolves.toMatchObject({ estado: 'ENTREGADO_PARCIAL' });
  });
});

describe('reposición del centro', () => {
  beforeEach(async () => { await parcial(); recetaReposicion(); });

  it('parcial: entra como stock nuevo con su lote y vencimiento, al valor con que salió lo usado', async () => {
    const r = await reponer([guia(1)], { observacion: 'Guía de su bodega' });
    expect(r).toMatchObject({ numero: 1, pendiente: 2, repuesto: 1 });
    expect(lote(LR)).toMatchObject({ productoId: A, lote: 'R1', vencimiento: '2031-01-01', disponible: 1, creadoDesdeKit: 'F001' });
    expect(producto(A)).toMatchObject({ disponible: 8, valorStock: 8000, costoPromedio: 1000 });
    const [m] = movimientos('REPOSICION_KIT');
    expect(m).toMatchObject({ loteId: LR, cantidad: 1, valor: 1000, linea: 'reposicionCentros', centroId: 'c1', centroNombre: 'Pabellón 1', kitCodigo: 'F001' });
    expect(TIPOS_CONSUMO_CENTRO).toContain('REPOSICION_KIT');
    expect(kit()).toMatchObject({ estado: 'ENTREGADO_PARCIAL', reposicionPendiente: true, consumo: { usado: 3, repuesto: 1, pendiente: 2, valorRepuesto: 1000 } });
    expect(kit().reposiciones[0]).toMatchObject({ numero: 1, observacion: 'Guía de su bodega', usuario: POR, items: [{ referencia: 'REF-A', lote: 'R1', cantidad: 1, valor: 1000 }] });
    expect(logs().find((l) => l.accion === 'REPOSICION_REGISTRADA')).toMatchObject({ detalle: { numero: 1, pendienteDespues: 2 } });
  });

  it('total en varias reposiciones: lo repuesto suma exactamente lo usado y el kit deja de tener pendiente', async () => {
    await reponer([guia(1)]);
    await reponer([guia(2, { lote: 'R2', vencimiento: '2032-01-01' })]);
    expect(kit()).toMatchObject({ reposicionPendiente: false, consumo: { usado: 3, repuesto: 3, pendiente: 0, valorUsado: 3000, valorRepuesto: 3000 } });
    expect(kit().reposiciones.map((x) => x.numero)).toEqual([1, 2]);
    expect(movimientos('REPOSICION_KIT').reduce((s, m) => s + m.valor, 0)).toBe(3000);
    expect(tieneReposicionPendiente(kit())).toBe(false);
    await expect(reponer([guia(1)])).rejects.toThrow(/máximo 0/);
  });

  it('una referencia permitida distinta (otro producto del componente) también sirve', async () => {
    await reponer([guia(1, { productoId: C, lote: 'C1' })]);
    expect(producto(C)).toMatchObject({ disponible: 1, valorStock: 1000, costoPromedio: 1000 });
  });

  it('excesiva: no se repone más de lo usado; nada se escribe', async () => {
    const antes = foto();
    await expect(reponer([guia(4)])).rejects.toThrow(/se usaron 3; no se pueden reponer 4 \(máximo 3\)/);
    await expect(reponer([guia(2), guia(2, { lote: 'R2' })])).rejects.toThrow(/máximo 3/);
    // Lo devuelto (B) no se usó: no hay nada que reponer de ese componente.
    await expect(reponer([{ componenteId: 'c1', productoId: B, lote: 'X', vencimiento: '2031-01-01', cantidad: 1 }])).rejects.toThrow(/máximo 0/);
    expect(foto()).toBe(antes);
    expect(movimientos('REPOSICION_KIT')).toHaveLength(0);
  });

  it('una referencia no permitida para el componente se rechaza', async () => {
    await expect(reponer([guia(1, { productoId: B })])).rejects.toThrow(/no está permitida para este componente/);
    expect(movimientos('REPOSICION_KIT')).toHaveLength(0);
  });

  it('exige lote y vencimiento, y avisa si el lote ya existe con otra fecha', async () => {
    await expect(reponer([guia(1, { lote: '' })])).rejects.toThrow(/lote/);
    await expect(reponer([guia(1, { vencimiento: '31-01-2031' })])).rejects.toThrow(/vencimiento válido/);
    await expect(reponer([guia(1, { lote: 'A2', vencimiento: '2031-05-05' })])).rejects.toMatchObject({ details: { motivo: 'fecha-distinta' } });
    await expect(reponer([guia(1, { lote: 'A2', vencimiento: '2031-05-05' })], { confirmarFechaDistinta: true })).resolves.toMatchObject({ repuesto: 1 });
  });

  it('un kit que no está cerrado no admite reposiciones', async () => {
    ({ db, datos } = crearDb(inicial()));
    await armar();
    recetaReposicion();
    await expect(reponer([guia(1)])).rejects.toMatchObject({ details: { motivo: 'estado' } });
  });

  it('permisos: exige la acción "Registrar reposición" de Flexibles', async () => {
    await expect(guardarKit(db, 'sin', { familia: 'FLEXIBLE', operacion: 'REPONER', kitId: 'F001', items: [guia(1)] })).rejects.toThrow(/permiso/);
    await expect(guardarKit(db, 'dev', { familia: 'FLEXIBLE', operacion: 'REPONER', kitId: 'F001', items: [guia(1)] })).resolves.toMatchObject({ repuesto: 1 });
  });
});

describe('rearmar', () => {
  beforeEach(async () => { await parcial(); recetaReposicion(); await reponer([guia(3)]); });

  const rearmar = (lineas, extra = {}) => guardarKitComo(db, POR, { familia: 'FLEXIBLE', referencia: 'KFH', rearmadoDe: 'F001', lineas, ...extra });

  it('el kit nuevo usa FEFO: no toma lo repuesto si hay lotes que vencen antes', async () => {
    // A2 (2030) vence antes que R1 (repuesto, 2031): elegir R1 pide confirmación.
    await expect(rearmar([{ productoId: A, loteId: LR, cantidad: 3 }, { productoId: B, loteId: LB, cantidad: 1 }])).rejects.toMatchObject({ details: { motivo: 'fuera-fefo', loteIds: [LR] } });
    expect(lote(LR).disponible).toBe(3);
    const r = await rearmar([{ productoId: A, loteId: LA2, cantidad: 3 }, { productoId: B, loteId: LB, cantidad: 1 }]);
    expect(r).toMatchObject({ codigo: 'F002' });
    expect(lote(LR).disponible).toBe(3);
    expect(lote(LA2).disponible).toBe(4);
  });

  it('vincula el kit nuevo con el original (solo referencia) y no se rearma dos veces', async () => {
    await rearmar([{ productoId: A, loteId: LA2, cantidad: 3 }, { productoId: B, loteId: LB, cantidad: 1 }]);
    expect(kit('F002')).toMatchObject({ rearmadoDe: { id: 'F001', codigo: 'F001' }, estado: 'ARMADO' });
    expect(kit('F001')).toMatchObject({ rearmadoEn: { id: 'F002', codigo: 'F002' }, estado: 'ENTREGADO_PARCIAL' });
    expect(logs('F001').some((l) => l.accion === 'REARMADO')).toBe(true);
    await expect(rearmar([{ productoId: A, loteId: LA2, cantidad: 1 }])).rejects.toMatchObject({ details: { motivo: 'ya-rearmado' } });
  });

  it('solo se rearma un kit cerrado y con el mismo modelo', async () => {
    await expect(guardarKitComo(db, POR, { familia: 'FLEXIBLE', referencia: 'KFM', rearmadoDe: 'F001', lineas: [{ productoId: A, loteId: LA2, cantidad: 1 }] })).rejects.toThrow(/debe ser KFH/);
    ({ db, datos } = crearDb(inicial()));
    await armar();
    await expect(guardarKitComo(db, POR, { familia: 'FLEXIBLE', referencia: 'KFH', rearmadoDe: 'F001', lineas: [{ productoId: A, loteId: LA2, cantidad: 1 }] })).rejects.toMatchObject({ details: { motivo: 'estado' } });
  });
});

describe('ejemplo completo: cuadratura sin doble descuento ni doble retorno', () => {
  it('armar, despachar, devolución parcial, reposición y rearmar', async () => {
    await parcial();
    recetaReposicion();
    await reponer([guia(3)]);
    await guardarKitComo(db, POR, { familia: 'FLEXIBLE', referencia: 'KFH', rearmadoDe: 'F001', lineas: [{ productoId: A, loteId: LA2, cantidad: 3 }, { productoId: B, loteId: LB, cantidad: 1 }] });
    const lineas = sumarLineas(movimientos());
    // F001 salió por $5.500 y F002 por $3.500; volvieron $2.500 y se repusieron $3.000.
    expect(lineas.salidaKits).toEqual({ unidades: 10, valor: 9000 });
    expect(lineas.retornoKits).toEqual({ unidades: 3, valor: 2500 });
    expect(lineas.reposicionCentros).toEqual({ unidades: 3, valor: 3000 });
    expect(lineas.consumo).toEqual({ unidades: 0, valor: 0 });
    // Valor en bodega = inicial 12.000 − 9.000 + 2.500 + 3.000 = 8.500 (stock A 7, B 3).
    expect(producto(A).valorStock + producto(B).valorStock).toBe(8500);
    expect(producto(A)).toMatchObject({ disponible: 7, valorStock: 7000 });
    expect(producto(B)).toMatchObject({ disponible: 3, valorStock: 1500 });
    // Consumo del centro: usado 3 ($3.000), repuesto 3 ($3.000), neto 0.
    expect(movimientos('ENTREGA_KIT').reduce((s, m) => s + m.valor, 0)).toBe(3000);
    expect(movimientos('REPOSICION_KIT').reduce((s, m) => s + m.valor, 0)).toBe(3000);
  });
});

describe('filtros del listado (consultaKits)', () => {
  it('por defecto: solo Armado y En tránsito', () => {
    expect(ESTADOS_KIT_POR_DEFECTO).toEqual(['ARMADO', 'EN_TRANSITO']);
    expect(consultaKits({ familia: 'FLEXIBLE' }).donde).toEqual([['familia', '==', 'FLEXIBLE'], ['estado', 'in', ['ARMADO', 'EN_TRANSITO']]]);
  });
  it('con Entregado y Entregado parcial; con todos, sin filtro de estado', () => {
    expect(consultaKits({ familia: 'FLEXIBLE', estados: ['ENTREGADO_PARCIAL', 'ENTREGADO'] }).donde).toContainEqual(['estado', 'in', ['ENTREGADO', 'ENTREGADO_PARCIAL']]);
    expect(consultaKits({ familia: 'FLEXIBLE', estados: ['ARMADO', 'EN_TRANSITO', 'ENTREGADO', 'ENTREGADO_PARCIAL'] }).donde).toEqual([['familia', '==', 'FLEXIBLE']]);
  });
  it('se combina con la referencia (tipo) y "Con reposición pendiente"', () => {
    expect(consultaKits({ familia: 'FLEXIBLE', tipo: 'HOMBRE_NORMAL', estados: ['ENTREGADO'] }).donde).toEqual([['familia', '==', 'FLEXIBLE'], ['tipo', '==', 'HOMBRE_NORMAL'], ['estado', 'in', ['ENTREGADO']]]);
    expect(consultaKits({ familia: 'FLEXIBLE', tipo: 'HOMBRE_NORMAL', pendiente: true }).donde).toEqual([['familia', '==', 'FLEXIBLE'], ['tipo', '==', 'HOMBRE_NORMAL'], ['reposicionPendiente', '==', true]]);
  });
  it('con búsqueda por ID, el estado, el tipo y lo pendiente se filtran en memoria', () => {
    const q = consultaKits({ familia: 'FLEXIBLE', codigo: 'F00', tipo: 'HOMBRE_NORMAL' });
    expect(q.orden).toBe('codigoNormalizado');
    const k = (estado, extra = {}) => ({ estado, tipo: 'HOMBRE_NORMAL', lineas: [], ...extra });
    expect(q.enMemoria(k('ARMADO'))).toBe(true);
    expect(q.enMemoria(k('ENTREGADO'))).toBe(false);
    expect(q.enMemoria(k('ARMADO', { tipo: 'MUJER_NORMAL' }))).toBe(false);
    const pendiente = consultaKits({ familia: 'FLEXIBLE', codigo: 'F00', pendiente: true });
    expect(pendiente.enMemoria(k('ENTREGADO', { lineas: [{ cantidad: 2, valor: 10, usado: 2, repuesto: 1 }] }))).toBe(true);
    expect(pendiente.enMemoria(k('ENTREGADO', { lineas: [{ cantidad: 2, valor: 10, usado: 2, repuesto: 2 }] }))).toBe(false);
  });
});

describe('reglas puras de reposición', () => {
  it('pendiente por componente y reparto del valor entre líneas', () => {
    const lineas = [
      { loteId: 'l1', componenteId: 'c0', componenteNombre: 'Guía', productoNombre: 'A', cantidad: 2, valor: 2000, usado: 2, valorUsado: 2000 },
      { loteId: 'l2', componenteId: 'c0', componenteNombre: 'Guía', productoNombre: 'A', cantidad: 1, valor: 1100, usado: 1, valorUsado: 1100 },
    ];
    expect(pendientePorComponente(lineas)).toEqual([{ componenteId: 'c0', componenteNombre: 'Guía', usado: 3, repuesto: 0, pendiente: 3 }]);
    const receta = [{ id: 'c0', referencias: [{ productoId: 'A', referencia: 'REF-A', nombre: 'A' }] }];
    const r = planReposicion(lineas, [{ componenteId: 'c0', productoId: 'A', lote: 'X', vencimiento: '2031-01-01', cantidad: 3 }], receta);
    expect(r.errores).toEqual([]);
    expect(r.items[0]).toMatchObject({ valor: 3100, desde: [{ loteId: 'l1', cantidad: 2, valor: 2000 }, { loteId: 'l2', cantidad: 1, valor: 1100 }] });
  });
});
