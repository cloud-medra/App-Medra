// Lógica de las Cloud Functions de Bodega (ver index.js), separada de
// onCall para probarla contra los emuladores (tests/emulador). Las reglas
// de negocio puras están en nucleo.mjs (compartidas con la pantalla) y la
// lectura de códigos en gs1.mjs.
//
// El navegador solo LEE las colecciones bodega_*: toda escritura pasa por
// aquí, dentro de una transacción (o se escribe todo o nada).
//
//   bodega_catalogos/{id}      { tipo: CATEGORIA|UNIDAD, nombre, activo }
//   bodega_productos/{id}      maestro de productos + totales de stock
//     /logs/{id}               auditoría (creación, edición, códigos)
//   bodega_codigos_barra/{id}  vínculo código de barra -> producto (id =
//                              idVinculo(clave); un código, un producto)
//   bodega_unicos/{id}         candados de unicidad (código maestro, maestro
//                              clínico, nombre de categoría/unidad)
//   bodega_control/contadores  correlativos (código maestro automático)
//
// Cada función pública recibe (db, uid, datos) y revisa el permiso granular
// con puedeAccion. Las variantes *Como(db, por, datos) no revisan permisos:
// las usan los scripts (migración, datos de prueba).

const { HttpsError } = require('firebase-functions/v2/https');
const { FieldValue } = require('firebase-admin/firestore');
const { puedeAccion } = require('../permisos/nucleo.mjs');
const {
  ACCIONES, COL, TIPOS_CATALOGO, CAMPOS_BLOQUEADOS_CON_MOVIMIENTOS, TIPOS_DOCUMENTO_BODEGA, ESTADOS_DOCUMENTO,
  MAX_LINEAS_DOCUMENTO, MAX_OBSERVACION,
  validarCatalogo, validarProducto, codigoAutomatico, idUnico, validarCabecera, validarLinea, agruparLineas,
  idUnicoDocumento, aplicarMovimiento, normalizarLote, productoEnInventario, ErrorStock,
  MAX_LINEAS_EGRESO, MAX_ACCIONES_TRANSITO, MAX_NOTA, ESTADOS_TRANSITO, MOVIMIENTO_DE_ACCION,
  agruparLineasEgreso, aplicarMovimientoCentro, aplicarAccionTransito, accionTransito, normalizarIdEntrega,
  ESTADOS_INVENTARIO, NO_CONTADOS, MAX_CONTEOS_POR_ENVIO, MAX_NOMBRE_INVENTARIO, diferenciaLinea, resumenInventario,
  aplicarConteo, idLote,
  validarCaja, totalesCaja,
} = require('./nucleo.mjs');
const { interpretarLectura, idVinculo, MAX_CODIGO_LEIDO } = require('./gs1.mjs');

const MAX_CODIGOS_POR_PRODUCTO = 20;
const ahora = () => FieldValue.serverTimestamp();
const refControl = (db) => db.collection(COL.control).doc('contadores');
const refUnico = (db, id) => db.collection(COL.unicos).doc(id);
const refVinculo = (db, clave) => db.collection(COL.codigosBarra).doc(idVinculo(clave));

// --- Usuario y permisos -----------------------------------------------------

const perfilActivo = async (db, uid) => {
  if (!uid) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
  const perfil = (await db.collection('usuarios').doc(uid).get()).data();
  if (!perfil || perfil.activo === false) throw new HttpsError('permission-denied', 'Tu usuario no está activo.');
  return perfil;
};
const exigir = (perfil, accion) => {
  if (!puedeAccion(perfil, ...accion)) throw new HttpsError('permission-denied', 'No tienes permiso para esta acción.');
};
const datosPor = (uid, perfil) => ({ uid, nombre: perfil.nombreCompleto || perfil.email || '', email: perfil.email || '' });

const exigirSinErrores = (errores) => {
  if (errores.length) throw new HttpsError('invalid-argument', errores.join(' '));
};

const registrarLog = (t, refDoc, accion, por, detalle = {}) => t.set(refDoc.collection('logs').doc(), {
  accion, detalle, usuario: por.nombre, usuarioUid: por.uid, fecha: ahora(),
});

// --- Catálogos (categorías y unidades) --------------------------------------

const guardarCatalogoComo = (db, por, datos = {}) => {
  const { errores, catalogo } = validarCatalogo(datos);
  exigirSinErrores(errores);
  const id = datos.id ? String(datos.id) : null;

  return db.runTransaction(async (t) => {
    const ref = id ? db.collection(COL.catalogos).doc(id) : db.collection(COL.catalogos).doc();
    const refNuevoUnico = refUnico(db, idUnico.catalogo(catalogo.tipo, catalogo.nombre));
    const [snap, snapUnico] = await Promise.all([id ? t.get(ref) : null, t.get(refNuevoUnico)]);
    const antes = snap?.data();
    if (id && !antes) throw new HttpsError('not-found', 'El registro ya no existe.');
    if (antes && antes.tipo !== catalogo.tipo) throw new HttpsError('invalid-argument', 'No se puede cambiar el tipo.');
    if (snapUnico.exists && snapUnico.data().refId !== ref.id) {
      throw new HttpsError('already-exists', `Ya existe ${TIPOS_CATALOGO[catalogo.tipo].etiqueta.toLowerCase()} "${catalogo.nombre}".`);
    }

    if (antes && antes.nombre !== catalogo.nombre) t.delete(refUnico(db, idUnico.catalogo(antes.tipo, antes.nombre)));
    t.set(refNuevoUnico, { tipo: 'catalogo', refId: ref.id });
    t.set(ref, {
      ...catalogo,
      ...(antes ? {} : { creadoPor: por, creadoEn: ahora() }),
      actualizadoPor: por,
      actualizadoEn: ahora(),
    }, { merge: true });
    registrarLog(t, ref, antes ? 'EDICION' : 'CREACION', por, { antes: antes ? { nombre: antes.nombre, activo: antes.activo } : null, despues: catalogo });
    return { id: ref.id, ...catalogo };
  });
};

const guardarCatalogo = async (db, uid, datos) => {
  const perfil = await perfilActivo(db, uid);
  exigir(perfil, ACCIONES.guardarCatalogo);
  return guardarCatalogoComo(db, datosPor(uid, perfil), datos);
};

// --- Códigos de barra -------------------------------------------------------

// Lo leído (texto) -> { clave, codigoLeido }. Lanza si no identifica un
// producto (vacío, demasiado largo o solo lote/vencimiento).
const lecturaParaVincular = (codigoLeido) => {
  const texto = String(codigoLeido ?? '');
  if (texto.length > MAX_CODIGO_LEIDO) throw new HttpsError('invalid-argument', 'El código leído es demasiado largo.');
  const lectura = interpretarLectura(texto);
  if (!lectura) throw new HttpsError('invalid-argument', 'El código de barra está vacío.');
  if (lectura.soloDatosLote) {
    throw new HttpsError('invalid-argument', 'Ese código solo trae lote o vencimiento: no identifica un producto.');
  }
  return { clave: lectura.clave, codigoLeido: lectura.codigo };
};

const datosVinculo = ({ clave, codigoLeido }, productoId, por, reasignadoDe = null) => ({
  clave,
  codigoLeido,
  productoId,
  creadoPor: por,
  creadoEn: ahora(),
  ...(reasignadoDe ? { reasignadoDe } : {}),
});

const errorVinculadoAOtro = (codigo, otro) => new HttpsError(
  'failed-precondition',
  `El código ${codigo} ya está vinculado a ${otro?.codigoMaestro || ''} ${otro?.nombre || 'otro producto'}.`.replace(/\s+/g, ' '),
  { motivo: 'vinculado-a-otro', productoId: otro?.id || null, codigoMaestro: otro?.codigoMaestro || '', nombre: otro?.nombre || '' }
);

// --- Productos --------------------------------------------------------------

// Lee y valida la unidad o categoría elegida (debe existir, ser del tipo
// correcto y estar activa, salvo que ya fuera la del producto).
const leerCatalogo = async (t, db, tipo, id, idAnterior) => {
  if (!id) return null;
  const snap = await t.get(db.collection(COL.catalogos).doc(id));
  const etiqueta = TIPOS_CATALOGO[tipo].etiqueta;
  if (!snap.exists || snap.data().tipo !== tipo) throw new HttpsError('invalid-argument', `La ${etiqueta.toLowerCase()} elegida no existe.`);
  if (snap.data().activo === false && id !== idAnterior) throw new HttpsError('invalid-argument', `La ${etiqueta.toLowerCase()} "${snap.data().nombre}" está inactiva.`);
  return snap.data();
};

// Copia del maestro clínico para mostrar sin leerlo.
const copiaMaestro = (m) => ({
  codigo: m.codigo || '',
  referencia: m.referencia || '',
  descriptor: m.descriptorAuto || m.descriptorEmpresa || m.tipo || '',
  empresa: m.empresa || '',
  clase: m.clase || '',
  precioNeto: Number(m.precioNeto) || 0,
});

