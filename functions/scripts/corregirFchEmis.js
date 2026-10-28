// functions/scripts/corregirFchEmis.js
//
// Laboratorio y Vacunatorio: deja `fchEmis` (fecha de emisión de la factura)
// en AAAA-MM-DD en los documentos que quedaron con DD/MM/AAAA. El editor de
// Documentos recibidos (EditorDocumentos.jsx) guardaba la fecha tal como la
// mostraba al grabar cualquier cambio, y la imputada la heredó. Con el
// formato mezclado, Finanzas → Comparativo mensual (rango sobre fchEmis) los
// deja fuera y los listados ordenan mal.
//
// Colecciones: {laboratorio,vacunatorio}_{documentos,imputadas}/{anio}/meses/
// {mes}/documentos/{id}. Para cada fchEmis que no está en AAAA-MM-DD:
//   - Se convierte leyéndolo como DD/MM/AAAA (el único formato que escribía
//     el editor) y se contrasta con <FchEmis> del XML del SII guardado en el
//     documento (`xmlOriginal`). Solo se corrige si coinciden (OK).
//   - Sin XML, con un XML distinto o con un texto que no se puede leer, el
//     documento queda en REVISAR y no se toca.
//   - "Ambigua": día y mes ≤ 12 y distintos (09/10 podría ser 10 de
//     septiembre); se informa, y se corrige solo si el XML la confirma.
//
//   cd functions
//   node scripts/corregirFchEmis.js                       # prueba: muestra qué cambiaría, no escribe
//   node scripts/corregirFchEmis.js --aplicar             # guarda el respaldo JSON y escribe
//   node scripts/corregirFchEmis.js --revertir=<archivo>  # deja fchEmis como estaba y borra los logs creados
//   --respaldos=<carpeta>    dónde guardar el respaldo (por defecto C:\respaldos-medra)
//
// Escribe solo `fchEmis` (y `updatedAt` no se toca: no es un cambio del
// usuario) y deja un log CORRECCION_FORMATO_FECHA en la subcolección `logs`
// de cada documento. Correrlo dos veces no cambia nada. No hay triggers
// sobre estas colecciones y fchEmis no entra en los totales ni en los
// snapshots de imputaciones_periodos.
//
// Credenciales: Application Default Credentials del proyecto. Proyecto:
// GCLOUD_PROJECT o workcraft-491b7.

/* global require, process, __dirname */
const fs = require('node:fs');
const path = require('node:path');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

const PROYECTO = process.env.GCLOUD_PROJECT || 'workcraft-491b7';
const argumento = (nombre) => process.argv.find((a) => a.startsWith(`--${nombre}=`))?.split('=').slice(1).join('=') || null;
const aplicar = process.argv.includes('--aplicar');
const archivoRevertir = argumento('revertir');
// Fuera del proyecto: la carpeta del proyecto la sincroniza OneDrive.
const DIR_RESPALDOS = path.resolve(argumento('respaldos') || 'C:\\respaldos-medra');
const LOTE = 200; // 2 escrituras por documento (campo + log)
const COLECCIONES = ['laboratorio_documentos', 'laboratorio_imputadas', 'vacunatorio_documentos', 'vacunatorio_imputadas'];
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const USUARIO = { uid: 'script', email: 'script', nombre: 'Script corregirFchEmis' };

const aJSON = (v) => JSON.parse(JSON.stringify(v, (_k, x) => (x && typeof x.toDate === 'function' ? { __fecha: x.toDate().toISOString() } : x)));

// 'DD/MM/AAAA' -> { iso, ambigua } o null si no es una fecha válida.
const desdeDDMMAAAA = (texto) => {
  const m = String(texto).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [dia, mes, anio] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const f = new Date(Date.UTC(anio, mes - 1, dia));
  if (f.getUTCFullYear() !== anio || f.getUTCMonth() !== mes - 1 || f.getUTCDate() !== dia) return null;
  return { iso: `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`, ambigua: dia <= 12 && mes <= 12 && dia !== mes };
};
const fechaDelXml = (xml) => (String(xml || '').match(/<FchEmis>\s*([^<\s]+)\s*<\/FchEmis>/) || [])[1] || '';

const revisar = (ruta, datos) => {
  const actual = datos.fchEmis;
  const leida = desdeDDMMAAAA(actual);
  const xml = fechaDelXml(datos.xmlOriginal);
  let estado = 'OK';
  let motivo = 'coincide con <FchEmis> del XML del SII';
  if (!leida) { estado = 'REVISAR'; motivo = 'texto que no es DD/MM/AAAA válido'; }
  else if (!xml) { estado = 'REVISAR'; motivo = 'sin XML del SII para confirmar'; }
  else if (xml !== leida.iso) { estado = 'REVISAR'; motivo = `el XML dice ${xml}`; }
  return { ruta, actual, propuesto: leida?.iso || '', xml, ambigua: !!leida?.ambigua, estado, motivo, folio: datos.folio || '' };
};

