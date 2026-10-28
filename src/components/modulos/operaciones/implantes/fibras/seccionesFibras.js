// Implantes → Fibras: reparte las fibras en las tres secciones de la
// pantalla (En uso, En bodega, Agotadas). Lógica pura, sin Firestore.
import {
  UBICACION, ubicacionDe, usosRestantes, normalizarReferencia, fechaUltimoUsoVigente, siguienteEnBodega,
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

// Alerta de una fibra en uso: 'rojo' vencida; 'ambar' si le queda 1 uso o
// vence en los próximos 30 días; null si no.
export const alertaFibra = (fibra, hoy) => {
  if (estaVencida(fibra, hoy)) return 'rojo';
  if (usosRestantes(fibra) === 1 || venceProximamente(fibra, hoy)) return 'ambar';
  return null;
};

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
 */
export const seccionesFibras = (fibras = [], hoy, texto = '') => {
  const visibles = fibras.filter((f) => coincideBusqueda(f, texto));
  const bodega = visibles.filter((f) => ubicacionDe(f) === UBICACION.EN_BODEGA).sort(porReferenciaYVencimiento);
  const agotadas = visibles.filter((f) => ubicacionDe(f) === UBICACION.AGOTADA)
    .map((f) => ({ ...f, ultimoUso: fechaUltimoUsoVigente(f) }))
    .sort((a, b) => b.ultimoUso.localeCompare(a.ultimoUso) || (b.codigoInterno || '').localeCompare(a.codigoInterno || ''));

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
