// functions/scripts/asignarUbicacionFibras.js
//
// Implantes → Fibras: da la ubicación inicial (EN BODEGA / EN USO / AGOTADA) a
// las fibras registradas antes de que existiera el campo. Las reglas de
// Firestore exigen `ubicacion` en cada fibra, así que se corre ANTES de
// desplegar las reglas nuevas.
//
// Propuesta por referencia:
//   - AGOTADA: las agotadas (estado AGOTADA).
//   - EN USO: la fibra activa y vigente (vencimiento ≥ hoy) que ya tiene usos
//     (previos o registrados); si hay varias, la del uso más reciente y, a
//     igualdad, la con más usos consumidos. Solo una por referencia.
//   - EN BODEGA: el resto (sin usos, vencidas, o no elegidas como EN USO).
// Para cada referencia con una fibra EN USO se crea su control
// implantes_fibras_control/enUso__{referencia}.
//
//   cd functions
//   node scripts/asignarUbicacionFibras.js                       # prueba: muestra la propuesta, no escribe
//   node scripts/asignarUbicacionFibras.js --aplicar             # guarda el respaldo JSON y escribe
//   node scripts/asignarUbicacionFibras.js --revertir=<archivo>  # quita la ubicación, los controles y los logs creados
//   --respaldos=<carpeta>    dónde guardar el respaldo (por defecto C:\respaldos-medra)
//
// Escribe en cada fibra solo `ubicacion` y `ubicacionDesde`, un log
// UBICACION_INICIAL y los controles "en uso". Las fibras que ya tienen
// ubicación no se tocan (correrlo dos veces no cambia nada). No toca el
// contador de usos, los usos ni las gestiones.
//
// Credenciales: Application Default Credentials del proyecto. Proyecto:
// GCLOUD_PROJECT o workcraft-491b7.

/* global require, process */
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
const COL = 'implantes_fibras';
const COL_CONTROL = 'implantes_fibras_control';
const POR = { uid: 'script', nombre: 'Asignación inicial (script)' };

const hoyChile = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date());
const normalizarReferencia = (r) => String(r ?? '').trim().toUpperCase();
const idControl = (r) => `enUso__${normalizarReferencia(r).replace(/\//g, '_')}`;
const consumidos = (f) => (Number(f.usosPrevios) || 0) + (f.numerosOcupados || []).length;
const ultimoUso = (f) => Object.values(f.fechasUso || {}).reduce((m, x) => (x > m ? x : m), '');

// Ubicación propuesta para cada fibra: [{ id, referencia, ubicacion, motivo }].
const proponer = (fibras, hoy) => {
  const porReferencia = new Map();
  fibras.forEach((f) => {
    const r = normalizarReferencia(f.referencia);
    if (!porReferencia.has(r)) porReferencia.set(r, []);
    porReferencia.get(r).push(f);
  });
  const propuesta = [];
  porReferencia.forEach((lista, referencia) => {
    const candidatas = lista
      .filter((f) => f.estado !== 'AGOTADA' && consumidos(f) > 0 && (f.vencimiento || '') >= hoy)
      .sort((a, b) => ultimoUso(b).localeCompare(ultimoUso(a)) || consumidos(b) - consumidos(a) || a.id.localeCompare(b.id));
    const enUso = candidatas[0]?.id || null;
    lista.forEach((f) => {
      let ubicacion = 'EN BODEGA';
      let motivo = 'Sin usos';
      if (f.estado === 'AGOTADA') { ubicacion = 'AGOTADA'; motivo = 'Agotada'; }
      else if (f.id === enUso) { ubicacion = 'EN USO'; motivo = `Ya tiene ${consumidos(f)} uso(s)${candidatas.length > 1 ? ` (la de uso más reciente de ${candidatas.length})` : ''}`; }
      else if ((f.vencimiento || '') < hoy) motivo = `Vencida (${f.vencimiento})`;
      else if (consumidos(f) > 0) motivo = `Tiene usos, pero ${enUso} queda EN USO (una por referencia)`;
      propuesta.push({ id: f.id, referencia, lote: f.lote, vencimiento: f.vencimiento, usos: `${consumidos(f)}/${f.usosTotales}`, estado: f.estado, ubicacion, motivo });
    });
  });
  return propuesta.sort((a, b) => a.id.localeCompare(b.id));
};