const escribirPorTandas = async (db, items, armar) => {
  for (let i = 0; i < items.length; i += LOTE) {
    const lote = db.batch();
    items.slice(i, i + LOTE).forEach((x) => armar(lote, x));
    await lote.commit();
  }
};

const revertir = async (db) => {
  const respaldo = JSON.parse(fs.readFileSync(path.resolve(archivoRevertir), 'utf8'));
  const entradas = respaldo.documentos || [];
  console.log(`REVIRTIENDO ${entradas.length} documento(s) desde ${archivoRevertir} (respaldo del ${respaldo.creadoEn})`);
  await escribirPorTandas(db, entradas, (lote, e) => {
    lote.update(db.doc(e.ruta), { fchEmis: e.camposAntes.fchEmis });
    if (e.logId) lote.delete(db.doc(e.ruta).collection('logs').doc(e.logId));
  });
  console.log('Listo: fchEmis volvió a su valor anterior y se borraron los logs de la corrección.');
};

(async () => {
  const db = getFirestore(initializeApp({ projectId: PROYECTO }));
  if (archivoRevertir) { await revertir(db); return; }
  console.log(`${aplicar ? 'APLICANDO' : 'PRUEBA (no escribe nada)'} — proyecto ${PROYECTO}\n`);

  const filas = [];
  const documentos = new Map(); // ruta -> datos (para el respaldo)
  for (const col of COLECCIONES) {
    for (const refAnio of await db.collection(col).listDocuments()) {
      for (const refMes of await refAnio.collection('meses').listDocuments()) {
        const snap = await refMes.collection('documentos').get();
        snap.docs.forEach((d) => {
          const v = d.get('fchEmis');
          if (typeof v === 'string' && ISO.test(v)) return;
          if (v === undefined || v === null || v === '') return;
          filas.push(revisar(d.ref.path, d.data()));
          documentos.set(d.ref.path, d.data());
        });
      }
    }
  }

  console.log('Ruta | fchEmis actual | propuesto | XML SII | ambigua | estado');
  filas.forEach((f) => console.log(`  ${f.ruta} | ${f.actual} | ${f.propuesto || '—'} | ${f.xml || '—'} | ${f.ambigua ? 'sí' : 'no'} | ${f.estado}${f.estado === 'OK' ? '' : ` (${f.motivo})`}`));
  const ok = filas.filter((f) => f.estado === 'OK');
  const pendientes = filas.filter((f) => f.estado !== 'OK');
  console.log(`\nTotal: ${filas.length} · se corrigen: ${ok.length} · a revisar (no se tocan): ${pendientes.length} · ambiguas confirmadas por XML: ${ok.filter((f) => f.ambigua).length}`);

  if (!aplicar) { console.log('\nPara aplicar: --aplicar'); return; }
  if (!ok.length) { console.log('\nNada que corregir.'); return; }

  if (/onedrive/i.test(DIR_RESPALDOS) || DIR_RESPALDOS.startsWith(path.resolve(__dirname, '..', '..'))) {
    throw new Error(`No se guarda el respaldo en ${DIR_RESPALDOS}: está dentro de OneDrive o del proyecto. Usa --respaldos=<carpeta local>.`);
  }
  const conLog = ok.map((f) => ({ ...f, logId: db.doc(f.ruta).collection('logs').doc().id }));
  fs.mkdirSync(DIR_RESPALDOS, { recursive: true });
  const archivo = path.join(DIR_RESPALDOS, `fchEmis-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(archivo, JSON.stringify({
    creadoEn: new Date().toISOString(), proyecto: PROYECTO,
    documentos: conLog.map((f) => ({ ruta: f.ruta, camposAntes: { fchEmis: f.actual }, logId: f.logId, documento: aJSON(documentos.get(f.ruta)) })),
  }, null, 1));
  console.log(`\nRespaldo: ${archivo} (${conLog.length} documento(s))`);

  await escribirPorTandas(db, conLog, (lote, f) => {
    const ref = db.doc(f.ruta);
    lote.update(ref, { fchEmis: f.propuesto });
    lote.set(ref.collection('logs').doc(f.logId), {
      accion: 'CORRECCION_FORMATO_FECHA',
      detalle: `fchEmis de DD/MM/AAAA a AAAA-MM-DD (confirmada con el XML del SII). Folio: ${f.folio}`,
      cambios: { fchEmis: { anterior: f.actual, nuevo: f.propuesto } },
      fechaHora: new Date().toLocaleString('es-CL', { timeZone: 'America/Santiago' }),
      timestamp: FieldValue.serverTimestamp(),
      usuario: USUARIO,
    });
  });
  console.log('Listo. Para deshacer: --revertir=<archivo del respaldo>');
})().catch((err) => { console.error(err.message || err); process.exit(1); });
