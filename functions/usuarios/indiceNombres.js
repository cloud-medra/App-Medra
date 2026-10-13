// Índice de nombres de usuario: nombres_usuario/{nombre normalizado} =
// { uid, nombreUsuario }. Como el id del documento es el nombre en
// minúsculas, dos usuarios no pueden tener el mismo nombre (sin distinguir
// mayúsculas). Solo lo escriben las Cloud Functions, en la misma transacción
// que usuarios/{uid}.nombreUsuario; el login lo usa para encontrar al usuario.

const { HttpsError } = require('firebase-functions/v2/https');
const { errorNombreUsuario, normalizarNombreUsuario, MENSAJE_NOMBRE_EN_USO } = require('./nombreUsuario.mjs');

const refNombre = (db, normalizado) => db.collection('nombres_usuario').doc(normalizado);

// Dentro de una transacción, antes de sus escrituras: valida el nombre,
// verifica que esté libre (o que ya sea de este usuario) y devuelve la
// función que escribe el índice (y libera el nombre anterior si era suyo).
const prepararNombreUsuario = async (db, t, uid, nombre, anterior) => {
  const error = errorNombreUsuario(nombre);
  if (error) throw new HttpsError('invalid-argument', error);
  const nuevo = normalizarNombreUsuario(nombre);
  const viejo = anterior ? normalizarNombreUsuario(anterior) : null;
  const snap = await t.get(refNombre(db, nuevo));
  if (snap.exists && snap.data().uid !== uid) throw new HttpsError('already-exists', MENSAJE_NOMBRE_EN_USO);
  const liberarViejo = Boolean(viejo) && viejo !== nuevo && (await t.get(refNombre(db, viejo))).data()?.uid === uid;
  return (escritor) => {
    escritor.set(refNombre(db, nuevo), { uid, nombreUsuario: String(nombre).trim() });
    if (liberarViejo) escritor.delete(refNombre(db, viejo));
  };
};

module.exports = { refNombre, prepararNombreUsuario };
