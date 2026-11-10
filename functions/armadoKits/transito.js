// Despacho y tránsito de kits (Function kitsTransito).
//
// El stock y el valor del kit ya salieron de Bodega al armarlo
// (ASIGNACION_KIT, "Salida a kits"). Aquí nada vuelve a descontar: los
// movimientos KIT_DESPACHO, ENTREGA_KIT y KIT_DEVUELTO no tienen línea de
// cierre (linea: null) ni cambian saldos de lotes ni productos; solo dejan
// la trazabilidad en el kardex. ENTREGA_KIT guarda el valor con que el kit
// salió de Bodega para "Consumo por centro" (sin línea, no entra al cierre).
//
// El kit no usa bodega_transitos: esos registros descuentan el saldo
// `transito` del lote, y las unidades del kit nunca estuvieron ahí. Tiene su
// propio estado:
//   ARMADO --despachar--> EN_TRANSITO --recibir--> ENTREGADO (final)
//                           \--rechazar / anular--> ARMADO
// Solo un kit ARMADO se edita o elimina (servicio.js lo exige).

const { HttpsError } = require('firebase-functions/v2/https');
const { COL, saldoDe, fotoSaldo, datosPropietario, MAX_OBSERVACION } = require('../bodega/nucleo.mjs');
const { internos } = require('../bodega/servicio');
const {
  COL_KITS, ESTADOS_KIT, ETIQUETAS_ESTADO_KIT, ACCIONES_TRANSITO_KIT, estadoKit, versionKit, advertenciasKit, hoyChile,
} = require('./nucleo.mjs');

const { perfilActivo, exigir, datosPor, registrarLog, leerPeriodo, ahora } = internos;

const texto = (v) => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, MAX_OBSERVACION);
const refContadores = (db) => db.collection(COL.control).doc('contadores');

const leerKit = async (t, db, kitId) => {
  if (!kitId) throw new HttpsError('invalid-argument', 'Falta el kit.');
  const snap = await t.get(db.collection(COL_KITS).doc(kitId));
  if (!snap.exists) throw new HttpsError('not-found', 'El kit no existe.');
  return { ref: snap.ref, kit: snap.data() };
};

const exigirEstado = (kit, estado) => {
  const actual = estadoKit(kit);
  if (actual !== estado) {
    throw new HttpsError('failed-precondition', `El kit ${kit.codigo} está ${ETIQUETAS_ESTADO_KIT[actual].toLowerCase()}: no se puede hacer esta acción.`, { motivo: 'estado', estado: actual });
  }
};

// Saldos actuales de lotes y productos, solo para la foto del kardex (no cambian).
const leerSaldos = async (t, db, lineas) => {
  const loteIds = [...new Set(lineas.map((l) => l.loteId))];
  const productoIds = [...new Set(lineas.map((l) => l.productoId))];
  const snaps = await Promise.all([
    ...loteIds.map((id) => t.get(db.collection(COL.lotes).doc(id))),
    ...productoIds.map((id) => t.get(db.collection(COL.productos).doc(id))),
  ]);
  return {
    lotes: new Map(snaps.slice(0, loteIds.length).map((s) => [s.id, s.exists ? s.data() : null])),
    productos: new Map(snaps.slice(loteIds.length).map((s) => [s.id, s.exists ? s.data() : null])),
  };
};

// Un movimiento por línea, sin efecto en saldos ni en el cierre.
const escribirMovimientos = (t, db, por, { kitId, kit, tipo, centro, documentoRef, periodoId, saldos, conValor, observacion }) => {
  kit.lineas.forEach((l, orden) => {
    const p = saldos.productos.get(l.productoId);
    const valor = conValor ? Number(l.valor) || 0 : 0;
    t.set(db.collection(COL.movimientos).doc(), {
      tipo, fecha: ahora(), orden, usuario: por,
      productoId: l.productoId, productoNombre: l.productoNombre, codigoMaestro: l.codigoMaestro || p?.codigoMaestro || '', categoriaId: p?.categoriaId || null,
      loteId: l.loteId, lote: l.lote || null, vencimiento: l.vencimiento || null, ...datosPropietario(null), cantidad: l.cantidad,
      saldoLote: fotoSaldo(saldoDe(saldos.lotes.get(l.loteId))), saldoProducto: fotoSaldo(saldoDe(p)),
      centroId: centro.id, centroNombre: centro.nombre, kitId, kitCodigo: kit.codigo, documentoRef, observacion, idEntrega: '',
      periodoId, linea: null, costoUnitario: valor && l.cantidad ? valor / l.cantidad : 0, valor,
    });
  });
};

