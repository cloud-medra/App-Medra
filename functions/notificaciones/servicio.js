// Notificaciones de la campana (ver nucleo.mjs): conteo de pendientes y
// sincronización de las alertas agregadas, y alerta por ticket nuevo.
// Separado de los triggers (index.js) para probarlo con Firestore simulado.
//
// Lecturas por corrida de notificacionesPendientes: la configuración de
// módulos activos, las 5 alertas agregadas y un count() por fuente (1
// lectura por cada 1.000 documentos), más las descripciones pendientes (las
// revisadas pierden `pendienteDesde` en la corrida siguiente, así que no se
// acumulan). Los usuarios (destinatarios) solo se
// leen si la cantidad cambió o pasaron más de REFRESCAR_DESTINATARIOS_MS.

const { FieldValue, FieldPath } = require('firebase-admin/firestore');
const {
  FUENTES_PENDIENTES, RUTA_GESTION_TICKETS, idAlertaPendientes, idAlertaTicket,
  rutaActiva, destinatariosDeRuta, destinatariosTicket, cambioAlertaPendientes, alertaTicket,
} = require('./nucleo.mjs');
const { COLECCION_DESCRIPCIONES, esPendiente } = require('../descripcionesReporte/nucleo.mjs');
const { ESTADOS: ESTADOS_ZONA } = require('../bodymap/nucleo.mjs');

const REFRESCAR_DESTINATARIOS_MS = 6 * 60 * 60 * 1000;
const refAlerta = (db, id) => db.collection('alertas').doc(id);
const contar = async (q) => (await q.count().get()).data().count || 0;

// detalles de un módulo (collectionGroup acotado por documentId, como las
// pantallas de Solicitud: usa los índices de `solicitud` y `estado` que ya existen).
const detallesDe = (db, raiz) => db.collectionGroup('detalles')
  .where(FieldPath.documentId(), '>=', `${raiz}/0000`)
  .where(FieldPath.documentId(), '<', `${raiz}/9999`);

// Cuántos pendientes hay de cada fuente (mismo criterio que su pantalla).
const CONTADORES = {
  // Zonas sin confirmar: "Sin asignar" o "Sugerida".
  zonas: (db) => contar(db.collection('maestros_zonas_diagnostico')
    .where('estado', 'in', [ESTADOS_ZONA.SIN_ASIGNAR, ESTADOS_ZONA.SUGERIDA])),
  // Gestiones marcadas para solicitar (Solicitud las lista para descargar).
  solicitudImplantes: (db) => contar(detallesDe(db, 'implantes_gestiones').where('solicitud', '==', 'SOLICITAR')),
  solicitudHemodinamia: (db) => contar(detallesDe(db, 'hemodinamia_gestiones').where('solicitud', '==', 'SOLICITAR')),
  // Ítems cargados (candidatos de Solicitud Consignación).
  solicitudConsignacion: (db) => contar(detallesDe(db, 'consignacion_registros').where('estado', '==', 'CARGADO')),
  // Pendiente = pendienteDesde sin actualizadoEl (esPendiente). Firestore no
  // filtra por campo ausente: se leen las que tienen pendienteDesde y se
  // filtra aquí. A las ya revisadas (con actualizadoEl) se les quita
  // pendienteDesde, así la consulta solo trae las pendientes y no crece con
  // el tiempo; quedan igual que las anteriores al campo (revisadas).
  descripciones: async (db) => {
    const snap = await db.collection(COLECCION_DESCRIPCIONES)
      .where('pendienteDesde', '!=', null).select('pendienteDesde', 'actualizadoEl').get();
    const revisadas = snap.docs.filter((d) => !esPendiente(d.data()));
    await limpiarRevisadas(db, revisadas);
    return snap.size - revisadas.length;
  },
};

// Quita pendienteDesde de descripciones ya revisadas (lotes de 400). El
// trigger descripcionesReporteMaestro se dispara pero no hace nada: solo
// recalcula filas si cambian los switches de ocultar.
const limpiarRevisadas = async (db, docs) => {
  for (let i = 0; i < docs.length; i += 400) {
    const lote = db.batch();
    docs.slice(i, i + 400).forEach((d) => lote.update(d.ref, { pendienteDesde: FieldValue.delete() }));
    await lote.commit();
  }
};

const datosDe = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));
const usuariosDev = async (db) => datosDe(await db.collection('usuarios').where('rol', '==', 'dev').get());
const usuariosConRuta = async (db, modulo, ruta) =>
  datosDe(await db.collection('usuarios').where(`permisos.${modulo}`, 'array-contains', ruta).get());

const milisDe = (ts) => (ts?.toMillis ? ts.toMillis() : 0);

// Escribe el cambio de una alerta agregada (o de ticket) con la forma de
// functions/alertas/servicio.js.
const escribirCambio = (ref, cambio) => {
  if (cambio.accion === 'resolver') {
    return ref.update({
      estado: 'resuelta', resultado: 'sin_pendientes', noLeidas: [], resueltaEl: FieldValue.serverTimestamp(), 'datos.cantidad': 0,
    });
  }
  if (cambio.accion === 'crear') {
    return ref.set({
      ...cambio.datos, estado: 'pendiente', resultado: null, resueltaEl: null,
      creadoEl: FieldValue.serverTimestamp(), destinatariosEl: FieldValue.serverTimestamp(),
    });
  }
  return ref.update({ ...cambio.datos, destinatariosEl: FieldValue.serverTimestamp() });
};

