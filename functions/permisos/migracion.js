// Migración de las plantillas por centro (plantillas_permisos/{centroId},
// sin rol) a plantillas por centro + rol (plantillas_permisos/{centroId}__{rol}).
// La usa functions/scripts/migrarPlantillasPorRol.js (y sus pruebas).
//
// Cada plantilla antigua pasa a ser la de Operador y, si en ese centro hay
// usuarios con otro rol que usa plantilla (Encargado de centro), también la
// de ese rol: así ningún usuario gana ni pierde permisos. Los demás roles
// quedan "Sin configurar". Se copian los logs, se agrega uno "MIGRACION" y
// se borra la antigua. Nunca pisa una plantilla centro + rol que ya exista
// (la informa como conflicto). Es idempotente: sin plantillas antiguas no
// hace nada.

const { FieldValue } = require('firebase-admin/firestore');
const {
  combinar, normalizarExcepciones, idPlantilla, idPlantillaDeUsuario, esRolSinPlantilla, ROLES_CON_PLANTILLA, ROL_POR_DEFECTO, SIN_EXCEPCIONES,
} = require('./nucleo.mjs');

const ROL_DESTINO = ROL_POR_DEFECTO; // 'operador'
const estable = (v) => JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x)
  ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]]))
  : x));

const migrarPlantillasPorRol = async (db, { aplicar = false } = {}) => {
  const coleccion = db.collection('plantillas_permisos');
  const todas = await coleccion.get();
  const existentes = new Set(todas.docs.map((d) => d.id));
  const antiguas = todas.docs.filter((d) => !d.id.includes('__'));
  const resultado = [];

  for (const antigua of antiguas) {
    const centroId = antigua.id;
    const datos = antigua.data();
    const plantilla = { permisos: datos.permisos || {}, permisosGranulares: datos.permisosGranulares || {} };
    const usuarios = (await db.collection('usuarios').where('centroCostoId', '==', centroId).get()).docs
      .map((d) => ({ id: d.id, ...d.data() }));
    const rolesConUsuarios = ROLES_CON_PLANTILLA.filter((r) => usuarios.some((u) => (u.rol || ROL_POR_DEFECTO) === r));
    const roles = [...new Set([ROL_DESTINO, ...rolesConUsuarios])];
    const destinos = roles.filter((r) => !existentes.has(idPlantilla(centroId, r)));
    const conflictos = roles.filter((r) => existentes.has(idPlantilla(centroId, r)));

    // Verificación: el permiso efectivo de cada usuario del centro antes
    // (plantilla antigua) y después (plantilla de su rol) debe ser el mismo.
    // admin/dev no cuentan: tienen acceso total y no usan plantilla.
    const nuevas = new Map(roles.map((r) => [idPlantilla(centroId, r), conflictos.includes(r)
      ? null // la existente se respeta
      : plantilla]));
    const cambian = usuarios.filter((u) => !esRolSinPlantilla(u.rol)).filter((u) => {
      const exc = normalizarExcepciones(u.excepciones || SIN_EXCEPCIONES);
      const antes = combinar(plantilla, exc);
      const id = idPlantillaDeUsuario(centroId, u.rol || ROL_POR_DEFECTO);
      const despues = combinar(id ? nuevas.get(id) ?? null : null, exc);
      return estable(antes) !== estable(despues);
    }).map((u) => u.id);

    resultado.push({ centroId, roles: destinos, conflictos, usuarios: usuarios.length, rolesConUsuarios, cambian });

    if (aplicar && conflictos.length === 0) {
      const logs = (await antigua.ref.collection('logs').get()).docs;
      const lote = db.batch();
      destinos.forEach((rol) => {
        const ref = coleccion.doc(idPlantilla(centroId, rol));
        lote.set(ref, { ...datos, centroId, rol, migradoDe: centroId, migradoEl: FieldValue.serverTimestamp() });
        logs.forEach((l) => lote.set(ref.collection('logs').doc(l.id), l.data()));
        lote.set(ref.collection('logs').doc(), {
          accion: 'MIGRACION', detalle: { de: centroId, a: idPlantilla(centroId, rol), centroId, rol },
          usuario: 'Migración plantillas por rol', usuarioUid: null, fecha: FieldValue.serverTimestamp(),
        });
      });
      logs.forEach((l) => lote.delete(l.ref));
      lote.delete(antigua.ref);
      await lote.commit();
    }
  }
  return resultado;
};

module.exports = { migrarPlantillasPorRol };
