// Inicio → Pendientes: qué bloques ve cada usuario, cómo se cuentan las
// cirugías y las alertas de fibras, y con qué filtro se abre cada pantalla.
// Lógica pura, sin Firestore (las consultas están en usePendientesInicioData).
//
//   - Implantes (con Gestión de Implantes):
//       Por imputar   solicitud == SOLICITAR (lo que lista Solicitud; se
//                     imputa al exportar, en el período abierto).
//       Incompletas   estado == INCOMPLETO.
//       Por revisar   estado REVISAR o S/COTIZACION, más las AGENDANDO o
//                     AGENDADO con cirugía anterior a hoy (ya pasó y no se
//                     cargó nada).
//     Todas las fechas, sin filtro por período.
//   - Cirugías de hoy y de mañana: Implantes y Hemodinamia (HEM), cada uno
//     con su Gestión. Se cuentan pacientes (admisiones) distintos: una
//     cirugía con dos empresas son dos gestiones.
//   - Fibras (con la pantalla Fibras): mismas reglas que seccionesFibras.js.
import { subItemsVisibles } from '../../../../config/accesoMenu';
import { moduloGestion } from '../../operaciones/shared/modulosGestion';
import { UBICACION, RUTA_FIBRAS, ubicacionDe, usosRestantes, normalizarReferencia } from '../../operaciones/implantes/fibras/fibrasNucleo';
import { seccionesFibras, estaVencida, venceProximamente } from '../../operaciones/implantes/fibras/seccionesFibras';

export { RUTA_FIBRAS };
export const MODULOS_CIRUGIAS = Object.freeze(['implantes', 'hemodinamia']);
export const ESTADOS_EN_REVISION = Object.freeze(['REVISAR', 'S/COTIZACION', 'SIN COTIZACION']);
export const ESTADOS_AGENDADA = Object.freeze(['AGENDANDO', 'AGENDADO']);
export const MAX_CIRUGIAS_LISTA = 5;

// Qué bloques ve el usuario (mismas reglas que el menú, con Gestión de módulos).
export const bloquesPendientes = (userData, modulosActivos) => {
  const rutas = (modulo) => new Set(subItemsVisibles(userData, modulo, modulosActivos).map((s) => s.path));
  const impl = rutas('implantes');
  const hem = rutas('hemodinamia');
  const veGestion = { implantes: impl.has(moduloGestion('implantes').rutas.gestion), hemodinamia: hem.has(moduloGestion('hemodinamia').rutas.gestion) };
  return {
    implantes: veGestion.implantes,
    // "Por imputar" se resuelve en Solicitud: sin ese ítem se ve pero no abre nada.
    abreSolicitud: veGestion.implantes && impl.has(moduloGestion('implantes').rutas.solicitud),
    cirugias: MODULOS_CIRUGIAS.filter((m) => veGestion[m]),
    fibras: impl.has(RUTA_FIBRAS),
  };
};

export const hayBloques = (b) => b.implantes || b.cirugias.length > 0 || b.fibras;

// 'AAAA-MM-DD' del día siguiente (sin zona: la fecha ya viene en hora de Chile).
export const diaSiguienteISO = (iso) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

const sinDato = (v) => !v || v === 'P' || v === 'Cargando...';

// Gestiones del día (de un módulo) -> cirugías: una por admisión, por nombre.
export const cirugiasDelDia = (gestiones = [], modulo) => {
  const porAdmision = new Map();
  gestiones.forEach((g) => {
    const id = String(g.gestionId || g.agendaId || '').trim();
    const clave = sinDato(id) ? `ref:${g.refPath || g.id}` : id;
    if (!porAdmision.has(clave)) {
      porAdmision.set(clave, {
        clave: `${modulo}:${clave}`,
        modulo,
        gestionId: sinDato(id) ? '' : id,
        paciente: sinDato(g.nombre) ? 'Sin nombre' : g.nombre,
        medico: sinDato(g.medico) ? 'Sin médico' : g.medico,
      });
    }
  });
  return [...porAdmision.values()];
};

// Cirugías de varios módulos (ya deduplicadas) ordenadas por paciente.
export const unirCirugias = (listas) => listas.flat()
  .sort((a, b) => a.paciente.localeCompare(b.paciente, 'es') || a.modulo.localeCompare(b.modulo));

// Fibras + códigos marcados como fibra -> los cinco indicadores, con las
// referencias involucradas (para abrir Fibras ya filtrada si es una sola).
export const indicadoresFibras = (fibras = [], codigos = [], hoy) => {
  const activas = fibras.filter((f) => ubicacionDe(f) !== UBICACION.AGOTADA);
  const refs = (lista) => [...new Set(lista.map((f) => normalizarReferencia(f.referencia)))];
  const ultimoUso = activas.filter((f) => ubicacionDe(f) === UBICACION.EN_USO && usosRestantes(f) === 1);
  const vencenPronto = activas.filter((f) => venceProximamente(f, hoy));
  const vencidas = activas.filter((f) => estaVencida(f, hoy));
  const bodegaSinUso = seccionesFibras(fibras, hoy).enUso.filter((t) => !t.fibra);
  const conDisponible = new Set(activas.filter((f) => !estaVencida(f, hoy)).map((f) => normalizarReferencia(f.referencia)));
  const sinDisponibles = [...new Set(codigos.map((c) => normalizarReferencia(c.referencia)).filter(Boolean))]
    .filter((r) => !conDisponible.has(r)).sort();
  return {
    ultimoUso: { n: ultimoUso.length, referencias: refs(ultimoUso) },
    vencenPronto: { n: vencenPronto.length, referencias: refs(vencenPronto) },
    vencidas: { n: vencidas.length, referencias: refs(vencidas) },
    bodegaSinUso: { n: bodegaSinUso.length, referencias: refs(bodegaSinUso) },
    sinDisponibles: { n: sinDisponibles.length, referencias: sinDisponibles },
  };
};

// Búsqueda con la que se abre Fibras: la referencia si es una sola.
export const filtroFibras = (referencias = []) => (referencias.length === 1 ? { texto: referencias[0] } : null);

// Filtros iniciales de Gestión (useGestionesFiltros) para cada indicador.
export const filtroGestion = (tipo, hoy) => {
  const todas = { anio: '', mes: '', dias: [], rango: 'todos' };
  switch (tipo) {
    case 'incompletas': return { ...todas, estados: ['INCOMPLETO'] };
    case 'enRevision': return { ...todas, estados: [...ESTADOS_EN_REVISION] };
    case 'agendadasVencidas': return { ...todas, rango: 'hastaAyer', estados: [...ESTADOS_AGENDADA] };
    case 'hoy': return { ...todas, rango: 'soloHoy', estados: [] };
    case 'manana': {
      const [anio, mes, dia] = diaSiguienteISO(hoy).split('-');
      return { anio, mes, dias: [dia], rango: 'desdeManana', estados: [] };
    }
    default: return null;
  }
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
