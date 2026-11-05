// Estados de un registro de Consignación (campo `estado`) y sus colores.
// Ciclo: INGRESADO (alta) → PENDIENTE/CARGADO/REVISAR (selector de Cargas)
// → SOLICITADO (export de Solicitud: se imputa) → FINALIZADO (Sincronizar OC
// le asigna su número de orden). Lógica pura, sin Firestore.

export const ESTADO_SOLICITADO = 'SOLICITADO';
export const ESTADO_FINALIZADO = 'FINALIZADO';

export const estadoConsignacion = (registro) => String(registro?.estado || 'INGRESADO').trim().toUpperCase();

// Ya imputado (copiado a consignacion_imputadas): queda con candado. FINALIZADO
// sigue imputado, solo agrega que ya tiene orden.
export const ESTADOS_IMPUTADOS = [ESTADO_SOLICITADO, ESTADO_FINALIZADO];
export const estaImputadoConsignacion = (registro) => ESTADOS_IMPUTADOS.includes(estadoConsignacion(registro));

// Estado tras recibir la orden en Sincronizar OC: solo una carga SOLICITADO
// pasa a FINALIZADO; en otro estado conserva el suyo (no se salta la
// solicitud ni la imputación). null = no cambia.
export const estadoAlAsignarOrden = (registro) =>
  (estadoConsignacion(registro) === ESTADO_SOLICITADO ? ESTADO_FINALIZADO : null);

// "Marcar todos como Cargado" de Cargas: no toca los imputados, los ya
// CARGADO, los REVISAR (se revisan y marcan uno por uno) ni los sin código.
export const esElegibleCargaMasiva = (registro) => {
  const estado = estadoConsignacion(registro);
  return !ESTADOS_IMPUTADOS.includes(estado) && estado !== 'CARGADO' && estado !== 'REVISAR'
    && Boolean(String(registro?.codigo ?? '').trim());
};

// Pastilla (fondo suave + texto) por estado.
export const ESTADO_BADGE = {
  AGENDADO: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300',
  PENDIENTE: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300',
  INGRESADO: 'bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400',
  REVISAR: 'bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400',
  INCOMPLETO: 'bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-400',
  'S/COTIZACION': 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300',
  CARGADO: 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400',
  SOLICITADO: 'bg-purple-100 dark:bg-purple-950/40 text-purple-700 dark:text-purple-400',
  FINALIZADO: 'bg-cyan-100 dark:bg-cyan-950/40 text-cyan-700 dark:text-cyan-400'
};
export const ESTADO_BADGE_DEFECTO = 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300';

// Punto de color (lista de Cargas y filtro de estados).
export const ESTADO_PUNTO = {
  AGENDADO: 'bg-slate-400',
  PENDIENTE: 'bg-slate-400',
  INGRESADO: 'bg-blue-500',
  REVISAR: 'bg-amber-500',
  INCOMPLETO: 'bg-red-500',
  'S/COTIZACION': 'bg-slate-400',
  CARGADO: 'bg-emerald-500',
  SOLICITADO: 'bg-purple-500',
  FINALIZADO: 'bg-cyan-500'
};
