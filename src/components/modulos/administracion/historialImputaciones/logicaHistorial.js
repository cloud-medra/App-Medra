// Historial de Imputaciones (Finanzas): lógica pura, sin Firestore.
//
// El tipo de una imputación es la colección donde está ({modulo}_imputadas),
// no un campo: solo Consignación guarda `modulo`. Por eso cada pestaña
// consulta únicamente sus colecciones y General une hasta tres listados, cada
// uno ordenado por el servidor y con su propio cursor.

import { MESES } from '../controlMensual/constants';
import {
  ORIGEN,
  normalizarImputadaConsignacion,
  normalizarImputadaHemodinamia,
  normalizarImputadaImplantes,
} from '../cargasConsolidado/utils/normalizarFila';

export const RUTA_HISTORIAL = '/administracion/historialImputaciones';
export const TAMANO_PAGINA = 25;
export const LARGO_MINIMO_BUSQUEDA = 2;
// Tope por mes y colección en "Buscar en todo el año": una admisión tiene
// pocas filas; si se alcanza, la pantalla avisa que puede haber más.
export const LIMITE_ADMISION_POR_MES = 50;
// Primer año con imputadas (medido en producción el 09-11-2026). Lista fija:
// armar el selector no gasta lecturas.
export const PRIMER_ANIO = 2026;

// El orden también decide el desempate entre colecciones en General.
export const FUENTES = {
  [ORIGEN.IMPLANTES]: { raiz: 'implantes_imputadas', campoNombre: 'paciente', normalizar: normalizarImputadaImplantes },
  [ORIGEN.CONSIGNACION]: { raiz: 'consignacion_imputadas', campoNombre: 'nombre', normalizar: normalizarImputadaConsignacion },
  [ORIGEN.HEMODINAMIA]: { raiz: 'hemodinamia_imputadas', campoNombre: 'paciente', normalizar: normalizarImputadaHemodinamia },
};

export const PESTANAS = [
  { id: 'general', label: 'General', path: `${RUTA_HISTORIAL}/general`, origen: null },
  { id: 'implantes', label: 'Implantes', path: `${RUTA_HISTORIAL}/implantes`, origen: ORIGEN.IMPLANTES },
  { id: 'consignacion', label: 'Consignación', path: `${RUTA_HISTORIAL}/consignacion`, origen: ORIGEN.CONSIGNACION },
  { id: 'hemodinamia', label: 'Hemodinamia', path: `${RUTA_HISTORIAL}/hemodinamia`, origen: ORIGEN.HEMODINAMIA },
];

// Las reglas de Firestore dejan leer las imputadas a cualquier interno activo,
// así que el alcance de cada pestaña se decide aquí: General incluye solo los
// tipos cuya pestaña tiene asignada el usuario y se oculta si no tiene ninguna.
export const pestanasPermitidas = (tieneAcceso) => {
  const propias = PESTANAS.filter((p) => p.origen && tieneAcceso(p.path));
  const origenes = propias.map((p) => p.origen);
  return PESTANAS.flatMap((p) => {
    if (p.origen) return origenes.includes(p.origen) ? [{ ...p, origenes: [p.origen] }] : [];
    return tieneAcceso(p.path) && origenes.length > 0 ? [{ ...p, origenes }] : [];
  });
};

export const periodoActualChile = (fecha = new Date()) => {
  const partes = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: 'numeric' }).formatToParts(fecha);
  const valor = (tipo) => Number(partes.find((p) => p.type === tipo).value);
  return { anio: valor('year'), mes: valor('month') };
};

export const idMes = (numero) => MESES.find((m) => m.num === numero)?.id ?? '';

export const aniosSeleccionables = (hoy) => Array.from(
  { length: Math.max(hoy.anio - PRIMER_ANIO + 1, 1) },
  (_, i) => String(hoy.anio - i),
);

// Meses que ya ocurrieron del año elegido: nunca se consultan meses futuros.
export const mesesConsultables = (anio, hoy) => {
  const numero = Number(anio);
  if (numero > hoy.anio) return [];
  return MESES.filter((m) => numero < hoy.anio || m.num <= hoy.mes).map((m) => m.id);
};