// Corrida de notificacionesPendientes. `ahora`: para probar.
const sincronizarPendientes = async (db, { ahora = Date.now() } = {}) => {
  const fuentes = Object.keys(FUENTES_PENDIENTES);
  const configActivos = await db.collection('configuracion_sistema').doc('modulosActivos').get();
  const activos = configActivos.exists ? configActivos.data() : null;
  const [previas, cantidades] = await Promise.all([
    db.getAll(...fuentes.map((f) => refAlerta(db, idAlertaPendientes(f)))),
    // Un ítem inactivo no lo abre nadie: cuenta como 0 (se resuelve).
    Promise.all(fuentes.map((f) => {
      const { modulo, ruta } = FUENTES_PENDIENTES[f];
      return rutaActiva(activos, modulo, ruta) ? CONTADORES[f](db) : 0;
    })),
  ]);

  let devs = null;
  const resultado = {};
  for (const [i, fuente] of fuentes.entries()) {
    const previa = previas[i].exists ? previas[i].data() : null;
    const cantidad = cantidades[i];
    const { modulo, ruta } = FUENTES_PENDIENTES[fuente];
    const sinCambio = previa?.estado === 'pendiente' && cantidad > 0
      && cantidad === Number(previa.datos?.cantidad)
      && ahora - milisDe(previa.destinatariosEl) < REFRESCAR_DESTINATARIOS_MS;
    if (sinCambio || (!cantidad && previa?.estado !== 'pendiente')) {
      resultado[fuente] = { cantidad, accion: null };
      continue;
    }
    let destinatarios = [];
    if (cantidad) {
      devs = devs || await usuariosDev(db);
      destinatarios = destinatariosDeRuta([...devs, ...await usuariosConRuta(db, modulo, ruta)], modulo, ruta);
    }
    // Pendientes que nadie puede abrir cuentan como 0 (se resuelve).
    const cambio = cambioAlertaPendientes(fuente, previa, destinatarios.length ? cantidad : 0, destinatarios);
    if (cambio) await escribirCambio(refAlerta(db, idAlertaPendientes(fuente)), cambio);
    resultado[fuente] = { cantidad, accion: cambio?.accion || null };
  }
  return resultado;
};

// Usuarios que pueden recibir la alerta de un ticket: devs, quienes tienen
// "Gestionar tickets" y los administradores guardados en el ticket.
const usuariosParaTicket = async (db, ticket) => {
  const [devs, gestores, asignados, delCentro] = await Promise.all([
    usuariosDev(db),
    usuariosConRuta(db, 'administracion', RUTA_GESTION_TICKETS),
    (ticket.administradores || []).length
      ? db.getAll(...ticket.administradores.map((uid) => db.collection('usuarios').doc(uid)))
        .then((snaps) => snaps.filter((s) => s.exists).map((s) => ({ id: s.id, ...s.data() })))
      : [],
    ticket.centroAdministradores
      ? usuariosEnCentro(db, ticket.centroAdministradores)
      : [],
  ]);
  return [...devs, ...gestores, ...asignados, ...delCentro];
};
// Sin filtrar por rol en la consulta (evita un índice compuesto): lo filtra destinatariosTicket.
const usuariosEnCentro = async (db, centro) =>
  datosDe(await db.collection('usuarios').where('centrosAdministrados', 'array-contains', centro).get());

// Ticket creado / editado (trigger). Solo hace algo al crearse NUEVO (crea
// la alerta) o al dejar de ser NUEVO / eliminarse (la resuelve); los
// mensajes y demás ediciones no leen nada.
const aplicarCambioTicket = async (db, ticketId, antes, despues) => {
  const eraNuevo = antes?.estado === 'NUEVO';
  const esNuevo = despues?.estado === 'NUEVO';
  const ref = refAlerta(db, idAlertaTicket(ticketId));
  if (!antes && esNuevo) {
    const destinatarios = destinatariosTicket(despues, await usuariosParaTicket(db, despues));
    if (!destinatarios.length) return { accion: null, destinatarios: 0 };
    await ref.set({
      ...alertaTicket(ticketId, despues), destinatarios, noLeidas: destinatarios,
      estado: 'pendiente', resultado: null, creadoEl: FieldValue.serverTimestamp(), resueltaEl: null,
    });
    return { accion: 'crear', destinatarios: destinatarios.length };
  }
  if (eraNuevo && !esNuevo) {
    const previa = await ref.get();
    if (!previa.exists || previa.get('estado') !== 'pendiente') return { accion: null };
    await ref.update({
      estado: 'resuelta', resultado: despues?.estado || 'eliminado', noLeidas: [], resueltaEl: FieldValue.serverTimestamp(),
    });
    return { accion: 'resolver' };
  }
  return { accion: null };
};

module.exports = { sincronizarPendientes, aplicarCambioTicket, CONTADORES };
