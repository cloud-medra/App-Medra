import { useState, useMemo } from 'react';
import { useResumenImputadas, TODOS_LOS_MESES } from '../../../shared/useResumenImputadas';
import { ordenarRegistrosCargas } from '../../cargasConsignacion/utils/ordenarRegistrosCargas';

export const NOMBRES_MESES = {
  "01": "Enero", "02": "Febrero", "03": "Marzo", "04": "Abril",
  "05": "Mayo", "06": "Junio", "07": "Julio", "08": "Agosto",
  "09": "Septiembre", "10": "Octubre", "11": "Noviembre", "12": "Diciembre"
};

export const ATRIBUTO_OPTIONS = ['CONSIGNACION', 'COTIZACION'];
export { TODOS_LOS_MESES };

// Filas "No lleva OC" guardadas al solicitar (filasGuia), por refPath del
// documento. Igual que en Solicitud, si varios ítems comparten delivery se
// muestran una sola vez, bajo el primero. No suman en los totales.
export const agruparFilasGuiaPorDocumento = (documentos) => {
  const mapa = new Map();
  const deliveriesVistos = new Set();
  documentos.forEach(d => {
    const filas = Array.isArray(d.filasGuia) ? d.filasGuia : [];
    const delivery = String(d.delivery || '').trim();
    if (filas.length === 0 || (delivery && deliveriesVistos.has(delivery))) return;
    if (delivery) deliveriesVistos.add(delivery);
    mapa.set(d.refPath, filas);
  });
  return mapa;
};

// Por fecha de cirugía (más nueva primero). Dentro del mismo día, el orden
// de Cargas (ordenarRegistrosCargas: por carga, cada admisión junta y en el
// orden de la carga masiva; la imputada copia fechaRegistro y posicionCarga
// del registro). El sort es estable, así que ese orden se conserva.
export const ordenarDocumentosResumen = (documentos) =>
  ordenarRegistrosCargas(documentos).sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || '')));

export const useResumenConsignacionData = () => {
  // Años/meses por sondeo y documentos con lectura única al elegir el mes
  // (antes: listener sobre todas las imputadas de todos los años).
  const {
    anio, setAnio,
    mes, setMes,
    aniosDisponibles,
    mesesDelAnioActual,
    documentos,
    cargando,
    actualizar
  } = useResumenImputadas('consignacion_imputadas');
  const [busqueda, setBusqueda] = useState('');
  const [filtroAtributo, setFiltroAtributo] = useState('');

  const documentosFiltrados = useMemo(() => {
    let lista = documentos;

    if (filtroAtributo) {
      lista = lista.filter(d => (d.atributo || '').toUpperCase() === filtroAtributo);
    }

    if (busqueda.trim()) {
      const term = busqueda.trim().toLowerCase();
      lista = lista.filter(d =>
        String(d.gestionId || '').toLowerCase().includes(term) ||
        String(d.nombre || '').toLowerCase().includes(term) ||
        String(d.medico || '').toLowerCase().includes(term) ||
        String(d.empresa || '').toLowerCase().includes(term) ||
        String(d.codigo || '').toLowerCase().includes(term) ||
        String(d.referencia || '').toLowerCase().includes(term)
      );
    }

    return ordenarDocumentosResumen(lista);
  }, [documentos, busqueda, filtroAtributo]);

  const filasGuiaPorDocumento = useMemo(
    () => agruparFilasGuiaPorDocumento(documentosFiltrados),
    [documentosFiltrados]
  );

  const totales = useMemo(() => {
    const totalVenta = documentosFiltrados.reduce((acc, d) => acc + (Number(d.venta) || 0), 0);
    const totalCantidad = documentosFiltrados.reduce((acc, d) => acc + (Number(d.cantidad) || 0), 0);
    return { totalVenta, totalCantidad, totalRegistros: documentosFiltrados.length };
  }, [documentosFiltrados]);

  return {
    anio, setAnio,
    mes, setMes,
    busqueda, setBusqueda,
    filtroAtributo, setFiltroAtributo,
    aniosDisponibles,
    mesesDelAnioActual,
    documentosFiltrados,
    filasGuiaPorDocumento,
    totales,
    cargando,
    actualizar
  };
};