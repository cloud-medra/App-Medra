// Armado de Kits: reglas puras, compartidas con la pantalla.
//
// Un kit se arma con stock de Bodega: no hay stock paralelo. Cada línea apunta
// a un documento de bodega_lotes y sus unidades salen del disponible.
//
// Para agregar otro tipo de kit basta una entrada en FAMILIAS_KIT (etiqueta,
// ruta del menú y tipos) y una pantalla que monte PantallaKits con esa familia.

import { idVinculo } from '../bodega/gs1.mjs';
import { normalizarClave, normalizarLote, lotesFEFO, lotesPropios, fechaValida } from '../bodega/nucleo.mjs';

export const MODULO = 'armadoKits';
export const COL_KITS = 'kits_armados';

export const FAMILIAS_KIT = Object.freeze({
  FLEXIBLE: Object.freeze({
    etiqueta: 'Flexibles',
    ruta: '/armadoKits/flexibles',
    tipos: Object.freeze({ FLEXIBLE_HOMBRE: 'Flexible hombre', FLEXIBLE_MUJER: 'Flexible mujer' }),
  }),
});

const ACCIONES = Object.freeze({
  crear: ['kits', 'btn_crear'],
  editar: ['kit', 'btn_editar'],
  eliminar: ['kit', 'btn_eliminar'],
  completarVencimiento: ['kit', 'btn_completar_vencimiento'],
});
// [modulo, ruta, seccion, accion] para puedeAccion.
export const accionKit = (familia, accion) => [MODULO, FAMILIAS_KIT[familia].ruta, ...ACCIONES[accion]];

export const MAX_CODIGO_KIT = 40;
export const MAX_LINEAS_KIT = 60;
export const OPERACION_COMPLETAR = 'COMPLETAR_VENCIMIENTO';