// Crea o edita un producto. `datos`: { id?, producto, codigos? }. Al crear
// se pueden vincular códigos ([{ clave, codigoLeido }]); un código
// vinculado a otro producto solo se reasigna con `reasignar: true`.
// Devuelve { id, producto } (sin fechas) para reflejarlo en pantalla.
const guardarProductoComo = (db, por, datos = {}) => {
  const id = datos.id ? String(datos.id) : null;
  const { errores, producto } = validarProducto(datos.producto);
  exigirSinErrores(errores);
  const codigos = Array.isArray(datos.codigos) ? datos.codigos : [];
  if (id && codigos.length) throw new HttpsError('invalid-argument', 'Los códigos de un producto existente se vinculan desde su ficha.');
  if (codigos.length > MAX_CODIGOS_POR_PRODUCTO) throw new HttpsError('invalid-argument', `Máximo ${MAX_CODIGOS_POR_PRODUCTO} códigos por producto.`);
  const claves = [...new Set(codigos.map((c) => c.clave))];

  return db.runTransaction(async (t) => {
    const ref = id ? db.collection(COL.productos).doc(id) : db.collection(COL.productos).doc();
    const antes = id ? (await t.get(ref)).data() : null;
    if (id && !antes) throw new HttpsError('not-found', 'El producto ya no existe.');

    const codigoMaestroNuevo = producto.codigoMaestro || antes?.codigoMaestro || '';
    const cambiaCodigo = Boolean(codigoMaestroNuevo) && codigoMaestroNuevo !== antes?.codigoMaestro;
    const cambiaMaestro = producto.maestroCodigoId !== (antes?.maestroCodigoId || null);

    // Lecturas (todas antes de escribir).
    const [, , snapMaestro, snapUnicoCodigo, snapUnicoMaestro, snapControl, ...snapsVinculos] = await Promise.all([
      leerCatalogo(t, db, 'UNIDAD', producto.unidadId, antes?.unidadId),
      leerCatalogo(t, db, 'CATEGORIA', producto.categoriaId, antes?.categoriaId),
      producto.maestroCodigoId && cambiaMaestro ? t.get(db.collection('maestros_codigos').doc(producto.maestroCodigoId)) : null,
      cambiaCodigo ? t.get(refUnico(db, idUnico.codigoMaestro(codigoMaestroNuevo))) : null,
      producto.maestroCodigoId && cambiaMaestro ? t.get(refUnico(db, idUnico.maestroClinico(producto.maestroCodigoId))) : null,
      codigoMaestroNuevo ? null : t.get(refControl(db)),
      ...claves.map((c) => t.get(refVinculo(db, c))),
    ]);

    if (snapMaestro && !snapMaestro.exists) throw new HttpsError('invalid-argument', 'El producto del maestro clínico ya no existe.');
    if (snapUnicoCodigo?.exists && snapUnicoCodigo.data().refId !== ref.id) {
      throw new HttpsError('already-exists', `El código maestro ${codigoMaestroNuevo} ya está en uso.`);
    }
    if (snapUnicoMaestro?.exists && snapUnicoMaestro.data().refId !== ref.id) {
      throw new HttpsError('already-exists', 'Ese producto del maestro clínico ya está vinculado a otro producto de Bodega.');
    }
    if (antes?.conMovimientos) {
      const bloqueado = CAMPOS_BLOQUEADOS_CON_MOVIMIENTOS.find((c) => Boolean(antes[c]) !== producto[c]);
      if (bloqueado) throw new HttpsError('failed-precondition', 'No se puede cambiar si maneja lote o vencimiento: el producto ya tiene movimientos.');
    }
    if (antes && antes.activo !== false && !producto.activo && ((antes.disponible || 0) > 0 || (antes.transito || 0) > 0)) {
      throw new HttpsError('failed-precondition', 'No se puede inactivar un producto con stock disponible o en tránsito.');
    }
    const vinculosOtros = snapsVinculos.filter((s) => s.exists && s.data().productoId !== ref.id);
    if (vinculosOtros.length && !datos.reasignar) {
      const otroId = vinculosOtros[0].data().productoId;
      const otro = (await t.get(db.collection(COL.productos).doc(otroId))).data();
      throw errorVinculadoAOtro(vinculosOtros[0].data().codigoLeido || vinculosOtros[0].data().clave, otro ? { id: otroId, ...otro } : null);
    }
    const otros = await Promise.all(vinculosOtros.map((s) => t.get(db.collection(COL.productos).doc(s.data().productoId))));

    // Código maestro automático (BOD-00001): también reserva su candado. Si
    // alguien ya escribió a mano el siguiente, se salta (hasta 10).
    let codigoMaestro = codigoMaestroNuevo;
    let siguiente = null;
    if (!codigoMaestro) {
      siguiente = snapControl.data()?.productos || 0;
      for (let intento = 0; intento < 10 && !codigoMaestro; intento += 1) {
        siguiente += 1;
        const snapAuto = await t.get(refUnico(db, idUnico.codigoMaestro(codigoAutomatico(siguiente))));
        if (!snapAuto.exists) codigoMaestro = codigoAutomatico(siguiente);
      }
      if (!codigoMaestro) throw new HttpsError('failed-precondition', 'No se pudo generar un código maestro automático; escribe uno.');
    }

    // Escrituras.
    if (siguiente !== null) t.set(refControl(db), { productos: siguiente }, { merge: true });
    if (codigoMaestro !== antes?.codigoMaestro) {
      if (antes?.codigoMaestro) t.delete(refUnico(db, idUnico.codigoMaestro(antes.codigoMaestro)));
      t.set(refUnico(db, idUnico.codigoMaestro(codigoMaestro)), { tipo: 'codigoMaestro', refId: ref.id });
    }
    if (cambiaMaestro) {
      if (antes?.maestroCodigoId) t.delete(refUnico(db, idUnico.maestroClinico(antes.maestroCodigoId)));
      if (producto.maestroCodigoId) t.set(refUnico(db, idUnico.maestroClinico(producto.maestroCodigoId)), { tipo: 'maestroClinico', refId: ref.id });
    }

    const maestroCodigo = cambiaMaestro
      ? (snapMaestro ? copiaMaestro(snapMaestro.data()) : null)
      : (antes?.maestroCodigo ?? null);
    const codigosBarra = [...new Set([...(antes?.codigosBarra || []), ...claves])];
    const plano = {
      ...producto,
      codigoMaestro,
      maestroCodigo,
      codigosBarra,
      disponible: antes?.disponible || 0,
      transito: antes?.transito || 0,
      transitoPorCentro: antes?.transitoPorCentro || {},
      conMovimientos: antes?.conMovimientos || false,
    };
    t.set(ref, {
      ...plano,
      ...(antes ? {} : { creadoPor: por, creadoEn: ahora() }),
      actualizadoPor: por,
      actualizadoEn: ahora(),
    }, { merge: true });

    codigos.forEach((c) => {
      const previo = snapsVinculos[claves.indexOf(c.clave)];
      const reasignadoDe = previo?.exists && previo.data().productoId !== ref.id ? previo.data().productoId : null;
      t.set(refVinculo(db, c.clave), datosVinculo(c, ref.id, por, reasignadoDe));
    });
    otros.forEach((snapOtro, i) => {
      if (!snapOtro.exists) return;
      const clave = vinculosOtros[i].data().clave;
      t.update(snapOtro.ref, { codigosBarra: FieldValue.arrayRemove(clave), actualizadoPor: por, actualizadoEn: ahora() });
      registrarLog(t, snapOtro.ref, 'CODIGO_REASIGNADO', por, { clave, a: ref.id });
    });

    const cambios = antes
      ? Object.fromEntries(Object.keys(producto).filter((k) => JSON.stringify(antes[k] ?? null) !== JSON.stringify(plano[k] ?? null))
        .map((k) => [k, { antes: antes[k] ?? null, despues: plano[k] ?? null }]))
      : null;
    registrarLog(t, ref, antes ? 'EDICION' : 'CREACION', por, antes ? { cambios } : { producto: plano, codigos: claves });
    return { id: ref.id, producto: plano };
  });
};

const guardarProducto = async (db, uid, datos = {}) => {
  const perfil = await perfilActivo(db, uid);
  const id = datos.id ? String(datos.id) : null;
  exigir(perfil, id ? ACCIONES.editarProducto : ACCIONES.crearProducto);
  if (id) {
    // Activar o inactivar es una acción aparte (sensible).
    const actual = (await db.collection(COL.productos).doc(id).get()).data();
    if (actual && (actual.activo !== false) !== (datos.producto?.activo !== false)) exigir(perfil, ACCIONES.inactivarProducto);
  }
  const lecturas = Array.isArray(datos.codigos) ? datos.codigos.map(lecturaParaVincular) : [];
  if (lecturas.length) exigir(perfil, ACCIONES.vincularCodigo);
  if (datos.reasignar) exigir(perfil, ACCIONES.desvincularCodigo);
  return guardarProductoComo(db, datosPor(uid, perfil), { ...datos, codigos: lecturas });
};

// Vincula un código leído a un producto. Si ya está vinculado a otro, lo
// reasigna solo con `reasignar: true` (requiere además poder desvincular).
// `lectura`: { clave, codigoLeido } (lecturaParaVincular).
const vincularCodigoComo = (db, por, { productoId, lectura, reasignar = false }) => {
  if (!productoId) throw new HttpsError('invalid-argument', 'Falta el producto.');
  return db.runTransaction(async (t) => {
    const ref = db.collection(COL.productos).doc(productoId);
    const [snap, snapVinculo] = await Promise.all([t.get(ref), t.get(refVinculo(db, lectura.clave))]);
    if (!snap.exists) throw new HttpsError('not-found', 'El producto ya no existe.');
    if (snap.data().activo === false) throw new HttpsError('failed-precondition', 'El producto está inactivo.');
    const actual = snapVinculo.exists ? snapVinculo.data() : null;
    if (actual?.productoId === productoId) return { clave: lectura.clave, productoId, yaVinculado: true };

    let refOtro = null;
    if (actual) {
      refOtro = db.collection(COL.productos).doc(actual.productoId);
      const otro = await t.get(refOtro);
      if (!reasignar) throw errorVinculadoAOtro(lectura.codigoLeido, otro.exists ? { id: otro.id, ...otro.data() } : null);
      if (!otro.exists) refOtro = null;
    }

    t.set(refVinculo(db, lectura.clave), datosVinculo(lectura, productoId, por, actual?.productoId || null));
    t.update(ref, { codigosBarra: FieldValue.arrayUnion(lectura.clave), actualizadoPor: por, actualizadoEn: ahora() });
    registrarLog(t, ref, 'CODIGO_VINCULADO', por, { clave: lectura.clave, codigoLeido: lectura.codigoLeido, reasignadoDe: actual?.productoId || null });
    if (refOtro) {
      t.update(refOtro, { codigosBarra: FieldValue.arrayRemove(lectura.clave), actualizadoPor: por, actualizadoEn: ahora() });
      registrarLog(t, refOtro, 'CODIGO_REASIGNADO', por, { clave: lectura.clave, a: productoId });
    }
    return { clave: lectura.clave, productoId, reasignadoDe: actual?.productoId || null };
  });
};

