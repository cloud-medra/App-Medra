// Lógica de las Cloud Functions de Armado de Kits (ver index.js).
//
//   kits_armados/{idKit(codigo)} = { familia, referencia, tipo, numero, codigo, codigoNormalizado,
//     lineas: [{ productoId, productoNombre, codigoMaestro, referencia, loteId,
//       lote, vencimiento, cantidad, valor, costoUnitario, fueraDeFEFO,
//       sinVencimiento, vencimientoCompletado? }],
//     cantidadLineas, totalUnidades, lineasSinVencimiento, creadoPor/En,
//     actualizadoPor/En }
//     /logs/{id}: auditoría (creado, editado, eliminado, fecha completada).
//   bodega_control/kits_correlativos = { [familia]: último número usado }
//
// El ID (F001, F002…) se asigna aquí, en la misma transacción que guarda el kit
// y descuenta el stock: si algo falla no se consume el número. El contador
// nunca baja, así que el número de un kit eliminado no se reutiliza.
//
// El navegador solo lee. Todo cambio de stock ocurre en UNA transacción junto
// con el kit, con los mismos pasos que las salidas de Bodega: si algo falla no
// se guarda ni se descuenta nada, y Firestore repite la transacción cuando dos
// usuarios compiten por el mismo lote, de modo que el segundo ve el saldo real.

const { HttpsError } = require('firebase-functions/v2/https');
const { COL, aplicarMovimiento, saldoDe, fotoSaldo, datosPropietario, camposCosto, aplicarRetornoKit, idLote, normalizarClave } = require('../bodega/nucleo.mjs');
const { internos } = require('../bodega/servicio');
const {
  COL_KITS, FAMILIAS_KIT, OPERACION_COMPLETAR, ID_CONTADOR_KITS, codigoCorrelativoKit, accionKit, idKit, referenciaDe, validarCabeceraKit, validarLineasKit, planCambiosKit,
  hoyChile, loteVencido, lotesParaKit, lotesFueraDeFEFO, valorRetiro, totalesKit, fechaValida, fechasDistintasDelLote, lineasConFecha,
} = require('./nucleo.mjs');

const {
  perfilActivo, exigir, datosPor, exigirSinErrores, registrarLog, leerPeriodo, costosDe, valorizar, conErrorStock, exigirSinInventario, refEstado, ahora,
} = internos;

const refLote = (db, id) => db.collection(COL.lotes).doc(id);
const refProducto = (db, id) => db.collection(COL.productos).doc(id);
const etiquetaLote = (lote) => lote || 'S/L';
const resumenLinea = (l, cantidad = l.cantidad) => ({ producto: l.productoNombre, lote: l.lote || null, vencimiento: l.vencimiento || null, cantidad });

