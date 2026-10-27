import * as XLSX from 'xlsx';

// =====================================================================
// Solicitudes de modificaciones (Implantes, Hemodinamia y Consignación;
// esta última traduce sus registros en consignacion/utils/
// modificacionesConsignacion.js). Lógica pura.
//
// Al descargar la Solicitud normal se guarda en el bloque una FOTO de lo
// solicitado (`itemsSolicitados`). Si después se edita un bloque SOLICITADO,
// al guardar se compara contra esa foto y se marca `modificacionPendiente`.
// "Solicitudes de modificaciones" descarga SOLO las filas que cambiaron
// (nunca el bloque completo), sin volver a imputar (la imputación ya se
// actualizó al guardar), y deja la foto igual a lo actual: así nada se
// cuenta dos veces.
//
// La comparación es siempre contra la ÚLTIMA foto descargada, así que
// varias ediciones antes de descargar dan el cambio NETO:
//   - editado dos veces          -> una fila MODIFICADO (original -> final)
//   - agregado y luego eliminado -> no aparece
//   - modificado y luego eliminado -> ELIMINADO (con los valores de la foto)
//   - vuelve a como estaba       -> sin cambios (se quita la marca)
// =====================================================================

export const MOVIMIENTOS = { AGREGADO: 'AGREGADO', MODIFICADO: 'MODIFICADO', ELIMINADO: 'ELIMINADO' };

// Campos de cada ítem que se guardan en la foto. Los que van al Excel de
// Solicitud; los demás (estado de carga, OC…) no son una modificación.
const CAMPOS_FOTO = ['id', 'codigo', 'referencia', 'descriptorAuto', 'cantidad', 'precio', 'venta', 'lote', 'vencimiento', 'tipoVinculado', 'numCotizacion'];
const NUMERICOS = new Set(['cantidad', 'precio', 'venta']);
// Campos cuya diferencia es una modificación.
export const CAMPOS_COMPARADOS = ['codigo', 'descriptorAuto', 'cantidad', 'precio', 'venta', 'lote', 'vencimiento', 'tipoVinculado'];

const normalizar = (campo, valor) => (NUMERICOS.has(campo) ? Number(valor) || 0 : String(valor ?? ''));

// Foto mínima de los ítems (lo que se guarda en el bloque).
export const fotoItems = (items) => (items || [])
  .filter((it) => it && it.id)
  .map((it) => Object.fromEntries(CAMPOS_FOTO.map((c) => [c, c === 'id' ? it.id : normalizar(c, it[c])])));

// Diferencias de los ítems actuales contra la foto, en el orden de la foto
// (y los agregados al final, en su orden).
// [{ movimiento, id, anterior | null, nuevo | null, campos: [campos cambiados] }]
export const diferenciasContraFoto = (foto, items) => {
  const antes = new Map((foto || []).map((it) => [it.id, it]));
  const actuales = fotoItems(items);
  const ahora = new Map(actuales.map((it) => [it.id, it]));
  const cambios = [];
  (foto || []).forEach((anterior) => {
    const nuevo = ahora.get(anterior.id);
    if (!nuevo) {
      cambios.push({ movimiento: MOVIMIENTOS.ELIMINADO, id: anterior.id, anterior, nuevo: null, campos: [] });
      return;
    }
    const campos = CAMPOS_COMPARADOS.filter((c) => normalizar(c, anterior[c]) !== normalizar(c, nuevo[c]));
    if (campos.length) cambios.push({ movimiento: MOVIMIENTOS.MODIFICADO, id: anterior.id, anterior, nuevo, campos });
  });
  actuales.forEach((nuevo) => {
    if (!antes.has(nuevo.id)) cambios.push({ movimiento: MOVIMIENTOS.AGREGADO, id: nuevo.id, anterior: null, nuevo, campos: [] });
  });
  return cambios;
};

export const hayModificacion = (foto, items) => diferenciasContraFoto(foto, items).length > 0;

// Campos a guardar en el bloque al guardar una edición de un bloque
// SOLICITADO. `itemsAntes`: los del documento antes de esta edición (base
// para bloques solicitados antes de existir la foto). 0 lecturas: el
// documento original ya está cargado.
export const camposModificacionAlGuardar = ({ fotoGuardada, itemsAntes, itemsDespues }) => {
  const foto = Array.isArray(fotoGuardada) ? fotoGuardada : fotoItems(itemsAntes);
  return { itemsSolicitados: foto, modificacionPendiente: hayModificacion(foto, itemsDespues) };
};

// ----------------------------- Excel ---------------------------------

const formatearFecha = (valor) => {
  if (!valor) return '';
  if (typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}/.test(valor)) {
    const [y, m, d] = valor.slice(0, 10).split('-');
    return `${d}-${m}-${y}`;
  }
  const date = valor.toDate ? valor.toDate() : new Date(valor);
  if (Number.isNaN(date.getTime())) return '';
  return `${String(date.getDate()).padStart(2, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${date.getFullYear()}`;
};

