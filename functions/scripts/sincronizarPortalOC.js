// functions/scripts/sincronizarPortalOC.js
//
// Carga inicial (y reparación) de Portal Proveedores → Órdenes de Compra: copia cada
// fila de documentos_sistema/…/detalles a portal_ordenes_compra, solo con los campos
// autorizados y la empresa del Maestro. Después la mantienen Importar y Eliminar Detalles
// OC, en el mismo lote que la fila. Lee las filas pidiendo solo esos campos: paciente y
// médico nunca llegan al script. No dispara triggers: la colección no tiene ninguno.
//
//   cd functions
//   node scripts/sincronizarPortalOC.js            # simulación (no escribe)
//   node scripts/sincronizarPortalOC.js --aplicar  # escribe, en lotes espaciados
//
// Idempotente: reemplaza cada copia y borra las que ya no tienen fila. Correrlo en
// horario sin uso. Lecturas: 1 por fila + 1 por copia + el Maestro de Empresas.
// Credenciales: Application Default Credentials. Proyecto: GCLOUD_PROJECT o workcraft-491b7.

const process = require('node:process');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldPath, FieldValue } = require('firebase-admin/firestore');
const {
  COL_PORTAL_OC, CAMPOS_PORTAL_OC, crearIndiceEmpresas, empresaIdDeProveedor, proyeccionPortalOC, idsPortalOC,
} = require('../portalProveedores/nucleo.mjs');

const PROYECTO = process.env.GCLOUD_PROJECT || 'workcraft-491b7';
const aplicar = process.argv.includes('--aplicar');
const LOTE = 400;
const PAUSA_MS = 3000;
const RAIZ = 'documentos_sistema';
const espera = (ms) => new Promise((r) => { setTimeout(r, ms); });

(async () => {
  const db = getFirestore(initializeApp({ projectId: PROYECTO }));
  console.log(`${aplicar ? 'APLICANDO' : 'SIMULACIÓN (sin escribir)'} — proyecto ${PROYECTO}`);

  const empresas = (await db.collection('maestros_empresas').get()).docs.map((d) => ({ id: d.id, ...d.data() }));
  const indice = crearIndiceEmpresas(empresas);
  const nombre = new Map(empresas.map((e) => [e.id, e.nombre]));

  const snap = await db.collectionGroup('detalles').orderBy(FieldPath.documentId())
    .startAt(db.doc(`${RAIZ}/0000`)).endBefore(db.doc(`${RAIZ}/9999`))
    .select(...CAMPOS_PORTAL_OC, 'proveedor')
    .get();
  const filas = snap.docs.filter((d) => /^documentos_sistema\/\d{4}\/meses\/\d{2}\/admisiones\/[^/]+\/empresas\/[^/]+\/detalles\/[^/]+$/.test(d.ref.path));
  const ids = await idsPortalOC(filas.map((d) => d.id));

  const copias = filas.map((d) => {
    const [, anio, , mes] = d.ref.path.split('/');
    const datos = d.data();
    const empresaId = empresaIdDeProveedor(indice, datos.proveedor);
    return { id: ids.get(d.id), datos: proyeccionPortalOC({ datos, proveedor: datos.proveedor, empresaId, anio, mes }) };
  });
  if (new Set(copias.map((c) => c.id)).size !== copias.length) throw new Error('Hay filas con el mismo ID: no se escribe nada.');

  const existentes = await db.collection(COL_PORTAL_OC).select().get();
  const vigentes = new Set(copias.map((c) => c.id));
  const sobrantes = existentes.docs.filter((d) => !vigentes.has(d.id));

  const porEmpresa = new Map();
  const sinEmpresa = new Map();
  copias.forEach(({ datos }) => {
    if (datos.empresaId) porEmpresa.set(datos.empresaId, (porEmpresa.get(datos.empresaId) || 0) + 1);
    else sinEmpresa.set(datos.proveedor, (sinEmpresa.get(datos.proveedor) || 0) + 1);
  });
  const porPeriodo = {};
  copias.forEach(({ datos }) => { const k = `${datos.anio}/${datos.mes}`; porPeriodo[k] = (porPeriodo[k] || 0) + 1; });

  console.log(`Filas de Detalles OC: ${filas.length}`);
  console.log(`Copias existentes: ${existentes.size} · a escribir: ${copias.length} · a borrar (sin fila): ${sobrantes.length}`);
  console.log(`Lotes: ${Math.ceil((copias.length + sobrantes.length) / LOTE)} de ${LOTE}`);
  console.log(`\nCon empresa: ${copias.length - [...sinEmpresa.values()].reduce((a, b) => a + b, 0)} filas de ${porEmpresa.size} empresas`);
  [...porEmpresa].sort((a, b) => b[1] - a[1]).forEach(([id, n]) => console.log(`${String(n).padStart(6)}  ${nombre.get(id)}`));
  console.log(`\nSin empresa (ningún externo las ve): ${[...sinEmpresa.values()].reduce((a, b) => a + b, 0)}`);
  [...sinEmpresa].forEach(([p, n]) => console.log(`${String(n).padStart(6)}  ${p}`));
  console.log('\nPor período:', JSON.stringify(porPeriodo));
  const campos = Object.keys(copias[0]?.datos || {}).sort().join(', ');
  console.log('Campos de cada copia:', campos);

  if (!aplicar) { console.log('\nPara aplicar: --aplicar'); return; }

  const ops = [
    ...copias.map(({ id, datos }) => (lote) => lote.set(db.collection(COL_PORTAL_OC).doc(id), { ...datos, actualizadoEn: FieldValue.serverTimestamp() })),
    ...sobrantes.map((d) => (lote) => lote.delete(d.ref)),
  ];
  for (let i = 0; i < ops.length; i += LOTE) {
    const lote = db.batch();
    ops.slice(i, i + LOTE).forEach((op) => op(lote));
    await lote.commit();
    console.log(`Lote ${i / LOTE + 1}: ${Math.min(i + LOTE, ops.length)} de ${ops.length}`);
    if (i + LOTE < ops.length) await espera(PAUSA_MS);
  }
  console.log('Listo.');
})().catch((err) => { console.error(err); process.exit(1); });
