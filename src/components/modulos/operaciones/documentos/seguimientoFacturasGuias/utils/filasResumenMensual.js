// Filas de la tabla de Resumen Mensual: una por mes (enero a diciembre,
// aunque el mes no tenga datos) + la fila de totales del año. Los
// porcentajes del total se calculan sobre el total anual, no promediando
// los meses; con total 0 el porcentaje es null ("—" en pantalla).
import { MESES } from '../../resumenFacturacion/resumenFacturacionService';
import { nombreDeMes } from '../../../../../../utils/ordenarMeses';

const numero = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

const fila = (etiqueta, { total, facturado, cantidad = 0, cantidadPendiente = 0 }) => {
  const pendiente = total - facturado;
  return {
    etiqueta, total, facturado, pendiente, cantidad, cantidadPendiente,
    pctFacturado: total ? (facturado / total) * 100 : null,
    pctPendiente: total ? (pendiente / total) * 100 : null
  };
};

export const filasResumenMensual = (meses = {}) => {
  const filas = MESES.map((mm) => {
    const m = meses[mm] || {};
    return { mes: mm, ...fila(nombreDeMes(mm), {
      total: numero(m.total), facturado: numero(m.facturado),
      cantidad: numero(m.cantidad), cantidadPendiente: numero(m.cantidadPendiente)
    }) };
  });
  const suma = (campo) => filas.reduce((s, f) => s + f[campo], 0);
  const totales = fila('Total año', {
    total: suma('total'), facturado: suma('facturado'),
    cantidad: suma('cantidad'), cantidadPendiente: suma('cantidadPendiente')
  });
  return { filas, totales };
};

// "50 %", "33,3 %" o "—".
export const formatearPorcentaje = (valor) => (valor === null
  ? '—'
  : `${valor.toLocaleString('es-CL', { maximumFractionDigits: 1 })} %`);
