// Respaldo de contingencia de Implantes: lógica pura (sin Firestore ni
// archivos). Convierte lo leído del sistema en las filas del Excel, arma los
// catálogos de los desplegables y decide cuántas filas vacías preparar y qué
// copias viejas borrar. El libro se arma en libroRespaldo.js y la lectura y
// el guardado en generarRespaldoImplantes.js.
//
// Las filas exportadas (ORIGEN = SISTEMA) son una FOTO del sistema: llevan
// los valores guardados en cada ítem (código, precio, venta…), no los del
// catálogo de hoy, porque el sistema también guarda su propia copia al cargar.

import { ESTADO_CARGA_OPTIONS, CODIGO_SIN_OC } from '../../src/components/modulos/operaciones/implantes/gestionImplantes/components/Cargastab/cargasHelpers.js';
import { LADOS, LADO_POR_DEFECTO } from '../../functions/bodymap/nucleo.mjs';

export const PREFIJO_ARCHIVO = 'respaldo_implantes_';
export const COPIAS_A_CONSERVAR = 3;
export const ZONA_HORARIA = 'America/Santiago';

// Mismas opciones que el <select> de Estado en Información
// (Informaciontab.jsx). AGENDANDO es el valor antiguo de AGENDADO.
export const ESTADOS_GESTION = ['AGENDADO', 'PENDIENTE', 'REVISAR', 'S/COTIZACION', 'CARGADO', 'INCOMPLETO'];
export const ESTADOS_CARGA = ESTADO_CARGA_OPTIONS;
export const INFORMES = ['PENDIENTE', 'DISPONIBLE', 'NO APLICA'];
export const NOMBRES_LADO = LADOS.map((l) => l.nombre);
export const SI_NO = ['SÍ', 'NO'];
export { CODIGO_SIN_OC };

export const TIPOS_LINEA = Object.freeze({
  NORMAL: 'NORMAL',
  PAD_PADRE: 'PAD PADRE',
  CONTENIDO_PAD: 'CONTENIDO PAD',
  LOTE_ADICIONAL: 'LOTE ADICIONAL',
});
export const LISTA_TIPOS_LINEA = Object.values(TIPOS_LINEA);

export const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

// Filas vacías mínimas, para que el respaldo sirva aunque se exporte a
// comienzo de mes (con pocas gestiones todavía).
export const MINIMO_LIBRES = Object.freeze({ gestiones: 100, items: 300, documentos: 200 });
// Ítems por gestión si el mes todavía no tiene ítems para estimarlo.
export const ITEMS_POR_GESTION_POR_DEFECTO = 4;

const texto = (v) => (v === undefined || v === null ? '' : String(v).trim());
const numero = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const ISO = /^\d{4}-\d{2}-\d{2}$/;

// --- Fechas -----------------------------------------------------------------

// "AAAA-MM-DD" de una fecha en hora de Chile.
export const fechaISOChile = (fecha = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: ZONA_HORARIA, year: 'numeric', month: '2-digit', day: '2-digit' }).format(fecha);

export const fechaHoraChile = (fecha = new Date()) =>
  new Intl.DateTimeFormat('es-CL', { timeZone: ZONA_HORARIA, dateStyle: 'short', timeStyle: 'short' }).format(fecha);

// "AAAA-MM-DD" → Date a medianoche UTC (exceljs la escribe como ese día, sin
// correrla por la zona horaria). Texto no ISO ("Sin fecha", "PAD", "P") → null.
export const isoAFechaExcel = (iso) => {
  if (!ISO.test(texto(iso))) return null;
  const [a, m, d] = iso.split('-').map(Number);
  const fecha = new Date(Date.UTC(a, m - 1, d));
  return fecha.getUTCMonth() === m - 1 ? fecha : null;
};

