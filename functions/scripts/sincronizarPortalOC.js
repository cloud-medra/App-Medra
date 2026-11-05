// functions/scripts/sincronizarPortalOC.js
//
// Carga inicial, control y reparación de Portal Proveedores → Órdenes de Compra: compara
// cada fila de documentos_sistema/…/detalles con su copia en portal_ordenes_compra (solo
// los campos autorizados y la empresa del Maestro). Normalmente las mantienen Importar y
// Eliminar Detalles OC, en el mismo lote que la fila; esto detecta si alguna quedó
// distinta, y también las copias que no le corresponden a ninguna fila o con campos que
// no deben tener. Lee las filas pidiendo solo esos campos: médico y admisión nunca llegan
// al script, y lo que imprime son conteos y nombres de campos, no valores (ni pacientes). No dispara
// triggers: la colección no tiene ninguno.
//
//   cd functions
//   node scripts/sincronizarPortalOC.js --mes 2026-10 --estimar  # solo dice cuánto leería
//   node scripts/sincronizarPortalOC.js --mes 2026-10            # compara e informa (no escribe)
//   node scripts/sincronizarPortalOC.js --mes 2026-10 --mes 2026-11 --aplicar  # además repara
//   node scripts/sincronizarPortalOC.js --todo                   # todos los meses (~31.000 lecturas)
//
// El alcance es obligatorio. Lecturas: 1 por fila + 1 por copia del alcance + el Maestro de
// Empresas, y unas pocas de los count() del aviso previo. Si una fila cambió de mes, indicar
// los dos: una copia "sin fila" solo se detecta en el mes de la copia.
//
// Idempotente: escribe solo las copias faltantes, desfasadas o con campos de más (siempre
// completas), y borra las que ya no tienen fila. Correrlo en horario sin uso.
// Credenciales: Application Default Credentials. Proyecto: GCLOUD_PROJECT o workcraft-491b7.

const process = require('node:process');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldPath, FieldValue } = require('firebase-admin/firestore');
const {
  COL_PORTAL_OC, CAMPOS_PORTAL_OC, crearIndiceEmpresas, empresaIdDeProveedor, proyeccionPortalOC, idsPortalOC, diferenciasCopiaPortal, alcanceDeArgumentos,
} = require('../portalProveedores/nucleo.mjs');

const PROYECTO = process.env.GCLOUD_PROJECT || 'workcraft-491b7';
const alcance = alcanceDeArgumentos(process.argv.slice(2));
if (alcance.error) { console.error(alcance.error); process.exit(2); }
const { aplicar, estimar, todo, meses } = alcance;
const LOTE = 400;
const PAUSA_MS = 3000;
const RAIZ = 'documentos_sistema';
const espera = (ms) => new Promise((r) => { setTimeout(r, ms); });