const vincularCodigo = async (db, uid, datos = {}) => {
  const perfil = await perfilActivo(db, uid);
  exigir(perfil, ACCIONES.vincularCodigo);
  if (datos.reasignar) exigir(perfil, ACCIONES.desvincularCodigo);
  return vincularCodigoComo(db, datosPor(uid, perfil), {
    productoId: String(datos.productoId || ''),
    lectura: lecturaParaVincular(datos.codigoLeido),
    reasignar: Boolean(datos.reasignar),
  });
};

const desvincularCodigo = async (db, uid, datos = {}) => {
  const perfil = await perfilActivo(db, uid);
  exigir(perfil, ACCIONES.desvincularCodigo);
  const por = datosPor(uid, perfil);
  const productoId = String(datos.productoId || '');
  const clave = String(datos.clave || '');
  if (!productoId || !clave) throw new HttpsError('invalid-argument', 'Faltan el producto o el código.');

  return db.runTransaction(async (t) => {
    const ref = db.collection(COL.productos).doc(productoId);
    const snapVinculo = await t.get(refVinculo(db, clave));
    if (!snapVinculo.exists || snapVinculo.data().productoId !== productoId) {
      throw new HttpsError('failed-precondition', 'Ese código ya no está vinculado a este producto.');
    }
    t.delete(snapVinculo.ref);
    t.update(ref, { codigosBarra: FieldValue.arrayRemove(clave), actualizadoPor: por, actualizadoEn: ahora() });
    registrarLog(t, ref, 'CODIGO_DESVINCULADO', por, { clave, codigoLeido: snapVinculo.data().codigoLeido || '' });
    return { clave, productoId };
  });
};

// --- Documentos: ingreso y carga inicial -----------------------------------
//
//   bodega_documentos/{id} = { tipo: INGRESO|CARGA_INICIAL, estado:
//     BORRADOR|CONFIRMADO, tipoDocumento, numero, ordenCompra, proveedorId,
//     proveedorNombre, fecha, observacion, lineas: [{ productoId, lote,
//     vencimiento, cantidad, codigoLeido, (al confirmar) productoNombre,
//     codigoMaestro, loteId }], totalUnidades, creadoPor, confirmadoPor… }
//   bodega_lotes/{productoId__lote__venc} = { productoId, lote, vencimiento,
//     disponible, transito, transitoPorCentro, soloCargaInicial, … }
//   bodega_movimientos/{id} = kardex (un movimiento por línea agrupada).
//   bodega_control/estado = { inventarioAbierto: { id, alcance } } (Fase 5)
//   bodega_control/config = { cargaInicialCerrada }

const refEstado = (db) => db.collection(COL.control).doc('estado');
const refConfig = (db) => db.collection(COL.control).doc('config');
const ACCIONES_DOCUMENTO = {
  INGRESO: { borrador: ACCIONES.guardarBorradorIngreso, confirmar: ACCIONES.confirmarIngreso, eliminar: ACCIONES.eliminarBorradorIngreso },
  CARGA_INICIAL: { borrador: ACCIONES.guardarBorradorCarga, confirmar: ACCIONES.confirmarCarga, eliminar: ACCIONES.eliminarBorradorCarga },
};
const accionesDe = (tipo) => {
  const acciones = ACCIONES_DOCUMENTO[tipo];
  if (!acciones) throw new HttpsError('invalid-argument', 'Tipo de documento inválido.');
  return acciones;
};
const saldoDe = (d) => ({ disponible: d?.disponible || 0, transito: d?.transito || 0, transitoPorCentro: d?.transitoPorCentro || {} });

// Borrador: cabecera y líneas tal como están (pueden estar incompletas);
// solo se normalizan formatos y largos.
const normalizarBorrador = (tipo, datos = {}) => {
  const cab = datos.cabecera || {};
  const texto = (v, max) => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
  const cabecera = tipo === 'INGRESO'
    ? {
      tipoDocumento: texto(cab.tipoDocumento, 10), numero: texto(cab.numero, 40).toUpperCase(), ordenCompra: texto(cab.ordenCompra, 40).toUpperCase(),
      proveedorId: texto(cab.proveedorId, 100), fecha: texto(cab.fecha, 10), observacion: texto(cab.observacion, MAX_OBSERVACION),
    }
    : { observacion: texto(cab.observacion, MAX_OBSERVACION) };
  const lineas = Array.isArray(datos.lineas) ? datos.lineas : [];
  if (lineas.length > MAX_LINEAS_DOCUMENTO) throw new HttpsError('invalid-argument', `Máximo ${MAX_LINEAS_DOCUMENTO} líneas por documento.`);
  return {
    cabecera,
    lineas: lineas.map((l) => {
      const cantidad = Number(l?.cantidad);
      if (!l?.productoId || !Number.isInteger(cantidad) || cantidad <= 0) throw new HttpsError('invalid-argument', 'Hay líneas sin producto o con cantidad inválida.');
      return { productoId: String(l.productoId), lote: normalizarLote(l.lote).slice(0, 40) || null, vencimiento: texto(l.vencimiento, 10) || null, cantidad, codigoLeido: String(l.codigoLeido || '').slice(0, 300) };
    }),
  };
};

const guardarBorrador = async (db, uid, datos = {}) => {
  const perfil = await perfilActivo(db, uid);
  const tipo = String(datos.tipo || '');
  exigir(perfil, accionesDe(tipo).borrador);
  const por = datosPor(uid, perfil);
  const { cabecera, lineas } = normalizarBorrador(tipo, datos);
  const id = datos.id ? String(datos.id) : null;

  return db.runTransaction(async (t) => {
    const ref = id ? db.collection(COL.documentos).doc(id) : db.collection(COL.documentos).doc();
    const conDatosUnicos = tipo === 'INGRESO' && cabecera.proveedorId && cabecera.tipoDocumento && cabecera.numero;
    const [snap, snapUnico] = await Promise.all([
      id ? t.get(ref) : null,
      conDatosUnicos ? t.get(refUnico(db, idUnicoDocumento(cabecera))) : null,
    ]);
    if (id && !snap.exists) throw new HttpsError('not-found', 'El borrador ya no existe.');
    if (snap?.exists && (snap.data().estado !== ESTADOS_DOCUMENTO.BORRADOR || snap.data().tipo !== tipo)) {
      throw new HttpsError('failed-precondition', 'Ese documento ya fue confirmado y no se puede modificar.');
    }
    t.set(ref, {
      tipo, estado: ESTADOS_DOCUMENTO.BORRADOR, ...cabecera, lineas,
      ...(snap?.exists ? {} : { creadoPor: por, creadoEn: ahora() }),
      actualizadoPor: por, actualizadoEn: ahora(),
    }, { merge: true });
    return { id: ref.id, duplicado: Boolean(snapUnico?.exists) };
  });
};

const eliminarBorrador = async (db, uid, datos = {}) => {
  const perfil = await perfilActivo(db, uid);
  const id = String(datos.id || '');
  if (!id) throw new HttpsError('invalid-argument', 'Falta el borrador.');
  const ref = db.collection(COL.documentos).doc(id);
  return db.runTransaction(async (t) => {
    const snap = await t.get(ref);
    if (!snap.exists) return { id, eliminado: false };
    exigir(perfil, accionesDe(snap.data().tipo).eliminar);
    if (snap.data().estado !== ESTADOS_DOCUMENTO.BORRADOR) throw new HttpsError('failed-precondition', 'Un documento confirmado no se puede eliminar.');
    t.delete(ref);
    return { id, eliminado: true };
  });
};