// Valor de una celda de fecha leída del Excel → "AAAA-MM-DD" (o null). Lo
// usará el importador: Excel puede entregar una fecha, un número de serie o
// el texto que escribió el usuario (dd-mm-aaaa o AAAA-MM-DD).
export const fechaExcelAISO = (valor) => {
  if (valor instanceof Date && !Number.isNaN(valor.getTime())) return valor.toISOString().slice(0, 10);
  if (typeof valor === 'number' && valor > 0) {
    return new Date(Date.UTC(1899, 11, 30) + Math.round(valor) * 86400000).toISOString().slice(0, 10);
  }
  const t = texto(valor);
  if (ISO.test(t)) return isoAFechaExcel(t) ? t : null;
  const m = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (!m) return null;
  const iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return isoAFechaExcel(iso) ? iso : null;
};

// --- Período ----------------------------------------------------------------

// { anio: '2026', mes: 'noviembre' } → { anio: '2026', mes: '11' }
export const periodoARuta = ({ anio, mes }) => {
  const indice = MESES.indexOf(texto(mes).toLowerCase());
  if (indice < 0) throw new Error(`Mes de período no reconocido: ${mes}`);
  return { anio: texto(anio), mes: String(indice + 1).padStart(2, '0') };
};

// "AAAA-MM" (opción --mes) → { anio, mes } con mes en dos dígitos.
export const mesDesdeTexto = (valor) => {
  const m = texto(valor).match(/^(\d{4})-(\d{1,2})$/);
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) throw new Error(`--mes debe ser AAAA-MM (recibido: ${valor})`);
  return { anio: m[1], mes: m[2].padStart(2, '0') };
};

export const mesAnterior = ({ anio, mes }) => {
  const n = Number(mes);
  return n === 1
    ? { anio: String(Number(anio) - 1), mes: '12' }
    : { anio: String(anio), mes: String(n - 1).padStart(2, '0') };
};

// Período abierto más reciente del módulo entre los documentos ABIERTO /
// REABIERTO de cierres_periodos (misma fuente que usePeriodoAbiertoModulo).
export const periodoAbiertoDe = (cierres, modulo = 'implantes') => {
  const delModulo = (cierres || []).filter((c) => c.modulo === modulo && MESES.includes(texto(c.mes).toLowerCase()));
  delModulo.sort((a, b) => (Number(b.anio) - Number(a.anio))
    || (MESES.indexOf(texto(b.mes).toLowerCase()) - MESES.indexOf(texto(a.mes).toLowerCase())));
  return delModulo[0] || null;
};

// --- Gestiones e ítems ------------------------------------------------------

// Misma forma que la ruta del sistema (getDetallesRef): admisión o
// SIN_ADMISION, empresa y fecha. En las filas nuevas la arma la fórmula.
export const claveGestion = ({ admision, empresa, fecha }) => {
  const adm = texto(admision);
  return `${adm && adm !== 'P' ? adm : 'SIN_ADMISION'}|${texto(empresa)}|${texto(fecha)}`;
};

export const tipoLineaDe = (item) => {
  if (item?.padPadreId) return TIPOS_LINEA.CONTENIDO_PAD;
  if (item?.lotePadreId) return TIPOS_LINEA.LOTE_ADICIONAL;
  if (item?.esPad) return TIPOS_LINEA.PAD_PADRE;
  return TIPOS_LINEA.NORMAL;
};

const nombreLado = (id) => {
  if (!id || id === LADO_POR_DEFECTO) return '';
  return LADOS.find((l) => l.id === id)?.nombre || texto(id);
};

const itemsDe = (gestion) => (Array.isArray(gestion?.cotizaciones?.[0]?.items) ? gestion.cotizaciones[0].items : []);

// Fecha o texto tal cual (para "Sin fecha", "PAD"…).
const fechaOTexto = (valor) => isoAFechaExcel(valor) || texto(valor);