const capitalizar = (t) => (t ? t.charAt(0).toUpperCase() + t.slice(1).toLowerCase() : '');
export const textoPeriodoSolicitud = (bloque) => {
  if (bloque?.periodo) return bloque.periodo;
  return bloque?.periodoSolicitudMes ? `${capitalizar(bloque.periodoSolicitudMes)} ${bloque.periodoSolicitudAnio}` : '';
};

// Filas del Excel de modificaciones (solo lo que cambió). `bloques`: con
// sus datos de cabecera, su foto y sus ítems actuales. `columnaNumero`:
// encabezado de la última columna de datos (Consignación no tiene
// cotización: lleva el N° de guía).
export const construirFilasModificaciones = (bloques, fechaIngreso, { columnaNumero = 'N° COTIZACION' } = {}) => {
  const filas = [];
  bloques.forEach((b) => {
    diferenciasContraFoto(b.itemsSolicitados, b.items).forEach(({ movimiento, anterior, nuevo }) => {
      const a = anterior || {};
      const n = nuevo || {};
      const cantA = anterior ? a.cantidad : 0;
      const cantN = nuevo ? n.cantidad : 0;
      const ventaA = anterior ? a.venta : 0;
      const ventaN = nuevo ? n.venta : 0;
      const vigente = nuevo || anterior;
      filas.push({
        'MOVIMIENTO': movimiento,
        'ID': b.gestionId,
        'PACIENTE': b.nombre,
        'MEDICO': b.medico,
        'FECHA': formatearFecha(b.fecha),
        'EMPRESA': b.empresa,
        'FECHA SOLICITUD ORIGINAL': formatearFecha(b.fechaSolicitud),
        'PERIODO IMPUTACION': textoPeriodoSolicitud(b),
        'CODIGO ANTERIOR': anterior ? a.codigo : '',
        'CODIGO': nuevo ? n.codigo : '',
        'DESCRIPCION': vigente.descriptorAuto || '',
        'CANTIDAD ANTERIOR': anterior ? cantA : '',
        'CANTIDAD': nuevo ? cantN : '',
        'DIFERENCIA CANTIDAD': cantN - cantA,
        'PRECIO ANTERIOR': anterior ? a.precio : '',
        'PRECIO': nuevo ? n.precio : '',
        'VENTA ANTERIOR': anterior ? ventaA : '',
        'VENTA': nuevo ? ventaN : '',
        'DIFERENCIA VENTA': ventaN - ventaA,
        'LOTE ANTERIOR': anterior ? a.lote : '',
        'LOTE': nuevo ? n.lote : '',
        'VENCIMIENTO ANTERIOR': anterior ? formatearFecha(a.vencimiento) : '',
        'VENCIMIENTO': nuevo ? formatearFecha(n.vencimiento) : '',
        'ATRIBUTO': vigente.tipoVinculado || '',
        [columnaNumero]: vigente.numCotizacion || b.numCotizacion || '',
        'FECHA INGRESO': fechaIngreso,
      });
    });
  });
  return filas;
};

// Nombre del archivo: siempre empieza con MODIFICACIONES (y COPIA si es una
// nueva descarga desde el historial).
export const nombreArchivoModificaciones = (archivoSolicitud, fechaISO, { copia = false } = {}) =>
  `MODIFICACIONES${copia ? '_COPIA' : ''}_${archivoSolicitud}_${fechaISO}.xlsx`;

export const tituloModificaciones = (etiqueta, { copia = false } = {}) =>
  `${copia ? 'COPIA — ' : ''}MODIFICACIONES DE SOLICITUDES DE ${String(etiqueta).toUpperCase()}: este archivo contiene SOLO cambios sobre solicitudes ya enviadas. No reemplaza ni duplica la solicitud original.`;

// Libro con la hoja "Modificaciones": título, subtítulo, una fila vacía, la
// tabla y una fila de totales de las diferencias.
export const libroModificaciones = ({ filas, titulo, subtitulo }) => {
  const hoja = XLSX.utils.aoa_to_sheet([[titulo], [subtitulo], []]);
  XLSX.utils.sheet_add_json(hoja, filas, { origin: 'A4' });
  if (filas.length) {
    const totalCantidad = filas.reduce((s, f) => s + (Number(f['DIFERENCIA CANTIDAD']) || 0), 0);
    const totalVenta = filas.reduce((s, f) => s + (Number(f['DIFERENCIA VENTA']) || 0), 0);
    XLSX.utils.sheet_add_json(hoja, [{ 'MOVIMIENTO': 'TOTAL DIFERENCIAS', 'DIFERENCIA CANTIDAD': totalCantidad, 'DIFERENCIA VENTA': totalVenta }], {
      origin: -1, skipHeader: true, header: Object.keys(filas[0]),
    });
  }
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, 'Modificaciones');
  return libro;
};
