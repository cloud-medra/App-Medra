// Inicio → Pendientes: qué bloques ve cada usuario, cómo se cuentan las
// cirugías, el uso de las fibras por referencia y con qué filtro se abre
// cada pantalla. Solo cantidades: en el Inicio no se muestran nombres de
// pacientes. Lógica pura, sin Firestore (las consultas están en
// usePendientesInicioData).
//
//   - Implantes (con Gestión de Implantes):
//       Por imputar   solicitud == SOLICITAR (lo que lista Solicitud; se
//                     imputa al exportar, en el período abierto).
//       Incompletas   estado == INCOMPLETO.
//       Por revisar   estado REVISAR o S/COTIZACION, más las AGENDANDO o
//                     AGENDADO con cirugía anterior a hoy (ya pasó y no se
//                     cargó nada).
//     Todas las fechas, sin filtro por período.
//   - Cirugías de hoy y de mañana (con Gestión de Implantes): se cuentan
//     pacientes (admisiones) distintos; una cirugía con dos empresas son dos
//     gestiones. Hemodinamia no va: sus procedimientos no se agendan.
//   - Fibras (con la pantalla Fibras): una línea por referencia con el uso
//     de su fibra en uso (consumidos/totales) y el color de alertaFibra.
import { subItemsVisibles } from '../../../../config/accesoMenu';
import { moduloGestion } from '../../operaciones/shared/modulosGestion';
import { UBICACION, RUTA_FIBRAS, ubicacionDe, usosConsumidosDe, normalizarReferencia } from '../../operaciones/implantes/fibras/fibrasNucleo';
import { alertaFibra } from '../../operaciones/implantes/fibras/seccionesFibras';

export { RUTA_FIBRAS };
export const ESTADOS_EN_REVISION = Object.freeze(['REVISAR', 'S/COTIZACION', 'SIN COTIZACION']);
export const ESTADOS_AGENDADA = Object.freeze(['AGENDANDO', 'AGENDADO']);

// Qué bloques ve el usuario (mismas reglas que el menú, con Gestión de módulos).
export const bloquesPendientes = (userData, modulosActivos) => {
  const rutas = (modulo) => new Set(subItemsVisibles(userData, modulo, modulosActivos).map((s) => s.path));
  const impl = rutas('implantes');
  const veGestion = impl.has(moduloGestion('implantes').rutas.gestion);
  return {
    implantes: veGestion,
    // "Por imputar" se resuelve en Solicitud: sin ese ítem se ve pero no abre nada.
    abreSolicitud: veGestion && impl.has(moduloGestion('implantes').rutas.solicitud),
    cirugias: veGestion,
    fibras: impl.has(RUTA_FIBRAS),
  };
};

export const hayBloques = (b) => b.implantes || b.cirugias || b.fibras;

// 'AAAA-MM-DD' del día siguiente (sin zona: la fecha ya viene en hora de Chile).
export const diaSiguienteISO = (iso) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

const sinDato = (v) => !v || v === 'P';

// Gestiones del día de un módulo -> cantidad de cirugías (admisiones
// distintas; una gestión sin admisión cuenta sola).
export const contarCirugias = (gestiones = []) => new Set(gestiones.map((g) => {
  const id = String(g.gestionId || g.agendaId || '').trim();
  return sinDato(id) ? `ref:${g.refPath || g.id}` : id;
})).size;

// Fibras + códigos marcados como fibra -> una línea por referencia, en orden:
// { referencia, uso: { consumidos, totales, alerta } | null }. `uso` es el de
// la fibra EN USO (null si la referencia no tiene ninguna); `alerta` es la de
// la pantalla Fibras ('ambar' | 'rojo' | null).
export const usoFibrasPorReferencia = (fibras = [], codigos = [], hoy) => {
  const lineas = new Map();
  const agregar = (referencia) => {
    const clave = normalizarReferencia(referencia);
    if (clave && !lineas.has(clave)) lineas.set(clave, { referencia: String(referencia).trim(), uso: null });
  };
  codigos.forEach((c) => agregar(c.referencia));
  fibras.filter((f) => ubicacionDe(f) !== UBICACION.AGOTADA).forEach((f) => agregar(f.referencia));
  fibras.filter((f) => ubicacionDe(f) === UBICACION.EN_USO).forEach((f) => {
    const linea = lineas.get(normalizarReferencia(f.referencia));
    if (linea) linea.uso = { consumidos: usosConsumidosDe(f), totales: Number(f.usosTotales) || 0, alerta: alertaFibra(f, hoy) };
  });
  return [...lineas.values()].sort((a, b) => normalizarReferencia(a.referencia).localeCompare(normalizarReferencia(b.referencia)));
};

// Filtros iniciales de Gestión (useGestionesFiltros) para cada indicador.
export const filtroGestion = (tipo, hoy) => {
  const todas = { anio: '', mes: '', dias: [], rango: 'todos' };
  switch (tipo) {
    case 'incompletas': return { ...todas, estados: ['INCOMPLETO'] };
    case 'enRevision': return { ...todas, estados: [...ESTADOS_EN_REVISION] };
    case 'agendadasVencidas': return { ...todas, rango: 'hastaAyer', estados: [...ESTADOS_AGENDADA] };
    case 'porRevisar': return { ...todas, estados: [...ESTADOS_EN_REVISION, ...ESTADOS_AGENDADA] };
    case 'hoy': return { ...todas, rango: 'soloHoy', estados: [] };
    case 'manana': {
      const [anio, mes, dia] = diaSiguienteISO(hoy).split('-');
      return { anio, mes, dias: [dia], rango: 'desdeManana', estados: [] };
    }
    default: return null;
  }
};

// Con qué filtro abre "Por revisar": el de la parte que tiene gestiones; si
// las dos tienen (o no se sabe), ambos estados con todas las fechas.
export const tipoPorRevisar = (enRevision, agendadasVencidas) => {
  const n = (r) => (r && Number.isFinite(r.n) ? r.n : null);
  if (n(enRevision) > 0 && n(agendadasVencidas) === 0) return 'enRevision';
  if (n(agendadasVencidas) > 0 && n(enRevision) === 0) return 'agendadasVencidas';
  return 'porRevisar';
};

// Resultado de una lectura ({ n } | { error } | undefined mientras carga)
// -> { estado: 'cargando' | 'noDisponible' | 'alDia' | 'conPendientes', n }.
// Un error nunca se muestra como 0.
export const valorIndicador = (r) => {
  if (!r) return { estado: 'cargando' };
  if (r.error || !Number.isFinite(r.n)) return { estado: 'noDisponible' };
  return { estado: r.n === 0 ? 'alDia' : 'conPendientes', n: r.n };
};

// Suma de indicadores (Por revisar = en revisión + agendadas vencidas):
// si alguno no está disponible, el total tampoco.
export const sumarResultados = (...rs) => {
  if (rs.some((r) => !r)) return undefined;
  if (rs.some((r) => r.error || !Number.isFinite(r.n))) return { error: true };
  return { n: rs.reduce((s, r) => s + r.n, 0) };
};
