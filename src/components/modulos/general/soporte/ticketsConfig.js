// Ayuda y soporte: tickets para reportar errores, pedir mejoras o
// integraciones y hacer consultas. Lógica pura (sin Firebase).
//
// Un ticket es UN documento tickets/{id} con su conversación adentro
// (`mensajes`): abrirlo cuesta 1 lectura. Campos:
//   numero, tipo, titulo, descripcion, prioridad, modulo, capturas[],
//   contexto { vista, url, navegador, versionApp, fechaCliente },
//   creadoPor (uid), creadoPorNombre, creadoPorEmail,
//   estado, mensajes[], creadoEl, actualizadoEl,
//   noLeidoUsuario  (el creador tiene novedades sin ver: respuesta o cambio de estado),
//   pendienteGestor (nuevo o con respuesta del usuario, sin revisar por quien gestiona).
// Los indicadores consultan esas dos marcas con limit, nunca todos los tickets.

import { VERSION_APP } from '../../../../config/versionApp';

export const COLECCION_TICKETS = 'tickets';
// Contador correlativo (TK-0001…): tickets_meta/contador = { ultimo }.
export const DOC_CONTADOR_TICKETS = ['tickets_meta', 'contador'];

// Pantalla de gestión (ítem de Herramientas = permiso "Gestionar tickets").
export const RUTA_GESTION_TICKETS = '/administracion/tickets';
export const RUTA_AYUDA_SOPORTE = '/ajustes/ayudaSoporte';

export const TAMANO_PAGINA_TICKETS = 20;
export const MAX_CAPTURAS = 3;
export const MAX_TITULO = 120;
export const MAX_DESCRIPCION = 4000;
export const MAX_MENSAJE = 4000;

export const TIPOS_TICKET = [
  { id: 'ERROR', label: 'Error o problema' },
  { id: 'MEJORA', label: 'Solicitud de mejora o integración' },
  { id: 'CONSULTA', label: 'Consulta' },
];

export const PRIORIDADES_TICKET = [
  { id: 'BAJA', label: 'Baja', tono: 'neutro' },
  { id: 'MEDIA', label: 'Media', tono: 'aviso' },
  { id: 'ALTA', label: 'Alta', tono: 'peligro' },
];

// Estados: Nuevo → En revisión → En progreso → Resuelto / Respondido / Rechazado.
export const ESTADOS_TICKET = [
  { id: 'NUEVO', label: 'Nuevo', tono: 'acento' },
  { id: 'EN_REVISION', label: 'En revisión', tono: 'aviso' },
  { id: 'EN_PROGRESO', label: 'En progreso', tono: 'violeta' },
  { id: 'RESUELTO', label: 'Resuelto', tono: 'exito', final: true },
  { id: 'RESPONDIDO', label: 'Respondido', tono: 'exito', final: true },
  { id: 'RECHAZADO', label: 'Rechazado', tono: 'peligro', final: true },
];

const porId = (lista) => Object.fromEntries(lista.map((x) => [x.id, x]));
export const TIPO_POR_ID = porId(TIPOS_TICKET);
export const PRIORIDAD_POR_ID = porId(PRIORIDADES_TICKET);
export const ESTADO_POR_ID = porId(ESTADOS_TICKET);

export const etiquetaTipo = (id) => TIPO_POR_ID[id]?.label || id || '—';
export const etiquetaEstado = (id) => ESTADO_POR_ID[id]?.label || id || '—';
export const etiquetaPrioridad = (id) => PRIORIDAD_POR_ID[id]?.label || id || '—';

// TK-0001 (mínimo 4 dígitos).
export const codigoTicket = (numero) => `TK-${String(numero ?? 0).padStart(4, '0')}`;

// "TK-12", "tk 0012" o "12" -> 12; si no es un número de ticket, null.
export const numeroDesdeBusqueda = (texto) => {
  const m = String(texto ?? '').trim().match(/^(?:tk[-\s]?)?0*(\d{1,7})$/i);
  return m ? Number(m[1]) : null;
};

// Contexto técnico que se guarda al crear el ticket (lo ve quien gestiona).
export const contextoTecnico = ({ vista, ahora = new Date() } = {}) => ({
  vista: vista || '',
  url: typeof window !== 'undefined' ? window.location.href : '',
  navegador: typeof navigator !== 'undefined' ? navigator.userAgent : '',
  idioma: typeof navigator !== 'undefined' ? navigator.language || '' : '',
  pantalla: typeof window !== 'undefined' ? `${window.innerWidth}×${window.innerHeight}` : '',
  versionApp: VERSION_APP,
  fechaCliente: ahora.toISOString(),
});

