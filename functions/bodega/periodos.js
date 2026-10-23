// Bodega en Control Mensual: lo que pasa cuando cambia un periodo de Bodega
// (cierres_periodos/{anio}_{mes}_bodega). Lo llama el trigger
// bodegaPeriodo (index.js).
//
//   - Al ABRIR (o reabrir) un periodo: los movimientos hechos sin periodo
//     abierto (periodoId null) pasan a ese periodo.
//   - Al CERRARLO (cierre manual o automático al abrir otro mes): se guarda
//     la foto fija del periodo en bodega_periodos/{anio}_{mes}:
//       { anio, mes, orden, estado, periodoAnteriorId, saldoInicial,
//         lineas: { [linea]: { unidades, valor } }, saldoFinal, saldoGeneral,
//         saldoTransito, unidadesFinales, unidadesSinCosto, movimientos,
//         cuadre: { valorReal, diferencia }, fechaCierre, generadoEn }
//       /productos/{productoId} = { productoNombre, codigoMaestro,
//         disponibleFinal, transitoFinal, valorInicial, valorFinal, lineas }
//     El saldo inicial es el saldo final de la foto anterior (0 si no hay).
//     Regenerar la foto (al volver a cerrar un mes reabierto) da el mismo
//     resultado con los mismos movimientos.

const { FieldValue } = require('firebase-admin/firestore');
const {
  COL, COL_PERIODOS, TIPOS_MOVIMIENTO, ESTADOS_PERIODO_ABIERTO, idPeriodo, ordenPeriodo, sumarLineas, saldoFinalPeriodo,
  lineasVacias, lineaDeMovimiento, valorConSigno, costoDe, unidadesValorizadas,
} = require('./nucleo.mjs');

const LOTE_ESCRITURA = 400;
const ms = (fecha) => (fecha && typeof fecha.toMillis === 'function' ? fecha.toMillis() : null);

const escribirPorTandas = async (db, operaciones) => {
  for (let i = 0; i < operaciones.length; i += LOTE_ESCRITURA) {
    const lote = db.batch();
    operaciones.slice(i, i + LOTE_ESCRITURA).forEach((op) => op(lote));
    await lote.commit();
  }
};

// Movimientos sin periodo (hechos sin un periodo de Bodega abierto) hasta
// `hasta` (Timestamp; null = todos) -> periodoId. Devuelve cuántos.
const asignarSinPeriodo = async (db, periodoId, hasta = null) => {
  const limite = ms(hasta);
  const snap = await db.collection(COL.movimientos).where('periodoId', '==', null).get();
  const docs = snap.docs.filter((d) => limite === null || ms(d.get('fecha')) === null || ms(d.get('fecha')) <= limite);
  await escribirPorTandas(db, docs.map((d) => (lote) => lote.update(d.ref, { periodoId })));
  return docs.length;
};

// Foto del periodo anterior (la más reciente antes de este).
const leerAnterior = async (db, orden) => {
  const snap = await db.collection(COL_PERIODOS).where('orden', '<', orden).orderBy('orden', 'desc').limit(1).get();
  if (snap.empty) return { id: null, saldoInicial: 0, productos: new Map() };
  const d = snap.docs[0];
  const productos = await d.ref.collection('productos').get();
  return { id: d.id, saldoInicial: Number(d.get('saldoFinal')) || 0, productos: new Map(productos.docs.map((p) => [p.id, p.data()])) };
};

// Detalle por producto: lo que traía de la foto anterior + los movimientos.
const detallePorProducto = (anteriores, movimientos) => {
  const detalle = new Map();
  anteriores.forEach((p, id) => {
    if (!(Number(p.disponibleFinal) || Number(p.transitoFinal) || Number(p.valorFinal))) return;
    detalle.set(id, {
      productoNombre: p.productoNombre || '', codigoMaestro: p.codigoMaestro || '',
      disponibleFinal: Number(p.disponibleFinal) || 0, transitoFinal: Number(p.transitoFinal) || 0,
      valorInicial: Number(p.valorFinal) || 0, valorFinal: Number(p.valorFinal) || 0, lineas: lineasVacias(),
    });
  });
  movimientos.forEach((m) => {
    const def = TIPOS_MOVIMIENTO[m.tipo];
    if (!def || !m.productoId) return;
    const d = detalle.get(m.productoId) || {
      productoNombre: m.productoNombre || '', codigoMaestro: m.codigoMaestro || '',
      disponibleFinal: 0, transitoFinal: 0, valorInicial: 0, valorFinal: 0, lineas: lineasVacias(),
    };
    const cantidad = Number(m.cantidad) || 0;
    d.disponibleFinal += def.disponible * cantidad;
    d.transitoFinal += def.transito * cantidad;
    d.valorFinal += valorConSigno(m);
    const linea = m.linea || lineaDeMovimiento(m.tipo);
    if (linea) d.lineas[linea] = { unidades: d.lineas[linea].unidades + cantidad, valor: d.lineas[linea].valor + (Number(m.valor) || 0) };
    detalle.set(m.productoId, d);
  });
  return detalle;
};

