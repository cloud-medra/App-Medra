// Maestro "Zonas por diagnóstico" (maestros_zonas_diagnostico): una entrada
// por descripción normalizada de las gestiones de Implantes, con sus zonas
// del cuerpo, el lado, el estado (sin_asignar / sugerida / confirmada) y
// cuántas gestiones la usan. Lo mantienen el trigger (index.js) y el script
// inicial (scripts/generarZonasDiagnostico.js); las zonas las edita el
// Maestro desde la pantalla. Separado de onCall/trigger para probarlo contra
// el emulador (tests/emulador).

const { FieldValue } = require('firebase-admin/firestore');
const {
  normalizarDescripcion, esDescripcionValida, idDescripcion, sugerirZonas, ESTADOS,
} = require('./nucleo.mjs');

const COLECCION = 'maestros_zonas_diagnostico';
const ref = (db, descripcion) => db.collection(COLECCION).doc(idDescripcion(descripcion));

// Entrada nueva con la sugerencia por palabras clave ("Sugerida" si hay
// zonas, si no "Sin asignar").
const nuevaEntrada = (descripcion, gestiones) => {
  const s = sugerirZonas(descripcion);
  return {
    descripcion: normalizarDescripcion(descripcion),
    ejemplo: String(descripcion).trim(),
    zonas: s.zonas,
    lado: s.lado,
    estado: s.zonas.length ? ESTADOS.SUGERIDA : ESTADOS.SIN_ASIGNAR,
    sugerencia: { zonas: s.zonas, lado: s.lado },
    gestiones,
    creadoEl: FieldValue.serverTimestamp(),
  };
};

// Resta una gestión a la descripción anterior y suma una a la nueva, las dos en
// la misma transacción: si se corta no queda a medias, descuadrando el contador.
// La nueva se crea si no existe. Nunca baja de 0; con 0 la entrada se mantiene,
// con su zona. Sigue siendo una diferencia: este trigger no se reintenta.
const moverContador = (db, resta, suma) => db.runTransaction(async (t) => {
  const descripciones = [resta, suma].filter(Boolean);
  const snaps = await t.getAll(...descripciones.map((x) => ref(db, x)));
  snaps.forEach((snap, i) => {
    const descripcion = descripciones[i];
    const delta = descripcion === suma ? 1 : -1;
    if (!snap.exists) {
      if (delta > 0) t.set(snap.ref, nuevaEntrada(descripcion, delta));
      return;
    }
    t.update(snap.ref, { gestiones: Math.max(0, (snap.data().gestiones || 0) + delta), gestionesActualizadoEl: FieldValue.serverTimestamp() });
  });
});

// Cambio de un documento de gestión (antes/después: datos o null). Solo
// actúa si cambió la descripción (normalizada) o se creó/eliminó.
const aplicarCambioGestion = async (db, antes, despues) => {
  const a = antes && esDescripcionValida(antes.descripcion) ? normalizarDescripcion(antes.descripcion) : null;
  const d = despues && esDescripcionValida(despues.descripcion) ? normalizarDescripcion(despues.descripcion) : null;
  if (a === d) return { cambio: false };
  await moverContador(db, a, d);
  return { cambio: true, resta: a, suma: d };
};

// Recuento completo desde las gestiones (script inicial / reparación):
// crea las descripciones que faltan (con sugerencia) y fija el contador de
// todas; las que ya no tienen gestiones quedan en 0 con su zona.
const recontar = async (db, { aplicar = false } = {}) => {
  const gestiones = await db.collectionGroup('detalles')
    .orderBy('__name__')
    .startAt(db.doc('implantes_gestiones/0000'))
    .endBefore(db.doc('implantes_gestiones/9999'))
    .select('descripcion')
    .get();
  const conteo = new Map(); // normalizada -> { n, ejemplo }
  let excluidas = 0;
  gestiones.docs.forEach((g) => {
    const texto = g.get('descripcion');
    if (!esDescripcionValida(texto)) { excluidas += 1; return; }
    const n = normalizarDescripcion(texto);
    const actual = conteo.get(n) || { n: 0, ejemplo: String(texto).trim() };
    conteo.set(n, { ...actual, n: actual.n + 1 });
  });
  const existentes = new Map((await db.collection(COLECCION).get()).docs.map((d) => [d.id, d.data()]));
  const filas = [];
  for (const [descripcion, { n, ejemplo }] of conteo) {
    const previa = existentes.get(idDescripcion(descripcion));
    filas.push({ descripcion, gestiones: n, nueva: !previa, previa: previa?.gestiones ?? null, ...(previa ? { zonas: previa.zonas, estado: previa.estado } : sugerirZonas(ejemplo)), ejemplo });
  }
  // Las que ya no aparecen en ninguna gestión: contador a 0.
  for (const [id, previa] of existentes) {
    if (!conteo.has(previa.descripcion)) filas.push({ descripcion: previa.descripcion, gestiones: 0, nueva: false, previa: previa.gestiones ?? null, zonas: previa.zonas, estado: previa.estado, id });
  }
  if (aplicar) {
    for (let i = 0; i < filas.length; i += 400) {
      const lote = db.batch();
      filas.slice(i, i + 400).forEach((f) => {
        const r = ref(db, f.descripcion);
        if (f.nueva) lote.set(r, nuevaEntrada(f.ejemplo, f.gestiones));
        else lote.update(r, { gestiones: f.gestiones, gestionesActualizadoEl: FieldValue.serverTimestamp() });
      });
      await lote.commit();
    }
  }
  return { totalGestiones: gestiones.size, excluidas, filas };
};

module.exports = { COLECCION, aplicarCambioGestion, recontar, nuevaEntrada };
