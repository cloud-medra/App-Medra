// functions/scripts/agregarOrdenConsignacion.js
//
// Migración única para "Sincronizar OC" de Cargas de Consignación: agrega
// `orden: ''` a los registros de consignacion_registros que no tienen el
// campo (o lo tienen en null). La sincronización consulta
// where('orden', '==', '') y Firestore no encuentra documentos donde el
// campo no existe, así que esos registros nunca recibirían su OC.
// Los registros con un orden ya escrito (a mano o sincronizado) no se tocan.
//
//   cd functions
//   node scripts/agregarOrdenConsignacion.js            # simulación (cuenta, no escribe)
//   node scripts/agregarOrdenConsignacion.js --aplicar  # escribe
//
// Idempotente. Lecturas: 1 por registro de consignación (todos, una vez).
// Escrituras: 1 por registro sin el campo.
// Credenciales: Application Default Credentials. Con FIRESTORE_EMULATOR_HOST
// corre contra el emulador. Proyecto: GCLOUD_PROJECT o workcraft-491b7.

const COL_BASE = 'consignacion_registros';
const TAMANO_LOTE = 400;

const agregarOrdenConsignacion = async (db, { aplicar = false } = {}) => {
  const { FieldPath } = require('firebase-admin/firestore');
  // Rango sobre __name__ (carpetas de año de 4 dígitos) para no leer los
  // "detalles" de otros módulos.
  const snap = await db.collectionGroup('detalles')
    .where(FieldPath.documentId(), '>=', db.doc(`${COL_BASE}/0000`))
    .where(FieldPath.documentId(), '<', db.doc(`${COL_BASE}/9999`))
    .get();

  const sinCampo = [];
  let vacios = 0;
  let conOrden = 0;
  snap.docs.forEach((d) => {
    const orden = d.data().orden;
    if (orden === undefined || orden === null) sinCampo.push(d);
    else if (String(orden).trim() === '') vacios++;
    else conOrden++;
  });

  if (aplicar) {
    for (let i = 0; i < sinCampo.length; i += TAMANO_LOTE) {
      const batch = db.batch();
      sinCampo.slice(i, i + TAMANO_LOTE).forEach((d) => batch.update(d.ref, { orden: '' }));
      await batch.commit();
    }
  }

  // Meses de los registros sin campo, para saber cuáles caen en el índice de OC.
  const porMes = {};
  sinCampo.forEach((d) => {
    const mes = String(d.data().fecha || '').slice(0, 7) || 'sin fecha';
    porMes[mes] = (porMes[mes] || 0) + 1;
  });

  return { total: snap.size, sinCampo: sinCampo.length, vacios, conOrden, porMes };
};

module.exports = { agregarOrdenConsignacion };

if (require.main === module) {
  const { initializeApp } = require('firebase-admin/app');
  const { getFirestore } = require('firebase-admin/firestore');
  const PROYECTO = process.env.GCLOUD_PROJECT || 'workcraft-491b7';
  const aplicar = process.argv.includes('--aplicar');

  initializeApp({ projectId: PROYECTO });
  agregarOrdenConsignacion(getFirestore(), { aplicar })
    .then(({ total, sinCampo, vacios, conOrden, porMes }) => {
      console.log(`\nProyecto ${PROYECTO}: ${total} registro(s) de consignación.`);
      console.log(`  Con orden: ${conOrden} · orden vacío: ${vacios} · SIN el campo: ${sinCampo}`);
      Object.keys(porMes).sort().forEach((mes) => console.log(`    ${mes}: ${porMes[mes]}`));
      console.log(aplicar ? `\n${sinCampo} registro(s) actualizados con orden: ''.` : '\nSimulación: no se escribió nada. Use --aplicar para escribir.');
    })
    .catch((error) => {
      console.error('Error en la migración:', error);
      process.exit(1);
    });
}
