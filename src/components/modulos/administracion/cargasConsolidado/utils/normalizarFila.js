// Capa de normalización: Implantes y Hemodinamia (bloques anidados en
// implantes_gestiones / hemodinamia_gestiones) y Consignación (ítems planos en
// consignacion_registros) tienen formas de datos distintas — acá se
// mapean a una forma común para que la tabla combinada, Imputadas y
// Solicitudes puedan renderizar ambos orígenes con las mismas columnas.
// `_raw` conserva el documento original tal cual lo entrega el hook de
// cada módulo, para que el modal de detalle y la acción de exportar
// puedan seguir operando con la forma nativa de cada uno.

import { CENTRO_HEMODINAMIA } from '../../../operaciones/hemodinamia/gestionHemodinamia/utils/constantesHemodinamia';
import { CODIGO_SIN_OC } from '../../../operaciones/implantes/gestionImplantes/components/Cargastab/cargasHelpers';
import { periodoImputacion } from '../../../operaciones/shared/periodoImputacion';

export const ORIGEN = {
  IMPLANTES: 'IMPLANTES',
  CONSIGNACION: 'CONSIGNACION',
  HEMODINAMIA: 'HEMODINAMIA'
};

export const ORIGEN_LABEL = {
  [ORIGEN.IMPLANTES]: 'Implantes',
  [ORIGEN.CONSIGNACION]: 'Consignación',
  [ORIGEN.HEMODINAMIA]: 'Hemodinamia'
};

export const ORIGEN_BADGE_STYLE = {
  [ORIGEN.IMPLANTES]: 'bg-violet-100 dark:bg-violet-950/40 text-violet-700 dark:text-violet-400 border-violet-300 dark:border-violet-800',
  [ORIGEN.CONSIGNACION]: 'bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 border-blue-300 dark:border-blue-800',
  [ORIGEN.HEMODINAMIA]: 'bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border-rose-300 dark:border-rose-800'
};

// --- Gestión (tabla principal) ---

// El "Período" (periodoAño/Mes, contable) es un dato aparte de la "fecha"
// (admisión/registro) por la que se filtra la tabla — pueden no coincidir
// (ej. fecha 30-08-2026 imputada al período de septiembre). Para un bloque
// de Implantes se toma del primer ítem que lo tenga, mismo criterio que
// usa DetallesTab.jsx para mostrarlo en el detalle.
// Si el bloque ya fue solicitado, es su período de solicitud (donde está
// imputado; ver periodoImputacion).
const obtenerPeriodoBloqueImplantes = (bloque) => {
  for (const cot of bloque.cotizaciones || []) {
    const p = (cot.items || []).map(x => periodoImputacion(bloque, x)).find(Boolean);
    if (p) return { periodoAnio: p.anio, periodoMes: p.mes };
  }
  return { periodoAnio: '', periodoMes: '' };
};

export const normalizarFilaGestionImplantes = (bloque) => ({
  origen: ORIGEN.IMPLANTES,
  id: bloque.id,
  refPath: bloque.refPath,
  gestionId: bloque.gestionId || bloque.agendaId || 'P',
  nombre: bloque.nombre || 'P',
  medico: bloque.medico || 'P',
  fecha: bloque.fecha || '',
  empresa: bloque.empresa || 'P',
  centro: bloque.centro || 'P',
  atributo: bloque.atributo || 'P',
  estado: bloque.estado || 'AGENDADO',
  costo: Number(bloque.costo) || 0,
  solicitud: bloque.solicitud || 'PENDIENTE',
  registradoPor: bloque.registradoPor || '',
  fechaRegistro: bloque.fechaRegistro || null,
  ...obtenerPeriodoBloqueImplantes(bloque),
  _raw: bloque
});

export const normalizarFilaGestionHemodinamia = (bloque) => ({
  origen: ORIGEN.HEMODINAMIA,
  id: bloque.id,
  refPath: bloque.refPath,
  gestionId: bloque.gestionId || bloque.agendaId || 'P',
  nombre: bloque.nombre || 'P',
  medico: bloque.medico || 'P',
  fecha: bloque.fecha || '',
  empresa: bloque.empresa || 'P',
  centro: CENTRO_HEMODINAMIA,
  atributo: bloque.atributo || 'HEMODINAMIA',
  estado: bloque.estado || 'AGENDADO',
  costo: Number(bloque.costo) || 0,
  solicitud: bloque.solicitud || 'PENDIENTE',
  registradoPor: bloque.registradoPor || '',
  fechaRegistro: bloque.fechaRegistro || null,
  ...obtenerPeriodoBloqueImplantes(bloque),
  _raw: bloque
});

