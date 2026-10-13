import { useState, useMemo } from 'react';
import { useResumenImputadas, TODOS_LOS_MESES } from '../useResumenImputadas';
import { moduloGestion } from '../modulosGestion';

export const NOMBRES_MESES = {
  "01": "Enero", "02": "Febrero", "03": "Marzo", "04": "Abril",
  "05": "Mayo", "06": "Junio", "07": "Julio", "08": "Agosto",
  "09": "Septiembre", "10": "Octubre", "11": "Noviembre", "12": "Diciembre"
};

export const ESTADO_CARGA_OPTIONS = ['PENDIENTE', 'CARGADO', 'REVISAR', 'S/COTIZACION'];
export { TODOS_LOS_MESES };

// Resumen de imputadas de un módulo de Gestión (Implantes, Hemodinamia).
export const useResumenGestionesData = (modulo) => {
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
  } = useResumenImputadas(moduloGestion(modulo).coleccionImputadas);
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstadoCarga, setFiltroEstadoCarga] = useState('');

  const documentosFiltrados = useMemo(() => {
    let lista = documentos;

    if (filtroEstadoCarga) {
      lista = lista.filter(d => (d.estadoCarga || 'PENDIENTE') === filtroEstadoCarga);
    }

    if (busqueda.trim()) {
      const term = busqueda.trim().toLowerCase();
      lista = lista.filter(d =>
        String(d.gestionId || '').toLowerCase().includes(term) ||
        String(d.paciente || '').toLowerCase().includes(term) ||
        String(d.medico || '').toLowerCase().includes(term) ||
        String(d.empresa || '').toLowerCase().includes(term) ||
        String(d.codigo || '').toLowerCase().includes(term) ||
        String(d.referencia || '').toLowerCase().includes(term)
      );
    }

    return [...lista].sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || '')));
  }, [documentos, busqueda, filtroEstadoCarga]);

  const totales = useMemo(() => {
    const totalMonto = documentosFiltrados.reduce((acc, d) => acc + (Number(d.total) || 0), 0);
    const totalCantidad = documentosFiltrados.reduce((acc, d) => acc + (Number(d.cantidad) || 0), 0);
    return { totalMonto, totalCantidad, totalRegistros: documentosFiltrados.length };
  }, [documentosFiltrados]);

  return {
    anio, setAnio,
    mes, setMes,
    busqueda, setBusqueda,
    filtroEstadoCarga, setFiltroEstadoCarga,
    aniosDisponibles,
    mesesDelAnioActual,
    documentosFiltrados,
    totales,
    cargando,
    actualizar
  };
};