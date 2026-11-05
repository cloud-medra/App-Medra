// Estadísticas: lectura y escritura en Firestore (Admin SDK). La lógica pura
// está en ./nucleo.js. Todo escribe en estadisticas/{modulo}_{AAAA-MM}
// (+ partes {id}__pN si un período no cabe en un documento) y en el índice
// estadisticas/_indice, que la pantalla lee para armar el selector de
// períodos con una sola lectura.

const { FieldValue } = require('firebase-admin/firestore');
const {
  FUENTES, COLECCION_ESTADISTICAS, ID_INDICE, VERSION, SUFIJO_CODIGOS, SUFIJO_MONTOS,
  claveMes, idEstadistica, idParte, calcularPeriodo, repartir, repartirMapa, repartirMontos, parteDe, GRUPO,
  aporteDesdeDoc, huellaAporte, clavePrecio,
} = require('./nucleo');

const ESTADOS_ABIERTOS = ['ABIERTO', 'REABIERTO'];

const refEstadistica = (db, id) => db.collection(COLECCION_ESTADISTICAS).doc(id);
const refIndice = (db) => refEstadistica(db, ID_INDICE);

const leerDocumentosPeriodo = async (db, modulo, anio, mesId) => {
  const snap = await db.collection(FUENTES[modulo].coleccion).doc(String(anio))
    .collection('meses').doc(mesId).collection('documentos').get();
  return snap.docs.map((d) => d.data());
};

const estadoCierre = async (db, modulo, anio, mesId) => {
  const snap = await db.collection('cierres_periodos').doc(`${anio}_${mesId}_${modulo}`).get();
  return snap.exists ? snap.data().estado || null : null;
};

const entradaIndice = (modulo, anio, mesId, datos) => ({
  periodos: { [modulo]: { [claveMes(anio, mesId)]: { anio: String(anio), mes: mesId, ...datos } } },
});

// Recalcula un período completo desde sus documentos imputados (lecturas =
// cantidad de ítems del período + 1). Escribe los tres documentos: principal
// ({id}: tuplas), códigos ({id}__codigos) y montos ({id}__montos, protegido
// por reglas con "Ver montos"), cada uno con sus partes si no cabe.
// `definitivo` undefined = conservar el estado que tenía. `reiniciarCambios`
// pone en 0 los cambios posteriores al cierre (cierre y recálculo manual).
const recalcularPeriodo = async (db, modulo, anio, mesId, { definitivo, origen, usuario = null, reiniciarCambios = false } = {}) => {
  const id = idEstadistica(modulo, anio, mesId);
  if (!id || !FUENTES[modulo]) throw new Error(`Período inválido: ${modulo} ${anio} ${mesId}`);
  const [docs, previoSnap] = await Promise.all([
    leerDocumentosPeriodo(db, modulo, anio, mesId),
    refEstadistica(db, id).get(),
  ]);
  const previo = previoSnap.exists ? previoSnap.data() : {};
  const calculo = calcularPeriodo(modulo, docs);
  const grupos = repartir(calculo.t, calculo.nombres);
  const gruposCodigos = repartirMapa(calculo.l, calculo.codigos, GRUPO.codigos);
  const gruposMontos = repartirMontos(calculo.montos);
  const esDefinitivo = definitivo === undefined ? Boolean(previo.definitivo) : definitivo;
  const ahora = FieldValue.serverTimestamp();
  const idCodigos = `${id}${SUFIJO_CODIGOS}`;
  const idMontos = `${id}${SUFIJO_MONTOS}`;

  const batch = db.batch();
  batch.set(refEstadistica(db, id), {
    modulo,
    bloque: FUENTES[modulo].bloque,
    anio: String(anio),
    mes: mesId,
    periodo: claveMes(anio, mesId),
    version: VERSION,
    definitivo: esDefinitivo,
    definitivoEl: esDefinitivo ? (definitivo === true ? ahora : previo.definitivoEl || ahora) : null,
    cambiosTrasCierre: reiniciarCambios || !esDefinitivo ? 0 : previo.cambiosTrasCierre || 0,
    actualizadoEl: ahora,
    origen,
    ...(usuario ? { recalculadoPor: usuario, recalculadoEl: ahora } : {}),
    documentos: calculo.documentos,
    partes: grupos.length,
    partesCodigos: gruposCodigos.length,
    partesMontos: gruposMontos.length,
    nombres: calculo.nombres,
    t: grupos[0],
  });
  grupos.slice(1).forEach((g, i) => batch.set(refEstadistica(db, idParte(id, i + 1)), { base: id, t: g }));
  batch.set(refEstadistica(db, idCodigos), { base: id, codigos: calculo.codigos, l: gruposCodigos[0] });
  gruposCodigos.slice(1).forEach((g, i) => batch.set(refEstadistica(db, idParte(idCodigos, i + 1)), { base: id, l: g }));
  batch.set(refEstadistica(db, idMontos), { base: id, ...gruposMontos[0] });
  gruposMontos.slice(1).forEach((g, i) => batch.set(refEstadistica(db, idParte(idMontos, i + 1)), { base: id, ...g }));
  for (let p = grupos.length; p < (previo.partes || 1); p += 1) batch.delete(refEstadistica(db, idParte(id, p)));
  for (let p = gruposCodigos.length; p < (previo.partesCodigos || 1); p += 1) batch.delete(refEstadistica(db, idParte(idCodigos, p)));
  for (let p = gruposMontos.length; p < (previo.partesMontos || 1); p += 1) batch.delete(refEstadistica(db, idParte(idMontos, p)));
  batch.set(refIndice(db), entradaIndice(modulo, anio, mesId, { definitivo: esDefinitivo }), { merge: true });
  await batch.commit();
  return {
    id,
    documentos: calculo.documentos,
    tuplas: Object.keys(calculo.t).length,
    lineas: Object.keys(calculo.l).length,
    sinPrecio: calculo.sinPrecio,
    partes: grupos.length,
    partesCodigos: gruposCodigos.length,
    partesMontos: gruposMontos.length,
    definitivo: esDefinitivo,
  };
};

