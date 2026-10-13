// functions/scripts/revisarAccesoAdministradores.js
//
// SOLO LECTURA. Antes de publicar el cambio "el Administrador ve y hace solo
// lo que se le asigna (el Desarrollador sigue con acceso total)":
//   1. Verifica que haya al menos un Desarrollador activo (si no, nadie
//      tendría acceso garantizado a Administración). Sin ninguno, termina
//      con código 2.
//   2. Lista cada Administrador activo con lo que dejaría de ver o hacer:
//      Permisos por centro y Atajos, vistas de su menú sin configuración
//      granular (adentro quedarían bloqueadas) y acciones sensibles
//      (denegadas por defecto) que no tiene marcadas.
// No escribe nada. Para devolverle acceso a un Administrador: Lista de
// usuarios → Editar acceso → Permisos (o asignarle el rol Desarrollador).
//
//   cd functions
//   node scripts/revisarAccesoAdministradores.js
//
// Credenciales: Application Default Credentials del proyecto (Cloud Shell
// las trae). Proyecto: GCLOUD_PROJECT o workcraft-491b7. Con
// FIRESTORE_EMULATOR_HOST definido corre contra el emulador.

const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { analizarAccesoAdministradores } = require('../permisos/revisionAdministradores.mjs');

const PROYECTO = process.env.GCLOUD_PROJECT || 'workcraft-491b7';

const fila = (u) => `${u.uid} | ${u.nombreUsuario} | ${u.nombreCompleto} | ${u.email}`;

(async () => {
  const db = getFirestore(initializeApp({ projectId: PROYECTO }));
  console.log(`REVISIÓN (sin escribir) — proyecto ${PROYECTO}`);
  const usuarios = (await db.collection('usuarios').get()).docs.map((d) => ({ uid: d.id, ...d.data() }));
  const r = analizarAccesoAdministradores(usuarios);
  console.log(`Usuarios: ${r.total}. Desarrolladores activos: ${r.desarrolladores.length}. Administradores activos: ${r.administradores.length}.`);

  console.log('\nDesarrolladores activos (mantienen acceso total):');
  r.desarrolladores.forEach((u) => console.log(`  - ${fila(u)}`));
  if (!r.desarrolladores.length) {
    console.log('  (ninguno)');
    console.log('\n!! NO PUBLIQUES: no hay ningún Desarrollador activo. Asigna el rol Desarrollador a tu cuenta antes.');
    process.exitCode = 2;
  }

  r.administradores.forEach((a) => {
    console.log(`\nAdministrador: ${fila(a)}`);
    console.log(`  Módulos asignados (${a.items} ítems): ${a.modulos.join(', ') || '(ninguno: no vería ningún módulo)'}`);
    a.pierde.forEach((p) => console.log(`  - Deja de ver: ${p}`));
    if (a.vistasSinConfigurar.length) console.log(`  - Vistas sin configuración granular (adentro quedarían bloqueadas): ${a.vistasSinConfigurar.join(', ')}`);
    if (a.accionesSinMarcar.length) console.log(`  - Acciones sensibles sin marcar: ${a.accionesSinMarcar.join(', ')}`);
  });
  console.log('\nNada escrito.');
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
