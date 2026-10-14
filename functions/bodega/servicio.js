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
      return { productoId: String(l.productoId), lote: normalizarLote(l.lote).slice(0, 40), vencimiento: texto(l.vencimiento, 10), cantidad, codigoLeido: String(l.codigoLeido || '').slice(0, 300) };
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

module.exports = {
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
