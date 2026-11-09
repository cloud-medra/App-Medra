// Maestros → Códigos de barras: agrega, edita, mueve y elimina vínculos del
// registro de Bodega (bodega_codigos_barra). No hay un registro paralelo: el ID
// de cada vínculo sale de su clave, así un código no puede estar en dos
// productos, y `codigosBarra` del producto se mantiene en la misma transacción.
//
// Solo escribe el vínculo y esa lista (con la fecha de actualización del
// producto): nunca saldos, lotes, costos ni movimientos. El `codigoLeido` de
// documentos y kardex es texto histórico y no se corrige.
//
// Quien edita, mueve o elimina envía el producto que vio (`esperadoProductoId`):
// si otro usuario cambió el código entre medio, la operación se rechaza en vez
// de pisar ese cambio.

const { HttpsError } = require('firebase-functions/v2/https');
const { COL, ACCIONES_CODIGO_BARRA } = require('./nucleo.mjs');
const { internos, lecturaParaVincular } = require('./servicio');

const {
  perfilActivo, exigir, datosPor, registrarLog, ahora, datosVinculo, errorVinculadoAOtro, refVinculo,
  resumenProductoCodigo: resumenProducto, valorCodigo, vinculoReasignado, auditarCambioDeDueno,
} = internos;

const refProducto = (db, id) => db.collection(COL.productos).doc(id);

const errorCambioConcurrente = () => new HttpsError('failed-precondition', 'Otro usuario cambió este código recién. Actualiza el listado y revísalo.', { motivo: 'cambio-concurrente' });

const leerVinculoEsperado = async (t, db, clave, esperadoProductoId) => {
  if (!clave || !esperadoProductoId) throw new HttpsError('invalid-argument', 'Faltan el código o el producto.');
  const snap = await t.get(refVinculo(db, clave));
  if (!snap.exists || snap.data().productoId !== esperadoProductoId) throw errorCambioConcurrente();
  return snap;
};

// El producto dueño del código puede no existir (vínculo huérfano): igual se
// debe poder corregir, sin actualizar su lista.
const actualizarLista = (t, snap, lista, por) => {
  if (snap.exists) t.update(snap.ref, { codigosBarra: lista, actualizadoPor: por, actualizadoEn: ahora() });
};
const sinClave = (snap, clave) => (snap.data()?.codigosBarra || []).filter((c) => c !== clave);
const conClave = (lista, clave) => [...new Set([...lista, clave])];
const listaDe = (id, lista) => ({ id, codigosBarra: lista });

const leerProductoDestino = async (t, db, productoId) => {
  if (!productoId) throw new HttpsError('invalid-argument', 'Falta la referencia de destino.');
  const snap = await t.get(refProducto(db, productoId));
  if (!snap.exists) throw new HttpsError('not-found', 'La referencia de destino ya no existe.');
  if (snap.data().activo === false) throw new HttpsError('failed-precondition', 'La referencia de destino está inactiva.');
  return snap;
};

// Un código ocupado se rechaza siempre, también si es del mismo producto:
// quien corrige debe saber a quién pertenece.
const exigirCodigoLibre = async (t, db, lectura) => {
  const snap = await t.get(refVinculo(db, lectura.clave));
  if (!snap.exists) return;
  const dueno = await t.get(refProducto(db, snap.data().productoId));
  throw errorVinculadoAOtro(lectura.codigoLeido, dueno.exists ? { id: dueno.id, ...dueno.data() } : null);
};

const agregar = (db, por, datos) => {
  const lectura = lecturaParaVincular(datos.codigoLeido);
  const productoId = String(datos.productoId || '');
  return db.runTransaction(async (t) => {
    const destino = await leerProductoDestino(t, db, productoId);
    await exigirCodigoLibre(t, db, lectura);
    const lista = conClave(destino.data().codigosBarra || [], lectura.clave);
    t.set(refVinculo(db, lectura.clave), datosVinculo(lectura, productoId, por));
    actualizarLista(t, destino, lista, por);
    registrarLog(t, destino.ref, 'CODIGO_AGREGADO', por, { valorAnterior: null, valorNuevo: valorCodigo(lectura), productoOrigen: null, productoDestino: resumenProducto(productoId, destino.data()) });
    return { clave: lectura.clave, productoId, productos: [listaDe(productoId, lista)] };
  });
};