// Diferencias netas entre el aporte anterior y el nuevo de un documento.
const sumar = (mapa, clave, campo, valor) => {
  if (!valor) return;
  mapa[clave] = mapa[clave] || {};
  mapa[clave][campo] = (mapa[clave][campo] || 0) + valor;
};
const deltasDe = (viejo, nuevo) => {
  const d = { t: {}, mt: {}, l: {}, ml: {}, datosT: {}, datosL: {}, codigos: {} };
  [[viejo, -1], [nuevo, 1]].forEach(([ap, signo]) => {
    if (!ap) return;
    sumar(d.t, ap.clave, 'n', signo);
    sumar(d.mt, ap.clave, '$', signo * ap.monto);
    sumar(d.mt, ap.clave, 'sp', signo * (ap.sinPrecio ? 1 : 0));
    if (signo > 0) d.datosT[ap.clave] = ap.tupla;
    if (ap.linea) {
      const lc = ap.linea.clave;
      sumar(d.l, lc, 'q', signo * ap.linea.cantidad);
      sumar(d.l, lc, 'n', signo);
      sumar(d.ml, lc, '$', signo * ap.monto);
      if (ap.linea.precio > 0) sumar(d.ml, lc, `p:${clavePrecio(ap.linea.precio)}`, signo);
      if (signo > 0) {
        d.datosL[lc] = ap.linea.datos;
        d.codigos[ap.linea.datos.k] = ap.linea.codigo;
      }
    }
  });
  return d;
};