// Lee y calcula todo lo que mueve un cambio de contenido, y devuelve las
// líneas finales y una función que escribe (Firestore exige terminar las
// lecturas antes de la primera escritura de la transacción). `entrada`: las
// líneas pedidas ([] al eliminar). Devuelve null si no hay nada que mover.
const prepararCambioStock = async (t, db, por, { kitId, codigo, anteriores, entrada }) => {
  const { retiros, asignaciones } = planCambiosKit(anteriores, entrada);
  if (!retiros.length && !asignaciones.length) return null;
  const hoy = hoyChile();

  const productoIds = [...new Set([...retiros.map((r) => r.linea.productoId), ...asignaciones.map((a) => a.entrada.productoId)])];
  const conAsignacion = [...new Set(asignaciones.map((a) => a.entrada.productoId))];
  const [snapEstado, periodoId, snapsProductos, consultas, snapsRetiro] = await Promise.all([
    t.get(refEstado(db)),
    leerPeriodo(t, db),
    Promise.all(productoIds.map((id) => t.get(refProducto(db, id)))),
    Promise.all(conAsignacion.map((id) => t.get(db.collection(COL.lotes).where('productoId', '==', id).limit(300)))),
    // Lectura directa: el lote de destino de un retorno puede no estar en la consulta.
    Promise.all(retiros.map((r) => t.get(refLote(db, r.linea.loteId)))),
  ]);

  const productos = new Map();
  snapsProductos.forEach((s) => {
    if (!s.exists) throw new HttpsError('not-found', 'Un producto ya no existe en el maestro.');
    productos.set(s.id, { id: s.id, ...s.data() });
  });
  exigirSinInventario(snapEstado, [...productos.values()], 'armar kits');

  const lotes = new Map();
  consultas.forEach((q) => q.docs.forEach((d) => lotes.set(d.id, { id: d.id, ...d.data() })));
  snapsRetiro.forEach((s) => { if (s.exists) lotes.set(s.id, { id: s.id, ...s.data() }); });

  // --- Saldos y costos en memoria: primero lo que vuelve, luego lo que sale.
  const saldoLote = new Map();
  const saldoProducto = new Map(productoIds.map((id) => [id, saldoDe(productos.get(id))]));
  const costos = costosDe(productos);
  const pasos = [];
  const estadoLineas = new Map(anteriores.map((l) => [l.loteId, { ...l }]));

  retiros.forEach(({ linea, cantidad }) => {
    const p = productos.get(linea.productoId);
    const mov = { tipo: 'RETORNO_KIT', cantidad };
    const valor = valorRetiro(linea, cantidad);
    const antesProducto = saldoProducto.get(linea.productoId);
    const { costo, valorizado } = aplicarRetornoKit(costos.get(p.id), antesProducto, { cantidad, valor, costoSalida: linea.costoUnitario ?? null });
    costos.set(p.id, costo);
    const sl = conErrorStock(() => aplicarMovimiento(saldoDe(lotes.get(linea.loteId)), mov));
    const sp = conErrorStock(() => aplicarMovimiento(antesProducto, mov));
    saldoLote.set(linea.loteId, sl);
    saldoProducto.set(linea.productoId, sp);
    const estado = estadoLineas.get(linea.loteId);
    estado.cantidad -= cantidad;
    estado.valor = (Number(estado.valor) || 0) - valor;
    pasos.push({ tipo: 'RETORNO_KIT', cantidad, p, datosLote: linea, loteId: linea.loteId, sl, sp, valorizado: { periodoId, ...valorizado } });
  });

  const errores = [];
  const lotesDe = (productoId) => [...lotes.values()].filter((l) => l.productoId === productoId)
    .map((l) => ({ ...l, disponible: saldoLote.has(l.id) ? saldoLote.get(l.id).disponible : l.disponible }));
  const fuera = new Set();
  const asignadoPorLote = Object.fromEntries(asignaciones.map((a) => [a.entrada.loteId, a.cantidad]));
  conAsignacion.forEach((id) => lotesFueraDeFEFO(lotesParaKit(lotesDe(id), hoy), asignadoPorLote).forEach((x) => fuera.add(x)));

  const pendientesFEFO = [];
  const pendientesSinFecha = [];
  asignaciones.forEach(({ entrada: e }) => {
    const p = productos.get(e.productoId);
    const lote = lotes.get(e.loteId);
    if (!lote || lote.productoId !== e.productoId) { errores.push(`${p.nombre}: el lote ya no existe.`); return; }
    const texto = `${p.nombre} lote ${etiquetaLote(lote.lote)}`;
    if (lote.propietarioId) errores.push(`${texto}: es stock consignado y no se usa en kits.`);
    if (loteVencido(lote, hoy)) errores.push(`${texto}: está vencido.`);
    if (fuera.has(e.loteId) && !e.confirmarFueraFEFO) pendientesFEFO.push({ loteId: e.loteId, texto });
    if (!lote.vencimiento && !e.confirmarSinVencimiento) pendientesSinFecha.push({ loteId: e.loteId, texto });
  });
  exigirSinErrores([...new Set(errores)]);
  if (pendientesFEFO.length) {
    throw new HttpsError('failed-precondition', `Hay lotes que vencen antes de: ${pendientesFEFO.map((x) => x.texto).join('; ')}. Confirma la selección.`, { motivo: 'fuera-fefo', loteIds: pendientesFEFO.map((x) => x.loteId) });
  }
  if (pendientesSinFecha.length) {
    throw new HttpsError('failed-precondition', `Sin fecha de vencimiento: ${pendientesSinFecha.map((x) => x.texto).join('; ')}. Confirma la selección.`, { motivo: 'sin-vencimiento', loteIds: pendientesSinFecha.map((x) => x.loteId) });
  }

  asignaciones.forEach(({ entrada: e, cantidad }) => {
    const p = productos.get(e.productoId);
    const lote = lotes.get(e.loteId);
    const mov = { tipo: 'ASIGNACION_KIT', cantidad };
    const antesProducto = saldoProducto.get(e.productoId);
    const antesLote = saldoLote.get(e.loteId) || saldoDe(lote);
    const [sl, sp] = conErrorStock(() => {
      try {
        return [aplicarMovimiento(antesLote, mov), aplicarMovimiento(antesProducto, mov)];
      } catch (error) {
        error.message = `${p.nombre} lote ${etiquetaLote(lote.lote)}: ${error.message}`;
        throw error;
      }
    });
    const valorizado = valorizar(costos, p, antesProducto, mov, periodoId);
    saldoLote.set(e.loteId, sl);
    saldoProducto.set(e.productoId, sp);
    const previa = estadoLineas.get(e.loteId);
    estadoLineas.set(e.loteId, previa ? {
      ...previa,
      cantidad: previa.cantidad + cantidad,
      valor: (Number(previa.valor) || 0) + valorizado.valor,
      // Con unidades de dos costos no hay un costo de salida único.
      costoUnitario: previa.costoUnitario === valorizado.costoUnitario ? previa.costoUnitario : null,
      fueraDeFEFO: Boolean(previa.fueraDeFEFO || fuera.has(e.loteId)),
    } : {
      productoId: p.id, productoNombre: p.nombre, codigoMaestro: p.codigoMaestro || '', referencia: referenciaDe(p),
      loteId: e.loteId, lote: lote.lote || null, vencimiento: lote.vencimiento || null, cantidad,
      valor: valorizado.valor, costoUnitario: valorizado.costoUnitario,
      fueraDeFEFO: fuera.has(e.loteId), sinVencimiento: !lote.vencimiento,
    });
    pasos.push({ tipo: 'ASIGNACION_KIT', cantidad, p, datosLote: lote, loteId: e.loteId, sl, sp, valorizado });
  });

  const lineas = entrada.map((e) => estadoLineas.get(e.loteId));

  const escribir = () => {
    saldoLote.forEach((s, id) => {
      const paso = pasos.find((x) => x.loteId === id);
      const actual = lotes.get(id);
      let base;
      if (actual) { const { id: _id, ...resto } = actual; base = resto; } // eslint-disable-line no-unused-vars
      else base = { productoId: paso.p.id, lote: paso.datosLote.lote || null, vencimiento: paso.datosLote.vencimiento || null, ...datosPropietario(null), creadoEn: ahora() };
      t.set(refLote(db, id), { ...base, ...s, soloCargaInicial: false, ultimoMovimiento: ahora(), ultimoMovimientoTipo: paso.tipo });
    });
    const productosActualizados = productoIds.map((id) => {
      const costo = camposCosto(costos.get(id));
      t.update(refProducto(db, id), { ...saldoProducto.get(id), ...costo, conMovimientos: true, actualizadoEn: ahora() });
      return { id, ...saldoProducto.get(id), ...costo, conMovimientos: true };
    });
    pasos.forEach(({ tipo, cantidad, p, datosLote, loteId, sl, sp, valorizado }, orden) => {
      t.set(db.collection(COL.movimientos).doc(), {
        tipo, fecha: ahora(), orden, usuario: por,
        productoId: p.id, productoNombre: p.nombre, codigoMaestro: p.codigoMaestro, categoriaId: p.categoriaId || null,
        loteId, lote: datosLote.lote || null, vencimiento: datosLote.vencimiento || null, ...datosPropietario(null), cantidad,
        saldoLote: fotoSaldo(sl), saldoProducto: fotoSaldo(sp),
        centroId: null, kitId, documentoRef: { id: kitId, tipo: 'KIT', numero: codigo }, observacion: `Kit ${codigo}`,
        ...valorizado,
      });
    });
    return productosActualizados;
  };

  return { lineas, retiros, asignaciones, escribir };
};