// Documentos de gestión ({ refPath, ...data }) → filas de las hojas
// Gestiones e Ítems. Los N° de línea son correlativos desde 1 y la Línea
// padre apunta al N° de línea del PAD o de la referencia principal.
export const filasDesdeGestiones = (gestiones) => {
  const filasGestiones = [];
  const filasItems = [];
  let linea = 0;

  const ordenadas = [...(gestiones || [])].sort((a, b) =>
    texto(a.fecha).localeCompare(texto(b.fecha))
    || texto(a.gestionId).localeCompare(texto(b.gestionId))
    || texto(a.empresa).localeCompare(texto(b.empresa)));

  ordenadas.forEach((g) => {
    const clave = claveGestion({ admision: g.gestionId || g.agendaId, empresa: g.empresa, fecha: g.fecha });
    filasGestiones.push({
      clave,
      admision: texto(g.gestionId || g.agendaId),
      fecha: fechaOTexto(g.fecha),
      empresa: texto(g.empresa),
      nombre: texto(g.nombre),
      totalCotizacion: numero(g.costo) || numero(g.cotizaciones?.[0]?.totalCotizacion) || '',
      informe: texto(g.informe),
      centro: texto(g.centro),
      atributo: texto(g.atributo),
      lado: nombreLado(g.lado),
      observacion: texto(g.observacion),
      convenio: texto(g.convenio),
      prevision: texto(g.prevision),
      medico: texto(g.medico),
      descripcion: texto(g.descripcion),
      estado: texto(g.estado),
      solicitud: texto(g.solicitud) || 'PENDIENTE',
      registradoPor: texto(g.registradoPor),
      idSistema: g.refPath,
    });

    const lineaPorId = new Map();
    const items = itemsDe(g);
    items.forEach((it) => { linea += 1; if (it?.id) lineaPorId.set(it.id, linea); });
    items.forEach((it) => {
      const padre = it.padPadreId || it.lotePadreId;
      filasItems.push({
        linea: it?.id ? lineaPorId.get(it.id) : null,
        clave,
        tipo: tipoLineaDe(it),
        lineaPadre: padre ? (lineaPorId.get(padre) ?? '') : '',
        numCotizacion: texto(it.numCotizacion),
        referencia: texto(it.referencia),
        cantidad: numero(it.cantidad),
        lote: texto(it.lote),
        vencimiento: fechaOTexto(it.vencimiento),
        estadoCarga: texto(it.estadoCarga) || 'PENDIENTE',
        codigo: texto(it.codigo),
        precio: numero(it.precio),
        empresaVinculada: texto(it.empresaVinculada),
        clase: texto(it.clase),
        tipoVinculado: texto(it.tipoVinculado),
        descriptorAuto: texto(it.descriptorAuto),
        vecesCosto: numero(it.vecesCosto) || 1,
        totalItem: numero(it.totalItem),
        venta: numero(it.venta),
        sinCodigo: !!it.sinCodigo,
        recargoEncontrado: !!it.recargoEncontrado,
        esFibra: Boolean(it.fibra?.codigoInterno || it.fibra?.id),
        idSistema: texto(it.id),
      });
    });
  });

  // Ítems antiguos sin id: igual necesitan un N° de línea único.
  let siguiente = linea;
  filasItems.forEach((f) => { if (f.linea === null || f.linea === undefined) { siguiente += 1; f.linea = siguiente; } });

  return { filasGestiones, filasItems, ultimaLinea: siguiente };
};

// --- Edición de filas del sistema ---------------------------------------------
// En una caída se pueden actualizar algunos campos de lo ya registrado (decisión
// del 23-11-2026). El resto de la fila sigue bloqueado. El importador aplica
// estos cambios por ID de sistema.

export const CAMPOS_EDITABLES_GESTION = Object.freeze(['informe', 'lado', 'observacion']);
export const CAMPOS_EDITABLES_ITEM = Object.freeze(['cantidad', 'lote', 'vencimiento', 'estadoCarga']);