// Confirma un ingreso o carga inicial (desde cero o desde su borrador) en
// UNA transacción: valida cabecera, productos, lotes y unicidad; suma al
// disponible de cada lote y producto; deja un movimiento por línea
// (agrupada por lote) y el documento CONFIRMADO. Si algo falla, no se
// escribe nada.
const confirmarDocumentoComo = (db, por, datos = {}) => {
  const tipo = String(datos.tipo || '');
  const { errores, cabecera } = validarCabecera(tipo, datos.cabecera);
  exigirSinErrores(errores);
  const lineasEntrada = Array.isArray(datos.lineas) ? datos.lineas : [];
  if (!lineasEntrada.length) throw new HttpsError('invalid-argument', 'El documento no tiene líneas.');
  if (lineasEntrada.length > MAX_LINEAS_DOCUMENTO) throw new HttpsError('invalid-argument', `Máximo ${MAX_LINEAS_DOCUMENTO} líneas por documento.`);
  const tipoMovimiento = TIPOS_DOCUMENTO_BODEGA[tipo].movimiento;
  const id = datos.id ? String(datos.id) : null;

  return db.runTransaction(async (t) => {
    const ref = id ? db.collection(COL.documentos).doc(id) : db.collection(COL.documentos).doc();
    const productoIds = [...new Set(lineasEntrada.map((l) => String(l?.productoId || '')).filter(Boolean))];
    const [snapDoc, snapUnico, snapProveedor, snapEstado, snapConfig, ...snapsProductos] = await Promise.all([
      id ? t.get(ref) : null,
      tipo === 'INGRESO' ? t.get(refUnico(db, idUnicoDocumento(cabecera))) : null,
      tipo === 'INGRESO' ? t.get(db.collection('maestros_empresas').doc(cabecera.proveedorId)) : null,
      t.get(refEstado(db)),
      tipo === 'CARGA_INICIAL' ? t.get(refConfig(db)) : null,
      ...productoIds.map((pid) => t.get(db.collection(COL.productos).doc(pid))),
    ]);
    if (id && !snapDoc.exists) throw new HttpsError('not-found', 'El borrador ya no existe.');
    if (snapDoc?.exists && (snapDoc.data().estado !== ESTADOS_DOCUMENTO.BORRADOR || snapDoc.data().tipo !== tipo)) {
      throw new HttpsError('failed-precondition', 'Ese documento ya fue confirmado.');
    }
    if (snapConfig?.data()?.cargaInicialCerrada) throw new HttpsError('failed-precondition', 'La carga inicial está cerrada. Usa Ingreso por documento.');
    let proveedorNombre = '';
    if (tipo === 'INGRESO') {
      if (!snapProveedor.exists) throw new HttpsError('invalid-argument', 'El proveedor elegido no existe.');
      proveedorNombre = snapProveedor.data().nombre || '';
      if (snapUnico.exists) {
        throw new HttpsError('already-exists', `Ya se ingresó la ${cabecera.tipoDocumento === 'GUIA' ? 'guía' : 'factura'} N° ${cabecera.numero} de ${proveedorNombre}.`);
      }
    }

    const productos = new Map(snapsProductos.filter((s) => s.exists).map((s) => [s.id, { id: s.id, ...s.data() }]));
    const erroresLineas = [];
    const lineasValidas = lineasEntrada.map((l) => {
      const r = validarLinea(l, productos.get(String(l?.productoId || '')) || null);
      erroresLineas.push(...r.errores);
      return r.linea;
    });
    exigirSinErrores([...new Set(erroresLineas)]);

    const inventario = snapEstado.data()?.inventarioAbierto;
    const bloqueados = [...productos.values()].filter((p) => productoEnInventario(inventario, p));
    if (bloqueados.length) {
      throw new HttpsError('failed-precondition', `Hay un inventario abierto que incluye: ${bloqueados.map((p) => p.nombre).join(', ')}. Ciérralo antes de mover stock.`);
    }

    const lineas = agruparLineas(lineasValidas);
    const snapsLotes = await Promise.all(lineas.map((l) => t.get(db.collection(COL.lotes).doc(l.loteId))));
    const lotesPrevios = new Map(snapsLotes.map((s) => [s.id, s.exists ? s.data() : null]));
    if (tipo === 'CARGA_INICIAL') {
      const conMovimientos = lineas.filter((l) => lotesPrevios.get(l.loteId) && lotesPrevios.get(l.loteId).soloCargaInicial === false);
      if (conMovimientos.length) {
        throw new HttpsError('failed-precondition', `Estos lotes ya tienen movimientos distintos a carga inicial (usa Ingreso): ${conMovimientos.map((l) => `${productos.get(l.productoId).nombre} lote ${l.lote || 'S/L'}`).join('; ')}.`);
      }
    }

    // Saldos: se aplican en orden, sobre copias en memoria.
    const saldosProducto = new Map([...productos.values()].map((p) => [p.id, saldoDe(p)]));
    const saldosLote = new Map();
    const movimientos = [];
    try {
      lineas.forEach((l, orden) => {
        const loteAntes = saldosLote.get(l.loteId) || saldoDe(lotesPrevios.get(l.loteId));
        const loteDespues = aplicarMovimiento(loteAntes, { tipo: tipoMovimiento, cantidad: l.cantidad });
        const productoDespues = aplicarMovimiento(saldosProducto.get(l.productoId), { tipo: tipoMovimiento, cantidad: l.cantidad });
        saldosLote.set(l.loteId, loteDespues);
        saldosProducto.set(l.productoId, productoDespues);
        movimientos.push({ l, orden, loteDespues, productoDespues });
      });
    } catch (error) {
      if (error instanceof ErrorStock) throw new HttpsError('failed-precondition', error.message);
      throw error;
    }

    // Escrituras.
    lineas.forEach((l) => {
      const previo = lotesPrevios.get(l.loteId);
      const saldo = saldosLote.get(l.loteId);
      t.set(db.collection(COL.lotes).doc(l.loteId), {
        productoId: l.productoId, lote: l.lote, vencimiento: l.vencimiento,
        disponible: saldo.disponible, transito: saldo.transito, transitoPorCentro: saldo.transitoPorCentro,
        soloCargaInicial: tipo === 'CARGA_INICIAL' && (previo ? previo.soloCargaInicial !== false : true),
        creadoEn: previo?.creadoEn || ahora(),
        ultimoMovimiento: ahora(), ultimoMovimientoTipo: tipoMovimiento,
      });
    });
    const productosActualizados = [...new Set(lineas.map((l) => l.productoId))].map((pid) => {
      const saldo = saldosProducto.get(pid);
      t.update(db.collection(COL.productos).doc(pid), { ...saldo, conMovimientos: true, actualizadoEn: ahora() });
      return { id: pid, ...saldo, conMovimientos: true };
    });
    const documentoRef = {
      id: ref.id, tipo,
      ...(tipo === 'INGRESO' ? { tipoDocumento: cabecera.tipoDocumento, numero: cabecera.numero, proveedorNombre } : {}),
    };
    movimientos.forEach(({ l, orden, loteDespues, productoDespues }) => {
      const p = productos.get(l.productoId);
      t.set(db.collection(COL.movimientos).doc(), {
        tipo: tipoMovimiento, fecha: ahora(), orden, usuario: por,
        productoId: l.productoId, productoNombre: p.nombre, codigoMaestro: p.codigoMaestro, categoriaId: p.categoriaId || null,
        loteId: l.loteId, lote: l.lote, vencimiento: l.vencimiento, cantidad: l.cantidad,
        saldoLote: { disponible: loteDespues.disponible, transito: loteDespues.transito },
        saldoProducto: { disponible: productoDespues.disponible, transito: productoDespues.transito },
        centroId: null, documentoRef, observacion: cabecera.observacion, codigoLeido: l.codigoLeido,
      });
    });
    const lineasDocumento = lineas.map((l) => ({ ...l, productoNombre: productos.get(l.productoId).nombre, codigoMaestro: productos.get(l.productoId).codigoMaestro }));
    const totalUnidades = lineas.reduce((n, l) => n + l.cantidad, 0);
    t.set(ref, {
      tipo, estado: ESTADOS_DOCUMENTO.CONFIRMADO, ...cabecera, proveedorNombre,
      lineas: lineasDocumento, numeroLineas: lineas.length, totalUnidades,
      creadoPor: snapDoc?.data()?.creadoPor || por, creadoEn: snapDoc?.data()?.creadoEn || ahora(),
      confirmadoPor: por, confirmadoEn: ahora(), actualizadoPor: por, actualizadoEn: ahora(),
    });
    if (tipo === 'INGRESO') t.set(refUnico(db, idUnicoDocumento(cabecera)), { tipo: 'documento', refId: ref.id });
    return { id: ref.id, lineas: lineas.length, unidades: totalUnidades, productos: productosActualizados };
  });
};

const confirmarDocumento = async (db, uid, datos = {}) => {
  const perfil = await perfilActivo(db, uid);
  exigir(perfil, accionesDe(String(datos.tipo || '')).confirmar);
  return confirmarDocumentoComo(db, datosPor(uid, perfil), datos);
};

// Cierra (o reabre) la carga inicial para todos.
const configurarCargaInicial = async (db, uid, datos = {}) => {
  const perfil = await perfilActivo(db, uid);
  exigir(perfil, ACCIONES.cerrarCarga);
  const cerrada = datos.cerrada === true;
  await refConfig(db).set({ cargaInicialCerrada: cerrada, cargaInicialActualizadaPor: datosPor(uid, perfil), cargaInicialActualizadaEn: ahora() }, { merge: true });
  return { cargaInicialCerrada: cerrada };
};

// --- Egreso (salida a tránsito) y gestión del tránsito ----------------------
//
//   bodega_salidas/{id} = { numero, fecha, usuario, solicitante, observacion,
//     lineas, resumenPorCentro: { [centroId]: { nombre, lineas, unidades } } }
//   bodega_transitos/{id} = uno por producto + lote + centro de una salida:
//     { salidaId, salidaNumero, productoId, productoNombre, codigoMaestro,
//       loteId, lote, vencimiento, centroId, centroNombre, cantidadSalida,
//       pendiente, entregado, devuelto, estado: ABIERTO|CERRADO, fechaSalida,
//       usuario, solicitante, observacion, ultimaAccionEn }
//     /historial/{id} = { accion: SALIDA|ENTREGAR|DEVOLVER|NOTA, cantidad,
//       idEntrega, observacion, nota, usuario, fecha }
//   bodega_transito_centros/{centroId} = { centroNombre, unidades,
//     productos: { [productoId]: n }, productosDistintos, transitosAbiertos }

const refTransitoCentro = (db, centroId) => db.collection(COL.transitoCentros).doc(centroId);
const conErrorStock = (fn) => {
  try {
    return fn();
  } catch (error) {
    if (error instanceof ErrorStock) throw new HttpsError('failed-precondition', error.message);
    throw error;
  }
};
const exigirSinInventario = (snapEstado, productos, accion = 'mover stock') => {
  const inventario = snapEstado.data()?.inventarioAbierto;
  const bloqueados = productos.filter((p) => productoEnInventario(inventario, p));
  if (bloqueados.length) {
    throw new HttpsError('failed-precondition', `Hay un inventario abierto que incluye: ${[...new Set(bloqueados.map((p) => p.nombre))].join(', ')}. Ciérralo antes de ${accion}.`);
  }
};