// Cambiar el valor cambia el ID: se borra y se crea en la misma transacción,
// conservando quién lo vinculó y cuándo.
const editar = (db, por, datos) => {
  const lectura = lecturaParaVincular(datos.codigoLeido);
  const clave = String(datos.clave || '');
  if (lectura.clave === clave) throw new HttpsError('invalid-argument', 'El código nuevo es igual al actual.');
  return db.runTransaction(async (t) => {
    const snap = await leerVinculoEsperado(t, db, clave, String(datos.esperadoProductoId || ''));
    const actual = snap.data();
    await exigirCodigoLibre(t, db, lectura);
    const producto = await t.get(refProducto(db, actual.productoId));
    const lista = conClave(sinClave(producto, clave), lectura.clave);
    t.delete(snap.ref);
    t.set(refVinculo(db, lectura.clave), { ...actual, clave: lectura.clave, codigoLeido: lectura.codigoLeido, modificadoPor: por, modificadoEn: ahora() });
    actualizarLista(t, producto, lista, por);
    const resumen = resumenProducto(actual.productoId, producto.data());
    registrarLog(t, producto.ref, 'CODIGO_EDITADO', por, { valorAnterior: valorCodigo(actual), valorNuevo: valorCodigo(lectura), productoOrigen: resumen, productoDestino: resumen });
    return { clave: lectura.clave, productoId: actual.productoId, productos: [listaDe(actual.productoId, lista)] };
  });
};

const mover = (db, por, datos) => {
  const clave = String(datos.clave || '');
  const destinoId = String(datos.productoDestinoId || '');
  return db.runTransaction(async (t) => {
    const snap = await leerVinculoEsperado(t, db, clave, String(datos.esperadoProductoId || ''));
    const actual = snap.data();
    if (actual.productoId === destinoId) throw new HttpsError('invalid-argument', 'El código ya está en esa referencia.');
    const destino = await leerProductoDestino(t, db, destinoId);
    const origen = await t.get(refProducto(db, actual.productoId));
    const listaOrigen = sinClave(origen, clave);
    const listaDestino = conClave(destino.data().codigosBarra || [], clave);
    t.set(snap.ref, vinculoReasignado(actual, destinoId, por));
    actualizarLista(t, origen, listaOrigen, por);
    actualizarLista(t, destino, listaDestino, por);
    auditarCambioDeDueno(t, 'CODIGO_MOVIDO', por, actual, { ref: origen.ref, id: actual.productoId, datos: origen.data() }, { ref: destino.ref, id: destinoId, datos: destino.data() });
    return { clave, productoId: destinoId, productos: [listaDe(actual.productoId, listaOrigen), listaDe(destinoId, listaDestino)] };
  });
};

const eliminar = (db, por, datos) => {
  const clave = String(datos.clave || '');
  return db.runTransaction(async (t) => {
    const snap = await leerVinculoEsperado(t, db, clave, String(datos.esperadoProductoId || ''));
    const actual = snap.data();
    const producto = await t.get(refProducto(db, actual.productoId));
    const lista = sinClave(producto, clave);
    t.delete(snap.ref);
    actualizarLista(t, producto, lista, por);
    registrarLog(t, producto.ref, 'CODIGO_ELIMINADO', por, { valorAnterior: valorCodigo(actual), valorNuevo: null, productoOrigen: resumenProducto(actual.productoId, producto.data()), productoDestino: null });
    return { clave, productoId: actual.productoId, productos: [listaDe(actual.productoId, lista)] };
  });
};

const OPERACIONES = { AGREGAR: agregar, EDITAR: editar, MOVER: mover, ELIMINAR: eliminar };

const gestionarCodigoBarraComo = (db, por, datos = {}) => {
  const operacion = OPERACIONES[datos.accion];
  if (!operacion) throw new HttpsError('invalid-argument', 'Acción no válida.');
  return operacion(db, por, datos);
};

const gestionarCodigoBarra = async (db, uid, datos = {}) => {
  const perfil = await perfilActivo(db, uid);
  if (!ACCIONES_CODIGO_BARRA[datos.accion]) throw new HttpsError('invalid-argument', 'Acción no válida.');
  exigir(perfil, ACCIONES_CODIGO_BARRA[datos.accion]);
  return gestionarCodigoBarraComo(db, datosPor(uid, perfil), datos);
};

module.exports = { gestionarCodigoBarra, gestionarCodigoBarraComo };