// Campos editables de un ítem del sistema, con las mismas restricciones que
// la pantalla Cargas:
//   - Estado carga: no en PAD (padre ni contenido, su estado es PAD fijo) ni
//     en líneas sin código (en Cargas no tienen selector).
//   - Lote y vencimiento: no en el PAD PADRE (son "PAD") ni en una fibra
//     (vienen de la fibra física).
//   - Cantidad: no en una fibra (siempre 1 por uso).
export const camposEditablesItem = (fila) => {
  const esPad = fila.tipo === TIPOS_LINEA.PAD_PADRE || fila.tipo === TIPOS_LINEA.CONTENIDO_PAD;
  return CAMPOS_EDITABLES_ITEM.filter((campo) => {
    if (campo === 'estadoCarga') return !esPad && !fila.sinCodigo;
    if (campo === 'lote' || campo === 'vencimiento') return fila.tipo !== TIPOS_LINEA.PAD_PADRE && !fila.esFibra;
    if (campo === 'cantidad') return !fila.esFibra;
    return false;
  });
};

// --- Catálogos --------------------------------------------------------------

const activo = (doc) => texto(doc?.estado ?? 'ACTIVO').toUpperCase() !== 'INACTIVO';
const normalizarRef = (r) => texto(r).toUpperCase();
const porTexto = (a, b) => a.localeCompare(b, 'es');

// Referencias del Maestro de Códigos que se pueden usar en la contingencia:
// las activas (igual que el autocompletado de Cargas) y sin fibras
// reutilizables (exigen elegir la fibra física, que no va en el respaldo).
export const catalogoReferencias = (codigos) => {
  let inactivas = 0;
  let fibras = 0;
  const usables = [];
  (codigos || []).forEach((c) => {
    if (!texto(c?.referencia)) return;
    if (!activo(c)) { inactivas += 1; return; }
    if (c.fibraReutilizable === true) { fibras += 1; return; }
    usables.push(c);
  });

  const repeticiones = new Map();
  usables.forEach((c) => {
    const ref = normalizarRef(c.referencia);
    repeticiones.set(ref, (repeticiones.get(ref) || 0) + 1);
  });

  const filas = usables.map((c) => ({
    clave: `${texto(c.referencia)}|${texto(c.empresa)}`,
    referencia: texto(c.referencia),
    codigo: texto(c.codigo),
    empresa: texto(c.empresa),
    precio: numero(c.precioNeto),
    clase: texto(c.clase),
    tipo: texto(c.tipo),
    descriptorAuto: texto(c.descriptorAuto),
    segmento: texto(c.segmento),
    repeticiones: repeticiones.get(normalizarRef(c.referencia)),
  })).sort((a, b) => porTexto(a.referencia, b.referencia) || porTexto(a.empresa, b.empresa));

  const clavesVistas = new Set();
  let clavesRepetidas = 0;
  filas.forEach((f) => {
    const k = f.clave.toUpperCase();
    if (clavesVistas.has(k)) clavesRepetidas += 1; else clavesVistas.add(k);
  });

  const referenciasUnicas = [];
  const vistas = new Set();
  filas.forEach((f) => {
    const k = normalizarRef(f.referencia);
    if (!vistas.has(k)) { vistas.add(k); referenciasUnicas.push(f.referencia); }
  });

  return {
    filas,
    referenciasUnicas,
    resumen: {
      usables: filas.length,
      inactivas,
      fibras,
      referenciasRepetidas: [...repeticiones.values()].filter((n) => n > 1).length,
      clavesRepetidas,
    },
  };
};

const nombresUnicos = (docs, filtro) => [...new Set((docs || [])
  .filter((d) => texto(d?.nombre) && activo(d) && filtro(d))
  .map((d) => texto(d.nombre)))].sort(porTexto);

// Mismos filtros que EmpresaSelect y CentroSelect (Gestiones).
export const listaEmpresas = (docs) => nombresUnicos(docs, () => true);
export const listaCentros = (docs) => nombresUnicos(docs, (d) => d.usarEnGestiones !== false);

// Rangos de recargo ACTIVOS ordenados por "desde" (la fórmula busca el
// tramo con COINCIDIR aproximado, que exige orden ascendente).
export const listaRecargos = (docs) => (docs || [])
  .filter((r) => texto(r?.estado).toUpperCase() === 'ACTIVO')
  .map((r) => ({ desde: numero(r.desde), hasta: numero(r.hasta), vecesCosto: numero(r.vecesCosto) || 1 }))
  .sort((a, b) => a.desde - b.desde);