// Quién ve el ticket además del autor y los desarrolladores: el o los
// administradores asignados al autor AL CREARLO (se guarda en el ticket y no
// cambia después). Sale de los datos del usuario ya cargados, con el mismo
// criterio de Usuarios y accesos (functions/solicitudes/destinatarios.mjs):
//   - Operador o Encargado con centro:
//       · "todos los administradores del centro" -> centroAdministradores
//         = su centro (lo ve cualquier administrador de ese centro);
//       · si no, administradores = sus administradoresAsignados.
//   - Sin centro o sin administradores asignados, o si el autor es
//     Administrador o Desarrollador: nadie más (listas vacías).
// firestore.rules (ticketNuevoValido) exige estos mismos valores contra el
// perfil del autor, así que no se pueden falsear.
const ROLES_CON_ADMINISTRADOR = ['operador', 'encargado'];
export const visibilidadTicket = (userData) => {
  const rol = userData?.rol || 'operador';
  const centro = userData?.centroCostoId;
  const usaAdministradores = ROLES_CON_ADMINISTRADOR.includes(rol) && centro !== undefined && centro !== null && centro !== '';
  const todos = userData?.todosLosAdministradoresDelCentro === true;
  return {
    administradores: usaAdministradores && !todos ? [...(userData?.administradoresAsignados || [])] : [],
    centroAdministradores: usaAdministradores && todos ? centro : null,
  };
};

// Validación del formulario de un ticket nuevo: { campo: mensaje }.
export const validarTicketNuevo = (t) => {
  const errores = {};
  if (!TIPO_POR_ID[t.tipo]) errores.tipo = 'Elige un tipo';
  if (!String(t.titulo || '').trim()) errores.titulo = 'El título es obligatorio';
  else if (t.titulo.trim().length > MAX_TITULO) errores.titulo = `Máximo ${MAX_TITULO} caracteres`;
  if (!String(t.descripcion || '').trim()) errores.descripcion = 'Describe el problema o la solicitud';
  else if (t.descripcion.trim().length > MAX_DESCRIPCION) errores.descripcion = `Máximo ${MAX_DESCRIPCION} caracteres`;
  if (!PRIORIDAD_POR_ID[t.prioridad]) errores.prioridad = 'Elige una prioridad';
  if (!String(t.modulo || '').trim()) errores.modulo = 'Elige un módulo';
  if ((t.capturas || []).length > MAX_CAPTURAS) errores.capturas = `Máximo ${MAX_CAPTURAS} capturas`;
  return errores;
};

// Entrada de la conversación. `fecha` es la del cliente (las listas de
// Firestore no admiten serverTimestamp() adentro); el orden es el de la lista.
export const crearMensaje = ({ autor, deGestor, texto, tipo = 'mensaje', estadoAnterior, estadoNuevo, motivo, fecha = new Date() }) => ({
  id: `${fecha.getTime().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
  tipo,
  autorUid: autor?.uid || '',
  autorNombre: autor?.nombreCompleto || autor?.email || 'Usuario',
  deGestor: Boolean(deGestor),
  texto: String(texto || '').trim(),
  ...(estadoAnterior !== undefined ? { estadoAnterior } : {}),
  ...(estadoNuevo !== undefined ? { estadoNuevo } : {}),
  ...(motivo !== undefined ? { motivo: String(motivo).trim() } : {}),
  fecha,
});

// Cambio de estado (quien gestiona). Rechazar exige motivo. Devuelve
// { error } o { cambios } con el estado y su registro en la conversación.
export const cambioDeEstado = (ticket, estadoNuevo, { autor, motivo = '', fecha = new Date() } = {}) => {
  if (!ESTADO_POR_ID[estadoNuevo]) return { error: 'Estado no válido' };
  if (estadoNuevo === ticket.estado) return { error: 'El ticket ya está en ese estado' };
  if (estadoNuevo === 'RECHAZADO' && !String(motivo).trim()) return { error: 'El motivo del rechazo es obligatorio' };
  const mensaje = crearMensaje({
    autor, deGestor: true, tipo: 'estado', fecha,
    texto: String(motivo).trim(),
    estadoAnterior: ticket.estado, estadoNuevo,
    ...(estadoNuevo === 'RECHAZADO' ? { motivo } : {}),
  });
  return {
    cambios: {
      estado: estadoNuevo,
      mensajes: [...(ticket.mensajes || []), mensaje],
      noLeidoUsuario: true,
      pendienteGestor: false,
    },
  };
};

// Respuesta en la conversación. Del usuario: queda pendiente para quien
// gestiona. De quien gestiona: el usuario tiene una novedad sin ver.
export const respuesta = (ticket, texto, { autor, deGestor, fecha = new Date() }) => {
  const limpio = String(texto || '').trim();
  if (!limpio) return { error: 'Escribe un mensaje' };
  if (limpio.length > MAX_MENSAJE) return { error: `Máximo ${MAX_MENSAJE} caracteres` };
  const mensaje = crearMensaje({ autor, deGestor, texto: limpio, fecha });
  return {
    cambios: {
      mensajes: [...(ticket.mensajes || []), mensaje],
      ...(deGestor ? { noLeidoUsuario: true, pendienteGestor: false } : { noLeidoUsuario: false, pendienteGestor: true }),
    },
  };
};

// Fecha de Firestore (Timestamp), Date o texto -> Date | null.
export const aFecha = (v) => {
  if (!v) return null;
  if (typeof v.toDate === 'function') return v.toDate();
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

export const formatearFechaTicket = (v) => {
  const d = aFecha(v);
  return d ? d.toLocaleString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
};