// Sin hora: el vencimiento es una fecha de Chile, sea cual sea la zona del servidor.
export const hoyChile = (ahora = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(ahora);

// El ID sale del código, así la unicidad la garantiza la propia transacción.
export const idKit = (codigo) => idVinculo(normalizarClave(codigo));

// Misma referencia que muestra Bodega (propia o del maestro clínico).
export const referenciaDe = (p) => p?.referencia || p?.maestroCodigo?.referencia || '';

export const validarCabeceraKit = (datos = {}) => {
  const errores = [];
  const familia = FAMILIAS_KIT[datos.familia];
  if (!familia) errores.push('El tipo de kit no existe.');
  else if (!familia.tipos[datos.tipo]) errores.push('Selecciona un tipo de kit válido.');
  const codigo = String(datos.codigo ?? '').trim().replace(/\s+/g, ' ');
  if (!codigo) errores.push('Ingresa el código del kit.');
  else if (codigo.length > MAX_CODIGO_KIT) errores.push(`El código no puede superar ${MAX_CODIGO_KIT} caracteres.`);
  return { errores, cabecera: { familia: datos.familia, tipo: datos.tipo, codigo, codigoNormalizado: normalizarClave(codigo) } };
};

// Une las líneas repetidas del mismo lote (suma la cantidad; una confirmación
// dada en cualquiera de ellas vale para el lote).
export const validarLineasKit = (lineas) => {
  if (!Array.isArray(lineas) || !lineas.length) return { errores: ['El kit no tiene insumos.'], lineas: [] };
  const errores = [];
  const porLote = new Map();
  lineas.forEach((l) => {
    const cantidad = Number(l?.cantidad);
    if (!l?.productoId || !l?.loteId) { errores.push('Cada línea necesita producto y lote.'); return; }
    if (!Number.isInteger(cantidad) || cantidad <= 0) { errores.push('La cantidad debe ser un número entero mayor a cero.'); return; }
    const previa = porLote.get(String(l.loteId));
    porLote.set(String(l.loteId), {
      productoId: String(l.productoId), loteId: String(l.loteId), cantidad: (previa?.cantidad || 0) + cantidad,
      confirmarFueraFEFO: Boolean(previa?.confirmarFueraFEFO || l.confirmarFueraFEFO),
      confirmarSinVencimiento: Boolean(previa?.confirmarSinVencimiento || l.confirmarSinVencimiento),
    });
  });
  if (porLote.size > MAX_LINEAS_KIT) errores.push(`Máximo ${MAX_LINEAS_KIT} líneas por kit.`);
  return { errores: [...new Set(errores)], lineas: [...porLote.values()] };
};

// Qué mover al pasar de las líneas guardadas a las pedidas: lo retirado
// (vuelve al stock) y lo agregado (sale del stock). Las líneas sin cambio de
// cantidad no mueven nada ni se vuelven a validar.
export const planCambiosKit = (anteriores = [], nuevas = []) => {
  const previas = new Map(anteriores.map((l) => [l.loteId, l]));
  const pedidas = new Map(nuevas.map((l) => [l.loteId, l]));
  const retiros = [];
  anteriores.forEach((linea) => {
    const delta = linea.cantidad - (pedidas.get(linea.loteId)?.cantidad || 0);
    if (delta > 0) retiros.push({ linea, cantidad: delta });
  });
  const asignaciones = [];
  nuevas.forEach((entrada) => {
    const delta = entrada.cantidad - (previas.get(entrada.loteId)?.cantidad || 0);
    if (delta > 0) asignaciones.push({ entrada, cantidad: delta });
  });
  return { retiros, asignaciones };
};

// Vence hoy cuenta como vigente, igual que en Bodega (vencimientos.js).
export const loteVencido = (lote, hoy) => Boolean(lote?.vencimiento) && lote.vencimiento < hoy;

// Lotes que se pueden usar en un kit, en orden FEFO: stock propio, con
// disponible y sin vencer. Los sin vencimiento quedan al final.
export const lotesParaKit = (lotes, hoy) => lotesFEFO(lotesPropios(lotes)).filter((l) => !loteVencido(l, hoy));

const FIN_FEFO = '9999-99-99';

// Lotes tomados saltándose uno que vence antes y al que todavía le queda
// saldo tras esta asignación. `elegibles` en orden FEFO; dos lotes de la misma
// fecha son equivalentes entre sí.
export const lotesFueraDeFEFO = (elegibles, asignado = {}) => {
  const fuera = new Set();
  let fechaConSaldo = null;
  elegibles.forEach((l) => {
    const fecha = l.vencimiento || FIN_FEFO;
    const usa = Number(asignado[l.id]) || 0;
    if (usa > 0 && fechaConSaldo !== null && fechaConSaldo < fecha) fuera.add(l.id);
    if (fechaConSaldo === null && (Number(l.disponible) || 0) > usa) fechaConSaldo = fecha;
  });
  return fuera;
};

// Toma `cantidad` del lote elegido y completa con los demás en orden FEFO.
// -> { partes: [{ lote, cantidad }], faltante }.
export const repartoDesde = (elegibles, loteId, cantidad) => {
  const elegido = elegibles.find((l) => l.id === loteId);
  const orden = elegido ? [elegido, ...elegibles.filter((l) => l.id !== loteId)] : [...elegibles];
  const partes = [];
  let resta = cantidad;
  orden.forEach((lote) => {
    const toma = Math.min(resta, Math.max(0, Number(lote.disponible) || 0));
    if (toma > 0) { partes.push({ lote, cantidad: toma }); resta -= toma; }
  });
  return { partes, faltante: resta };
};

// Valor (en pesos) que corresponde a retirar `cantidad` de una línea. Retirar
// la línea completa devuelve exactamente su valor, sin redondeos.
export const valorRetiro = (linea, cantidad) => (
  cantidad === linea.cantidad ? Number(linea.valor) || 0 : Math.round(((Number(linea.valor) || 0) * cantidad) / linea.cantidad)
);

export const totalesKit = (lineas = []) => ({
  cantidadLineas: lineas.length,
  totalUnidades: lineas.reduce((n, l) => n + l.cantidad, 0),
  lineasSinVencimiento: lineas.filter((l) => !l.vencimiento).length,
});

export { fechaValida };

// Fechas con que ya existe ese producto + lote, distintas de la que se ingresa
// (posible error de digitación). Un S/L no identifica un lote: no se compara.
export const fechasDistintasDelLote = (lotes, lote, vencimiento) => {
  const clave = normalizarLote(lote);
  if (!clave) return [];
  return [...new Set(lotes
    .filter((l) => normalizarLote(l.lote) === clave && l.vencimiento && l.vencimiento !== vencimiento)
    .map((l) => l.vencimiento))].sort();
};

// Aplica a las líneas la fecha completada: la línea pasa al lote con fecha y,
// si el kit ya tenía ese lote, se une con él (no quedan dos líneas del mismo).
export const lineasConFecha = (lineas, loteIdAnterior, loteIdNuevo, vencimiento) => {
  const origen = lineas.find((l) => l.loteId === loteIdAnterior);
  const existente = lineas.find((l) => l.loteId === loteIdNuevo && l.loteId !== loteIdAnterior);
  const actualizada = {
    ...origen, loteId: loteIdNuevo, vencimiento, sinVencimiento: false, vencimientoCompletado: true,
    ...(existente ? {
      cantidad: existente.cantidad + origen.cantidad,
      valor: (Number(existente.valor) || 0) + (Number(origen.valor) || 0),
      costoUnitario: existente.costoUnitario === origen.costoUnitario ? origen.costoUnitario : null,
      fueraDeFEFO: Boolean(existente.fueraDeFEFO || origen.fueraDeFEFO),
    } : {}),
  };
  return lineas.filter((l) => l !== existente).map((l) => (l === origen ? actualizada : l));
};