// --- Tamaño y copias --------------------------------------------------------

// Filas vacías: al menos el doble del volumen del mes (el mayor entre el mes
// exportado y el anterior, por si se exporta a comienzo de mes).
export const dimensionar = ({ gestionesMes, itemsMes, gestionesMesAnterior = 0 }) => {
  const baseGestiones = Math.max(gestionesMes, gestionesMesAnterior);
  const itemsPorGestion = gestionesMes > 0 && itemsMes > 0 ? itemsMes / gestionesMes : ITEMS_POR_GESTION_POR_DEFECTO;
  const baseItems = Math.max(itemsMes, Math.ceil(baseGestiones * itemsPorGestion));
  return {
    gestionesLibres: Math.max(2 * baseGestiones, MINIMO_LIBRES.gestiones),
    itemsLibres: Math.max(2 * baseItems, MINIMO_LIBRES.items),
    documentosLibres: Math.max(2 * baseGestiones, MINIMO_LIBRES.documentos),
  };
};

// Filas de cada catálogo: lo que trae más margen, con un mínimo pensado para
// la plantilla (se pegan desde las exportaciones de la app; el Maestro de
// Códigos tiene ~3.000 referencias).
export const MINIMO_CATALOGOS = Object.freeze({ referencias: 6000, empresas: 300, centros: 100, recargos: 50 });
export const dimensionarCatalogos = (cantidades) => Object.fromEntries(
  Object.entries(MINIMO_CATALOGOS).map(([k, minimo]) => [k, Math.max(minimo, Math.ceil((cantidades[k] || 0) * 1.5))]),
);

// Plantilla vacía: filas preparadas fijas (no hay volumen real que medir).
export const TAMANO_PLANTILLA = Object.freeze({ gestionesLibres: 1000, itemsLibres: 4000, documentosLibres: 1000 });
export const ARCHIVO_PLANTILLA = 'respaldo_implantes_PLANTILLA.xlsx';
export const ARCHIVO_PLANTILLA_MACROS = 'respaldo_implantes_PLANTILLA.xlsm';

// Plantilla sin datos del sistema. `catalogos` (opcional): lo leído de los
// archivos exportados desde la app ({ codigos, empresas, centros, recargos }
// con sus registros), `origen` (archivo, fecha y conteos de cada uno, para
// Instrucciones) y `fecha` (Date de los catálogos).
export const datosPlantilla = (generadoEl, { catalogos = {}, origen = {}, fecha = null } = {}) => ({
  plantilla: true,
  generadoEl,
  filasGestiones: [],
  filasItems: [],
  ultimaLinea: 0,
  catalogo: {
    filas: catalogos.codigos || [],
    referenciasUnicas: [],
    resumen: { usables: (catalogos.codigos || []).length, inactivas: 0, fibras: 0, referenciasRepetidas: 0, clavesRepetidas: 0 },
  },
  empresas: catalogos.empresas || [],
  centros: catalogos.centros || [],
  recargos: catalogos.recargos || [],
  origenCatalogos: origen,
  fechaCatalogos: fecha,
  tamano: { ...TAMANO_PLANTILLA },
});

export const nombreArchivo = (fechaISO) => `${PREFIJO_ARCHIVO}${fechaISO}.xlsx`;

const PATRON_COPIA = /^respaldo_implantes_\d{4}-\d{2}-\d{2}\.xlsx$/;

// Copias a borrar: deja las `conservar` más recientes (por la fecha del
// nombre). Solo toca archivos con el formato exacto del respaldo.
export const copiasABorrar = (nombres, conservar = COPIAS_A_CONSERVAR) => (nombres || [])
  .filter((n) => PATRON_COPIA.test(n))
  .sort()
  .reverse()
  .slice(conservar);
