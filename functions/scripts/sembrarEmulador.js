// functions/scripts/sembrarEmulador.js
//
// Datos de prueba para probar a mano contra los EMULADORES (login con
// usuario o correo, bloqueo, inactivos, permisos de Lista de usuarios).
// Borra todo lo que haya en los emuladores de Firestore y Auth y crea:
//
//   usuario      correo                   situación
//   admin        admin@prueba.cl          admin (acceso total)
//   operador     operador@prueba.cl       Lista de usuarios con "Desbloquear" marcado
//   sinpermiso   sinpermiso@prueba.cl     Lista de usuarios SIN "Desbloquear"
//                                         configurado (denegado por defecto)
//   inactivo     inactivo@prueba.cl       inactivo y deshabilitado en Auth
//   inactivoprevio inactivoprevio@prueba.cl inactivo de antes del cambio: aún
//                                         habilitado en Auth (ver el aviso
//                                         "deshabilitado" y el script
//                                         deshabilitarInactivosAuth)
//   bloqueado    bloqueado@prueba.cl      bloqueado por 5 intentos fallidos
//   nuevo        nuevo@prueba.cl          primer ingreso (Cambiar contraseña)
//
// Contraseña de todos: Prueba123. Nombres de usuario indexados.
//
// Solo corre contra emuladores (se niega si faltan FIRESTORE_EMULATOR_HOST
// y FIREBASE_AUTH_EMULATOR_HOST, o si el proyecto no es "demo-"):
//   npm run emuladores           # en otra terminal, antes
//   npm run emuladores:sembrar

const process = require('node:process');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const servicio = require('../usuarios/servicio');

const PROYECTO = process.env.GCLOUD_PROJECT || '';
const FIRESTORE = process.env.FIRESTORE_EMULATOR_HOST;
const AUTH = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const PASSWORD = 'Prueba123';
const LISTADO = '/administracion/listadoUsuario';

if (!FIRESTORE || !AUTH || !PROYECTO.startsWith('demo-')) {
  console.error('Solo para emuladores: define FIRESTORE_EMULATOR_HOST, FIREBASE_AUTH_EMULATOR_HOST y GCLOUD_PROJECT=demo-… (npm run emuladores:sembrar).');
  process.exit(1);
}

const listado = (elements) => ({
  permisos: { administracion: [LISTADO] },
  permisosGranulares: { [LISTADO]: { tabla_usuarios: { visible: true, elements } } },
});

const USUARIOS = [
  { nombreUsuario: 'admin', nombreCompleto: 'Admin Prueba', rol: 'admin', permisos: {}, permisosGranulares: {} },
  { nombreUsuario: 'operador', nombreCompleto: 'Operador Con Permisos', rol: 'operador', ...listado({ btn_desbloquear: true }) },
  { nombreUsuario: 'sinpermiso', nombreCompleto: 'Operador Sin Permisos', rol: 'operador', ...listado({}) },
  { nombreUsuario: 'inactivo', nombreCompleto: 'Usuario Inactivo', rol: 'operador', activo: false, deshabilitadoEnAuth: true, ...listado({}) },
  { nombreUsuario: 'inactivoprevio', nombreCompleto: 'Inactivo Previo', rol: 'operador', activo: false, ...listado({}) },
  { nombreUsuario: 'bloqueado', nombreCompleto: 'Usuario Bloqueado', rol: 'operador', bloquear: true, ...listado({}) },
  { nombreUsuario: 'nuevo', nombreCompleto: 'Usuario Nuevo', rol: 'operador', passwordChanged: false, ...listado({}) },
];

(async () => {
  const app = initializeApp({ projectId: PROYECTO });
  const [db, auth] = [getFirestore(app), getAuth(app)];

  await fetch(`http://${FIRESTORE}/emulator/v1/projects/${PROYECTO}/databases/(default)/documents`, { method: 'DELETE' });
  await fetch(`http://${AUTH}/emulator/v1/projects/${PROYECTO}/accounts`, { method: 'DELETE' });

  const verificarPassword = servicio.verificarPasswordRest('demo');
  for (const u of USUARIOS) {
    const { deshabilitadoEnAuth, bloquear, passwordChanged = true, ...perfil } = u;
    const email = `${u.nombreUsuario}@prueba.cl`;
    const { uid } = await auth.createUser({ email, password: PASSWORD, disabled: Boolean(deshabilitadoEnAuth) });
    await db.collection('usuarios').doc(uid).set({ ...perfil, email, passwordChanged, modoPantalla: 'claro' });
    await db.collection('nombres_usuario').doc(u.nombreUsuario).set({ uid, nombreUsuario: u.nombreUsuario });
    if (bloquear) {
      for (let i = 0; i < servicio.MAX_FALLOS; i += 1) {
        await servicio.iniciarSesion(db, auth, { identificador: u.nombreUsuario, password: 'incorrecta' }, { verificarPassword }).catch(() => {});
      }
    }
    console.log(`  ${u.nombreUsuario.padEnd(15)} ${email.padEnd(26)} ${uid}`);
  }
  console.log(`\nListo (proyecto ${PROYECTO}). Contraseña de todos: ${PASSWORD}`);
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
