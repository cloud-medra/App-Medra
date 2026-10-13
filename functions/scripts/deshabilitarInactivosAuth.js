// functions/scripts/deshabilitarInactivosAuth.js
//
// Deshabilita en Firebase Auth (y revoca sus sesiones) a los usuarios que
// ya están inactivos (usuarios/{uid}.activo == false). Desde ahora lo hace
// guardarPermisosUsuario al inactivar; este script pone al día a los que se
// inactivaron antes. No modifica usuarios/*.
//
// También informa (sin tocarlos) a los usuarios activos cuya cuenta de Auth
// está deshabilitada y a los inactivos sin cuenta de Auth.
//
// Por defecto solo revisa (no escribe nada):
//   cd functions
//   node scripts/deshabilitarInactivosAuth.js            # revisión
//   node scripts/deshabilitarInactivosAuth.js --aplicar  # deshabilita
//
// Es idempotente: se puede volver a correr.
//
// Credenciales: Application Default Credentials del proyecto
// (`gcloud auth application-default login`, o GOOGLE_APPLICATION_CREDENTIALS).
// Con FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST definidos corre
// contra los emuladores. Proyecto: GCLOUD_PROJECT o workcraft-491b7.

const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const { revisarInactivosEnAuth, deshabilitarEnAuth } = require('../usuarios/servicio');

const PROYECTO = process.env.GCLOUD_PROJECT || 'workcraft-491b7';
const aplicar = process.argv.includes('--aplicar');

const listar = (titulo, filas) => {
  if (!filas.length) return;
  console.log(`\n${titulo}:`);
  filas.forEach((u) => console.log(`  - ${u.uid} | ${u.nombreUsuario ?? ''} | ${u.nombreCompleto} | ${u.email}`));
};

(async () => {
  const app = initializeApp({ projectId: PROYECTO });
  const [db, auth] = [getFirestore(app), getAuth(app)];
  console.log(`${aplicar ? 'APLICANDO' : 'REVISIÓN (sin escribir)'} — proyecto ${PROYECTO}`);
  const r = await revisarInactivosEnAuth(db, auth);
  console.log(`Usuarios: ${r.total}. Inactivos por deshabilitar en Auth: ${r.pendientes.length}. Ya deshabilitados: ${r.yaDeshabilitados.length}.`);
  listar('Inactivos con la cuenta de Auth habilitada (se deshabilitan con --aplicar)', r.pendientes);
  listar('Activos con la cuenta de Auth deshabilitada (no se tocan; revisar)', r.activosDeshabilitados);
  listar('Inactivos sin cuenta de Auth (nada que hacer)', r.sinCuenta);
  if (!aplicar) {
    console.log('\nNada escrito. Para deshabilitarlos: --aplicar');
    return;
  }
  const { deshabilitados, errores } = await deshabilitarEnAuth(auth, r.pendientes.map((u) => u.uid));
  console.log(`\nDeshabilitados en Auth (sesiones revocadas): ${deshabilitados}.`);
  errores.forEach((e) => console.log(`  ! ${e.uid}: ${e.error}`));
  if (errores.length) process.exitCode = 1;
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