const despacharKitComo = (db, por, datos = {}) => {
  const kitId = String(datos.kitId || '');
  const centroId = String(datos.centroId || '');
  const versionImpresa = Number(datos.versionImpresa);
  if (!centroId) throw new HttpsError('invalid-argument', 'Elige el centro de destino.');
  if (!Number.isInteger(versionImpresa) || versionImpresa < 1) throw new HttpsError('invalid-argument', 'Escanea el código de barras de la hoja impresa del kit.');
  const observacion = texto(datos.observacion);

  return db.runTransaction(async (t) => {
    const { ref, kit } = await leerKit(t, db, kitId);
    const [snapCentro, snapContadores, periodoId] = await Promise.all([
      t.get(db.collection('maestros_centros').doc(centroId)), t.get(refContadores(db)), leerPeriodo(t, db),
    ]);
    exigirEstado(kit, ESTADOS_KIT.ARMADO);
    const version = versionKit(kit);
    if (versionImpresa !== version) {
      throw new HttpsError('failed-precondition', `La hoja impresa del kit ${kit.codigo} es la versión ${versionImpresa}, pero su contenido actual es la versión ${version}. Reimprime el PDF del kit y escanea la hoja nueva.`, { motivo: 'version', versionImpresa, versionActual: version });
    }
    if (!snapCentro.exists) throw new HttpsError('not-found', 'El centro elegido no existe.');
    if (snapCentro.data().estado === 'INACTIVO') throw new HttpsError('failed-precondition', `El centro ${snapCentro.data().nombre} está inactivo.`);
    const lineas = kit.lineas || [];
    if (!lineas.length) throw new HttpsError('failed-precondition', 'El kit no tiene insumos.');
    const { vencidas, sinVencimiento } = advertenciasKit(lineas, hoyChile());
    if ((vencidas.length || sinVencimiento.length) && datos.confirmarAdvertencias !== true) {
      throw new HttpsError('failed-precondition', `El kit tiene ${vencidas.length} línea(s) vencida(s) y ${sinVencimiento.length} sin vencimiento. Confirma para despacharlo igual.`, { motivo: 'advertencias', vencidas: vencidas.length, sinVencimiento: sinVencimiento.length });
    }
    const saldos = await leerSaldos(t, db, lineas);

    const centro = { id: centroId, nombre: snapCentro.data().nombre || '' };
    const numero = (snapContadores.data()?.salidas || 0) + 1;
    const refSalida = db.collection(COL.salidas).doc();
    t.set(refContadores(db), { salidas: numero }, { merge: true });
    t.set(refSalida, {
      numero, tipo: 'KIT', kitId, kitCodigo: kit.codigo, kitReferencia: kit.referencia || null,
      fecha: ahora(), usuario: por, solicitante: '', observacion,
      resumenPorCentro: { [centroId]: { nombre: centro.nombre, lineas: lineas.length, unidades: kit.totalUnidades } },
      lineas: lineas.map((l) => ({ productoId: l.productoId, productoNombre: l.productoNombre, loteId: l.loteId, lote: l.lote || null, centroId, centroNombre: centro.nombre, cantidad: l.cantidad })),
      totalUnidades: kit.totalUnidades,
    });
    escribirMovimientos(t, db, por, { kitId, kit, tipo: 'KIT_DESPACHO', centro, documentoRef: { id: refSalida.id, tipo: 'SALIDA', numero: String(numero) }, periodoId, saldos, conValor: false, observacion });
    t.update(ref, {
      estado: ESTADOS_KIT.EN_TRANSITO,
      despacho: { salidaId: refSalida.id, salidaNumero: numero, centroId, centroNombre: centro.nombre, fecha: ahora(), usuario: por, observacion, version },
      actualizadoPor: por, actualizadoEn: ahora(),
    });
    registrarLog(t, ref, 'DESPACHADO', por, { salidaNumero: numero, centro: centro.nombre, version, unidades: kit.totalUnidades, vencidas: vencidas.length, sinVencimiento: sinVencimiento.length, observacion });
    return { id: kitId, codigo: kit.codigo, estado: ESTADOS_KIT.EN_TRANSITO, salidaNumero: numero, centroNombre: centro.nombre };
  });
};