// Control de cuadre: el stock valorizado de hoy menos lo que se movió
// después del cierre debería ser igual al saldo final calculado.
const valorRealAlCierre = async (db, fechaCierre) => {
  const [productos, posteriores] = await Promise.all([
    db.collection(COL.productos).get(),
    fechaCierre ? db.collection(COL.movimientos).where('fecha', '>', fechaCierre).get() : null,
  ]);
  const actual = productos.docs.reduce((n, d) => n + costoDe(d.data()).valorStock, 0);
  const despues = (posteriores?.docs || []).reduce((n, d) => n + valorConSigno(d.data()), 0);
  return actual - despues;
};

const generarFotoPeriodo = async (db, { anio, mes, fechaCierre = null }) => {
  const anioTexto = String(anio);
  const id = idPeriodo(anioTexto, mes);
  const orden = ordenPeriodo(anioTexto, mes);
  const asignados = await asignarSinPeriodo(db, id, fechaCierre);
  const [anterior, snapMovs] = await Promise.all([
    leerAnterior(db, orden),
    db.collection(COL.movimientos).where('periodoId', '==', id).get(),
  ]);
  const movimientos = snapMovs.docs.map((d) => d.data());
  const lineas = sumarLineas(movimientos);
  const saldoFinal = saldoFinalPeriodo(anterior.saldoInicial, lineas);
  const detalle = detallePorProducto(anterior.productos, movimientos);

  let saldoGeneral = 0;
  let unidadesFinales = 0;
  let unidadesSinCosto = 0;
  detalle.forEach((d) => {
    const unidades = unidadesValorizadas({ disponible: d.disponibleFinal, transito: d.transitoFinal });
    unidadesFinales += unidades;
    if (unidades > 0 && d.valorFinal <= 0) unidadesSinCosto += unidades;
    saldoGeneral += unidades > 0 ? d.valorFinal * (d.disponibleFinal / unidades) : 0;
  });
  saldoGeneral = Math.round(saldoGeneral);
  const valorReal = await valorRealAlCierre(db, fechaCierre);

  const ref = db.collection(COL_PERIODOS).doc(id);
  const existentes = await ref.collection('productos').listDocuments();
  await escribirPorTandas(db, [
    ...existentes.filter((r) => !detalle.has(r.id)).map((r) => (lote) => lote.delete(r)),
    ...[...detalle.entries()].map(([productoId, d]) => (lote) => lote.set(ref.collection('productos').doc(productoId), d)),
  ]);
  const foto = {
    anio: anioTexto, mes, orden, estado: 'CERRADO', periodoAnteriorId: anterior.id,
    saldoInicial: anterior.saldoInicial, lineas, saldoFinal, saldoGeneral, saldoTransito: saldoFinal - saldoGeneral,
    unidadesFinales, unidadesSinCosto, movimientos: movimientos.length,
    cuadre: { valorReal, diferencia: saldoFinal - valorReal },
    fechaCierre: fechaCierre || null, generadoEn: FieldValue.serverTimestamp(),
  };
  await ref.set(foto);
  return { id, asignados, movimientos: movimientos.length, saldoFinal, diferencia: foto.cuadre.diferencia };
};

// Cambio de un documento de cierres_periodos (antes / después).
const alCambiarPeriodo = async (db, antes, despues) => {
  if (despues?.modulo !== 'bodega' || !despues.anio || !despues.mes) return null;
  const abierto = (d) => ESTADOS_PERIODO_ABIERTO.includes(d?.estado);
  const id = idPeriodo(despues.anio, despues.mes);
  if (abierto(despues) && !abierto(antes)) {
    const asignados = await asignarSinPeriodo(db, id);
    // Reabierto: la foto queda marcada; se regenera al volver a cerrarlo.
    if (despues.estado === 'REABIERTO') {
      const ref = db.collection(COL_PERIODOS).doc(id);
      if ((await ref.get()).exists) await ref.update({ estado: 'REABIERTO' });
    }
    return { accion: 'apertura', id, asignados };
  }
  if (despues.estado === 'CERRADO' && antes?.estado !== 'CERRADO') {
    return { accion: 'cierre', ...(await generarFotoPeriodo(db, { anio: despues.anio, mes: despues.mes, fechaCierre: despues.fechaCierre || null })) };
  }
  return null;
};

module.exports = { alCambiarPeriodo, generarFotoPeriodo, asignarSinPeriodo };
