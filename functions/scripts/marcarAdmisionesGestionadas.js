// functions/scripts/marcarAdmisionesGestionadas.js
//
// Carga inicial (y reparación) de la marca "Gestión implante" de Reporte
// Info (admisiones_gestionadas_implantes): recorre todas las gestiones de
// Implantes y deja una entrada por número de admisión con su estado
// (gestionada / cargada / imputada), gestiones asociadas e ítems
// pendientes. Borra las entradas de admisiones que ya no tienen gestiones.
// Después lo mantiene el trigger admisionesGestionadasImplante.
//
// Con --consignacion hace lo mismo para "Gestión consignación"
// (admisiones_gestionadas_consignacion, desde los registros de
// Consignación); después lo mantiene admisionesGestionadasConsignacion.
//
//   cd functions
//   node scripts/marcarAdmisionesGestionadas.js            # simulación (no escribe)
//   node scripts/marcarAdmisionesGestionadas.js --aplicar  # escribe
//   node scripts/marcarAdmisionesGestionadas.js --consignacion [--aplicar]
//
// Correrlo DESPUÉS de desplegar la función. Es idempotente. Lecturas: 1 por
// gestión + 1 por admisión marcada (y 1 por registro de Reporte Info, solo
// para el resumen de pendientes).
//
// Credenciales: Application Default Credentials del proyecto. Con
// FIRESTORE_EMULATOR_HOST definido corre contra el emulador. Proyecto:
// GCLOUD_PROJECT o workcraft-491b7.

const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { recontar } = require('../admisiones/servicio');
const { ETIQUETAS_ESTADO } = require('../admisiones/nucleo.mjs');

const PROYECTO = process.env.GCLOUD_PROJECT || 'workcraft-491b7';
const aplicar = process.argv.includes('--aplicar');
const modulo = process.argv.includes('--consignacion') ? 'consignacion' : 'implantes';
const ETIQUETA = modulo === 'consignacion' ? 'Registros de Consignación' : 'Gestiones de Implantes';

(async () => {
  const db = getFirestore(initializeApp({ projectId: PROYECTO }));
  console.log(`${aplicar ? 'APLICANDO' : 'SIMULACIÓN (sin escribir)'} — proyecto ${PROYECTO} — ${modulo}`);
  const { totalGestiones, sinAdmision, filas, sobrantes } = await recontar(db, { aplicar, modulo });

  // Admisiones de Reporte Info y cuántas quedan gestionadas / pendientes.
  const reporte = await db.collectionGroup('registros').select('Admisión').get();
  // collectionGroup('registros') incluye otras colecciones (consignación).
  const enReporte = new Set(reporte.docs.filter((d) => d.ref.path.startsWith('documentos_reportesInfo/')).map((d) => d.get('Admisión')).filter((a) => a != null && a !== '').map((a) => String(Number(a))));
  const gestionadas = new Set(filas.map((f) => f.admision));
  const porEstado = filas.reduce((acc, f) => ({ ...acc, [f.estado]: (acc[f.estado] || 0) + 1 }), {});

  console.log(`${ETIQUETA}: ${totalGestiones} (sin número de admisión: ${sinAdmision})`);
  console.log(`Admisiones con gestión: ${filas.length} → ${Object.entries(porEstado).map(([e, n]) => `${ETIQUETAS_ESTADO[e]}: ${n}`).join(' · ')}`);
  console.log(`  nuevas: ${filas.filter((f) => f.nueva).length} · ya marcadas: ${filas.filter((f) => !f.nueva).length} · a desmarcar (sin gestiones): ${sobrantes.length}`);
  console.log(`Reporte Info: ${enReporte.size} admisiones distintas → gestionadas: ${[...enReporte].filter((a) => gestionadas.has(a)).length} · pendientes: ${[...enReporte].filter((a) => !gestionadas.has(a)).length}`);
  console.log(`Admisiones gestionadas que aún no están en Reporte Info: ${[...gestionadas].filter((a) => !enReporte.has(a)).length} (se verán marcadas cuando lleguen)`);
  if (!aplicar) console.log('\nPara aplicar: --aplicar');
})().catch((err) => { console.error(err); process.exit(1); });