(async () => {
  const db = getFirestore(initializeApp({ projectId: PROYECTO }));
  console.log(`${aplicar ? 'APLICANDO' : 'SIMULACIÓN (sin escribir)'} — proyecto ${PROYECTO}`);

  // Una consulta por mes del alcance (o una sola con --todo).
  const consultasFilas = (todo ? [[`${RAIZ}/0000`, `${RAIZ}/9999`]] : meses.map(({ anio, mes }) => [`${RAIZ}/${anio}/meses/${mes}`, `${RAIZ}/${anio}/meses/${mes}\uf8ff`]))
    .map(([desde, hasta]) => db.collectionGroup('detalles').orderBy(FieldPath.documentId()).startAt(db.doc(desde)).endBefore(db.doc(hasta)));
  const consultasCopias = todo
    ? [db.collection(COL_PORTAL_OC)]
    : meses.map(({ anio, mes }) => db.collection(COL_PORTAL_OC).where('anio', '==', anio).where('mes', '==', mes));
  const contar = async (consultas) => (await Promise.all(consultas.map((q) => q.count().get()))).reduce((t, s) => t + s.data().count, 0);

  // Aviso previo: count() cuesta 1 lectura por cada 1.000 documentos, mínimo 1.
  const [nFilas, nCopias, nEmpresas] = await Promise.all([contar(consultasFilas), contar(consultasCopias), contar([db.collection('maestros_empresas')])]);
  console.log(`Alcance: ${todo ? 'todos los meses' : meses.map((m) => `${m.anio}-${m.mes}`).join(', ')}`);
  console.log(`Lecturas que hará: ~${nFilas + nCopias + nEmpresas} (filas ${nFilas} + copias ${nCopias} + Maestro ${nEmpresas})`);
  if (estimar) return;

  const empresas = (await db.collection('maestros_empresas').get()).docs.map((d) => ({ id: d.id, ...d.data() }));
  const indice = crearIndiceEmpresas(empresas);
  const nombre = new Map(empresas.map((e) => [e.id, e.nombre]));

  const snaps = [];
  for (const q of consultasFilas) snaps.push(await q.select(...CAMPOS_PORTAL_OC, 'proveedor').get());
  const filas = snaps.flatMap((s) => s.docs).filter((d) => /^documentos_sistema\/\d{4}\/meses\/\d{2}\/admisiones\/[^/]+\/empresas\/[^/]+\/detalles\/[^/]+$/.test(d.ref.path));
  const ids = await idsPortalOC(filas.map((d) => d.id));

  const copias = filas.map((d) => {
    const [, anio, , mes] = d.ref.path.split('/');
    const datos = d.data();
    const empresaId = empresaIdDeProveedor(indice, datos.proveedor);
    return { id: ids.get(d.id), datos: proyeccionPortalOC({ datos, proveedor: datos.proveedor, empresaId, anio, mes }) };
  });
  if (new Set(copias.map((c) => c.id)).size !== copias.length) throw new Error('Hay filas con el mismo ID: no se escribe nada.');

  const snapsCopias = [];
  for (const q of consultasCopias) snapsCopias.push(await q.get());
  const existentes = snapsCopias.flatMap((s) => s.docs);
  const guardadas = new Map(existentes.map((d) => [d.id, d.data()]));
  const vigentes = new Set(copias.map((c) => c.id));
  const sobrantes = existentes.filter((d) => !vigentes.has(d.id));

  // Comparación de cada fila con su copia.
  const faltantes = [];
  const distintas = [];
  const conteoDesfasados = {};
  const conteoNoAutorizados = {};
  copias.forEach((copia) => {
    const guardada = guardadas.get(copia.id);
    if (!guardada) { faltantes.push(copia); return; }
    const { desfasados, noAutorizados } = diferenciasCopiaPortal(copia.datos, guardada);
    if (!desfasados.length && !noAutorizados.length) return;
    distintas.push({ ...copia, desfasados, noAutorizados });
    desfasados.forEach((c) => { conteoDesfasados[c] = (conteoDesfasados[c] || 0) + 1; });
    noAutorizados.forEach((c) => { conteoNoAutorizados[c] = (conteoNoAutorizados[c] || 0) + 1; });
  });
  const sobrantesNoAutorizados = sobrantes.filter((d) => diferenciasCopiaPortal({}, d.data()).noAutorizados.length).length;
  const aEscribir = [...faltantes, ...distintas];

  const porEmpresa = new Map();
  const sinEmpresa = new Map();
  copias.forEach(({ datos }) => {
    if (datos.empresaId) porEmpresa.set(datos.empresaId, (porEmpresa.get(datos.empresaId) || 0) + 1);
    else sinEmpresa.set(datos.proveedor, (sinEmpresa.get(datos.proveedor) || 0) + 1);
  });
  const porPeriodo = {};
  copias.forEach(({ datos }) => { const k = `${datos.anio}/${datos.mes}`; porPeriodo[k] = (porPeriodo[k] || 0) + 1; });

  console.log(`Filas de Detalles OC: ${filas.length}`);
  console.log(`Copias existentes: ${existentes.length}`);
  console.log(`Al día: ${copias.length - aEscribir.length} · faltantes: ${faltantes.length} · desfasadas: ${distintas.length} · sin fila: ${sobrantes.length}`);
  console.log('Campos desfasados:', JSON.stringify(conteoDesfasados));
  console.log('Campos NO AUTORIZADOS en copias:', JSON.stringify(conteoNoAutorizados), '· en copias sin fila:', sobrantesNoAutorizados);
  distintas.slice(0, 10).forEach((d) => console.log(`  ${d.id.slice(0, 12)}…  ${d.datos.anio}/${d.datos.mes}  ${[...d.desfasados, ...d.noAutorizados].join(', ')}`));
  console.log(`Lotes para reparar: ${Math.ceil((aEscribir.length + sobrantes.length) / LOTE)} de ${LOTE}`);
  console.log(`\nCon empresa: ${copias.length - [...sinEmpresa.values()].reduce((a, b) => a + b, 0)} filas de ${porEmpresa.size} empresas`);
  [...porEmpresa].sort((a, b) => b[1] - a[1]).forEach(([id, n]) => console.log(`${String(n).padStart(6)}  ${nombre.get(id)}`));
  console.log(`\nSin empresa (ningún externo las ve): ${[...sinEmpresa.values()].reduce((a, b) => a + b, 0)}`);
  [...sinEmpresa].forEach(([p, n]) => console.log(`${String(n).padStart(6)}  ${p}`));
  console.log('\nPor período:', JSON.stringify(porPeriodo));
  const campos = Object.keys(copias[0]?.datos || {}).sort().join(', ');
  console.log('Campos de cada copia:', campos);

  if (!aplicar) { console.log(aEscribir.length + sobrantes.length ? '\nPara reparar: --aplicar' : '\nTodo al día.'); return; }
  if (!aEscribir.length && !sobrantes.length) { console.log('\nTodo al día: nada que escribir.'); return; }

  const ops = [
    ...aEscribir.map(({ id, datos }) => (lote) => lote.set(db.collection(COL_PORTAL_OC).doc(id), { ...datos, actualizadoEn: FieldValue.serverTimestamp() })),
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
