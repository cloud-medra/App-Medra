// "Descripciones ocultas" de Reporte Info (ver nucleo.mjs): contador de
// filas por descripción en el Maestro y campos calculados de cada fila. Lo
// usan los triggers (index.js, y el de admisiones gestionadas) y el script
// scripts/rellenarDescripcionesReporte.js. Separado de los triggers para
// probarlo contra el emulador (tests/emulador).

const { FieldValue, FieldPath } = require('firebase-admin/firestore');
const {
  COLECCION_DESCRIPCIONES, RAIZ_REPORTE, CAMPOS_FILA, descripcionNormDe, idDescripcionReporte,
  admisionClaveDe, camposFila, camposIguales, esFilaReporte,
} = require('./nucleo.mjs');
const { COLECCION_ADMISIONES } = require('../admisiones/nucleo.mjs');

const refDescripcion = (db, norm) => db.collection(COLECCION_DESCRIPCIONES).doc(idDescripcionReporte(norm));
const refMarca = (db, admision) => db.collection(COLECCION_ADMISIONES).doc(admision);
const LOTE = 400;

// Suma `delta` filas a la descripción; si no existe la crea visible (sin
// transacción: una importación crea cientos de filas a la vez). `nueva`: no
// existía, queda pendiente de revisión (`pendienteDesde`, ver
// estadoDescripcion en nucleo.mjs). Si dos filas la crean a la vez, las dos
// escriben lo mismo.
const sumarFilas = (db, norm, delta, { nueva = false } = {}) => refDescripcion(db, norm).set({
  descripcion: norm, filas: FieldValue.increment(delta), filasActualizadoEl: FieldValue.serverTimestamp(),
  ...(nueva ? { pendienteDesde: FieldValue.serverTimestamp() } : {}),
}, { merge: true });

const escribirEnLotes = async (db, ops) => {
  for (let i = 0; i < ops.length; i += LOTE) {
    const lote = db.batch();
    ops.slice(i, i + LOTE).forEach(({ ref, datos }) => lote.update(ref, datos));
    await lote.commit();
  }
};

const tieneCampos = (fila) => CAMPOS_FILA.every((k) => fila?.[k] !== undefined);

// Fila creada / editada / eliminada (`ref`: la fila; antes/después: datos o
// null). Mueve el contador si cambió la descripción y completa o recalcula
// los campos si faltan o cambió la descripción o la admisión.
const aplicarCambioFila = async (db, ref, antes, despues) => {
  const a = antes ? descripcionNormDe(antes['Descripción']) : null;
  const d = despues ? descripcionNormDe(despues['Descripción']) : null;
  const resultado = {};
  // Ediciones que no tocan descripción ni admisión (ej. "Revisado"): nada que leer.
  const mismaAdmision = antes && despues && admisionClaveDe(antes['Admisión']) === admisionClaveDe(despues['Admisión']);
  const calcularCampos = Boolean(despues) && !(antes && a === d && mismaAdmision && tieneCampos(despues));
  // La entrada se lee ANTES de sumar la fila: si no existe, la descripción
  // es nueva (pendiente). Cuando cambia la descripción siempre se calculan
  // los campos, así que no es una lectura extra.
  const admision = calcularCampos ? admisionClaveDe(despues['Admisión']) : '';
  const [entrada, marca] = calcularCampos
    ? await Promise.all([refDescripcion(db, d).get(), admision ? refMarca(db, admision).get() : null])
    : [null, null];
  if (a !== d) {
    if (a) await sumarFilas(db, a, -1);
    if (d) await sumarFilas(db, d, 1, { nueva: !entrada.exists });
    resultado.contador = { resta: a, suma: d };
  }
  if (!calcularCampos) return resultado;
  const campos = camposFila(despues, entrada.exists ? entrada.data() : null, Boolean(marca?.exists));
  if (!camposIguales(despues, campos)) {
    await ref.update(campos);
    resultado.campos = campos;
  }
  return resultado;
};

// Marcas de admisiones gestionadas de las admisiones dadas (Set).
const admisionesGestionadas = async (db, admisiones) => {
  const ids = [...new Set(admisiones.filter(Boolean))];
  const gestionadas = new Set();
  for (let i = 0; i < ids.length; i += 300) {
    const snaps = await db.getAll(...ids.slice(i, i + 300).map((a) => refMarca(db, a)));
    snaps.forEach((s) => { if (s.exists) gestionadas.add(s.id); });
  }
  return gestionadas;
};

