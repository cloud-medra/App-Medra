// Armado de Kits: reglas puras, compartidas con la pantalla.
//
// Un kit se arma con stock de Bodega: no hay stock paralelo. Cada línea apunta
// a un documento de bodega_lotes y sus unidades salen del disponible.
//
// Para agregar otro tipo de kit basta una entrada en FAMILIAS_KIT (etiqueta,
// rutas del menú y prefijo del ID), pantallas que monten PantallaKits y
// PantallaConfiguracionKits con esa familia, y su receta (receta.mjs).

import { idVinculo } from '../bodega/gs1.mjs';
import { normalizarClave, normalizarLote, lotesFEFO, lotesPropios, fechaValida } from '../bodega/nucleo.mjs';

export const MODULO = 'armadoKits';
export const COL_KITS = 'kits_armados';

export const FAMILIAS_KIT = Object.freeze({
  FLEXIBLE: Object.freeze({
    etiqueta: 'Flexibles',
    ruta: '/armadoKits/flexibles',
    rutaConfiguracion: '/armadoKits/configuracionFlexibles',
    prefijoId: 'F',
    // Los modelos (KFH, KFM…) y la receta están en kits_configuracion/FLEXIBLE.
  }),
});

const ACCIONES = Object.freeze({
  crear: ['kits', 'btn_crear'],
  editar: ['kit', 'btn_editar'],
  eliminar: ['kit', 'btn_eliminar'],
  completarVencimiento: ['kit', 'btn_completar_vencimiento'],
  reponer: ['kit', 'btn_registrar_reposicion'],
  rearmar: ['kit', 'btn_rearmar'],
});
// [modulo, ruta, seccion, accion] para puedeAccion.
export const accionKit = (familia, accion) => [MODULO, FAMILIAS_KIT[familia].ruta, ...ACCIONES[accion]];
export const accionConfiguracionKits = (familia) => [MODULO, FAMILIAS_KIT[familia].rutaConfiguracion, 'configuracion', 'btn_guardar'];

// Documento de bodega_control con el último número de cada familia. Solo lo
// escriben las Functions, en la misma transacción que crea el kit.
export const ID_CONTADOR_KITS = 'kits_correlativos';
// F001, F002… F999, F1000: el relleno es de 3 dígitos y luego sigue creciendo.
export const codigoCorrelativoKit = (familia, numero) => `${FAMILIAS_KIT[familia].prefijoId}${String(numero).padStart(3, '0')}`;

export const MAX_LINEAS_KIT = 60;

// Estados del kit (ver functions/armadoKits/transito.js). Un kit sin estado
// es ARMADO y uno sin versión es la versión 1.
//   ARMADO --despachar--> EN_TRANSITO --recibir / revisar sin devolución--> ENTREGADO
//                           |--revisar devolución parcial--> ENTREGADO_PARCIAL
//                           \--rechazar / anular / revisar con todo devuelto--> ARMADO
// ENTREGADO y ENTREGADO_PARCIAL son finales (cerrados): solo admiten
// reposiciones del centro y "Rearmar" (un kit nuevo).
export const ESTADOS_KIT = Object.freeze({ ARMADO: 'ARMADO', EN_TRANSITO: 'EN_TRANSITO', ENTREGADO: 'ENTREGADO', ENTREGADO_PARCIAL: 'ENTREGADO_PARCIAL' });
export const ETIQUETAS_ESTADO_KIT = Object.freeze({ ARMADO: 'Armado', EN_TRANSITO: 'En tránsito', ENTREGADO: 'Entregado', ENTREGADO_PARCIAL: 'Entregado parcial' });
export const ORDEN_ESTADOS_KIT = Object.freeze([ESTADOS_KIT.ARMADO, ESTADOS_KIT.EN_TRANSITO, ESTADOS_KIT.ENTREGADO, ESTADOS_KIT.ENTREGADO_PARCIAL]);
export const ESTADOS_CERRADOS_KIT = Object.freeze([ESTADOS_KIT.ENTREGADO, ESTADOS_KIT.ENTREGADO_PARCIAL]);
// Flexibles abre con los kits vivos; los cerrados quedan como historial.
export const ESTADOS_KIT_POR_DEFECTO = Object.freeze([ESTADOS_KIT.ARMADO, ESTADOS_KIT.EN_TRANSITO]);
export const estadoKit = (kit) => kit?.estado || ESTADOS_KIT.ARMADO;
export const kitCerrado = (kit) => ESTADOS_CERRADOS_KIT.includes(estadoKit(kit));
export const kitEditable = (kit) => estadoKit(kit) === ESTADOS_KIT.ARMADO;
// Sube con cada cambio de contenido: el código de barras la lleva, así una
// hoja impresa antes de editar se detecta al escanearla.
export const versionKit = (kit) => Number(kit?.version) || 1;
export const mensajeKitNoEditable = (kit) => `El kit ${kit.codigo} está ${ETIQUETAS_ESTADO_KIT[estadoKit(kit)].toLowerCase()}: no se puede editar ni eliminar.`;

