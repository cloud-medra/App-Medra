// Envío de un PDF de admisión a la papelera de Storage + registro de
// auditoría (ver nucleo.mjs). `bucket` y `db` llegan por parámetro (Admin
// SDK en index.js; simulados en documentosAdmision.test.js).
//
// Orden pensado para no dejar datos inconsistentes:
//   1) copiar a la papelera  → si falla, no cambió nada.
//   2) registrar auditoría   → si falla, se borra la copia.
//   3) borrar el original    → si falla, se borran copia y auditoría (el
//                              PDF sigue en la pestaña como antes).
// Si el original ya no existe, solo se deja la auditoría
// (archivoInexistente) y se avisa al cliente para que lo quite del listado.

const { validarSolicitud, rutaPapelera } = require('./nucleo.mjs');

class ErrorDocumento extends Error {
  constructor(codigo, mensaje) {
    super(mensaje);
    this.codigo = codigo;
  }
}

const noExiste = (err) => err?.code === 404;

// Limpieza durante una reversión: se registra pero no tapa el error original.
const intentar = async (fn, logger, contexto) => {
  try {
    await fn();
  } catch (err) {
    logger?.error?.('documentosAdmision: falló la reversión', { contexto, error: err?.message });
  }
};

const eliminarDocumento = async ({ bucket, db, datos, usuario, ahora = new Date(), marcaTiempo, logger }) => {
  const { config, id, nombre, error } = validarSolicitud(datos);
  if (error) throw new ErrorDocumento('invalid-argument', error);

  const ruta = datos.ruta;
  const auditoria = {
    modulo: datos.modulo,
    idAdmision: id,
    nombre,
    rutaOriginal: ruta,
    rutaPapelera: null,
    archivoInexistente: false,
    eliminadoPorUid: usuario.uid,
    eliminadoPorEmail: usuario.email || '',
    eliminadoPorNombre: usuario.nombre || '',
    eliminadoEl: marcaTiempo,
  };
  const refAuditoria = db.collection(config.coleccionAuditoria).doc();
  const original = bucket.file(ruta);

  const [existe] = await original.exists();
  if (!existe) {
    await refAuditoria.set({ ...auditoria, archivoInexistente: true });
    return { resultado: 'inexistente', auditoriaId: refAuditoria.id };
  }

  const destino = rutaPapelera(config, id, nombre, ahora);
  const copia = bucket.file(destino);

  try {
    await original.copy(copia);
  } catch (err) {
    logger?.error?.('documentosAdmision: no se pudo copiar a la papelera', { ruta, error: err?.message });
    throw new ErrorDocumento('internal', 'No se pudo mover el documento a la papelera. No se eliminó.');
  }

  try {
    await refAuditoria.set({ ...auditoria, rutaPapelera: destino });
  } catch (err) {
    logger?.error?.('documentosAdmision: no se pudo registrar la auditoría', { ruta, error: err?.message });
    await intentar(() => copia.delete({ ignoreNotFound: true }), logger, destino);
    throw new ErrorDocumento('internal', 'No se pudo registrar la eliminación. No se eliminó.');
  }

  try {
    await original.delete();
  } catch (err) {
    // Otra persona lo eliminó entre medio: la copia y la auditoría valen.
    if (!noExiste(err)) {
      logger?.error?.('documentosAdmision: no se pudo borrar el original', { ruta, error: err?.message });
      await intentar(() => copia.delete({ ignoreNotFound: true }), logger, destino);
      await intentar(() => refAuditoria.delete(), logger, refAuditoria.id);
      throw new ErrorDocumento('internal', 'No se pudo eliminar el documento. No se hicieron cambios.');
    }
  }

  return { resultado: 'eliminado', rutaPapelera: destino, auditoriaId: refAuditoria.id };
};

module.exports = { eliminarDocumento, ErrorDocumento };
