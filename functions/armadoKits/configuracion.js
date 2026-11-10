// Configuración de la receta de una familia de kits (Function kitsConfiguracion).
//
//   kits_configuracion/{familia} = { familia, componentes, modelos, version,
//     creadoPor/En, actualizadoPor/En } (ver receta.mjs)
//     /logs/{id}: qué cambió, quién y cuándo.
//
// Se guarda completa, comparando la versión que vio el usuario: si otro la
// cambió entre medio, se rechaza en vez de pisar ese cambio. Cada referencia
// se valida contra el maestro de Bodega dentro de la misma transacción. No
// toca kits armados: cada uno conserva su contenido.

const { HttpsError } = require('firebase-functions/v2/https');
const { COL } = require('../bodega/nucleo.mjs');
const { internos } = require('../bodega/servicio');
const { COL_KITS, FAMILIAS_KIT, accionConfiguracionKits } = require('./nucleo.mjs');
const { COL_CONFIGURACION_KITS, validarConfiguracion, cambiosConfiguracion, claveVariante } = require('./receta.mjs');

const { perfilActivo, exigir, datosPor, exigirSinErrores, registrarLog, ahora } = internos;

const guardarConfiguracionComo = (db, por, datos = {}) => {
  const familia = String(datos.familia || '');
  if (!FAMILIAS_KIT[familia]) throw new HttpsError('invalid-argument', 'El tipo de kit no existe.');
  const versionEsperada = Number(datos.versionEsperada);
  if (!Number.isInteger(versionEsperada) || versionEsperada < 0) throw new HttpsError('invalid-argument', 'Actualiza la página e inténtalo de nuevo.');

  return db.runTransaction(async (t) => {
    const ref = db.collection(COL_CONFIGURACION_KITS).doc(familia);
    const [snap, snapProductos] = await Promise.all([t.get(ref), t.get(db.collection(COL.productos))]);
    const actual = snap.exists ? snap.data() : null;
    const versionActual = Number(actual?.version) || 0;
    if (versionEsperada !== versionActual) {
      throw new HttpsError('failed-precondition', 'Otro usuario cambió la configuración recién. Actualiza y vuelve a hacer tu cambio.', { motivo: 'cambio-concurrente' });
    }
    const { errores, config } = validarConfiguracion(datos, snapProductos.docs.map((d) => ({ id: d.id, ...d.data() })));
    exigirSinErrores(errores);

    // Un modelo con kits armados no se quita ni cambia de género o vaina:
    // esos kits quedarían con una referencia que ya no significa lo mismo.
    const tocados = (actual?.modelos || []).filter((m) => {
      const nuevo = config.modelos.find((n) => n.referencia === m.referencia);
      return !nuevo || claveVariante(nuevo.genero, nuevo.vaina) !== claveVariante(m.genero, m.vaina);
    });
    for (const m of tocados) {
      const kits = await t.get(db.collection(COL_KITS).where('referencia', '==', m.referencia).limit(1));
      if (!kits.empty) throw new HttpsError('failed-precondition', `El modelo ${m.referencia} ya tiene kits: desactívalo en vez de quitarlo o cambiarle el género o la vaina.`);
    }

    const cambios = cambiosConfiguracion(actual, config);
    if (!cambios.length) return { version: versionActual, sinCambios: true, cambios };
    const version = versionActual + 1;
    t.set(ref, {
      familia, ...config, version,
      creadoPor: actual?.creadoPor || por, creadoEn: actual?.creadoEn || ahora(),
      actualizadoPor: por, actualizadoEn: ahora(),
    });
    registrarLog(t, ref, actual ? 'CONFIGURACION_EDITADA' : 'CONFIGURACION_CREADA', por, { cambios, versionAnterior: versionActual, version });
    return { version, cambios };
  });
};

const guardarConfiguracion = async (db, uid, datos = {}) => {
  const perfil = await perfilActivo(db, uid);
  if (!FAMILIAS_KIT[datos.familia]) throw new HttpsError('invalid-argument', 'El tipo de kit no existe.');
  exigir(perfil, accionConfiguracionKits(datos.familia));
  return guardarConfiguracionComo(db, datosPor(uid, perfil), datos);
};

module.exports = { guardarConfiguracion, guardarConfiguracionComo };