// Salida a tránsito: cada línea { productoId, loteId, cantidad, centroId }.
// En UNA transacción baja el disponible de cada lote y producto, sube el
// tránsito del centro de cada línea y crea la salida, sus tránsitos y los
// movimientos SALIDA_A_TRANSITO. Solo centros activos.
const egresarComo = (db, por, datos = {}) => {
  const entrada = Array.isArray(datos.lineas) ? datos.lineas : [];
  if (!entrada.length) throw new HttpsError('invalid-argument', 'La salida no tiene líneas.');
  if (entrada.length > MAX_LINEAS_EGRESO) throw new HttpsError('invalid-argument', `Máximo ${MAX_LINEAS_EGRESO} líneas por salida.`);
  const texto = (v, max) => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
  const solicitante = texto(datos.solicitante, 120);
  const observacion = texto(datos.observacion, MAX_OBSERVACION);
  const lineas = agruparLineasEgreso(entrada.map((l) => {
    const cantidad = Number(l?.cantidad);
    if (!l?.productoId || !l?.loteId || !l?.centroId) throw new HttpsError('invalid-argument', 'Cada línea necesita producto, lote y centro.');
    if (!Number.isInteger(cantidad) || cantidad <= 0) throw new HttpsError('invalid-argument', 'La cantidad debe ser un número entero mayor a cero.');
    return { productoId: String(l.productoId), loteId: String(l.loteId), centroId: String(l.centroId), cantidad };
  }));

  return db.runTransaction(async (t) => {
    const productoIds = [...new Set(lineas.map((l) => l.productoId))];
    const loteIds = [...new Set(lineas.map((l) => l.loteId))];
    const centroIds = [...new Set(lineas.map((l) => l.centroId))];
    const [snapEstado, snapContadores, ...resto] = await Promise.all([
      t.get(refEstado(db)),
      t.get(refControl(db)),
      ...productoIds.map((id) => t.get(db.collection(COL.productos).doc(id))),
      ...loteIds.map((id) => t.get(db.collection(COL.lotes).doc(id))),
      ...centroIds.map((id) => t.get(db.collection('maestros_centros').doc(id))),
      ...centroIds.map((id) => t.get(refTransitoCentro(db, id))),
    ]);
    const snapsProductos = resto.slice(0, productoIds.length);
    const snapsLotes = resto.slice(productoIds.length, productoIds.length + loteIds.length);
    const snapsCentros = resto.slice(productoIds.length + loteIds.length, productoIds.length + loteIds.length + centroIds.length);
    const snapsTotales = resto.slice(productoIds.length + loteIds.length + centroIds.length);

    const productos = new Map(snapsProductos.filter((x) => x.exists).map((x) => [x.id, { id: x.id, ...x.data() }]));
    const lotes = new Map(snapsLotes.filter((x) => x.exists).map((x) => [x.id, x.data()]));
    const centros = new Map(snapsCentros.filter((x) => x.exists).map((x) => [x.id, x.data()]));
    const errores = [];
    lineas.forEach((l) => {
      const p = productos.get(l.productoId);
      const lote = lotes.get(l.loteId);
      const centro = centros.get(l.centroId);
      if (!p) errores.push('Un producto ya no existe.');
      if (!lote || lote.productoId !== l.productoId) errores.push(`${p?.nombre || 'Producto'}: el lote ya no existe.`);
      if (!centro) errores.push('Un centro elegido ya no existe.');
      else if (centro.estado === 'INACTIVO') errores.push(`El centro ${centro.nombre} está inactivo.`);
    });
    exigirSinErrores([...new Set(errores)]);
    exigirSinInventario(snapEstado, [...productos.values()], 'sacar stock');

    // Saldos en memoria.
    const saldoLote = new Map(loteIds.map((id) => [id, saldoDe(lotes.get(id))]));
    const saldoProducto = new Map(productoIds.map((id) => [id, saldoDe(productos.get(id))]));
    const totalesCentro = new Map(centroIds.map((id, i) => [id, snapsTotales[i].exists ? snapsTotales[i].data() : {}]));
    const nuevosAbiertos = new Map(centroIds.map((id) => [id, 0]));
    const pasos = conErrorStock(() => lineas.map((l, orden) => {
      const mov = { tipo: 'SALIDA_A_TRANSITO', cantidad: l.cantidad, centroId: l.centroId, productoId: l.productoId };
      const p = productos.get(l.productoId);
      try {
        saldoLote.set(l.loteId, aplicarMovimiento(saldoLote.get(l.loteId), mov));
      } catch (error) {
        const lote = lotes.get(l.loteId);
        throw new ErrorStock(`${p.nombre} lote ${lote.lote || 'S/L'}: ${error.message}`);
      }
      saldoProducto.set(l.productoId, aplicarMovimiento(saldoProducto.get(l.productoId), mov));
      totalesCentro.set(l.centroId, aplicarMovimientoCentro(totalesCentro.get(l.centroId), mov));
      nuevosAbiertos.set(l.centroId, nuevosAbiertos.get(l.centroId) + 1);
      return { l, orden, saldoLote: saldoLote.get(l.loteId), saldoProducto: saldoProducto.get(l.productoId) };
    }));

    // Escrituras.
    const numero = (snapContadores.data()?.salidas || 0) + 1;
    t.set(refControl(db), { salidas: numero }, { merge: true });
    const refSalida = db.collection(COL.salidas).doc();
    loteIds.forEach((id) => {
      const s = saldoLote.get(id);
      t.set(db.collection(COL.lotes).doc(id), {
        ...lotes.get(id), disponible: s.disponible, transito: s.transito, transitoPorCentro: s.transitoPorCentro,
        soloCargaInicial: false, ultimoMovimiento: ahora(), ultimoMovimientoTipo: 'SALIDA_A_TRANSITO',
      });
    });
    const productosActualizados = productoIds.map((id) => {
      const s = saldoProducto.get(id);
      t.update(db.collection(COL.productos).doc(id), { ...s, conMovimientos: true, actualizadoEn: ahora() });
      return { id, ...s, conMovimientos: true };
    });
    centroIds.forEach((id, i) => {
      const previo = snapsTotales[i].exists ? snapsTotales[i].data() : {};
      const tot = totalesCentro.get(id);
      t.set(refTransitoCentro(db, id), {
        centroId: id, centroNombre: centros.get(id).nombre || '', unidades: tot.unidades, productos: tot.productos,
        productosDistintos: tot.productosDistintos, transitosAbiertos: (previo.transitosAbiertos || 0) + nuevosAbiertos.get(id),
        actualizadoEn: ahora(),
      });
    });
    const resumenPorCentro = {};
    pasos.forEach(({ l, orden, saldoLote: sl, saldoProducto: sp }) => {
      const p = productos.get(l.productoId);
      const lote = lotes.get(l.loteId);
      const centroNombre = centros.get(l.centroId).nombre || '';
      const refTransito = db.collection(COL.transitos).doc();
      const base = {
        productoId: l.productoId, productoNombre: p.nombre, codigoMaestro: p.codigoMaestro, categoriaId: p.categoriaId || null,
        loteId: l.loteId, lote: lote.lote || null, vencimiento: lote.vencimiento || null, centroId: l.centroId, centroNombre,
      };
      t.set(refTransito, {
        ...base, salidaId: refSalida.id, salidaNumero: numero, cantidadSalida: l.cantidad, pendiente: l.cantidad, entregado: 0, devuelto: 0,
        estado: ESTADOS_TRANSITO.ABIERTO, fechaSalida: ahora(), usuario: por, solicitante, observacion, ultimaAccionEn: ahora(),
      });
      t.set(refTransito.collection('historial').doc(), { accion: 'SALIDA', cantidad: l.cantidad, observacion, usuario: por, fecha: ahora() });
      t.set(db.collection(COL.movimientos).doc(), {
        ...base, tipo: 'SALIDA_A_TRANSITO', fecha: ahora(), orden, usuario: por, cantidad: l.cantidad,
        saldoLote: { disponible: sl.disponible, transito: sl.transito }, saldoProducto: { disponible: sp.disponible, transito: sp.transito },
        transitoId: refTransito.id, documentoRef: { id: refSalida.id, tipo: 'SALIDA', numero: String(numero) },
        observacion, solicitante,
      });
      const r = resumenPorCentro[l.centroId] || { nombre: centroNombre, lineas: 0, unidades: 0 };
      resumenPorCentro[l.centroId] = { ...r, lineas: r.lineas + 1, unidades: r.unidades + l.cantidad };
    });
    t.set(refSalida, {
      numero, fecha: ahora(), usuario: por, solicitante, observacion, resumenPorCentro,
      lineas: lineas.map((l) => ({ ...l, productoNombre: productos.get(l.productoId).nombre, lote: lotes.get(l.loteId).lote || null, centroNombre: centros.get(l.centroId).nombre || '' })),
      totalUnidades: lineas.reduce((n, l) => n + l.cantidad, 0),
    });
    return { id: refSalida.id, numero, lineas: lineas.length, productos: productosActualizados };
  });
};

const egresar = async (db, uid, datos = {}) => {
  const perfil = await perfilActivo(db, uid);
  exigir(perfil, ACCIONES.confirmarEgreso);
  return egresarComo(db, datosPor(uid, perfil), datos);
};

