// Notificaciones de la campana del header, sobre el buzón genérico `alertas`
// (functions/alertas/servicio.js): mismas alertas, mismos destinatarios /
// noLeidas y mismas reglas de Firestore. Núcleo puro compartido por las
// Cloud Functions (functions/notificaciones) y el navegador (la campana).
//
// Dos clases:
//   - AGREGADAS (tipo 'pendientes'): lo que se acumula. UNA alerta por
//     fuente, con id fijo `pendientes_<fuente>` y la cantidad pendiente en el
//     título. La mantiene la función programada notificacionesPendientes:
//     se crea o reabre al haber pendientes, vuelve a "no leída" para todos
//     si la cantidad sube, y se resuelve (sale de la campana) al llegar a 0.
//   - POR CASO: un ticket nuevo (tipo 'ticket', id `ticket_<id>`, trigger
//     notificacionesTicket; se resuelve cuando el ticket deja de ser NUEVO) y
//     cada solicitud de cambio de datos (tipo 'solicitud', ya existía en
//     functions/solicitudes).
//
// Destinatarios: quien puede abrir la pantalla a la que lleva el clic (la
// ruta en sus permisos del menú, como el sidebar) y los desarrolladores.

export const TIPO_PENDIENTES = 'pendientes';
export const TIPO_TICKET = 'ticket';

export const RUTA_GESTION_TICKETS = '/administracion/tickets';
export const RUTA_AYUDA_SOPORTE = '/ajustes/ayudaSoporte';
export const RUTA_ALERTAS = '/administracion/alertas';

// Fuentes agregadas: módulo y ruta de la pantalla (permiso y destino del
// clic) y cómo nombrar la cantidad. La forma de contar está en servicio.js.
export const FUENTES_PENDIENTES = Object.freeze({
  zonas: {
    modulo: 'maestros', ruta: '/maestros/zonasDiagnostico',
    titulo: (n) => `${n} ${n === 1 ? 'zona por diagnóstico' : 'zonas por diagnóstico'} por revisar`,
    resumen: 'Maestros → Zonas por diagnóstico: descripciones sin zona asignada o con zona sugerida sin confirmar.',
  },
  solicitudImplantes: {
    modulo: 'implantes', ruta: '/implantes/solicitudImplantes',
    titulo: (n) => `${n} ${n === 1 ? 'gestión' : 'gestiones'} de Implantes por descargar`,
    resumen: 'Implantes → Solicitud: gestiones marcadas para solicitar, pendientes de descargar.',
  },
  solicitudConsignacion: {
    modulo: 'consignacion', ruta: '/consignacion/solicitudConsignacion',
    titulo: (n) => `${n} ${n === 1 ? 'ítem' : 'ítems'} de Consignación por descargar`,
    resumen: 'Consignación → Solicitud: ítems cargados, pendientes de descargar.',
  },
  solicitudHemodinamia: {
    modulo: 'hemodinamia', ruta: '/hemodinamia/solicitudHemodinamia',
    titulo: (n) => `${n} ${n === 1 ? 'gestión' : 'gestiones'} de Hemodinamia por descargar`,
    resumen: 'Hemodinamia → Solicitud: gestiones marcadas para solicitar, pendientes de descargar.',
  },
  descripciones: {
    modulo: 'maestros', ruta: '/maestros/descripcionesOcultas',
    titulo: (n) => `${n} ${n === 1 ? 'descripción' : 'descripciones'} de Reporte Info por revisar`,
    resumen: 'Maestros → Descripciones ocultas: descripciones nuevas pendientes de revisión.',
  },
});

export const idAlertaPendientes = (fuente) => `pendientes_${fuente}`;
export const idAlertaTicket = (ticketId) => `ticket_${ticketId}`;

const activo = (u) => Boolean(u) && u.activo !== false;
const idDe = (u) => u.uid ?? u.id;
const unicos = (lista) => [...new Set(lista.filter(Boolean))].sort();

// ¿El ítem está activo (Gestión de módulos)? `activos`: el documento
// configuracion_sistema/modulosActivos (o null = todo activo). Mismo
// criterio que src/config/modulosActivos.js, sin expandir contenedores.
export const rutaActiva = (activos, modulo, ruta) => !(activos?.modulosInactivos || []).includes(modulo)
  && !(activos?.itemsInactivos || []).includes(ruta);

