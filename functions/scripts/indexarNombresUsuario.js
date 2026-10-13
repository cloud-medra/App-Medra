// functions/scripts/indexarNombresUsuario.js
//
// Crea el índice nombres_usuario/{nombre en minúsculas} = { uid, nombreUsuario }
// para los usuarios existentes (login con nombre de usuario y unicidad, ver
// functions/usuarios). Sin entrada en el índice, un usuario solo puede
// entrar con su correo.
//
// Antes informa los nombres que NO se pueden indexar: vacíos, con "@",
// espacios u otros caracteres no permitidos, o repetidos sin distinguir
// mayúsculas. Esos usuarios no se tocan: hay que corregirlos a mano
// (Administración → Usuarios → Editar) y volver a correr el script.
// Nunca modifica usuarios/*.
//
// Por defecto solo revisa (no escribe nada):
//   cd functions
//   node scripts/indexarNombresUsuario.js            # revisión
//   node scripts/indexarNombresUsuario.js --aplicar  # escribe el índice
//
// Es idempotente: se puede volver a correr.
//
// Credenciales: Application Default Credentials del proyecto
// (`gcloud auth application-default login`, o GOOGLE_APPLICATION_CREDENTIALS).
// Con FIRESTORE_EMULATOR_HOST definido corre contra el emulador. Proyecto:
// GCLOUD_PROJECT o workcraft-491b7.

const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { revisarNombresUsuario, indexarNombresUsuario } = require('../usuarios/servicio');

const PROYECTO = process.env.GCLOUD_PROJECT || 'workcraft-491b7';
const aplicar = process.argv.includes('--aplicar');

(async () => {
  const db = getFirestore(initializeApp({ projectId: PROYECTO }));
  console.log(`${aplicar ? 'APLICANDO' : 'REVISIÓN (sin escribir)'} — proyecto ${PROYECTO}`);
  const { total, entradas, problemas } = await revisarNombresUsuario(db);
  console.log(`Usuarios: ${total}. Nombres indexables: ${entradas.length}. Con problemas: ${problemas.length}.`);
  if (problemas.length) {
    console.log('\nNo se indexan (corregir a mano):');
    problemas.forEach((p) => console.log(`  - ${p.uid} | ${JSON.stringify(p.nombreUsuario)} | ${p.nombreCompleto} | ${p.email}${p.activo ? '' : ' | INACTIVO'}\n    ${p.motivo}`));
  }
  if (!aplicar) {
    console.log('\nNada escrito. Para crear el índice: --aplicar');
    return;
  }
  const { escritas, omitidas } = await indexarNombresUsuario(db, entradas);
  console.log(`\nÍndice: ${escritas} entradas escritas.`);
  omitidas.forEach((e) => console.log(`  ! "${e.normalizado}" ya está indexado para otro usuario; no se tocó (${e.uid}).`));
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