// Acciones sobre tránsitos (de a una o varias): ENTREGAR (sale
// definitivamente; exige N° de admisión y observación), DEVOLVER (vuelve al disponible
// de la Bodega General) o NOTA (seguimiento, no mueve stock). Cantidades
// parciales. Todo en UNA transacción.
//   datos: { origen: 'transito'|'centros', acciones: [{ transitoId, accion,
//            cantidad, idEntrega, observacion, nota }] }
const gestionarTransitoComo = (db, por, datos = {}) => {
  const acciones = Array.isArray(datos.acciones) ? datos.acciones : [];
  if (!acciones.length) throw new HttpsError('invalid-argument', 'No hay acciones.');
  if (acciones.length > MAX_ACCIONES_TRANSITO) throw new HttpsError('invalid-argument', `Máximo ${MAX_ACCIONES_TRANSITO} registros por vez.`);
  const texto = (v, max) => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
  const normalizadas = acciones.map((a) => {
    const accion = String(a?.accion || '');
    if (!['ENTREGAR', 'DEVOLVER', 'NOTA'].includes(accion)) throw new HttpsError('invalid-argument', 'Acción inválida.');
    if (!a?.transitoId) throw new HttpsError('invalid-argument', 'Falta el registro de tránsito.');
    const n = { transitoId: String(a.transitoId), accion, cantidad: Number(a.cantidad), observacion: texto(a.observacion, MAX_OBSERVACION), nota: texto(a.nota, MAX_NOTA), idEntrega: '' };
    if (accion === 'ENTREGAR') {
      const { valor, error } = normalizarIdEntrega(a.idEntrega);
      if (error) throw new HttpsError('invalid-argument', error);
      if (!n.observacion) throw new HttpsError('invalid-argument', 'La observación es obligatoria para entregar.');
      n.idEntrega = valor;
    }
    if (accion === 'NOTA' && !n.nota) throw new HttpsError('invalid-argument', 'Escribe la nota.');
    return n;
  });

  return db.runTransaction(async (t) => {
    const transitoIds = [...new Set(normalizadas.map((a) => a.transitoId))];
    const snapsTransitos = await Promise.all(transitoIds.map((id) => t.get(db.collection(COL.transitos).doc(id))));
    const transitos = new Map(snapsTransitos.filter((x) => x.exists).map((x) => [x.id, x.data()]));
    if (transitos.size !== transitoIds.length) throw new HttpsError('not-found', 'Un registro de tránsito ya no existe.');
    const mueven = normalizadas.filter((a) => a.accion !== 'NOTA');
    const loteIds = [...new Set(mueven.map((a) => transitos.get(a.transitoId).loteId))];
    const productoIds = [...new Set(mueven.map((a) => transitos.get(a.transitoId).productoId))];
    const centroIds = [...new Set(mueven.map((a) => transitos.get(a.transitoId).centroId))];
    const [snapEstado, ...resto] = await Promise.all([
      t.get(refEstado(db)),
      ...loteIds.map((id) => t.get(db.collection(COL.lotes).doc(id))),
      ...productoIds.map((id) => t.get(db.collection(COL.productos).doc(id))),
      ...centroIds.map((id) => t.get(refTransitoCentro(db, id))),
    ]);
    const lotes = new Map(resto.slice(0, loteIds.length).map((x) => [x.id, x.data()]));
    const productos = new Map(resto.slice(loteIds.length, loteIds.length + productoIds.length).map((x) => [x.id, x.exists ? { id: x.id, ...x.data() } : null]));
    const totales = new Map(resto.slice(loteIds.length + productoIds.length).map((x) => [x.id, x.exists ? x.data() : {}]));
    if ([...lotes.values()].some((l) => !l) || [...productos.values()].some((p) => !p)) throw new HttpsError('failed-precondition', 'El lote o el producto de un tránsito ya no existe.');
    // Devolver suma al disponible: no se permite con un inventario abierto
    // que incluya el producto. Entregar sí (no toca la bodega).
    exigirSinInventario(snapEstado, normalizadas.filter((a) => a.accion === 'DEVOLVER').map((a) => productos.get(transitos.get(a.transitoId).productoId)), 'devolver stock');

    const estadoTransito = new Map([...transitos.entries()].map(([id, tr]) => [id, { ...tr }]));
    const saldoLote = new Map(loteIds.map((id) => [id, saldoDe(lotes.get(id))]));
    const saldoProducto = new Map(productoIds.map((id) => [id, saldoDe(productos.get(id))]));
    const totalesCentro = new Map(centroIds.map((id) => [id, totales.get(id)]));
    const cerrados = new Map(centroIds.map((id) => [id, 0]));
    const pasos = conErrorStock(() => normalizadas.map((a, orden) => {
      const tr = estadoTransito.get(a.transitoId);
      if (tr.estado !== ESTADOS_TRANSITO.ABIERTO && a.accion !== 'NOTA') throw new ErrorStock(`${tr.productoNombre} (${tr.centroNombre}): el registro ya está cerrado.`);
      if (a.accion === 'NOTA') return { a, orden, tr };
      let nuevo;
      try {
        nuevo = aplicarAccionTransito(tr, a);
      } catch (error) {
        throw new ErrorStock(`${tr.productoNombre} (${tr.centroNombre}): ${error.message}`);
      }
      estadoTransito.set(a.transitoId, nuevo);
      if (nuevo.estado === ESTADOS_TRANSITO.CERRADO) cerrados.set(tr.centroId, cerrados.get(tr.centroId) + 1);
      const mov = { tipo: MOVIMIENTO_DE_ACCION[a.accion], cantidad: a.cantidad, centroId: tr.centroId, productoId: tr.productoId };
      saldoLote.set(tr.loteId, aplicarMovimiento(saldoLote.get(tr.loteId), mov));
      saldoProducto.set(tr.productoId, aplicarMovimiento(saldoProducto.get(tr.productoId), mov));
      totalesCentro.set(tr.centroId, aplicarMovimientoCentro(totalesCentro.get(tr.centroId), mov));
      return { a, orden, tr, mov, sl: saldoLote.get(tr.loteId), sp: saldoProducto.get(tr.productoId) };
    }));

    // Escrituras.
    transitoIds.forEach((id) => {
      const tr = estadoTransito.get(id);
      t.update(db.collection(COL.transitos).doc(id), {
        pendiente: tr.pendiente, entregado: tr.entregado || 0, devuelto: tr.devuelto || 0, estado: tr.estado,
        ultimaAccionEn: ahora(), ...(tr.estado === ESTADOS_TRANSITO.CERRADO && transitos.get(id).estado !== ESTADOS_TRANSITO.CERRADO ? { cerradoEn: ahora() } : {}),
      });
    });
    loteIds.forEach((id) => {
      const s = saldoLote.get(id);
      t.set(db.collection(COL.lotes).doc(id), {
        ...lotes.get(id), disponible: s.disponible, transito: s.transito, transitoPorCentro: s.transitoPorCentro,
        soloCargaInicial: false, ultimoMovimiento: ahora(),
      });
    });
    const productosActualizados = productoIds.map((id) => {
      const s = saldoProducto.get(id);
      t.update(db.collection(COL.productos).doc(id), { ...s, actualizadoEn: ahora() });
      return { id, ...s };
    });
    centroIds.forEach((id) => {
      const tot = totalesCentro.get(id);
      t.set(refTransitoCentro(db, id), {
        ...totales.get(id), unidades: tot.unidades, productos: tot.productos, productosDistintos: tot.productosDistintos,
        transitosAbiertos: Math.max(0, (totales.get(id).transitosAbiertos || 0) - cerrados.get(id)), actualizadoEn: ahora(),
      });
    });
    pasos.forEach(({ a, orden, tr, mov, sl, sp }) => {
      const refT = db.collection(COL.transitos).doc(a.transitoId);
      t.set(refT.collection('historial').doc(), {
        accion: a.accion, cantidad: a.accion === 'NOTA' ? null : a.cantidad, idEntrega: a.idEntrega || '',
        observacion: a.observacion, nota: a.nota, usuario: por, fecha: ahora(),
      });
      if (!mov) return;
      t.set(db.collection(COL.movimientos).doc(), {
        tipo: mov.tipo, fecha: ahora(), orden, usuario: por,
        productoId: tr.productoId, productoNombre: tr.productoNombre, codigoMaestro: tr.codigoMaestro, categoriaId: tr.categoriaId || null,
        loteId: tr.loteId, lote: tr.lote, vencimiento: tr.vencimiento, cantidad: a.cantidad,
        saldoLote: { disponible: sl.disponible, transito: sl.transito }, saldoProducto: { disponible: sp.disponible, transito: sp.transito },
        centroId: tr.centroId, centroNombre: tr.centroNombre, transitoId: a.transitoId,
        documentoRef: { id: tr.salidaId, tipo: 'SALIDA', numero: String(tr.salidaNumero) },
        idEntrega: a.idEntrega || '', observacion: a.observacion,
      });
    });
    return {
      transitos: transitoIds.map((id) => ({ id, ...(({ pendiente, entregado, devuelto, estado }) => ({ pendiente, entregado, devuelto, estado }))(estadoTransito.get(id)) })),
      productos: productosActualizados,
    };
  });
};

const gestionarTransito = async (db, uid, datos = {}) => {
  const perfil = await perfilActivo(db, uid);
  const origen = datos.origen === 'centros' ? 'centros' : 'transito';
  const acciones = Array.isArray(datos.acciones) ? datos.acciones : [];
  [...new Set(acciones.map((a) => a?.accion))].forEach((accion) => {
    if (!['ENTREGAR', 'DEVOLVER', 'NOTA'].includes(accion)) throw new HttpsError('invalid-argument', 'Acción inválida.');
    exigir(perfil, accionTransito(origen, accion));
  });
  return gestionarTransitoComo(db, datosPor(uid, perfil), datos);
};

// --- Inventario físico -------------------------------------------------------
//
//   bodega_inventarios/{id} = { nombre, alcance: { categorias: [] (vacío =
//     todo) }, estado: PREPARANDO|ABIERTO|CERRANDO|CERRADO|ANULADO,
//     iniciadoPor, fechaInicio, lineasTotal, motivoAjuste, noContados,
//     cerradoPor, fechaCierre, resumen }
//     /lineas/{loteId} = { productoId, productoNombre, codigoMaestro,
//       categoriaId, loteId, lote, vencimiento, teorico (foto del disponible),
//       contado (null = no contado), agregado (lote que no estaba), precio,
//       contadoPor, contadoEn, ajuste, ajustado }
//   bodega_control/estado.inventarioAbierto = { id, nombre, alcance } (uno a
//   la vez): bloquea mover stock de los productos del alcance.

const refInventario = (db, id) => db.collection(COL.inventarios).doc(id);
const LOTE_ESCRITURA = 400;
const LINEAS_POR_AJUSTE = 50;
const precioDe = (p) => Number(p?.maestroCodigo?.precioNeto) || 0;
const enAlcance = (alcance, producto) => !(alcance?.categorias || []).length || alcance.categorias.includes(producto?.categoriaId || '');

