// Historial de uso de las referencias (maestros_codigos_uso). Lo mantiene el
// trigger de gestiones de Implantes (functions/bodymap/index.js) y lo recalcula
// scripts/generarUsoCodigos.js. Ver nucleo.mjs.

const { FieldValue } = require('firebase-admin/firestore');
const { normalizarDescripcion, esDescripcionValida } = require('../bodymap/nucleo.mjs');
const {
  COLECCION_USO_CODIGOS, idReferenciaUso, claveDeGestion, aportesDeGestion, firmaAportes, fijarGestion,
} = require('./nucleo.mjs');

const refUso = (db, id) => db.collection(COLECCION_USO_CODIGOS).doc(id);

// Cambio de una gestión (`antes`/`despues`: datos del evento, o null).
//
// Un evento repetido no descuadra por la forma del documento, pero también puede
// llegar atrasado o en desorden (ver CLAUDE.md, cuota de CPU), y aplicar su
// `despues` haría reaparecer lo que ya se quitó. Por eso el evento solo dice QUÉ
// referencias revisar: lo que queda escrito sale de la gestión leída dentro de la
// transacción, así el último en escribir siempre deja el estado actual.
const aplicarCambioGestion = async (db, refGestion, antes, despues) => {
  const ruta = refGestion.path;
  const [aportesAntes, aportesDespues] = await Promise.all([aportesDeGestion(antes, ruta), aportesDeGestion(despues, ruta)]);
  // La mayoría de los guardados (precio, lote...) termina aquí, sin leer nada.
  if (firmaAportes(aportesAntes) === firmaAportes(aportesDespues)) return { cambio: false };

  const idGestion = await claveDeGestion(ruta);
  return db.runTransaction(async (t) => {
    const snap = await t.get(refGestion);
    const actual = await aportesDeGestion(snap.exists ? snap.data() : null, ruta);
    const referencias = new Map(
      [...aportesAntes.referencias, ...aportesDespues.referencias, ...actual.referencias].map((r) => [r.normalizada, r])
    );
    const lista = [...referencias.values()];
    if (!lista.length) return { cambio: false };
    const refs = await Promise.all(lista.map(async (r) => refUso(db, await idReferenciaUso(r.normalizada))));
    const usos = await t.getAll(...refs);
    let escritos = 0;
    lista.forEach((referencia, i) => {
      const sigueEnGestion = actual.referencias.some((r) => r.normalizada === referencia.normalizada);
      const { documento, cambio, vacio } = fijarGestion(usos[i].exists ? usos[i].data() : null, referencia, idGestion, sigueEnGestion ? actual : null);
      if (!cambio) return;
      escritos += 1;
      if (vacio) t.delete(refs[i]);
      else t.set(refs[i], { ...documento, actualizadoEl: FieldValue.serverTimestamp() });
    });
    return { cambio: escritos > 0, escritos };
  });
};

// JSON con las claves ordenadas: Firestore no conserva el orden de los mapas.
const canonico = (valor) => {
  if (Array.isArray(valor)) return valor.map(canonico);
  if (valor && typeof valor === 'object') {
    return Object.fromEntries(Object.keys(valor).sort().map((k) => [k, canonico(valor[k])]));
  }
  return valor;
};
const sinMarcaDeTiempo = ({ actualizadoEl, ...resto }) => resto;
const iguales = (a, b) => JSON.stringify(canonico(sinMarcaDeTiempo(a))) === JSON.stringify(canonico(sinMarcaDeTiempo(b)));

// Recalcula TODO desde las gestiones (carga inicial y reparación) y sobrescribe
// cada documento que difiera; no suma a lo existente, y borra los que ya no
// corresponden. Cuesta 1 lectura por gestión y 1 por documento de uso existente.
const recalcular = async (db, { aplicar = false } = {}) => {
  const gestiones = await db.collectionGroup('detalles')
    .orderBy('__name__')
    .startAt(db.doc('implantes_gestiones/0000'))
    .endBefore(db.doc('implantes_gestiones/9999'))
    .select('cotizaciones', 'medico', 'descripcion', 'fecha', 'empresa')
    .get();

  const esperados = new Map(); // id -> documento
  const empresasPorReferencia = new Map(); // normalizada -> { texto, empresas }
  const medicos = new Set();
  const descripciones = new Set();
  let sinAporte = 0;

  // En orden de ruta (año, mes, día): se conserva el nombre más antiguo, como en vivo.
  for (const g of gestiones.docs) {
    const datos = g.data();
    const aportes = await aportesDeGestion(datos, g.ref.path);
    if (!aportes.referencias.length) { sinAporte += 1; continue; }
    if (aportes.medico) medicos.add(aportes.medico.clave);
    if (aportes.descripcion) descripciones.add(aportes.descripcion.clave);
    const idGestion = await claveDeGestion(g.ref.path);
    for (const referencia of aportes.referencias) {
      const id = await idReferenciaUso(referencia.normalizada);
      esperados.set(id, fijarGestion(esperados.get(id) || null, referencia, idGestion, aportes).documento);
      const info = empresasPorReferencia.get(referencia.normalizada) || { texto: referencia.texto, empresas: new Set() };
      if (esDescripcionValida(datos.empresa)) info.empresas.add(normalizarDescripcion(datos.empresa));
      empresasPorReferencia.set(referencia.normalizada, info);
    }
  }

  const existentes = new Map((await db.collection(COLECCION_USO_CODIGOS).get()).docs.map((d) => [d.id, d.data()]));
  const aCrear = [...esperados.keys()].filter((id) => !existentes.has(id));
  const aSobrescribir = [...esperados.keys()].filter((id) => existentes.has(id) && !iguales(esperados.get(id), existentes.get(id)));
  const aBorrar = [...existentes.keys()].filter((id) => !esperados.has(id));

  if (aplicar) {
    const operaciones = [
      ...[...aCrear, ...aSobrescribir].map((id) => (lote) => lote.set(refUso(db, id), { ...esperados.get(id), actualizadoEl: FieldValue.serverTimestamp() })),
      ...aBorrar.map((id) => (lote) => lote.delete(refUso(db, id))),
    ];
    for (let i = 0; i < operaciones.length; i += 400) {
      const lote = db.batch();
      operaciones.slice(i, i + 400).forEach((op) => op(lote));
      await lote.commit();
    }
  }

  const documentos = [...esperados.values()];
  return {
    totalGestiones: gestiones.size,
    sinAporte,
    referencias: esperados.size,
    medicos: medicos.size,
    descripciones: descripciones.size,
    enVariasEmpresas: [...empresasPorReferencia.values()]
      .filter((r) => r.empresas.size > 1)
      .map((r) => ({ referencia: r.texto, empresas: [...r.empresas].sort() })),
    bytesDocumentoMayor: documentos.reduce((max, d) => Math.max(max, Buffer.byteLength(JSON.stringify(d))), 0),
    aCrear: aCrear.length,
    aSobrescribir: aSobrescribir.length,
    aBorrar: aBorrar.length,
    sinCambios: esperados.size - aCrear.length - aSobrescribir.length,
    lecturas: gestiones.size + existentes.size,
  };
};

module.exports = { aplicarCambioGestion, recalcular };