export const normalizarFilaGestionConsignacion = (item) => ({
  origen: ORIGEN.CONSIGNACION,
  id: item.id,
  refPath: item.ref?.path || item.refPath || null,
  gestionId: item.gestionId || 'P',
  nombre: item.nombre || 'P',
  medico: item.medico || 'P',
  fecha: item.fecha || '',
  empresa: item.empresa || 'P',
  centro: item.centro || 'P',
  atributo: item.atributo || 'P',
  estado: item.estado || 'INGRESADO',
  costo: Number(item.costo) || 0,
  solicitud: (item.estado || '').toUpperCase() === 'SOLICITADO' ? 'SOLICITADO' : 'PENDIENTE',
  registradoPor: item.registradoPor || '',
  fechaRegistro: item.fechaRegistro || null,
  periodoAnio: item.periodoAnio || '',
  periodoMes: item.periodoMes || '',
  _raw: item
});

// --- Imputadas ---

export const normalizarImputadaImplantes = (doc) => ({
  origen: ORIGEN.IMPLANTES,
  id: doc.id,
  gestionId: doc.gestionId || doc.agendaId || 'P',
  paciente: doc.paciente || 'P',
  medico: doc.medico || 'P',
  fecha: doc.fecha || '',
  empresa: doc.empresa || 'P',
  codigo: doc.codigo || 'P',
  referencia: doc.referencia || 'P',
  cantidad: Number(doc.cantidad) || 0,
  costoUnitario: Number(doc.precio) || 0,
  vecesCosto: doc.vecesCosto ?? null,
  venta: Number(doc.venta) || 0,
  total: Number(doc.total) || 0,
  lote: doc.lote || '',
  vencimiento: doc.vencimiento || '',
  estado: doc.estado || 'AGENDADO',
  periodoAnio: doc.periodoAnio || '',
  periodoMes: doc.periodoMes || '',
  _raw: doc
});

export const normalizarImputadaHemodinamia = (doc) => ({
  origen: ORIGEN.HEMODINAMIA,
  id: doc.id,
  gestionId: doc.gestionId || doc.agendaId || 'P',
  paciente: doc.paciente || 'P',
  medico: doc.medico || 'P',
  fecha: doc.fecha || '',
  empresa: doc.empresa || 'P',
  codigo: doc.codigo || 'P',
  referencia: doc.referencia || 'P',
  cantidad: Number(doc.cantidad) || 0,
  costoUnitario: Number(doc.precio) || 0,
  vecesCosto: doc.vecesCosto ?? null,
  venta: Number(doc.venta) || 0,
  total: Number(doc.total) || 0,
  lote: doc.lote || '',
  vencimiento: doc.vencimiento || '',
  estado: doc.estado || 'AGENDADO',
  periodoAnio: doc.periodoAnio || '',
  periodoMes: doc.periodoMes || '',
  _raw: doc
});

export const normalizarImputadaConsignacion = (doc) => ({
  origen: ORIGEN.CONSIGNACION,
  id: doc.id,
  gestionId: doc.gestionId || 'P',
  paciente: doc.nombre || 'P',
  medico: doc.medico || 'P',
  fecha: doc.fecha || '',
  empresa: doc.empresa || 'P',
  codigo: doc.codigo || 'P',
  referencia: doc.referencia || 'P',
  cantidad: Number(doc.cantidad) || 0,
  costoUnitario: Number(doc.costo) || 0,
  vecesCosto: doc.recargoVecesCosto ?? null,
  venta: Number(doc.venta) || 0,
  total: Number(doc.total) || 0,
  lote: doc.lote || '',
  vencimiento: doc.vencimiento || '',
  estado: doc.estado || 'INGRESADO',
  periodoAnio: doc.periodoAnio || '',
  periodoMes: doc.periodoMes || '',
  _raw: doc
});