// Foto del stock: una línea por lote con disponible > 0 de los productos
// del alcance. Idempotente (id de línea = id del lote): se puede reanudar.
const prepararLineas = async (db, id) => {
  const inv = (await refInventario(db, id).get()).data();
  const [snapProductos, snapLotes] = await Promise.all([
    db.collection(COL.productos).get(),
    db.collection(COL.lotes).where('disponible', '>', 0).get(),
  ]);
  const productos = new Map(snapProductos.docs.map((d) => [d.id, { id: d.id, ...d.data() }]));
  const lineas = snapLotes.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((l) => productos.has(l.productoId) && enAlcance(inv.alcance, productos.get(l.productoId)));
  for (let i = 0; i < lineas.length; i += LOTE_ESCRITURA) {
    const lote = db.batch();
    lineas.slice(i, i + LOTE_ESCRITURA).forEach((l) => {
      const p = productos.get(l.productoId);
      lote.set(refInventario(db, id).collection('lineas').doc(l.id), {
        productoId: l.productoId, productoNombre: p.nombre, codigoMaestro: p.codigoMaestro, categoriaId: p.categoriaId || null,
        loteId: l.id, lote: l.lote || null, vencimiento: l.vencimiento || null, teorico: l.disponible, contado: null,
        agregado: false, precio: precioDe(p), ajustado: false,
      }, { merge: true });
    });
    await lote.commit();
  }
  await refInventario(db, id).update({ estado: ESTADOS_INVENTARIO.ABIERTO, lineasTotal: lineas.length, preparadoEn: ahora() });
  return lineas.length;
};

// Inicia un inventario (total o por categorías). Primero bloquea los
// movimientos (bodega_control/estado) y recién después saca la foto: así el
// teórico no cambia mientras se arma.
const iniciarInventario = async (db, uid, datos = {}) => {
  const perfil = await perfilActivo(db, uid);
  exigir(perfil, ACCIONES.iniciarInventario);
  const por = datosPor(uid, perfil);
  const nombre = String(datos.nombre || '').trim().replace(/\s+/g, ' ').slice(0, MAX_NOMBRE_INVENTARIO);
  if (!nombre) throw new HttpsError('invalid-argument', 'Escribe un nombre para el inventario.');
  const categorias = [...new Set((Array.isArray(datos.categorias) ? datos.categorias : []).map(String).filter(Boolean))].slice(0, 30);

  const id = await db.runTransaction(async (t) => {
    const [snapEstado, ...snapsCategorias] = await Promise.all([
      t.get(refEstado(db)),
      ...categorias.map((c) => t.get(db.collection(COL.catalogos).doc(c))),
    ]);
    const abierto = snapEstado.data()?.inventarioAbierto;
    if (abierto?.id) throw new HttpsError('failed-precondition', `Ya hay un inventario abierto: ${abierto.nombre}. Ciérralo o anúlalo antes de iniciar otro.`);
    if (snapsCategorias.some((c) => !c.exists || c.data().tipo !== 'CATEGORIA')) throw new HttpsError('invalid-argument', 'Una categoría elegida no existe.');
    const ref = db.collection(COL.inventarios).doc();
    const alcance = { categorias, categoriasNombres: snapsCategorias.map((c) => c.data().nombre) };
    t.set(ref, { nombre, alcance, estado: ESTADOS_INVENTARIO.PREPARANDO, iniciadoPor: por, fechaInicio: ahora(), lineasTotal: 0 });
    t.set(refEstado(db), { inventarioAbierto: { id: ref.id, nombre, alcance } }, { merge: true });
    return ref.id;
  });
  const lineas = await prepararLineas(db, id);
  return { id, lineas };
};

// Reanuda la preparación si se cortó (estado PREPARANDO).
const reanudarInventario = async (db, uid, datos = {}) => {
  const perfil = await perfilActivo(db, uid);
  exigir(perfil, ACCIONES.iniciarInventario);
  const id = String(datos.id || '');
  const inv = (await refInventario(db, id).get()).data();
  if (!inv) throw new HttpsError('not-found', 'El inventario no existe.');
  if (inv.estado === ESTADOS_INVENTARIO.PREPARANDO) return { id, lineas: await prepararLineas(db, id) };
  if (inv.estado === ESTADOS_INVENTARIO.CERRANDO) return cerrarInventarioComo(db, inv.cerradoPor, { id, motivo: inv.motivoAjuste, noContados: inv.noContados });
  return { id, estado: inv.estado };
};

// Registra conteos: [{ productoId, lote, vencimiento, cantidad }] con
// modo 'sumar' (escaneo) o 'reemplazar' (corrección). Un lote que no
// estaba en la foto se agrega (teórico 0 o su disponible actual si existe).
const registrarConteo = async (db, uid, datos = {}) => {
  const perfil = await perfilActivo(db, uid);
  exigir(perfil, ACCIONES.contarInventario);
  const por = datosPor(uid, perfil);
  const id = String(datos.inventarioId || '');
  const modo = datos.modo === 'reemplazar' ? 'reemplazar' : 'sumar';
  const entrada = Array.isArray(datos.conteos) ? datos.conteos : [];
  if (!entrada.length) throw new HttpsError('invalid-argument', 'No hay conteos.');
  if (entrada.length > MAX_CONTEOS_POR_ENVIO) throw new HttpsError('invalid-argument', `Máximo ${MAX_CONTEOS_POR_ENVIO} conteos por envío.`);

  return db.runTransaction(async (t) => {
    const productoIds = [...new Set(entrada.map((c) => String(c?.productoId || '')).filter(Boolean))];
    const [snapInv, ...snapsProductos] = await Promise.all([
      t.get(refInventario(db, id)),
      ...productoIds.map((pid) => t.get(db.collection(COL.productos).doc(pid))),
    ]);
    if (!snapInv.exists) throw new HttpsError('not-found', 'El inventario no existe.');
    const inv = snapInv.data();
    if (inv.estado !== ESTADOS_INVENTARIO.ABIERTO) throw new HttpsError('failed-precondition', 'El inventario no está abierto para contar.');
    const productos = new Map(snapsProductos.filter((x) => x.exists).map((x) => [x.id, { id: x.id, ...x.data() }]));
    const errores = [];
    const conteos = entrada.map((c) => {
      const p = productos.get(String(c?.productoId || '')) || null;
      const cantidad = Number(c?.cantidad);
      const r = validarLinea({ ...c, cantidad: modo === 'reemplazar' && cantidad === 0 ? 1 : cantidad }, p);
      errores.push(...r.errores.filter((e) => !/inactivo/.test(e)));
      if (p && !enAlcance(inv.alcance, p)) errores.push(`${p.nombre} no está en el alcance de este inventario.`);
      return { ...r.linea, cantidad, loteId: idLote(r.linea.productoId, r.linea.lote, r.linea.vencimiento) };
    });
    exigirSinErrores([...new Set(errores)]);

    const loteIds = [...new Set(conteos.map((c) => c.loteId))];
    const snapsLineas = await Promise.all(loteIds.map((l) => t.get(refInventario(db, id).collection('lineas').doc(l))));
    const lineasNuevas = loteIds.filter((l, i) => !snapsLineas[i].exists);
    const snapsLotes = await Promise.all(lineasNuevas.map((l) => t.get(db.collection(COL.lotes).doc(l))));
    const lotesExistentes = new Map(lineasNuevas.map((l, i) => [l, snapsLotes[i].exists ? snapsLotes[i].data() : null]));
    const estado = new Map(loteIds.map((l, i) => [l, snapsLineas[i].exists ? snapsLineas[i].data() : null]));

    conErrorStock(() => conteos.forEach((c) => {
      const p = productos.get(c.productoId);
      const previa = estado.get(c.loteId) || {
        productoId: c.productoId, productoNombre: p.nombre, codigoMaestro: p.codigoMaestro, categoriaId: p.categoriaId || null,
        loteId: c.loteId, lote: c.lote, vencimiento: c.vencimiento, teorico: lotesExistentes.get(c.loteId)?.disponible || 0,
        contado: null, agregado: true, precio: precioDe(p), ajustado: false,
      };
      estado.set(c.loteId, { ...previa, contado: aplicarConteo(previa.contado, { cantidad: c.cantidad, modo }) });
    }));
    loteIds.forEach((l) => {
      t.set(refInventario(db, id).collection('lineas').doc(l), { ...estado.get(l), contadoPor: por, contadoEn: ahora() });
    });
    if (lineasNuevas.length) t.update(refInventario(db, id), { lineasTotal: FieldValue.increment(lineasNuevas.length) });
    return { lineas: loteIds.map((l) => ({ id: l, contado: estado.get(l).contado, teorico: estado.get(l).teorico, agregado: estado.get(l).agregado })) };
  });
};