// Cambió un switch del Maestro: recalcula las filas de esa descripción.
const aplicarCambioDescripcion = async (db, antes, despues) => {
  if (!despues) return { filas: 0, actualizadas: 0 };
  const cambio = ['ocultaImplantes', 'ocultaDocumentos'].some((k) => (antes?.[k] === true) !== (despues[k] === true));
  if (!cambio) return { filas: 0, actualizadas: 0 };
  const snap = await db.collectionGroup('registros').where('descripcionNorm', '==', despues.descripcion).get();
  const filas = snap.docs.filter((f) => esFilaReporte(f.ref.path));
  const gestionadas = await admisionesGestionadas(db, filas.map((f) => admisionClaveDe(f.get('Admisión'))));
  const ops = filas
    .map((f) => ({ ref: f.ref, fila: f.data(), datos: camposFila(f.data(), despues, gestionadas.has(admisionClaveDe(f.get('Admisión')))) }))
    .filter(({ fila, datos }) => !camposIguales(fila, datos));
  await escribirEnLotes(db, ops);
  return { filas: filas.length, actualizadas: ops.length };
};

// Una admisión ganó (gestionada) o perdió su gestión en Implantes: sus
// filas con descripción oculta en Implantes se muestran u ocultan.
const recalcularAdmision = async (db, admision, gestionada) => {
  const snap = await db.collectionGroup('registros').where('admisionClave', '==', admision).get();
  const ops = snap.docs
    .filter((f) => esFilaReporte(f.ref.path) && f.get('descripcionOcultaImplantes') === true)
    .filter((f) => f.get('ocultaImplantes') !== !gestionada)
    .map((f) => ({ ref: f.ref, datos: { ocultaImplantes: !gestionada } }));
  await escribirEnLotes(db, ops);
  return { actualizadas: ops.length };
};

// Relleno inicial / reparación (script): campos de todas las filas y el
// Maestro con el conteo de filas de cada descripción (las nuevas, visibles
// y pendientes de revisión).
const rellenar = async (db, { aplicar = false } = {}) => {
  const snap = await db.collectionGroup('registros')
    .orderBy(FieldPath.documentId())
    .startAt(db.doc(`${RAIZ_REPORTE}/0000`))
    .endBefore(db.doc(`${RAIZ_REPORTE}/9999`))
    .get();
  const filas = snap.docs.filter((f) => esFilaReporte(f.ref.path));
  const existentes = new Map((await db.collection(COLECCION_DESCRIPCIONES).get()).docs.map((d) => [d.id, d.data()]));
  const gestionadas = new Set((await db.collection(COLECCION_ADMISIONES).select().get()).docs.map((d) => d.id));

  const conteo = new Map(); // norm -> { filas, ejemplo }
  const opsFilas = [];
  let ocultasImplantes = 0;
  let ocultasDocumentos = 0;
  filas.forEach((f) => {
    const datos = f.data();
    const norm = descripcionNormDe(datos['Descripción']);
    const c = conteo.get(norm) || { filas: 0, ejemplo: String(datos['Descripción'] ?? '').trim() };
    conteo.set(norm, { ...c, filas: c.filas + 1 });
    const campos = camposFila(datos, existentes.get(idDescripcionReporte(norm)) || null, gestionadas.has(admisionClaveDe(datos['Admisión'])));
    if (campos.ocultaImplantes) ocultasImplantes += 1;
    if (campos.ocultaDocumentos) ocultasDocumentos += 1;
    if (!camposIguales(datos, campos)) opsFilas.push({ ref: f.ref, datos: campos });
  });

  const descripciones = [...conteo].map(([descripcion, c]) => ({
    descripcion, filas: c.filas, ejemplo: c.ejemplo, nueva: !existentes.has(idDescripcionReporte(descripcion)),
  }));
  existentes.forEach((e, id) => {
    if (!conteo.has(e.descripcion)) descripciones.push({ descripcion: e.descripcion, filas: 0, nueva: false, id });
  });
  descripciones.sort((x, y) => y.filas - x.filas || x.descripcion.localeCompare(y.descripcion));

  if (aplicar) {
    await escribirEnLotes(db, opsFilas);
    for (let i = 0; i < descripciones.length; i += LOTE) {
      const lote = db.batch();
      descripciones.slice(i, i + LOTE).forEach((x) => {
        lote.set(refDescripcion(db, x.descripcion), {
          descripcion: x.descripcion,
          filas: x.filas,
          filasActualizadoEl: FieldValue.serverTimestamp(),
          // Las que no estaban en el Maestro quedan pendientes, como las del trigger.
          ...(x.nueva ? { ejemplo: x.ejemplo, ocultaImplantes: false, ocultaDocumentos: false, creadoEl: FieldValue.serverTimestamp(), pendienteDesde: FieldValue.serverTimestamp() } : {}),
        }, { merge: true });
      });
      await lote.commit();
    }
  }
  return { totalFilas: filas.length, aActualizar: opsFilas.length, ocultasImplantes, ocultasDocumentos, descripciones };
};

module.exports = {
  aplicarCambioFila, aplicarCambioDescripcion, recalcularAdmision, rellenar, sumarFilas,
};
