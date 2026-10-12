// Recordatorios de tareas por usuario (lógica pura, sin Firebase).
//
// Datos:
//   recordatorios_tareas/{id}
//     { titulo, descripcion, dias: [1..7] (1 = lunes … 7 = domingo),
//       asignados: [uid], activa, desde: 'YYYY-MM-DD', creadoPor, creadoEn,
//       actualizadoEn }
//   recordatorios_realizados/{uid}/realizados/{tareaId}_{fecha}
//     { tareaId, titulo, fecha: 'YYYY-MM-DD', uid, usuarioNombre, realizadoEn }
//     Es a la vez el "Realizado" de esa repetición y el historial (no se
//     edita ni se borra: ver firestore.rules).
//
// Una tarea está pendiente si su última repetición (hoy o el día de la
// semana más reciente que le toca) no tiene Realizado. Si esa repetición
// fue antes de hoy, está "atrasada" y sigue apareciendo hasta marcarla; al
// llegar la repetición siguiente, se muestra esa (la anterior sin marcar
// queda sin Realizado en el historial). Todas las fechas son de
// America/Santiago.

export const ZONA_RECORDATORIOS = 'America/Santiago';

export const RUTA_RECORDATORIOS = '/administracion/recordatorios';
// Pestañas (procesos) de la vista, asignables en el formulario de usuarios.
export const RUTA_MIS_RECORDATORIOS = '/administracion/recordatorios/mis';
export const RUTA_ADMINISTRAR_RECORDATORIOS = '/administracion/recordatorios/administrar';

export const COLECCION_TAREAS = 'recordatorios_tareas';
export const COLECCION_REALIZADOS = 'recordatorios_realizados';
export const SUBCOLECCION_REALIZADOS = 'realizados';

export const DIAS_SEMANA = [
  { valor: 1, label: 'Lunes', corto: 'Lu' },
  { valor: 2, label: 'Martes', corto: 'Ma' },
  { valor: 3, label: 'Miércoles', corto: 'Mi' },
  { valor: 4, label: 'Jueves', corto: 'Ju' },
  { valor: 5, label: 'Viernes', corto: 'Vi' },
  { valor: 6, label: 'Sábado', corto: 'Sá' },
  { valor: 7, label: 'Domingo', corto: 'Do' },
];

export const MAX_TITULO = 120;
export const MAX_DESCRIPCION = 1000;

const esAdministrador = (userData) => userData?.rol === 'admin' || userData?.rol === 'dev';
const tieneVista = (userData) => (userData?.permisos?.administracion || []).includes(RUTA_RECORDATORIOS);
const tienePestana = (userData, ruta) => Boolean(userData?.permisosGranulares?.[ruta]);

// Mismo criterio que firestore.rules (recibeRecordatorios / administraRecordatorios).
export const puedeRecibirRecordatorios = (userData) =>
  Boolean(userData?.uid) && (esAdministrador(userData) || (tieneVista(userData) && tienePestana(userData, RUTA_MIS_RECORDATORIOS)));

export const puedeAdministrarRecordatorios = (userData) =>
  esAdministrador(userData) || (tieneVista(userData) && tienePestana(userData, RUTA_ADMINISTRAR_RECORDATORIOS));

// --- Fechas (strings 'YYYY-MM-DD', sin horas: se comparan como texto) ---

const formatoSantiago = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONA_RECORDATORIOS, year: 'numeric', month: '2-digit', day: '2-digit',
});

// Hoy en Santiago (en-CA da 'YYYY-MM-DD').
export const fechaEnSantiago = (instante = new Date()) => formatoSantiago.format(instante);

const aUTC = (fecha) => {
  const [y, m, d] = fecha.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};
const desdeUTC = (ms) => new Date(ms).toISOString().slice(0, 10);

export const sumarDias = (fecha, n) => desdeUTC(aUTC(fecha) + n * 86400000);

// 1 = lunes … 7 = domingo.
export const diaSemana = (fecha) => {
  const d = new Date(aUTC(fecha)).getUTCDay();
  return d === 0 ? 7 : d;
};

