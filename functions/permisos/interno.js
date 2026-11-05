// Las Cloud Functions no pasan por las reglas de Firestore: toda Function que no
// sea para usuarios externos los rechaza aquí, también las que solo exigen sesión.
// La única abierta a ellos es iniciarSesion.

const { HttpsError } = require('firebase-functions/v2/https');
const { esExterno } = require('./nucleo.mjs');

const MENSAJE_SOLO_INTERNOS = 'Esta función no está disponible para usuarios externos.';

const exigirInterno = (perfil) => {
  if (esExterno(perfil)) throw new HttpsError('permission-denied', MENSAJE_SOLO_INTERNOS);
};

module.exports = { exigirInterno, MENSAJE_SOLO_INTERNOS };
