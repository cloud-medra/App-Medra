// functions/scripts/migrarRolesNotas.js
//
// Migración única: las notas del panel (administracion_notas) pasan a decir
// qué roles las ven (campo rolesVisibles). A cada nota sin el campo (o con
// él vacío) se le pone ['admin', 'operador', 'encargado'] para que nadie deje
// de verla. Las que ya tienen roles (incluidas las solo para desarrolladores,
// ['dev']) no se tocan. El Desarrollador ve todas igual. No toca ningún otro
// campo (las notas sin `estilo` se ven con el aspecto de siempre).
//
// Orden del despliegue: correrla ANTES (o junto) de desplegar las reglas y el
// hosting nuevos: las reglas nuevas solo dejan leer una nota a los roles de
// rolesVisibles, y la consulta del cliente filtra por ese campo.
//
//   cd functions
//   node scripts/migrarRolesNotas.js            # simulación (no escribe)
//   node scripts/migrarRolesNotas.js --aplicar  # escribe
//
// Idempotente. Lecturas: 1 por nota. Escrituras: 1 por nota sin el campo.
// Credenciales: Application Default Credentials. Con FIRESTORE_EMULATOR_HOST
// corre contra el emulador. Proyecto: GCLOUD_PROJECT o workcraft-491b7.

const COLECCION = 'administracion_notas';
const TODOS_LOS_ROLES = ['admin', 'operador', 'encargado'];

const migrarRolesNotas = async (db, { aplicar = false, log = () => {} } = {}) => {
  const snap = await db.collection(COLECCION).get();
  const pendientes = snap.docs.filter((d) => {
    const roles = d.data().rolesVisibles;
    return !Array.isArray(roles) || roles.length === 0;
  });
  pendientes.forEach((d) => log(`${d.id} (${d.data().titulo || 'sin título'})`));
  if (aplicar) {
    // Lotes de 500 (límite de Firestore).
    for (let i = 0; i < pendientes.length; i += 500) {
      const batch = db.batch();
      pendientes.slice(i, i + 500).forEach((d) => batch.update(d.ref, { rolesVisibles: TODOS_LOS_ROLES }));
      await batch.commit();
    }
  }
  return { total: snap.size, migradas: pendientes.length };
};

module.exports = { migrarRolesNotas, TODOS_LOS_ROLES };

if (require.main === module) {
  const { initializeApp } = require('firebase-admin/app');
  const { getFirestore } = require('firebase-admin/firestore');
  const PROYECTO = process.env.GCLOUD_PROJECT || 'workcraft-491b7';
  const aplicar = process.argv.includes('--aplicar');

  initializeApp({ projectId: PROYECTO });
  migrarRolesNotas(getFirestore(), { aplicar, log: (l) => console.log(l) })
    .then(({ total, migradas }) => {
      console.log(`\n${migradas} de ${total} notas sin rolesVisibles (proyecto ${PROYECTO}).`);
      console.log(aplicar ? 'Cambios aplicados.' : 'Simulación: no se escribió nada. Use --aplicar para migrar.');
    })
    .catch((error) => {
      console.error('Error en la migración:', error);
      process.exit(1);
    });
}