export const nombreDia = (fecha) => DIAS_SEMANA.find((d) => d.valor === diaSemana(fecha))?.label || '';

// Repetición más reciente de la tarea en o antes de `hoy` (null si no tiene
// días, o si esa repetición es anterior a la creación de la tarea).
export const ultimaRepeticion = (tarea, hoy) => {
  const dias = tarea?.dias || [];
  if (dias.length === 0) return null;
  for (let i = 0; i < 7; i++) {
    const fecha = sumarDias(hoy, -i);
    if (dias.includes(diaSemana(fecha))) {
      return tarea.desde && fecha < tarea.desde ? null : fecha;
    }
  }
  return null;
};

// Próxima repetición DESPUÉS de `fecha`.
export const proximaRepeticion = (tarea, fecha) => {
  const dias = tarea?.dias || [];
  for (let i = 1; i <= 7; i++) {
    const f = sumarDias(fecha, i);
    if (dias.includes(diaSemana(f))) return f;
  }
  return null;
};

export const idRealizado = (tareaId, fecha) => `${tareaId}_${fecha}`;

// Desde qué fecha hay que leer Realizados para saber si la última
// repetición de cualquier tarea está marcada (una semana basta).
export const fechaMinimaRealizados = (hoy) => sumarDias(hoy, -6);

// Tareas pendientes del usuario para hoy, de la más atrasada a la de hoy.
//   tareas: las leídas para el usuario (array-contains uid)
//   realizados: Set de idRealizado(tareaId, fecha) del usuario
// Devuelve [{ tarea, fecha, atrasada }].
export const tareasPendientes = (tareas, realizados, { uid, hoy }) => (tareas || [])
  .filter((t) => t.activa !== false && (t.asignados || []).includes(uid))
  .map((tarea) => ({ tarea, fecha: ultimaRepeticion(tarea, hoy) }))
  .filter(({ tarea, fecha }) => fecha && !realizados.has(idRealizado(tarea.id, fecha)))
  .map(({ tarea, fecha }) => ({ tarea, fecha, atrasada: fecha < hoy }))
  .sort((a, b) => a.fecha.localeCompare(b.fecha) || String(a.tarea.titulo).localeCompare(String(b.tarea.titulo)));

// --- Validación del formulario (las reglas validan lo mismo) ---

export const validarTarea = ({ titulo, descripcion = '', dias = [], asignados = [] }) => {
  const errores = {};
  const t = String(titulo ?? '').trim();
  if (!t) errores.titulo = 'Escribe un título.';
  else if (t.length > MAX_TITULO) errores.titulo = `Máximo ${MAX_TITULO} caracteres.`;
  if (String(descripcion ?? '').trim().length > MAX_DESCRIPCION) errores.descripcion = `Máximo ${MAX_DESCRIPCION} caracteres.`;
  if (!dias.length) errores.dias = 'Elige al menos un día.';
  if (!asignados.length) errores.asignados = 'Asigna al menos un usuario.';
  return errores;
};

export const textoDias = (dias = []) => {
  const orden = [...dias].sort((a, b) => a - b);
  if (orden.length === 7) return 'Todos los días';
  if (orden.join() === '1,2,3,4,5') return 'Lunes a viernes';
  return orden.map((v) => DIAS_SEMANA.find((d) => d.valor === v)?.label).filter(Boolean).join(', ');
};

// --- Posición del recuadro flotante ---

export const MARGEN_FLOTANTE = 8;

// Mantiene el recuadro completo dentro de la ventana.
export const limitarPosicion = ({ x, y }, { ancho, alto }, { anchoVentana, altoVentana }) => ({
  x: Math.round(Math.min(Math.max(MARGEN_FLOTANTE, x), Math.max(MARGEN_FLOTANTE, anchoVentana - ancho - MARGEN_FLOTANTE))),
  y: Math.round(Math.min(Math.max(MARGEN_FLOTANTE, y), Math.max(MARGEN_FLOTANTE, altoVentana - alto - MARGEN_FLOTANTE))),
});

export const clavePosicion = (uid) => `recordatorios.posicion.${uid}`;
export const claveMinimizado = (uid) => `recordatorios.minimizado.${uid}`;