// Orden de texto de Firestore (bytes UTF-8), equivalente a comparar puntos de
// código. localeCompare o una comparación numérica desordenarían la unión de
// General respecto de los cursores del servidor.
export const compararComoFirestore = (a, b) => {
  const x = String(a ?? '');
  const y = String(b ?? '');
  let i = 0;
  while (i < x.length && i < y.length) {
    const cx = x.codePointAt(i);
    const cy = y.codePointAt(i);
    if (cx !== cy) return cx - cy;
    i += cx > 0xffff ? 2 : 1;
  }
  return x.length - y.length;
};

// Une listados ya ordenados (cada `buffer`, de menor a mayor) tomando siempre
// la cabeza menor. Muta los buffers: lo que no entra queda para la página
// siguiente, sin repetirse ni perderse. En un empate gana la fuente anterior,
// y dentro de una fuente se respeta el orden del servidor.
export const unirPagina = (fuentes, tamano) => {
  const pagina = [];
  while (pagina.length < tamano) {
    let elegida = null;
    for (const fuente of fuentes) {
      if (fuente.buffer.length === 0) continue;
      if (!elegida || compararComoFirestore(fuente.buffer[0].orden, elegida.buffer[0].orden) < 0) elegida = fuente;
    }
    if (!elegida) break;
    pagina.push(elegida.buffer.shift());
  }
  return pagina;
};

// Mismo orden que el listado paginado; sort es estable, así que las filas de
// una misma admisión quedan en el orden de llegada (origen y luego documento).
export const ordenarComoListado = (filas) => [...filas].sort((a, b) => compararComoFirestore(a.gestionId, b.gestionId));

export const SIN_BUSQUEDA = Object.freeze({ tipo: 'ninguna', valor: '' });

// Búsqueda en el servidor: los nombres están guardados en mayúsculas, con el
// nombre de pila primero. Las tildes se conservan porque un rango de prefijo
// no puede ignorarlas (para eso está "Buscar en este mes").
export const interpretarBusqueda = (texto) => {
  const valor = String(texto ?? '').trim().replace(/\s+/g, ' ').toUpperCase();
  if (valor.length < LARGO_MINIMO_BUSQUEDA) return SIN_BUSQUEDA;
  return { tipo: /^\d+$/.test(valor) ? 'admision' : 'nombre', valor };
};

export const campoDeOrden = (fuente, busqueda) => (busqueda.tipo === 'nombre' ? fuente.campoNombre : 'gestionId');

export const limitesDePrefijo = (valor) => [valor, `${valor}`];

const plegarTexto = (texto) => String(texto ?? '')
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .toUpperCase()
  .replace(/\s+/g, ' ')
  .trim();

// "Buscar en este mes": sobre el mes ya descargado, cualquier parte del
// nombre o de la admisión, sin mayúsculas ni tildes.
export const filtrarFilasDelMes = (filas, texto) => {
  const buscado = plegarTexto(texto);
  if (!buscado) return filas;
  return filas.filter((f) => plegarTexto(f.paciente).includes(buscado) || plegarTexto(f.gestionId).includes(buscado));
};

export const totalPaginasDe = (totalFilas) => Math.max(1, Math.ceil(totalFilas / TAMANO_PAGINA));

export const paginaLocal = (filas, pagina) => filas.slice((pagina - 1) * TAMANO_PAGINA, pagina * TAMANO_PAGINA);

// N = todos los documentos menos los que tienen `venta` numérica: incluye
// tanto `venta: null` como los documentos donde el campo no existe.
export const totalesDeUnOrigen = ({ cantidad, totalCosto, conVenta, totalVenta }) => ({
  cantidad: cantidad || 0,
  totalCosto: totalCosto || 0,
  totalVenta: totalVenta || 0,
  sinVenta: Math.max((cantidad || 0) - (conVenta || 0), 0),
});

export const sumarTotales = (lista) => lista.reduce((acc, t) => ({
  cantidad: acc.cantidad + t.cantidad,
  totalCosto: acc.totalCosto + t.totalCosto,
  totalVenta: acc.totalVenta + t.totalVenta,
  sinVenta: acc.sinVenta + t.sinVenta,
}), { cantidad: 0, totalCosto: 0, totalVenta: 0, sinVenta: 0 });