const recibirKitComo = (db, por, datos = {}) => {
  const observacion = texto(datos.observacion);
  return db.runTransaction(async (t) => {
    const { ref, kit } = await leerKit(t, db, String(datos.kitId || ''));
    const periodoId = await leerPeriodo(t, db);
    exigirEstado(kit, ESTADOS_KIT.EN_TRANSITO);
    const saldos = await leerSaldos(t, db, kit.lineas);
    const centro = { id: kit.despacho.centroId, nombre: kit.despacho.centroNombre };
    escribirMovimientos(t, db, por, { kitId: ref.id, kit, tipo: 'ENTREGA_KIT', centro, documentoRef: { id: ref.id, tipo: 'KIT', numero: kit.codigo }, periodoId, saldos, conValor: true, observacion });
    t.update(ref, { estado: ESTADOS_KIT.ENTREGADO, recepcion: { fecha: ahora(), usuario: por, observacion }, actualizadoPor: por, actualizadoEn: ahora() });
    registrarLog(t, ref, 'RECIBIDO', por, { salidaNumero: kit.despacho.salidaNumero, centro: centro.nombre, observacion });
    return { id: ref.id, codigo: kit.codigo, estado: ESTADOS_KIT.ENTREGADO };
  });
};

// Rechazar (el centro no lo acepta) y anular (el despacho fue un error)
// tienen el mismo efecto: el kit vuelve a ARMADO, sin mover stock. Cambia el
// motivo que queda registrado.
const devolverKitComo = (db, por, datos = {}) => {
  const accion = datos.accion === 'ANULAR' ? 'ANULAR' : 'RECHAZAR';
  const motivo = texto(datos.motivo);
  if (!motivo) throw new HttpsError('invalid-argument', 'Escribe el motivo.');
  return db.runTransaction(async (t) => {
    const { ref, kit } = await leerKit(t, db, String(datos.kitId || ''));
    const periodoId = await leerPeriodo(t, db);
    exigirEstado(kit, ESTADOS_KIT.EN_TRANSITO);
    const saldos = await leerSaldos(t, db, kit.lineas);
    const etiqueta = accion === 'ANULAR' ? 'Anulado' : 'Rechazado';
    const centro = { id: kit.despacho.centroId, nombre: kit.despacho.centroNombre };
    escribirMovimientos(t, db, por, { kitId: ref.id, kit, tipo: 'KIT_DEVUELTO', centro, documentoRef: { id: ref.id, tipo: 'KIT', numero: kit.codigo }, periodoId, saldos, conValor: false, observacion: `${etiqueta}: ${motivo}` });
    const devolucion = { accion, motivo, fecha: ahora(), usuario: por, salidaNumero: kit.despacho.salidaNumero, centroNombre: centro.nombre };
    t.update(db.collection(COL.salidas).doc(kit.despacho.salidaId), { kitDevuelto: devolucion });
    t.update(ref, { estado: ESTADOS_KIT.ARMADO, despacho: null, ultimaDevolucion: devolucion, actualizadoPor: por, actualizadoEn: ahora() });
    registrarLog(t, ref, accion === 'ANULAR' ? 'DESPACHO_ANULADO' : 'DESPACHO_RECHAZADO', por, { salidaNumero: kit.despacho.salidaNumero, centro: centro.nombre, motivo });
    return { id: ref.id, codigo: kit.codigo, estado: ESTADOS_KIT.ARMADO };
  });
};

const OPERACIONES = {
  DESPACHAR: despacharKitComo,
  RECIBIR: recibirKitComo,
  RECHAZAR: (db, por, datos) => devolverKitComo(db, por, { ...datos, accion: 'RECHAZAR' }),
  ANULAR: (db, por, datos) => devolverKitComo(db, por, { ...datos, accion: 'ANULAR' }),
};

const gestionarTransitoKit = async (db, uid, datos = {}) => {
  const operacion = OPERACIONES[datos.accion];
  if (!operacion) throw new HttpsError('invalid-argument', 'Acción no válida.');
  const perfil = await perfilActivo(db, uid);
  exigir(perfil, ACCIONES_TRANSITO_KIT[datos.accion]);
  return operacion(db, datosPor(uid, perfil), datos);
};

module.exports = { gestionarTransitoKit, despacharKitComo, recibirKitComo, devolverKitComo };