// --- Solicitudes ---
// Cada función devuelve un ARRAY de filas (no un objeto), una por ÍTEM —no
// por bloque/admisión— para que la tabla combinada muestre exactamente la
// misma estructura fila-por-ítem que las pantallas nativas de Solicitud de
// cada módulo (SolicitudConsignacion.jsx / SolicitudHemodinamia.jsx /
// SolicitudImplantes.jsx: Admisión, Paciente, Médico, Fecha, Empresa,
// Código, Descripción, Cantidad, Precio, Atributo, Fecha de Registro,
// Fecha de Carga, N° Guía, Fecha de Ingreso, Lote, Vencimiento). Los
// llamadores deben usar `.flatMap(...)`, no `.map(...)`.
//
// `selectId` (no `id`) es la clave de selección del checkbox: en
// Implantes/Hemodinamia es el bloque completo (`refPath`), porque ahí se
// exporta la admisión entera de una vez, no ítem por ítem — mismo criterio
// que ya usan las pantallas nativas (el checkbox de cada fila-ítem
// referencia `bloque.refPath`, así que todas las filas de un mismo bloque
// quedan marcadas/desmarcadas juntas). En Consignación, que sí exporta por
// ítem, `selectId` es el propio `id` del ítem.
//
// "Atributo" y "N° Guía" no significan lo mismo en los 3 orígenes:
// Consignación tiene guía de despacho real; Implantes/Hemodinamia no
// tienen "guía", tienen N° de Cotización. Se unifican bajo el mismo
// nombre de columna (el de Consignación, que es la pantalla de
// referencia), tomando el campo que corresponda según el origen de la fila.
// "Atributo" si existe con el mismo nombre de campo (`atributo`) en las 3
// colecciones de origen, así que no hace falta mapear nada ahí.
//
// Campos `*Export` (+ area/prevision): lo que va al EXCEL, que NO es lo
// mismo que lo que se muestra en pantalla. En Implantes/Hemodinamia la
// tabla nativa muestra `referencia` bajo el título "Descripción", pero su
// Excel nativo (shared/solicitud/useSolicitudGestionesData)
// exporta `descriptorAuto` como DESCRIPCION y `tipoVinculado` (del ítem)
// como ATRIBUTO. Antes el export del Consolidado reutilizaba `descripcion`
// (el valor de pantalla = referencia), por eso salía la Referencia en la
// columna DESCRIPCION. Consignación no tiene esa diferencia: su
// `descripcion` ya es la real en ambos lados.
// En Implantes la columna "Descripción" de pantalla también muestra
// `descriptorAuto` (antes mostraba la referencia, igual que la tabla
// nativa; ambas se corrigieron juntas).
//
// "Fecha de Registro" en Implantes/Hemodinamia es `fechaRegistroAdmision`
// (cuándo se ingresó el ID de admisión, ver shared/fechaRegistroAdmision.js),
// no `fechaRegistro` (creación del documento). En Consignación sigue siendo
// `fechaRegistro`.

const FILA_ITEM_VACIA = { codigo: '-', descripcion: '-', cantidad: '-', precio: 0, lote: '-', vencimiento: '' };

export const normalizarSolicitudImplantes = (bloque) => {
  // OJO: el doc crudo de implantes_gestiones anida los ítems en
  // `cotizaciones[0].items` (igual que Hemodinamia) — NO en `bloque.items`
  // directo. Leer `bloque.items` (como hacía la versión anterior) siempre
  // daba 0 ítems para Implantes en esta pestaña.
  const items = bloque.cotizaciones?.[0]?.items || [];
  const numCotizacionBloque = bloque.cotizaciones?.[0]?.numCotizacion || 'P';
  const filasItems = items.length > 0 ? items : [null];

  return filasItems.map((it, idx) => ({
    origen: ORIGEN.IMPLANTES,
    id: `${bloque.refPath}::${it?.id ?? idx}`,
    selectId: bloque.refPath,
    refPath: bloque.refPath,
    gestionId: bloque.gestionId || bloque.agendaId || 'P',
    paciente: bloque.nombre || 'P',
    medico: bloque.medico || 'P',
    fecha: bloque.fecha || '',
    empresa: bloque.empresa || 'P',
    codigo: it ? (it.codigo || 'S/C') : FILA_ITEM_VACIA.codigo,
    descripcion: it ? (it.descriptorAuto || 'P') : FILA_ITEM_VACIA.descripcion,
    cantidad: it ? (it.cantidad ?? FILA_ITEM_VACIA.cantidad) : FILA_ITEM_VACIA.cantidad,
    precio: it ? Number(it.precio) || 0 : FILA_ITEM_VACIA.precio,
    atributo: bloque.atributo || 'P',
    fechaRegistro: bloque.fechaRegistroAdmision || null,
    fechaCarga: bloque.fecha || '',
    numGuia: it?.numCotizacion || numCotizacionBloque,
    lote: it ? (it.lote || 'P') : FILA_ITEM_VACIA.lote,
    vencimiento: it ? (it.vencimiento || '') : FILA_ITEM_VACIA.vencimiento,
    descripcionExport: it ? (it.descriptorAuto || 'P') : '',
    atributoExport: it ? (it.tipoVinculado || 'P') : '',
    ventaExport: it ? (it.venta || 0) : '',
    estadoExport: it ? (it.estadoCarga || 'PENDIENTE') : '',
    area: bloque.centro || 'PABELLON',
    prevision: bloque.prevision || 'P',
    esFilaGuia: false,
    _raw: bloque
  }));
};

