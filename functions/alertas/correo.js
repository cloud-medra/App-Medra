// Aviso por correo de una alerta nueva (complementario al buzón de la app).
//
// PREPARADO, NO ACTIVO: se activa cuando exista la cuenta remitente del
// sistema y esté instalada la extensión "Trigger Email from Firestore"
// (colección `mail`; el remitente es el "Default FROM" de la extensión).
// Para activarlo: ALERTAS_CORREO_HABILITADO=true en
// functions/.env.<proyecto> y desplegar las funciones. Mientras tanto no
// escribe nada. Un fallo del correo nunca hace fallar la solicitud.

const process = require('node:process');

const habilitadoPorDefecto = () => process.env.ALERTAS_CORREO_HABILITADO === 'true';

// alerta: { id, titulo, resumen, destinatarios }
const notificarAlerta = async (db, alerta, { habilitado = habilitadoPorDefecto() } = {}) => {
  if (!habilitado) return { enviados: 0, omitido: 'deshabilitado' };
  const perfiles = await Promise.all(alerta.destinatarios.map((uid) => db.collection('usuarios').doc(uid).get()));
  const correos = perfiles.map((s) => s.data()).filter((u) => u && u.activo !== false && u.email).map((u) => u.email);
  if (!correos.length) return { enviados: 0, omitido: 'sinCorreos' };
  await db.collection('mail').add({
    bcc: correos,
    message: {
      subject: `[Medra] ${alerta.titulo}`,
      text: `${alerta.resumen}\n\nRevísala en Administración → Alertas.`,
    },
    alertaId: alerta.id,
  });
  return { enviados: correos.length };
};

module.exports = { notificarAlerta };
