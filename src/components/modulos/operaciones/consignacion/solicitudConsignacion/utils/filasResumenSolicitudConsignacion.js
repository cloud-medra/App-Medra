// Filas de la hoja "Resumen" del Excel de Solicitud de Consignación, mismo
// criterio que la de Solicitud Implantes (shared/solicitud/useSolicitudGestionesData.js):
// una fila por ítem, con las columnas Ingreso/Area/Previsión/Id/Cód/Cant/
// Venta/Médico/Fecha/Descripción/Estado. A diferencia de Implantes, en
// Consignación no existe un estado de carga por ítem: como el export solo
// toma documentos con estado=='CARGADO', ese es el valor fijo para todas las
// filas principales.
//
// Las filas de desglose de guía ("No lleva OC", esFilaGuia) no tienen
// documento propio: llevan la previsión de su fila principal (vacía si la
// principal no tiene) y Estado "PAD".

const formatearFechaDDMMYYYY = (fechaString) => {
  if (!fechaString || !fechaString.includes('-')) return fechaString || '';
  const [yyyy, mm, dd] = fechaString.split('-');
  return `${dd}-${mm}-${yyyy}`;
};

export const ESTADO_FILA_GUIA = 'PAD';

// En la lista de candidatos (cargarCandidatosSolicitudConsignacion) las
// filas de guía van justo después de su fila principal. Se recorre la lista
// completa, no solo lo seleccionado, para que una fila de guía encuentre su
// principal aunque esta no se haya marcado.
const previsionPrincipalPorFilaGuia = (todosLosItems) => {
  const mapa = new Map();
  let previsionPrincipal = '';
  todosLosItems.forEach(it => {
    if (it.esFilaGuia) {
      mapa.set(it.id, previsionPrincipal);
    } else {
      previsionPrincipal = it.datosOriginales?.prevision || '';
    }
  });
  return mapa;
};

export const construirFilasResumenSolicitudConsignacion = (itemsSeleccionados, todosLosItems, fechaIngreso) => {
  const previsionGuia = previsionPrincipalPorFilaGuia(todosLosItems);

  return itemsSeleccionados.map(it => ({
    'Ingreso': fechaIngreso,
    'Area': 'PABELLON',
    'Previsión': it.esFilaGuia
      ? (previsionGuia.get(it.id) ?? '')
      : (it.datosOriginales?.prevision || 'P'),
    'Id': it.gestionId,
    'Cód': it.codigo,
    'Cant': it.cantidad,
    'Venta': it.ventaUnitaria,
    'Médico': it.medico,
    'Fecha': formatearFechaDDMMYYYY(it.fecha),
    'Descripción': it.descripcion,
    'Estado': it.esFilaGuia ? ESTADO_FILA_GUIA : 'CARGADO'
  }));
};