// Líneas que piden confirmación al despachar.
export const advertenciasKit = (lineas = [], hoy) => ({
  vencidas: lineas.filter((l) => l.vencimiento && l.vencimiento < hoy),
  sinVencimiento: lineas.filter((l) => !l.vencimiento),
});

// Acciones de despacho y tránsito: en las vistas de Bodega donde se hacen.
export const ACCIONES_TRANSITO_KIT = Object.freeze({
  DESPACHAR: ['bodega', '/bodega/egresoBodega', 'egreso', 'btn_despachar_kit'],
  RECIBIR: ['bodega', '/bodega/transitoBodega', 'acciones', 'btn_kit_recibir'],
  RECHAZAR: ['bodega', '/bodega/transitoBodega', 'acciones', 'btn_kit_rechazar'],
  ANULAR: ['bodega', '/bodega/transitoBodega', 'acciones', 'btn_kit_anular'],
  REVISAR_DEVOLUCION: ['bodega', '/bodega/transitoBodega', 'acciones', 'btn_kit_revisar_devolucion'],
});
export const OPERACION_COMPLETAR = 'COMPLETAR_VENCIMIENTO';
export const OPERACION_REPONER = 'REPONER';

// Sin hora: el vencimiento es una fecha de Chile, sea cual sea la zona del servidor.
export const hoyChile = (ahora = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(ahora);

// El ID sale del código, así la unicidad la garantiza la propia transacción.
export const idKit = (codigo) => idVinculo(normalizarClave(codigo));

// Misma referencia que muestra Bodega (propia o del maestro clínico).
export const referenciaDe = (p) => p?.referencia || p?.maestroCodigo?.referencia || '';

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

// --- Devolución, consumo y reposición ------------------------------------------
//
// Cada línea de un kit cerrado guarda cuánto se usó y cuánto volvió (con su
// valor), y cuánto repuso el centro de lo usado:
//   { ...linea, usado, valorUsado, devuelto, valorDevuelto, repuesto, valorRepuesto }
// usado + devuelto = cantidad y valorUsado + valorDevuelto = valor. Un kit
// ENTREGADO sin estos campos (recibido antes) se usó completo.

const n0 = (v) => Number(v) || 0;
export const usoDeLinea = (l) => {
  const usado = l.usado ?? l.cantidad;
  const valorUsado = l.valorUsado ?? n0(l.valor);
  return {
    usado, valorUsado, devuelto: l.devuelto ?? 0, valorDevuelto: l.valorDevuelto ?? 0,
    repuesto: l.repuesto ?? 0, valorRepuesto: l.valorRepuesto ?? 0,
  };
};

// Revisión de la devolución: `devueltos` = [{ loteId, devuelto }] (las líneas
// que faltan se cuentan como 0 devuelto). Devuelve { errores, lineas,
// totales, resultado } con resultado TODO_DEVUELTO (= rechazar),
// NADA_DEVUELTO (= recibir) o PARCIAL.
export const RESULTADO_DEVOLUCION = Object.freeze({ TODO: 'TODO_DEVUELTO', NADA: 'NADA_DEVUELTO', PARCIAL: 'PARCIAL' });
export const planDevolucion = (lineasKit = [], devueltos = []) => {
  const errores = [];
  const pedido = new Map();
  (Array.isArray(devueltos) ? devueltos : []).forEach((d) => {
    const cantidad = Number(d?.devuelto);
    const loteId = String(d?.loteId || '');
    const linea = lineasKit.find((l) => l.loteId === loteId);
    if (!linea) { errores.push('Una línea de la devolución ya no está en el kit.'); return; }
    if (!Number.isInteger(cantidad) || cantidad < 0) { errores.push(`${linea.productoNombre}: la cantidad devuelta debe ser un número entero de 0 o más.`); return; }
    if (cantidad > linea.cantidad) { errores.push(`${linea.productoNombre} lote ${linea.lote || 'S/L'}: se despacharon ${linea.cantidad} y no pueden volver ${cantidad}.`); return; }
    pedido.set(loteId, cantidad);
  });
  const lineas = lineasKit.map((l) => {
    const devuelto = pedido.get(l.loteId) || 0;
    const valorDevuelto = devuelto ? valorRetiro(l, devuelto) : 0;
    return { ...l, devuelto, valorDevuelto, usado: l.cantidad - devuelto, valorUsado: n0(l.valor) - valorDevuelto, repuesto: 0, valorRepuesto: 0 };
  });
  const totales = {
    devuelto: lineas.reduce((s, l) => s + l.devuelto, 0), usado: lineas.reduce((s, l) => s + l.usado, 0),
    valorDevuelto: lineas.reduce((s, l) => s + l.valorDevuelto, 0), valorUsado: lineas.reduce((s, l) => s + l.valorUsado, 0),
  };
  const resultado = totales.usado === 0 ? RESULTADO_DEVOLUCION.TODO : totales.devuelto === 0 ? RESULTADO_DEVOLUCION.NADA : RESULTADO_DEVOLUCION.PARCIAL;
  return { errores: [...new Set(errores)], lineas, totales, resultado };
};

// Kit recibido completo: todo usado.
export const lineasTodoUsado = (lineasKit = []) => lineasKit.map((l) => ({ ...l, devuelto: 0, valorDevuelto: 0, usado: l.cantidad, valorUsado: n0(l.valor), repuesto: 0, valorRepuesto: 0 }));

// Resumen de consumo y reposición de un kit (se guarda en el kit para filtrar
// "Con reposición pendiente" sin leer las líneas).
export const consumoKit = (lineas = []) => {
  const u = lineas.map(usoDeLinea);
  const usado = u.reduce((s, x) => s + x.usado, 0);
  const repuesto = u.reduce((s, x) => s + x.repuesto, 0);
  return {
    usado, repuesto, pendiente: usado - repuesto,
    valorUsado: u.reduce((s, x) => s + x.valorUsado, 0), valorRepuesto: u.reduce((s, x) => s + x.valorRepuesto, 0),
  };
};
export const tieneReposicionPendiente = (kit) => kitCerrado(kit) && consumoKit(kit?.lineas).pendiente > 0;

// Lo usado y lo pendiente de reponer por componente del kit.
export const pendientePorComponente = (lineas = []) => {
  const porComponente = new Map();
  lineas.forEach((l) => {
    const id = l.componenteId || l.productoId;
    const c = porComponente.get(id) || { componenteId: id, componenteNombre: l.componenteNombre || l.productoNombre, usado: 0, repuesto: 0, pendiente: 0 };
    const u = usoDeLinea(l);
    c.usado += u.usado;
    c.repuesto += u.repuesto;
    c.pendiente = c.usado - c.repuesto;
    porComponente.set(id, c);
  });
  return [...porComponente.values()];
};

// Reposición: `items` = [{ componenteId, productoId, lote, vencimiento, cantidad }].
// `receta`: la del modelo del kit (recetaDelModelo): cada componente con sus
// referencias permitidas. Cada ítem se reparte entre las líneas usadas de su
// componente, en orden, y toma el valor con que salieron esas unidades (la
// última unidad pendiente de una línea se lleva el resto, así no quedan pesos
// sueltos). Devuelve { errores, items, lineas } (líneas con repuesto al día).
export const planReposicion = (lineasKit = [], items = [], receta = []) => {
  const errores = [];
  if (!Array.isArray(items) || !items.length) return { errores: ['Agrega al menos un insumo repuesto.'], items: [], lineas: lineasKit };
  const lineas = lineasKit.map((l) => ({ ...l, ...usoDeLinea(l) }));
  const pendientes = new Map(pendientePorComponente(lineasKit).map((c) => [c.componenteId, c]));
  const pedidoPorComponente = new Map();
  const validos = [];
  items.forEach((it) => {
    const componenteId = String(it?.componenteId || '');
    const componente = receta.find((c) => c.id === componenteId);
    const enKit = pendientes.get(componenteId);
    const cantidad = Number(it?.cantidad);
    const lote = String(it?.lote ?? '').trim();
    const vencimiento = String(it?.vencimiento ?? '').trim();
    if (!enKit) { errores.push('El componente repuesto no está en este kit.'); return; }
    const nombre = enKit.componenteNombre;
    const referencia = componente?.referencias.find((r) => r.productoId === it?.productoId);
    if (!referencia) { errores.push(`${nombre}: la referencia no está permitida para este componente en la configuración.`); return; }
    if (!Number.isInteger(cantidad) || cantidad <= 0) { errores.push(`${nombre}: la cantidad debe ser un número entero mayor a cero.`); return; }
    if (!lote) { errores.push(`${nombre}: ingresa el lote.`); return; }
    if (!fechaValida(vencimiento)) { errores.push(`${nombre}: ingresa un vencimiento válido.`); return; }
    pedidoPorComponente.set(componenteId, (pedidoPorComponente.get(componenteId) || 0) + cantidad);
    validos.push({ componenteId, componenteNombre: nombre, productoId: referencia.productoId, referencia: referencia.referencia, productoNombre: referencia.nombre, lote, vencimiento, cantidad });
  });
  pedidoPorComponente.forEach((cantidad, componenteId) => {
    const c = pendientes.get(componenteId);
    if (cantidad > c.pendiente) errores.push(`${c.componenteNombre}: se usaron ${c.usado}${c.repuesto ? ` y ya se repusieron ${c.repuesto}` : ''}; no se pueden reponer ${cantidad} (máximo ${c.pendiente}).`);
  });
  if (errores.length) return { errores: [...new Set(errores)], items: [], lineas: lineasKit };

  const resultado = validos.map((it) => {
    let falta = it.cantidad;
    let valor = 0;
    const desde = [];
    lineas.filter((l) => (l.componenteId || l.productoId) === it.componenteId).forEach((l) => {
      const libre = l.usado - l.repuesto;
      if (!falta || libre <= 0) return;
      const q = Math.min(libre, falta);
      const valorLibre = l.valorUsado - l.valorRepuesto;
      const v = q === libre ? valorLibre : Math.round((valorLibre * q) / libre);
      l.repuesto += q;
      l.valorRepuesto += v;
      valor += v;
      falta -= q;
      desde.push({ loteId: l.loteId, lote: l.lote || null, cantidad: q, valor: v });
    });
    return { ...it, valor, desde };
  });
  return { errores: [], items: resultado, lineas };
};

// --- Filtros del listado (Flexibles) ----------------------------------------------
//
// Consulta de una página según los filtros. Con `codigo` (búsqueda por ID) se
// usa el índice del código y el resto se filtra en memoria (son pocos). Si no:
//   - "Con reposición pendiente": reposicionPendiente == true.
//   - Estados: estado in [...] (con todos marcados, sin filtro de estado).
// Devuelve { donde: [[campo, op, valor]], orden, enMemoria(kit) }.
export const consultaKits = ({ familia, tipo = '', codigo = '', estados = ESTADOS_KIT_POR_DEFECTO, pendiente = false }) => {
  const lista = ORDEN_ESTADOS_KIT.filter((e) => (estados || []).includes(e));
  const todos = lista.length === ORDEN_ESTADOS_KIT.length;
  const enMemoria = (k) => (!tipo || k.tipo === tipo)
    && (pendiente ? tieneReposicionPendiente(k) : (todos || lista.includes(estadoKit(k))));
  if (codigo) return { donde: [['familia', '==', familia]], orden: 'codigoNormalizado', enMemoria };
  const donde = [['familia', '==', familia], ...(tipo ? [['tipo', '==', tipo]] : [])];
  if (pendiente) donde.push(['reposicionPendiente', '==', true]);
  else if (!todos) donde.push(['estado', 'in', lista]);
  return { donde, orden: 'creadoEn', enMemoria };
};