// Crea un kit (sin `kitId`) o cambia el contenido de uno existente. El ID y la
// referencia no se editan: si la referencia estaba mal, se elimina el kit y se
// crea otro.
const guardarKitComo = (db, por, datos = {}) => {
  const kitId = datos.kitId ? String(datos.kitId) : null;
  const { errores, lineas: entrada } = validarLineasKit(datos.lineas);
  const { errores: erroresCabecera, cabecera } = validarCabeceraKit(datos);
  exigirSinErrores([...new Set([...(kitId ? [] : erroresCabecera), ...errores])]);

  return db.runTransaction(async (t) => {
    const refContador = db.collection(COL.control).doc(ID_CONTADOR_KITS);
    const numero = kitId ? null : ((await t.get(refContador)).data()?.[cabecera.familia] || 0) + 1;
    const codigoNuevo = kitId ? null : codigoCorrelativoKit(cabecera.familia, numero);
    const ref = db.collection(COL_KITS).doc(kitId || idKit(codigoNuevo));
    const snapKit = await t.get(ref);
    if (kitId && !snapKit.exists) throw new HttpsError('not-found', 'El kit ya no existe.');
    // No debería ocurrir (el contador nunca baja), pero un set lo sobrescribiría.
    if (!kitId && snapKit.exists) throw new HttpsError('failed-precondition', `El ID ${codigoNuevo} ya existe. Avisa a un administrador.`);
    const kit = snapKit.exists ? snapKit.data() : null;
    if (kit && kit.familia !== datos.familia) throw new HttpsError('invalid-argument', 'El kit no pertenece a esta pantalla.');
    const codigo = kit?.codigo || codigoNuevo;

    const cambio = await prepararCambioStock(t, db, por, { kitId: ref.id, codigo, anteriores: kit?.lineas || [], entrada });
    if (!cambio) return { id: ref.id, codigo, sinCambios: true, productos: [] };

    const productos = cambio.escribir();
    const contenido = { lineas: cambio.lineas, ...totalesKit(cambio.lineas) };
    if (kit) {
      t.update(ref, { ...contenido, actualizadoPor: por, actualizadoEn: ahora() });
      registrarLog(t, ref, 'EDITADO', por, {
        retirado: cambio.retiros.map((r) => resumenLinea(r.linea, r.cantidad)),
        agregado: cambio.asignaciones.map((a) => { const l = cambio.lineas.find((x) => x.loteId === a.entrada.loteId); return resumenLinea(l, a.cantidad); }),
      });
    } else {
      t.set(refContador, { [cabecera.familia]: numero }, { merge: true });
      t.set(ref, { ...cabecera, numero, codigo, codigoNormalizado: normalizarClave(codigo), ...contenido, creadoPor: por, creadoEn: ahora(), actualizadoPor: por, actualizadoEn: ahora() });
      registrarLog(t, ref, 'CREADO', por, { lineas: cambio.lineas.map((l) => resumenLinea(l)) });
    }
    return { id: ref.id, codigo, referencia: kit?.referencia || cabecera.referencia, ...totalesKit(cambio.lineas), productos };
  });
};