// Trigger de un documento imputado. Solo escribe si cambió lo que aporta
// (admisión, médico, cirugía, empresa, código, cantidad o precio), o si se
// creó o borró. Costo: 0 si no cambió nada de eso; si cambió, 1 lectura y
// hasta 3 escrituras (principal, códigos y montos).
const aplicarCambio = async (db, modulo, anio, mesId, antes, despues) => {
  const viejo = antes ? aporteDesdeDoc(modulo, antes) : null;
  const nuevo = despues ? aporteDesdeDoc(modulo, despues) : null;
  if (huellaAporte(viejo) === huellaAporte(nuevo)) return 'sin-cambio';

  const id = idEstadistica(modulo, anio, mesId);
  if (!id) return 'mes-invalido';
  const snap = await refEstadistica(db, id).get();

  if (!snap.exists) {
    // Primer movimiento de un período sin estadísticas (o anterior al script):
    // se calcula completo una vez. Si el período ya está cerrado, queda
    // definitivo.
    const estado = await estadoCierre(db, modulo, anio, mesId);
    await recalcularPeriodo(db, modulo, anio, mesId, { definitivo: estado === 'CERRADO', origen: 'inicial' });
    return 'recalculado';
  }

  const actual = snap.data();
  if (actual.definitivo) {
    await snap.ref.update({ cambiosTrasCierre: FieldValue.increment(1), ultimoCambioTrasCierre: FieldValue.serverTimestamp() });
    return 'cambio-tras-cierre';
  }
  if ((actual.version || 1) < VERSION) {
    // Período abierto con el formato anterior (sin montos ni códigos).
    await recalcularPeriodo(db, modulo, anio, mesId, { definitivo: false, origen: 'formato' });
    return 'recalculado';
  }

  const d = deltasDe(viejo, nuevo);
  const escrituras = new Map(); // id de documento -> datos (set con merge)
  const en = (docId, ruta, valor) => {
    if (!escrituras.has(docId)) escrituras.set(docId, {});
    let nodo = escrituras.get(docId);
    ruta.slice(0, -1).forEach((r) => { nodo[r] = nodo[r] || {}; nodo = nodo[r]; });
    nodo[ruta[ruta.length - 1]] = valor;
  };
  const inc = (v) => FieldValue.increment(v);
  const idCodigos = `${id}${SUFIJO_CODIGOS}`;
  const idMontos = `${id}${SUFIJO_MONTOS}`;
  const partes = actual.partes || 1;
  const partesCodigos = actual.partesCodigos || 1;
  const partesMontos = actual.partesMontos || 1;

  // Principal: tuplas.
  const clavesT = new Set([...Object.keys(d.t), ...Object.keys(d.datosT)]);
  clavesT.forEach((k) => {
    const a = d.datosT[k]?.a || viejo?.tupla.a;
    const docId = idParte(id, parteDe(a, partes));
    if (d.datosT[k]) Object.entries(d.datosT[k]).forEach(([c, v]) => en(docId, ['t', k, c], v));
    if (d.t[k]?.n) en(docId, ['t', k, 'n'], inc(d.t[k].n));
  });
  // Códigos: líneas y diccionario.
  const clavesL = new Set([...Object.keys(d.l), ...Object.keys(d.datosL)]);
  clavesL.forEach((k) => {
    const a = d.datosL[k]?.a || viejo?.linea?.datos.a;
    const docId = idParte(idCodigos, parteDe(a, partesCodigos));
    if (d.datosL[k]) Object.entries(d.datosL[k]).forEach(([c, v]) => en(docId, ['l', k, c], v));
    Object.entries(d.l[k] || {}).forEach(([c, v]) => { if (v) en(docId, ['l', k, c], inc(v)); });
  });
  Object.entries(d.codigos).forEach(([k, v]) => en(idCodigos, ['codigos', k], v));
  // Montos: por tupla y por línea (con los precios unitarios usados).
  Object.entries(d.mt).forEach(([k, campos]) => {
    const docId = idParte(idMontos, parteDe(k, partesMontos));
    Object.entries(campos).forEach(([c, v]) => { if (v) en(docId, ['t', k, c], inc(v)); });
  });
  Object.entries(d.ml).forEach(([k, campos]) => {
    const docId = idParte(idMontos, parteDe(k, partesMontos));
    Object.entries(campos).forEach(([c, v]) => {
      if (!v) return;
      if (c.startsWith('p:')) en(docId, ['l', k, 'p', c.slice(2)], inc(v));
      else en(docId, ['l', k, c], inc(v));
    });
  });

  // Nombres nuevos para el diccionario (los existentes no se pisan).
  if (nuevo) {
    ['m', 'c', 'e'].forEach((dim) => {
      const [[k, v]] = Object.entries(nuevo.nombres[dim]);
      if (!actual.nombres?.[dim]?.[k]) en(id, ['nombres', dim, k], v);
    });
  }
  en(id, ['actualizadoEl'], FieldValue.serverTimestamp());
  en(id, ['origen'], 'trigger');

  const batch = db.batch();
  escrituras.forEach((datos, docId) => batch.set(refEstadistica(db, docId), docId === id ? datos : { base: id, ...datos }, { merge: true }));
  await batch.commit();
  return 'actualizado';
};