// Quién puede abrir la ruta: la tiene en permisos[modulo] (o es dev).
export const puedeAbrir = (u, modulo, ruta) => activo(u)
  && (u.rol === 'dev' || (u.permisos?.[modulo] || []).includes(ruta));

export const destinatariosDeRuta = (usuarios, modulo, ruta) =>
  unicos(usuarios.filter((u) => puedeAbrir(u, modulo, ruta)).map(idDe));

// Ticket nuevo: quien gestiona tickets (dev o con el ítem) y los
// administradores asignados al autor que guardó el ticket (ver
// visibilidadTicket en src/.../soporte/ticketsConfig.js). Nunca el autor.
export const destinatariosTicket = (ticket, usuarios) => {
  const gestores = usuarios.filter((u) => puedeAbrir(u, 'administracion', RUTA_GESTION_TICKETS));
  const asignados = usuarios.filter((u) => activo(u) && u.rol === 'admin' && (
    (ticket.administradores || []).includes(idDe(u))
    || (ticket.centroAdministradores && (u.centrosAdministrados || []).includes(ticket.centroAdministradores))
  ));
  return unicos([...gestores, ...asignados].map(idDe)).filter((uid) => uid !== ticket.creadoPor);
};

// Qué escribir en la alerta agregada de una fuente. `previa`: la alerta
// guardada (o null); `cantidad`: lo pendiente ahora; `destinatarios`: los
// actuales. Devuelve null si no hay nada que cambiar, o
// { accion: 'crear' | 'actualizar' | 'resolver', datos }.
//   - 0 pendientes: se resuelve (si estaba pendiente).
//   - Sin alerta, resuelta o con MÁS pendientes que antes: no leída para
//     todos y al tope de la lista (creadoEl nuevo).
//   - Menos o los mismos: se actualiza la cantidad; siguen sin leer solo
//     los que no la habían leído (y los destinatarios nuevos).
export const cambioAlertaPendientes = (fuente, previa, cantidad, destinatarios) => {
  const def = FUENTES_PENDIENTES[fuente];
  const pendiente = previa?.estado === 'pendiente';
  if (!cantidad) return pendiente ? { accion: 'resolver', datos: { cantidad: 0 } } : null;
  const base = {
    tipo: TIPO_PENDIENTES,
    titulo: def.titulo(cantidad),
    resumen: def.resumen,
    datos: { fuente, ruta: def.ruta, modulo: def.modulo, cantidad },
    destinatarios,
  };
  if (!pendiente) return { accion: 'crear', datos: { ...base, noLeidas: destinatarios } };
  const anterior = Number(previa.datos?.cantidad) || 0;
  if (cantidad > anterior) return { accion: 'crear', datos: { ...base, noLeidas: destinatarios } };
  const nuevos = destinatarios.filter((uid) => !(previa.destinatarios || []).includes(uid));
  const noLeidas = unicos([...(previa.noLeidas || []).filter((uid) => destinatarios.includes(uid)), ...nuevos]);
  const igual = cantidad === anterior
    && destinatarios.join() === unicos(previa.destinatarios || []).join()
    && noLeidas.join() === unicos(previa.noLeidas || []).join();
  return igual ? null : { accion: 'actualizar', datos: { ...base, noLeidas } };
};

// Título y resumen de la alerta de un ticket nuevo.
export const alertaTicket = (ticketId, ticket) => ({
  tipo: TIPO_TICKET,
  titulo: `Ticket nuevo ${ticket.numero || ''}: ${ticket.titulo || 'Sin título'}`.replace(/\s+:/, ':'),
  resumen: [ticket.creadoPorNombre, ticket.tipo, ticket.prioridad && `prioridad ${String(ticket.prioridad).toLowerCase()}`].filter(Boolean).join(' · '),
  datos: { ticketId, numero: ticket.numero || null },
});

// Ruta a la que lleva el clic en la campana para este usuario.
// `puedeAbrirRuta(ruta)`: lo calcula el navegador con el menú del usuario.
export const rutaDeAlerta = (alerta, puedeAbrirRuta) => {
  if (alerta.tipo === TIPO_PENDIENTES) return alerta.datos?.ruta || null;
  if (alerta.tipo === TIPO_TICKET) return puedeAbrirRuta(RUTA_GESTION_TICKETS) ? RUTA_GESTION_TICKETS : RUTA_AYUDA_SOPORTE;
  if (alerta.tipo === 'solicitud') return RUTA_ALERTAS;
  return null;
};