// `id`/`selectId` usan item.id (no item.refPath): las filas de desglose de
// guía que arma cargarCandidatosSolicitudConsignacion (esFilaGuia: true) no
// tienen documento propio en Firestore, así que no tienen refPath — solo
// id. Usar refPath como id las dejaba todas con el mismo id (undefined),
// rompiendo la selección por checkbox y las keys de React.
export const normalizarSolicitudConsignacion = (item) => [{
  origen: ORIGEN.CONSIGNACION,
  id: item.id,
  selectId: item.id,
  refPath: item.refPath || null,
  gestionId: item.gestionId || 'P',
  paciente: item.nombre || 'P',
  medico: item.medico || 'P',
  fecha: item.fecha || '',
  empresa: item.empresa || 'P',
  codigo: item.codigo || 'S/C',
  descripcion: item.descripcion || 'P',
  cantidad: item.cantidad,
  precio: Number(item.costo) || 0,
  atributo: item.atributo || 'P',
  fechaRegistro: item.fechaRegistro || null,
  fechaCarga: item.fecha || '',
  numGuia: item.numeroGuia || 0,
  lote: item.lote,
  vencimiento: item.vencimiento,
  descripcionExport: item.descripcion || 'P',
  atributoExport: item.atributo || 'P',
  ventaExport: item.ventaUnitaria,
  estadoExport: item.esFilaGuia ? '-' : 'CARGADO',
  area: 'PABELLON',
  prevision: item.esFilaGuia ? '-' : (item.datosOriginales?.prevision || 'P'),
  esFilaGuia: !!item.esFilaGuia,
  _raw: item
}];

// Hemodinamia guarda igual que Implantes (bloques con cotizaciones[0].items).
// `_raw` toma la forma nativa que entrega useSolicitudesUnificadasData.js
// (doc crudo con `cotizaciones` anidado), porque el export de este módulo
// la necesita tal cual para escribir en hemodinamia_imputadas.
export const normalizarSolicitudHemodinamia = (doc) => {
  const items = doc.cotizaciones?.[0]?.items || [];
  const numCotizacionBloque = doc.cotizaciones?.[0]?.numCotizacion || 'P';
  const bloque = {
    id: doc.id,
    refPath: doc.refPath,
    gestionId: doc.gestionId || doc.agendaId || 'P',
    agendaId: doc.agendaId || doc.gestionId || 'P',
    admision: doc.admision || 'P',
    nombre: doc.nombre || 'P',
    medico: doc.medico || 'P',
    empresa: doc.empresa || 'P',
    fecha: doc.fecha || 'P',
    informe: doc.informe || 'PENDIENTE',
    convenio: doc.convenio || 'P',
    prevision: doc.prevision || 'P',
    descripcion: doc.descripcion || 'P',
    centro: CENTRO_HEMODINAMIA,
    atributo: doc.atributo || 'HEMODINAMIA',
    estado: doc.estado || 'AGENDANDO',
    costo: doc.costo || 0,
    registradoPor: doc.registradoPor || 'Usuario',
    fechaRegistro: doc.fechaRegistro || null,
    fechaRegistroAdmision: doc.fechaRegistroAdmision || null,
    numCotizacion: numCotizacionBloque,
    items
  };

  const filasItems = items.length > 0 ? items : [null];

  return filasItems.map((it, idx) => ({
    origen: ORIGEN.HEMODINAMIA,
    id: `${bloque.refPath}::${it?.id ?? idx}`,
    selectId: bloque.refPath,
    refPath: bloque.refPath,
    gestionId: bloque.gestionId,
    paciente: bloque.nombre,
    medico: bloque.medico,
    fecha: bloque.fecha === 'P' ? '' : bloque.fecha,
    empresa: bloque.empresa,
    codigo: it ? (it.codigo || 'S/C') : FILA_ITEM_VACIA.codigo,
    descripcion: it ? (it.referencia || it.descriptorAuto || 'P') : FILA_ITEM_VACIA.descripcion,
    cantidad: it ? (it.cantidad ?? FILA_ITEM_VACIA.cantidad) : FILA_ITEM_VACIA.cantidad,
    precio: it ? Number(it.precio) || 0 : FILA_ITEM_VACIA.precio,
    atributo: bloque.atributo || 'P',
    fechaRegistro: bloque.fechaRegistroAdmision || null,
    fechaCarga: bloque.fecha === 'P' ? '' : bloque.fecha,
    numGuia: it?.numCotizacion || numCotizacionBloque,
    lote: it ? (it.lote || 'P') : FILA_ITEM_VACIA.lote,
    vencimiento: it ? (it.vencimiento || '') : FILA_ITEM_VACIA.vencimiento,
    descripcionExport: it ? (it.descriptorAuto || 'P') : '',
    atributoExport: it ? (it.tipoVinculado || 'P') : '',
    ventaExport: it ? (it.venta || 0) : '',
    estadoExport: it ? (it.estadoCarga || 'PENDIENTE') : '',
    area: bloque.centro,
    prevision: bloque.prevision,
    esFilaGuia: false,
    _raw: bloque
  }));
};

