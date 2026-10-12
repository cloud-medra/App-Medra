// functions/scripts/marcarOrdenOrigenConsignacion.js
//
// Migración única: marca `ordenOrigen` en los registros de
// consignacion_registros que ya tienen orden pero no el campo (los
// sincronizados o escritos a mano antes de que existiera).
//   'oc'     si Sincronizar OC escribió esa orden: tiene ocActualizadoEn y su
//            último log OC_ASIGNADA trae la MISMA orden que hoy (si alguien
//            la cambió a mano después, ya no es la sincronizada).
//   'manual' en cualquier otro caso con orden.
// Los 'oc' quedan bloqueados (Registro y firestore.rules). Los registros
// sin orden o que ya tienen ordenOrigen no se tocan.
//
//   cd functions
//   node scripts/marcarOrdenOrigenConsignacion.js            # simulación (cuenta, no escribe)
//   node scripts/marcarOrdenOrigenConsignacion.js --aplicar  # escribe
//
// Idempotente. Lecturas: 1 por registro de consignación + los logs
// OC_ASIGNADA de los que tienen ocActualizadoEn. Escrituras: 1 por registro
// marcado. Credenciales: Application Default Credentials. Con
// FIRESTORE_EMULATOR_HOST corre contra el emulador. Proyecto:
// GCLOUD_PROJECT o workcraft-491b7.

const COL_BASE = 'consignacion_registros';
const TAMANO_LOTE = 400;

const ordenDelUltimoLogOC = async (ref) => {
  const snap = await ref.collection('logs').where('accion', '==', 'OC_ASIGNADA').get();
  const logs = snap.docs.map((d) => d.data())
    .sort((a, b) => (a.timestamp?.toMillis?.() || 0) - (b.timestamp?.toMillis?.() || 0));
  return logs.length ? String(logs[logs.length - 1].detalles?.orden ?? '').trim() : null;
};

const marcarOrdenOrigenConsignacion = async (db, { aplicar = false } = {}) => {
  const { FieldPath } = require('firebase-admin/firestore');
  const snap = await db.collectionGroup('detalles')
    .where(FieldPath.documentId(), '>=', db.doc(`${COL_BASE}/0000`))
    .where(FieldPath.documentId(), '<', db.doc(`${COL_BASE}/9999`))
    .get();

  const marcas = [];
  let yaMarcados = 0;
  let sinOrden = 0;
  let cambiadasAMano = 0;
  for (const d of snap.docs) {
    const data = d.data();
    const orden = String(data.orden ?? '').trim();
    if (data.ordenOrigen !== undefined) { yaMarcados++; continue; }
    if (!orden) { sinOrden++; continue; }
    let origen = 'manual';
    if (data.ocActualizadoEn) {
      if ((await ordenDelUltimoLogOC(d.ref)) === orden) origen = 'oc';
      else cambiadasAMano++;
    }
    marcas.push({ ref: d.ref, origen });
  }

  if (aplicar) {
    for (let i = 0; i < marcas.length; i += TAMANO_LOTE) {
      const batch = db.batch();
      marcas.slice(i, i + TAMANO_LOTE).forEach(({ ref, origen }) => batch.update(ref, { ordenOrigen: origen }));
      await batch.commit();
    }
  }

  const oc = marcas.filter((m) => m.origen === 'oc').length;
  return { total: snap.size, oc, manual: marcas.length - oc, cambiadasAMano, yaMarcados, sinOrden };
};

module.exports = { marcarOrdenOrigenConsignacion };

if (require.main === module) {
  const { initializeApp } = require('firebase-admin/app');
  const { getFirestore } = require('firebase-admin/firestore');
  const PROYECTO = process.env.GCLOUD_PROJECT || 'workcraft-491b7';
  const aplicar = process.argv.includes('--aplicar');

  initializeApp({ projectId: PROYECTO });
  marcarOrdenOrigenConsignacion(getFirestore(), { aplicar })
    .then(({ total, oc, manual, cambiadasAMano, yaMarcados, sinOrden }) => {
      console.log(`\nProyecto ${PROYECTO}: ${total} registro(s) de consignación.`);
      console.log(`  A marcar 'oc' (bloqueados): ${oc}`);
      console.log(`  A marcar 'manual': ${manual} (de ellos, sincronizados y luego cambiados a mano: ${cambiadasAMano})`);
      console.log(`  Ya tenían ordenOrigen: ${yaMarcados} · sin orden: ${sinOrden}`);
      console.log(aplicar ? '\nCambios aplicados.' : '\nSimulación: no se escribió nada. Use --aplicar para escribir.');
    })
    .catch((error) => {
      console.error('Error en la migración:', error);
      process.exit(1);
    });
}