// Elimina el kit y devuelve todas sus unidades al stock. La auditoría queda
// en logs, también si después se crea otro kit con el mismo código.
const eliminarKitComo = (db, por, datos = {}) => {
  const kitId = String(datos.kitId || '');
  if (!kitId) throw new HttpsError('invalid-argument', 'Falta el kit.');
  return db.runTransaction(async (t) => {
    const ref = db.collection(COL_KITS).doc(kitId);
    const snap = await t.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'El kit ya no existe.');
    const kit = snap.data();
    if (kit.familia !== datos.familia) throw new HttpsError('invalid-argument', 'El kit no pertenece a esta pantalla.');
    const cambio = await prepararCambioStock(t, db, por, { kitId, codigo: kit.codigo, anteriores: kit.lineas || [], entrada: [] });
    const productos = cambio ? cambio.escribir() : [];
    registrarLog(t, ref, 'ELIMINADO', por, { codigo: kit.codigo, tipo: kit.tipo, lineas: (kit.lineas || []).map((l) => resumenLinea(l)) });
    t.delete(ref);
    return { id: kitId, codigo: kit.codigo, productos };
  });
};

// Completa la fecha de una línea sin vencimiento: las unidades están en el
// kit, así que no mueve stock ni valor. La línea pasa a apuntar al lote con
// fecha (su ID incluye el vencimiento), de modo que un retiro posterior llega
// a ese lote. Si no existe se crea en 0: así el retorno tiene destino y otra
// línea que complete el mismo lote con otra fecha recibe el aviso.
const completarVencimientoComo = (db, por, datos = {}) => {
  const kitId = String(datos.kitId || '');
  const loteId = String(datos.loteId || '');
  const vencimiento = String(datos.vencimiento || '').trim();
  if (!kitId || !loteId) throw new HttpsError('invalid-argument', 'Falta el kit o la línea.');
  if (!fechaValida(vencimiento)) throw new HttpsError('invalid-argument', 'Ingresa una fecha de vencimiento válida.');

  return db.runTransaction(async (t) => {
    const ref = db.collection(COL_KITS).doc(kitId);
    const snap = await t.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'El kit ya no existe.');
    const kit = snap.data();
    if (kit.familia !== datos.familia) throw new HttpsError('invalid-argument', 'El kit no pertenece a esta pantalla.');
    const linea = (kit.lineas || []).find((l) => l.loteId === loteId);
    if (!linea) throw new HttpsError('not-found', 'La línea ya no está en el kit.');
    if (linea.vencimiento) throw new HttpsError('failed-precondition', `La línea ya tiene fecha de vencimiento (${linea.vencimiento}).`);

    const loteIdNuevo = idLote(linea.productoId, linea.lote, vencimiento);
    const [consulta, snapDestino] = await Promise.all([
      t.get(db.collection(COL.lotes).where('productoId', '==', linea.productoId).limit(300)),
      t.get(refLote(db, loteIdNuevo)),
    ]);
    const existentes = consulta.docs.map((d) => d.data());
    const fechasExistentes = fechasDistintasDelLote(existentes, linea.lote, vencimiento);
    if (fechasExistentes.length && datos.confirmarFechaDistinta !== true) {
      throw new HttpsError('failed-precondition', `El lote ${linea.lote} ya existe con otra fecha.`, { motivo: 'fecha-distinta', fechasExistentes });
    }

    if (!snapDestino.exists) {
      t.set(refLote(db, loteIdNuevo), {
        productoId: linea.productoId, lote: linea.lote || null, vencimiento, ...datosPropietario(null),
        ...saldoDe(null), soloCargaInicial: false, creadoEn: ahora(), creadoDesdeKit: kitId,
      });
    }
    const lineas = lineasConFecha(kit.lineas, loteId, loteIdNuevo, vencimiento);
    t.update(ref, { lineas, ...totalesKit(lineas), actualizadoPor: por, actualizadoEn: ahora() });
    registrarLog(t, ref, 'COMPLETAR_VENCIMIENTO', por, {
      producto: linea.productoNombre, lote: linea.lote || null, cantidad: linea.cantidad,
      vencimientoAnterior: linea.vencimiento || null, vencimientoNuevo: vencimiento,
      loteIdAnterior: loteId, loteIdNuevo,
      fechasExistentes, confirmoFechaDistinta: fechasExistentes.length > 0,
    });
    return { id: kitId, loteId: loteIdNuevo, vencimiento, productos: [] };
  });
};

const exigirFamilia = (familia) => {
  if (!FAMILIAS_KIT[familia]) throw new HttpsError('invalid-argument', 'El tipo de kit no existe.');
};

// kitsGuardar: crear, editar o completar una fecha, cada una con su permiso.
const guardarKit = async (db, uid, datos = {}) => {
  const perfil = await perfilActivo(db, uid);
  exigirFamilia(datos.familia);
  const por = datosPor(uid, perfil);
  if (datos.operacion === OPERACION_COMPLETAR) {
    exigir(perfil, accionKit(datos.familia, 'completarVencimiento'));
    return completarVencimientoComo(db, por, datos);
  }
  exigir(perfil, accionKit(datos.familia, datos.kitId ? 'editar' : 'crear'));
  return guardarKitComo(db, por, datos);
};

const eliminarKit = async (db, uid, datos = {}) => {
  const perfil = await perfilActivo(db, uid);
  exigirFamilia(datos.familia);
  exigir(perfil, accionKit(datos.familia, 'eliminar'));
  return eliminarKitComo(db, datosPor(uid, perfil), datos);
};

module.exports = { guardarKit, guardarKitComo, eliminarKit, eliminarKitComo, completarVencimientoComo };
