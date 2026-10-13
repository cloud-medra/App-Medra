// Arma las hojas del Excel de "Exportar y Marcar como Solicitado" de
// Cargas Consolidado → Solicitudes. Funciones puras (sin XLSX ni
// Firestore) para poder testear el contenido de cada hoja.
//
// Hojas por origen: mismas columnas y nombres que el Excel nativo de cada
// módulo (shared/solicitud/useSolicitudGestionesData para Implantes y
// Hemodinamia; useSolicitudConsignacionData), para que el archivo del
// Consolidado sea
// intercambiable con el de cada pantalla nativa.
// "Detalle Unificado" y "Resumen": las 3 fuentes juntas en una sola tabla,
// con una columna Origen y nombres de columna comunes.

import { ORIGEN, ORIGEN_LABEL } from './normalizarFila';

export const formatearFechaExcel = (fechaString) => {
  if (!fechaString || !fechaString.includes('-')) return fechaString || '';
  const [yyyy, mm, dd] = fechaString.split('-');
  return `${dd}-${mm}-${yyyy}`;
};

// `fila.fechaRegistro` es un Timestamp de Firestore (no un string
// "YYYY-MM-DD"), igual que en las 3 pantallas nativas — mismo formateador
// que ellas usan para su columna "Fecha (de) Registro".
export const formatearFechaDeTimestamp = (valor) => {
  if (!valor) return '';
  const date = valor.toDate ? valor.toDate() : new Date(valor);
  if (isNaN(date.getTime())) return '';
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
};

// Valores de detalle comunes a las 3 hojas por origen y a la unificada;
// cada hoja solo decide el nombre de la columna.
const valoresDetalle = (fila, fechaIngreso) => ({
  id: fila.gestionId,
  paciente: fila.paciente,
  medico: fila.medico,
  fecha: formatearFechaExcel(fila.fecha),
  empresa: fila.empresa,
  codigo: fila.codigo || '',
  descripcion: fila.descripcionExport ?? '',
  cantidad: fila.cantidad ?? '',
  precio: fila.precio ?? '',
  atributo: fila.atributoExport ?? '',
  fechaRegistro: formatearFechaDeTimestamp(fila.fechaRegistro),
  fechaCarga: formatearFechaExcel(fila.fechaCarga),
  numDocumento: fila.numGuia || '',
  fechaIngreso,
  lote: fila.lote || '',
  // Consignación exporta el vencimiento tal cual (puede ser "PAD",
  // "Sin fecha", "N/A"), Implantes/Hemodinamia lo formatean — igual que
  // sus Excel nativos.
  vencimiento: fila.origen === ORIGEN.CONSIGNACION
    ? (fila.vencimiento || '')
    : (fila.vencimiento ? formatearFechaExcel(fila.vencimiento) : '')
});

const hojaDetalleCotizacion = (v) => ({
  'ID': v.id,
  'PACIENTE': v.paciente,
  'MEDICO': v.medico,
  'FECHA': v.fecha,
  'EMPRESA': v.empresa,
  'CODIGO': v.codigo,
  'DESCRIPCION': v.descripcion,
  'CANTIDAD': v.cantidad,
  'PRECIO': v.precio,
  'ATRIBUTO': v.atributo,
  'FECHA REGISTRO': v.fechaRegistro,
  'FECHA CARGA': v.fechaCarga,
  'N° COTIZACION': v.numDocumento,
  'FECHA INGRESO': v.fechaIngreso,
  'LOTE': v.lote,
  'VENCIMIENTO': v.vencimiento
});