// --- Orden compartido del Consolidado ---
// Las 3 colecciones ya llegan unificadas al mismo campo `gestionId`
// (número de admisión) gracias a los normalizadores de arriba, así que el
// orden se puede aplicar una sola vez sobre el arreglo combinado, sin
// importar de qué origen venga cada fila.
//
// 1° criterio: número de admisión ascendente (las admisiones son
// numéricas, ej. "102030" — se comparan como número, no como texto, para
// que "9" no quede después de "10"; un gestionId no numérico como el
// placeholder "P" se manda al final del todo).
// 2° criterio, dentro del mismo grupo de admisión: filas con código de OC
// van primero, filas sin código (CODIGO_SIN_OC = "No lleva OC", el
// placeholder "P", vacío o nulo) van al final de ese grupo.
const compararAdmision = (a, b) => {
  const na = Number(a);
  const nb = Number(b);
  const aEsNumero = a !== '' && a != null && !Number.isNaN(na);
  const bEsNumero = b !== '' && b != null && !Number.isNaN(nb);
  if (aEsNumero && bEsNumero) return na - nb;
  if (aEsNumero) return -1;
  if (bEsNumero) return 1;
  return String(a ?? '').localeCompare(String(b ?? ''));
};

const grupoOC = (codigo) => {
  const c = (codigo ?? '').toString().trim();
  return (c === '' || c === CODIGO_SIN_OC || c === 'P') ? 1 : 0;
};

export const ordenarPorAdmisionYOC = (filas) =>
  [...filas].sort((a, b) => {
    const cmpAdmision = compararAdmision(a.gestionId, b.gestionId);
    if (cmpAdmision !== 0) return cmpAdmision;
    return grupoOC(a.codigo) - grupoOC(b.codigo);
  });

// --- Filtros compartidos del Consolidado (Gestión, Solicitudes, Imputadas) ---
// Lista fija (no se deriva de los datos, a diferencia de un filtro de
// "estados vistos"): el Consolidado por definición solo junta estas 3
// colecciones, así que las opciones del selector de Origen no cambian.
export const ORIGENES_DISPONIBLES = [ORIGEN.IMPLANTES, ORIGEN.CONSIGNACION, ORIGEN.HEMODINAMIA];

// Búsqueda parcial (sin distinguir mayúsculas) por admisión o por
// nombre/paciente — cada normalizador de arriba usa `nombre` (Gestión) o
// `paciente` (Solicitudes/Imputadas), así que se revisan ambos campos sin
// necesidad de unificar el nombre de la propiedad entre los 3.
// `origenesSeleccionados` vacío = sin restricción ("Todas"), igual que el
// patrón ya usado en los demás filtros multi-selección de la app
// (ver filtrosEstados en Consignación/Implantes): no es necesario marcar
// "Todas" explícitamente, alcanza con no marcar ninguna opción individual.
export const filtrarPorBusquedaYOrigen = (filas, { busqueda = '', origenesSeleccionados = [] } = {}) => {
  const texto = busqueda.trim().toLowerCase();
  return filas.filter(f => {
    if (origenesSeleccionados.length > 0 && !origenesSeleccionados.includes(f.origen)) return false;
    if (!texto) return true;
    const admision = String(f.gestionId ?? '').toLowerCase();
    const nombre = String(f.nombre ?? f.paciente ?? '').toLowerCase();
    return admision.includes(texto) || nombre.includes(texto);
  });
};
