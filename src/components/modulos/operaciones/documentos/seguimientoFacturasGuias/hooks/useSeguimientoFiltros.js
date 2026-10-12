// Filtro de empresa (opcional, cascada sobre `filas` ya acotadas por
// año/mes + el criterio de servidor elegido -estado "Pendiente factura" o
// numero_guia vacío/"0"-), búsqueda de texto y paginación de 50 — todo
// client-side, mismo criterio que useDetallesOCFiltros.js. Compartido por
// Facturas y Guías: el criterio de servidor ya viene resuelto en `filas`,
// acá solo queda filtrar por empresa/búsqueda, totalizar y paginar.
import { useEffect, useMemo, useState } from 'react';
import { normalizarTexto } from '../../../../../../utils/normalizarTexto';
import { COLUMNAS, montoNumerico } from '../utils/columnasSeguimiento';
import { calcularResumenMontoOC } from '../utils/resumenMontoOC';

export const TAMANO_PAGINA_SEGUIMIENTO = 50;

// Texto en que busca la caja de búsqueda: lo que muestra cada columna
// ("$ 1.234.567", "15-09-2026") más los montos sin formato ("1234567").
export const textoBusquedaFila = (fila) => normalizarTexto([
  ...COLUMNAS.map((c) => c.valor(fila)),
  montoNumerico(fila.oc_monto),
  montoNumerico(fila.precio_u)
].filter((v) => v !== null && v !== undefined && v !== '-').join(' | '));

export const useSeguimientoFiltros = (filas) => {
  const [empresa, setEmpresa] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [pagina, setPagina] = useState(1);

  const opcionesEmpresas = useMemo(() => {
    const set = new Set();
    filas.forEach((fila) => {
      const nombre = (fila.proveedor || '').trim();
      if (nombre) set.add(nombre);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [filas]);

  // Si la empresa elegida deja de existir en las opciones (cambió año/mes/
  // tipo de seguimiento y esa empresa ya no tiene filas en el nuevo
  // período), se deselecciona en vez de quedar "elegida" pero sin resultados.
  useEffect(() => {
    if (empresa && !opcionesEmpresas.includes(empresa)) setEmpresa('');
  }, [opcionesEmpresas, empresa]);

  // Índice de búsqueda: se arma una vez por carga, no en cada tecla.
  const textosBusqueda = useMemo(() => new Map(filas.map((fila) => [fila, textoBusquedaFila(fila)])), [filas]);

  const filasFiltradas = useMemo(() => {
    const texto = normalizarTexto(busqueda);
    if (!empresa && !texto) return filas;
    return filas.filter((fila) => (!empresa || (fila.proveedor || '').trim() === empresa)
      && (!texto || textosBusqueda.get(fila).includes(texto)));
  }, [filas, empresa, busqueda, textosBusqueda]);

  // Total de TODAS las filas filtradas (no solo la página visible).
  const resumen = useMemo(() => calcularResumenMontoOC(filasFiltradas), [filasFiltradas]);

  useEffect(() => {
    setPagina(1);
  }, [filas, empresa, busqueda]);

  const totalPaginas = Math.max(1, Math.ceil(filasFiltradas.length / TAMANO_PAGINA_SEGUIMIENTO));
  const paginaSegura = Math.min(pagina, totalPaginas);

  const filasPagina = useMemo(() => {
    const inicio = (paginaSegura - 1) * TAMANO_PAGINA_SEGUIMIENTO;
    return filasFiltradas.slice(inicio, inicio + TAMANO_PAGINA_SEGUIMIENTO);
  }, [filasFiltradas, paginaSegura]);

  return {
    empresa, setEmpresa, opcionesEmpresas,
    busqueda, setBusqueda,
    filasFiltradas, filasPagina, resumen,
    totalFilas: filasFiltradas.length,
    pagina: paginaSegura, setPagina, totalPaginas
  };
};