// Cambio de estado de un período (cierres_periodos/{anio}_{mes}_{modulo}).
// `ref`: el cierre. Un evento atrasado no se aplica si el período ya está en otro
// estado (ej. un "cerrado" que llega tras reabrirlo congelaría un mes abierto): lo
// resuelve el evento de ese otro cambio. Repetirlo es seguro: recalcula el período.
const aplicarCierre = async (db, antes, despues, ref = null) => {
  const datos = despues || antes;
  const modulo = datos?.modulo;
  if (!FUENTES[modulo]) return 'otro-modulo';
  const { anio, mes } = datos;
  const estadoAntes = antes?.estado || null;
  const estadoDespues = despues?.estado || null;
  if (estadoAntes === estadoDespues) return 'sin-cambio';
  if (ref) {
    const actual = await ref.get();
    if ((actual.data()?.estado || null) !== estadoDespues) return 'evento-atrasado';
  }

  if (estadoDespues === 'CERRADO') {
    await recalcularPeriodo(db, modulo, anio, mes, { definitivo: true, origen: 'cierre', reiniciarCambios: true });
    return 'congelado';
  }
  if (estadoAntes === 'CERRADO' && ESTADOS_ABIERTOS.includes(estadoDespues)) {
    await recalcularPeriodo(db, modulo, anio, mes, { definitivo: false, origen: 'reapertura', reiniciarCambios: true });
    return 'reabierto';
  }
  if (!estadoAntes && ESTADOS_ABIERTOS.includes(estadoDespues)) {
    // Período nuevo: documento vacío (create falla si ya existe, sin leer).
    const id = idEstadistica(modulo, anio, mes);
    try {
      const batch = db.batch();
      batch.create(refEstadistica(db, id), {
        modulo, bloque: FUENTES[modulo].bloque, anio: String(anio), mes, periodo: claveMes(anio, mes), version: VERSION,
        definitivo: false, definitivoEl: null, cambiosTrasCierre: 0, actualizadoEl: FieldValue.serverTimestamp(),
        origen: 'apertura', documentos: 0, partes: 1, nombres: { m: {}, c: {}, e: {} }, t: {},
      });
      batch.set(refIndice(db), entradaIndice(modulo, anio, mes, { definitivo: false }), { merge: true });
      await batch.commit();
    } catch (err) {
      if (err.code !== 6) throw err; // 6 = ALREADY_EXISTS
    }
    return 'abierto';
  }
  return 'sin-cambio';
};

// Recálculo nocturno: períodos abiertos o reabiertos de los módulos con
// estadísticas (consulta de un solo campo: pocos documentos).
const recalcularAbiertos = async (db) => {
  const snap = await db.collection('cierres_periodos').where('estado', 'in', ESTADOS_ABIERTOS).get();
  const resultados = [];
  for (const d of snap.docs) {
    const { modulo, anio, mes } = d.data();
    if (!FUENTES[modulo]) continue;
    resultados.push(await recalcularPeriodo(db, modulo, anio, mes, { definitivo: false, origen: 'nocturno' }));
  }
  return resultados;
};

module.exports = { recalcularPeriodo, aplicarCambio, aplicarCierre, recalcularAbiertos, leerDocumentosPeriodo, estadoCierre };