const revertir = async (db) => {
  const respaldo = JSON.parse(fs.readFileSync(path.resolve(archivoRevertir), 'utf8'));
  console.log(`REVIRTIENDO ${respaldo.fibras.length} fibra(s) desde ${archivoRevertir} (respaldo del ${respaldo.creadoEn})`);
  const lote = db.batch();
  respaldo.fibras.forEach(({ id, logId }) => {
    lote.update(db.collection(COL).doc(id), { ubicacion: FieldValue.delete(), ubicacionDesde: FieldValue.delete() });
    lote.delete(db.collection(COL).doc(id).collection('logs').doc(logId));
  });
  respaldo.controles.forEach((id) => lote.delete(db.collection(COL_CONTROL).doc(id)));
  await lote.commit();
  console.log('Revertido.');
};

const principal = async () => {
  initializeApp({ projectId: PROYECTO });
  const db = getFirestore();
  if (archivoRevertir) return revertir(db);

  const hoy = hoyChile();
  const snap = await db.collection(COL).get();
  const todas = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const sinUbicacion = todas.filter((f) => !f.ubicacion);
  console.log(`Proyecto ${PROYECTO} · hoy ${hoy} · ${todas.length} fibra(s), ${sinUbicacion.length} sin ubicación`);
  const controlesExistentes = (await db.collection(COL_CONTROL).get()).docs.filter((d) => d.id.startsWith('enUso__')).map((d) => d.id);
  if (controlesExistentes.length > 0) console.log(`Controles "en uso" que ya existen (no se tocan): ${controlesExistentes.join(', ')}`);

  const propuesta = proponer(sinUbicacion, hoy);
  console.table(propuesta.map(({ id, referencia, lote, vencimiento, usos, estado, ubicacion, motivo }) => ({ id, referencia, lote, vencimiento, usos, estado, ubicacion, motivo })));
  const controles = propuesta.filter((p) => p.ubicacion === 'EN USO').map((p) => ({ id: idControl(p.referencia), referencia: p.referencia, fibraId: p.id }));
  controles.forEach((c) => {
    if (controlesExistentes.includes(c.id)) throw new Error(`Ya existe ${c.id}: revisa a mano antes de aplicar.`);
    console.log(`Control ${c.id} -> ${c.fibraId}`);
  });

  if (!aplicar) {
    console.log('\nPRUEBA: no se escribió nada. Para aplicar: --aplicar');
    return;
  }
  if (propuesta.length === 0) { console.log('Nada que aplicar.'); return; }
  if (/onedrive|proyectos web/i.test(DIR_RESPALDOS)) {
    throw new Error(`No se guarda el respaldo en ${DIR_RESPALDOS}: está dentro de OneDrive o del proyecto. Usa --respaldos=<carpeta local>.`);
  }
  fs.mkdirSync(DIR_RESPALDOS, { recursive: true });
  const archivo = path.join(DIR_RESPALDOS, `ubicacionFibras-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  const lote = db.batch();
  const fibrasRespaldo = [];
  propuesta.forEach((p) => {
    const ref = db.collection(COL).doc(p.id);
    const refLog = ref.collection('logs').doc();
    lote.update(ref, { ubicacion: p.ubicacion, ubicacionDesde: { fecha: FieldValue.serverTimestamp(), por: POR } });
    lote.set(refLog, { accion: 'UBICACION_INICIAL', detalles: { a: p.ubicacion, motivo: p.motivo }, usuario: POR.nombre, uid: POR.uid, timestamp: FieldValue.serverTimestamp() });
    fibrasRespaldo.push({ id: p.id, ubicacion: p.ubicacion, logId: refLog.id });
  });
  controles.forEach((c) => lote.set(db.collection(COL_CONTROL).doc(c.id), {
    referencia: c.referencia, fibraId: c.fibraId, origen: c.fibraId, actualizadoEl: FieldValue.serverTimestamp(),
  }));
  // Respaldo antes de escribir: qué se agrega (las fibras no tenían ubicación).
  fs.writeFileSync(archivo, JSON.stringify({ creadoEn: new Date().toISOString(), proyecto: PROYECTO, fibras: fibrasRespaldo, controles: controles.map((c) => c.id) }, null, 2));
  console.log(`Respaldo: ${archivo}`);
  await lote.commit();
  console.log(`Aplicado: ${propuesta.length} fibra(s), ${controles.length} control(es). Para deshacer: --revertir=${archivo}`);
};

principal().catch((e) => { console.error(e.message || e); process.exit(1); });