const hojaDetalleConsignacion = (v) => ({
  'ADMISION': v.id,
  'PACIENTE': v.paciente,
  'MEDICO': v.medico,
  'FECHA': v.fecha,
  'EMPRESA': v.empresa,
  'CODIGO': v.codigo,
  'DESCRIPCION': v.descripcion,
  'CANTIDAD': v.cantidad,
  'PRECIO': v.precio,
  'ATRIBUTO': v.atributo,
  'FECHA DE REGISTRO': v.fechaRegistro,
  'FECHA DE CARGA': v.fechaCarga,
  'N GUIA': v.numDocumento,
  'FECHA DE INGRESO': v.fechaIngreso,
  'LOTE': v.lote,
  'VENCIMIENTO': v.vencimiento
});

// "N° COTIZACIÓN" en la hoja unificada = N° de cotización para
// Implantes/Hemodinamia y N° de guía para Consignación (mismo campo
// `numGuia` ya unificado en normalizarFila.js).
const hojaDetalleUnificado = (fila, v) => ({
  'ORIGEN': ORIGEN_LABEL[fila.origen],
  'ID': v.id,
  'PACIENTE': v.paciente,
  'MEDICO': v.medico,
  'FECHA': v.fecha,
  'EMPRESA': v.empresa,
  'CODIGO': v.codigo,
  'DESCRIPCION': v.descripcion,
  'CANTIDAD': v.cantidad,
  'PRECIO': v.precio,
  'ATRIBUTO': v.atributo,
  'FECHA REGISTRO': v.fechaRegistro,
  'FECHA CARGA': v.fechaCarga,
  'N° COTIZACIÓN': v.numDocumento,
  'FECHA INGRESO': v.fechaIngreso,
  'LOTE': v.lote,
  'VENCIMIENTO': v.vencimiento
});

const filaResumen = (fila, fechaIngreso) => ({
  'Origen': ORIGEN_LABEL[fila.origen],
  'Ingreso': fechaIngreso,
  'Área': fila.area ?? '',
  'Previsión': fila.prevision ?? '',
  'Id': fila.gestionId,
  'Cód': fila.codigo || '',
  'Cant': fila.cantidad ?? '',
  'Venta': fila.ventaExport ?? '',
  'Médico': fila.medico,
  'Fecha': formatearFechaExcel(fila.fecha),
  'Descripción': fila.descripcionExport ?? '',
  'Estado': fila.estadoExport ?? ''
});

const HOJAS_POR_ORIGEN = [
  { origen: ORIGEN.IMPLANTES, nombre: 'Solicitud Implantes', mapear: hojaDetalleCotizacion },
  { origen: ORIGEN.CONSIGNACION, nombre: 'Solicitud Consignación', mapear: hojaDetalleConsignacion },
  { origen: ORIGEN.HEMODINAMIA, nombre: 'Solicitud Hemodinamia', mapear: hojaDetalleCotizacion }
];

// Devuelve [{ nombre, filas }] en el orden en que deben ir al libro.
// Las hojas por origen se omiten si no hay filas de ese origen; "Detalle
// Unificado" y "Resumen" van siempre. El orden de filas en las hojas
// unificadas es Implantes → Consignación → Hemodinamia (el de siempre del
// Resumen), respetando el orden de selección dentro de cada origen.
export const construirHojasSolicitudUnificada = (filasSeleccionadas, fechaIngreso) => {
  const hojasOrigen = [];
  const detalleUnificado = [];
  const resumen = [];

  HOJAS_POR_ORIGEN.forEach(({ origen, nombre, mapear }) => {
    const filasOrigen = filasSeleccionadas.filter(f => f.origen === origen);
    const filasHoja = filasOrigen.map(fila => {
      const v = valoresDetalle(fila, fechaIngreso);
      detalleUnificado.push(hojaDetalleUnificado(fila, v));
      resumen.push(filaResumen(fila, fechaIngreso));
      return mapear(v);
    });
    if (filasHoja.length > 0) hojasOrigen.push({ nombre, filas: filasHoja });
  });

  return [
    ...hojasOrigen,
    { nombre: 'Detalle Unificado', filas: detalleUnificado },
    { nombre: 'Resumen', filas: resumen }
  ];
};
