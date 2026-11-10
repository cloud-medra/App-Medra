// Implantes → Fibras: reparte las fibras en las tres secciones de la
// pantalla (En uso, En bodega, Agotadas). Lógica pura, sin Firestore.
import {
  UBICACION, ubicacionDe, normalizarReferencia, fechaUltimoUsoVigente, siguienteEnBodega, colorUsos, tienePerdida, COLOR_USOS,
} from './fibrasNucleo';

export const DIAS_AVISO_VENCE = 30;

const sumarDias = (iso, dias) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
};

export const estaVencida = (fibra, hoy) => Boolean(fibra?.vencimiento) && fibra.vencimiento < hoy;

// Vigente, pero vence en los próximos DIAS_AVISO_VENCE días (hoy incluido).
export const venceProximamente = (fibra, hoy) => !estaVencida(fibra, hoy)
  && Boolean(fibra?.vencimiento) && fibra.vencimiento <= sumarDias(hoy, DIAS_AVISO_VENCE);

// Vencimiento, como etiqueta aparte del color por usos (colorUsos):
// 'vencida', 'proxima' (vence en los próximos 30 días) o null.
export const ALERTA_VENCIMIENTO = Object.freeze({ VENCIDA: 'vencida', PROXIMA: 'proxima' });
export const alertaVencimiento = (fibra, hoy) => {
  if (estaVencida(fibra, hoy)) return ALERTA_VENCIMIENTO.VENCIDA;
  return venceProximamente(fibra, hoy) ? ALERTA_VENCIMIENTO.PROXIMA : null;
};

// Filtro por color de la pantalla: 'todas', un color de COLOR_USOS o 'perdida'.
export const FILTROS_COLOR = Object.freeze([
  { valor: 'todas', texto: 'Todas' },
  { valor: COLOR_USOS.VERDE, texto: 'Verde' },
  { valor: COLOR_USOS.NARANJO, texto: 'Naranjo' },
  { valor: COLOR_USOS.ROJO, texto: 'Rojo' },
  { valor: 'perdida', texto: 'Pérdida' },
]);
export const coincideColor = (fibra, filtro) => {
  if (!filtro || filtro === 'todas') return true;
  if (filtro === 'perdida') return tienePerdida(fibra);
  return colorUsos(fibra) === filtro;
};
// Orden "por color": rojo, naranjo, verde (lo que hay que gestionar primero).
const RANGO_COLOR = { [COLOR_USOS.ROJO]: 0, [COLOR_USOS.NARANJO]: 1, [COLOR_USOS.VERDE]: 2 };
export const ORDENES = Object.freeze([{ valor: 'referencia', texto: 'Referencia' }, { valor: 'color', texto: 'Color (rojo primero)' }]);
const porColor = (a, b) => (RANGO_COLOR[colorUsos(a)] ?? 3) - (RANGO_COLOR[colorUsos(b)] ?? 3);

// Búsqueda por código, referencia, lote o descripción (sin mayúsculas).
export const coincideBusqueda = (fibra, texto) => {
  const t = String(texto || '').trim().toUpperCase();
  return !t || [fibra.codigoInterno, fibra.referencia, fibra.lote, fibra.descriptor].some((v) => String(v || '').toUpperCase().includes(t));
};

const porReferenciaYVencimiento = (a, b) => normalizarReferencia(a.referencia).localeCompare(normalizarReferencia(b.referencia))
  || (a.vencimiento || '9999').localeCompare(b.vencimiento || '9999')
  || (a.codigoInterno || '').localeCompare(b.codigoInterno || '');

/**
 * Fibras (ya filtradas por la búsqueda) -> secciones:
 *   enUso:    [{ referencia, descriptor, fibra | null, enBodega, siguiente }]
 *             una tarjeta por referencia con fibra en uso, o con fibras en
 *             bodega pero ninguna en uso (fibra null; `siguiente` = la de
 *             bodega que se pondría en uso: vigente, vencimiento más próximo).
 *   bodega:   EN BODEGA, por referencia y vencimiento.
 *   agotadas: por último uso, de la más reciente a la más antigua.
 * Opciones: `color` (FILTROS_COLOR) filtra las tres; `orden` 'color' pone
 * primero las rojas en bodega y agotadas (las tarjetas siguen por referencia).
 */
export const seccionesFibras = (fibras = [], hoy, texto = '', { color = 'todas', orden = 'referencia' } = {}) => {
  const visibles = fibras.filter((f) => coincideBusqueda(f, texto) && coincideColor(f, color));
  const conOrden = (comparar) => (orden === 'color' ? (a, b) => porColor(a, b) || comparar(a, b) : comparar);
  const bodega = visibles.filter((f) => ubicacionDe(f) === UBICACION.EN_BODEGA).sort(conOrden(porReferenciaYVencimiento));
  const agotadas = visibles.filter((f) => ubicacionDe(f) === UBICACION.AGOTADA)
    .map((f) => ({ ...f, ultimoUso: fechaUltimoUsoVigente(f) }))
    .sort(conOrden((a, b) => b.ultimoUso.localeCompare(a.ultimoUso) || (b.codigoInterno || '').localeCompare(a.codigoInterno || '')));

  const referencias = new Map();
  visibles.filter((f) => ubicacionDe(f) !== UBICACION.AGOTADA).forEach((f) => {
    const ref = normalizarReferencia(f.referencia);
    if (!referencias.has(ref)) referencias.set(ref, { referencia: f.referencia, descriptor: f.descriptor, fibra: null, enBodega: 0 });
    const tarjeta = referencias.get(ref);
    if (ubicacionDe(f) === UBICACION.EN_USO) tarjeta.fibra = f;
    else tarjeta.enBodega += 1;
  });
  const enUso = [...referencias.values()]
    .map((t) => ({ ...t, siguiente: t.fibra ? null : siguienteEnBodega(bodega, t.referencia, hoy) }))
    .sort((a, b) => normalizarReferencia(a.referencia).localeCompare(normalizarReferencia(b.referencia)));

  return { enUso, bodega, agotadas, totalEnUso: enUso.filter((t) => t.fibra).length };
};