// Cierra con ajuste: deja cada lote igual a lo contado con movimientos
// AJUSTE_POSITIVO / AJUSTE_NEGATIVO (motivo obligatorio). Se hace por
// tandas (cada línea queda marcada `ajustado`), así que si se corta se
// puede reanudar sin duplicar. Al terminar, el inventario queda CERRADO
// (no editable) y se liberan los movimientos.
const cerrarInventarioComo = async (db, por, { id, motivo, noContados }) => {
  const motivoLimpio = String(motivo || '').trim().replace(/\s+/g, ' ').slice(0, MAX_OBSERVACION);
  if (!motivoLimpio) throw new HttpsError('invalid-argument', 'El motivo del ajuste es obligatorio.');
  const criterio = NO_CONTADOS[noContados] ? noContados : 'IGNORAR';
  const ref = refInventario(db, id);

  const inv = await db.runTransaction(async (t) => {
    const snap = await t.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'El inventario no existe.');
    const d = snap.data();
    if (d.estado !== ESTADOS_INVENTARIO.ABIERTO && d.estado !== ESTADOS_INVENTARIO.CERRANDO) throw new HttpsError('failed-precondition', 'El inventario no está abierto.');
    if (d.estado === ESTADOS_INVENTARIO.ABIERTO) {
      t.update(ref, { estado: ESTADOS_INVENTARIO.CERRANDO, motivoAjuste: motivoLimpio, noContados: criterio, cerradoPor: por, inicioCierre: ahora() });
      return { ...d, motivoAjuste: motivoLimpio, noContados: criterio, cerradoPor: por };
    }
    return d; // reanudación: se respetan motivo y criterio guardados
  });

  const lineas = (await ref.collection('lineas').get()).docs.map((d) => ({ id: d.id, ...d.data() }));
  const pendientes = lineas.filter((l) => !l.ajustado);
  for (let i = 0; i < pendientes.length; i += LINEAS_POR_AJUSTE) {
    const tanda = pendientes.slice(i, i + LINEAS_POR_AJUSTE);
    await db.runTransaction(async (t) => {
      const productoIds = [...new Set(tanda.map((l) => l.productoId))];
      const [snapsLineas, snapsLotes, snapsProductos] = await Promise.all([
        Promise.all(tanda.map((l) => t.get(ref.collection('lineas').doc(l.id)))),
        Promise.all(tanda.map((l) => t.get(db.collection(COL.lotes).doc(l.loteId)))),
        Promise.all(productoIds.map((pid) => t.get(db.collection(COL.productos).doc(pid)))),
      ]);
      const saldoProducto = new Map(snapsProductos.map((x) => [x.id, saldoDe(x.data())]));
      let orden = 0;
      tanda.forEach((l, k) => {
        const linea = snapsLineas[k].data();
        if (linea.ajustado) return;
        const loteActual = snapsLotes[k].exists ? snapsLotes[k].data() : null;
        const disponibleActual = loteActual?.disponible || 0;
        const { contadoFinal } = diferenciaLinea(linea, inv.noContados);
        const ajuste = contadoFinal - disponibleActual;
        if (ajuste !== 0) {
          const tipo = ajuste > 0 ? 'AJUSTE_POSITIVO' : 'AJUSTE_NEGATIVO';
          const mov = { tipo, cantidad: Math.abs(ajuste) };
          const sl = conErrorStock(() => aplicarMovimiento(saldoDe(loteActual), mov));
          const sp = conErrorStock(() => aplicarMovimiento(saldoProducto.get(linea.productoId), mov));
          saldoProducto.set(linea.productoId, sp);
          t.set(db.collection(COL.lotes).doc(linea.loteId), {
            ...(loteActual || { productoId: linea.productoId, lote: linea.lote, vencimiento: linea.vencimiento, creadoEn: ahora() }),
            disponible: sl.disponible, transito: sl.transito, transitoPorCentro: sl.transitoPorCentro,
            soloCargaInicial: false, ultimoMovimiento: ahora(), ultimoMovimientoTipo: tipo,
          });
          t.set(db.collection(COL.movimientos).doc(), {
            tipo, fecha: ahora(), orden: orden++, usuario: inv.cerradoPor,
            productoId: linea.productoId, productoNombre: linea.productoNombre, codigoMaestro: linea.codigoMaestro, categoriaId: linea.categoriaId || null,
            loteId: linea.loteId, lote: linea.lote, vencimiento: linea.vencimiento, cantidad: Math.abs(ajuste),
            saldoLote: { disponible: sl.disponible, transito: sl.transito }, saldoProducto: { disponible: sp.disponible, transito: sp.transito },
            centroId: null, documentoRef: { id, tipo: 'INVENTARIO', nombre: inv.nombre }, observacion: inv.motivoAjuste,
          });
        }
        t.update(ref.collection('lineas').doc(linea.loteId), { ajustado: true, ajuste, contadoFinal });
      });
      productoIds.forEach((pid) => {
        const s = saldoProducto.get(pid);
        t.update(db.collection(COL.productos).doc(pid), { ...s, conMovimientos: true, actualizadoEn: ahora() });
      });
    });
  }

  const resumen = resumenInventario(lineas, inv.noContados);
  await db.runTransaction(async (t) => {
    const snapEstado = await t.get(refEstado(db));
    t.update(ref, { estado: ESTADOS_INVENTARIO.CERRADO, fechaCierre: ahora(), resumen });
    if (snapEstado.data()?.inventarioAbierto?.id === id) t.set(refEstado(db), { inventarioAbierto: null }, { merge: true });
  });
  return { id, estado: ESTADOS_INVENTARIO.CERRADO, resumen };
};

const cerrarInventario = async (db, uid, datos = {}) => {
  const perfil = await perfilActivo(db, uid);
  exigir(perfil, ACCIONES.cerrarInventario);
  return cerrarInventarioComo(db, datosPor(uid, perfil), { id: String(datos.id || ''), motivo: datos.motivo, noContados: datos.noContados });
};

// Anula un inventario abierto sin tocar el stock (libera los movimientos).
const anularInventario = async (db, uid, datos = {}) => {
  const perfil = await perfilActivo(db, uid);
  exigir(perfil, ACCIONES.anularInventario);
  const id = String(datos.id || '');
  const motivo = String(datos.motivo || '').trim().slice(0, MAX_OBSERVACION);
  if (!motivo) throw new HttpsError('invalid-argument', 'Escribe el motivo de la anulación.');
  return db.runTransaction(async (t) => {
    const [snap, snapEstado] = await Promise.all([t.get(refInventario(db, id)), t.get(refEstado(db))]);
    if (!snap.exists) throw new HttpsError('not-found', 'El inventario no existe.');
    if (![ESTADOS_INVENTARIO.ABIERTO, ESTADOS_INVENTARIO.PREPARANDO].includes(snap.data().estado)) {
      throw new HttpsError('failed-precondition', 'Solo se puede anular un inventario abierto (uno en cierre se termina de cerrar).');
    }
    t.update(snap.ref, { estado: ESTADOS_INVENTARIO.ANULADO, anuladoPor: datosPor(uid, perfil), fechaAnulacion: ahora(), motivoAnulacion: motivo });
    if (snapEstado.data()?.inventarioAbierto?.id === id) t.set(refEstado(db), { inventarioAbierto: null }, { merge: true });
    return { id, estado: ESTADOS_INVENTARIO.ANULADO };
  });
};

// --- Cajas (kits con stock objetivo) ------------------------------------------
//
//   bodega_cajas/{id} = { nombre, descripcion, activa,
//     productos: { [productoId]: { nombre, codigoMaestro, stockObjetivo, stockActual } },
//     cantidadProductos, totalObjetivo, totalActual, totalFaltante, completitud,
//     ultimoInventario, ultimaReposicion, creadoPor/En, actualizadoPor/En }
//     /inventarios/{id}  y  /reposiciones/{id}: historial (no los lee el listado).
//   bodega_unicos/caja__{nombre}: candado del nombre único.

const refCaja = (db, id) => db.collection(COL.cajas).doc(id);
const conTotales = (productos) => ({ productos, ...totalesCaja(productos) });

// Crear / editar / desactivar. El stock actual de un producto que ya estaba
// se conserva (solo lo cambian inventario y reposición); uno nuevo parte en 0.
const guardarCajaComo = (db, por, datos = {}) => {
  const { errores, caja, productos } = validarCaja(datos);
  exigirSinErrores(errores);
  const id = datos.id ? String(datos.id) : null;
  return db.runTransaction(async (t) => {
    const ref = id ? refCaja(db, id) : db.collection(COL.cajas).doc();
    const refNuevoUnico = refUnico(db, idUnico.caja(caja.nombre));
    const [snap, snapUnico, ...snapsProductos] = await Promise.all([
      id ? t.get(ref) : null,
      t.get(refNuevoUnico),
      ...productos.map((p) => t.get(db.collection(COL.productos).doc(p.productoId))),
    ]);
    const antes = snap?.data();
    if (id && !antes) throw new HttpsError('not-found', 'La caja ya no existe.');
    if (snapUnico.exists && snapUnico.data().refId !== ref.id) throw new HttpsError('already-exists', `Ya existe una caja llamada "${caja.nombre}".`);
    const previos = antes?.productos || {};
    const erroresProductos = [];
    const mapa = {};
    productos.forEach((p, i) => {
      const s = snapsProductos[i];
      if (!s.exists) { erroresProductos.push('Un producto ya no existe en el maestro.'); return; }
      const d = s.data();
      if (d.activo === false && !previos[p.productoId]) erroresProductos.push(`${d.nombre}: el producto está inactivo.`);
      mapa[p.productoId] = {
        nombre: d.nombre, codigoMaestro: d.codigoMaestro || '', stockObjetivo: p.stockObjetivo,
        stockActual: Number(previos[p.productoId]?.stockActual) || 0,
      };
    });
    exigirSinErrores([...new Set(erroresProductos)]);

    if (antes && antes.nombre !== caja.nombre) t.delete(refUnico(db, idUnico.caja(antes.nombre)));
    t.set(refNuevoUnico, { tipo: 'caja', refId: ref.id });
    const documento = {
      ...caja, ...conTotales(mapa),
      ...(antes ? {} : { creadoPor: por, creadoEn: ahora(), ultimoInventario: null, ultimaReposicion: null }),
      actualizadoPor: por, actualizadoEn: ahora(),
    };
    // set sin merge: el mapa de productos se reemplaza entero (los quitados desaparecen).
    t.set(ref, antes ? { ...antes, ...documento } : documento);
    registrarLog(t, ref, antes ? 'EDICION' : 'CREACION', por, {
      antes: antes ? { nombre: antes.nombre, activa: antes.activa, productos: Object.keys(previos).length } : null,
      despues: { ...caja, productos: Object.keys(mapa).length },
    });
    return { id: ref.id };
  });
};

const guardarCaja = async (db, uid, datos) => {
  const perfil = await perfilActivo(db, uid);
  exigir(perfil, ACCIONES.guardarCaja);
  return guardarCajaComo(db, datosPor(uid, perfil), datos);
};

module.exports = {
  guardarCaja,
  guardarCajaComo,
  iniciarInventario,
  reanudarInventario,
  registrarConteo,
  cerrarInventario,
  cerrarInventarioComo,
  anularInventario,
  egresar,
  egresarComo,
  gestionarTransito,
  gestionarTransitoComo,
  guardarBorrador,
  eliminarBorrador,
  confirmarDocumento,
  confirmarDocumentoComo,
  configurarCargaInicial,
  guardarCatalogo,
  guardarCatalogoComo,
  guardarProducto,
  guardarProductoComo,
  vincularCodigo,
  vincularCodigoComo,
  desvincularCodigo,
  lecturaParaVincular,
};
