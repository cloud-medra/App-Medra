// Finanzas → Consumos, Facturas y Valorización de bodega: el total de un
// mes (o del año, en Consumos y Facturas) con las MISMAS fuentes que Control
// Mensual y Período actual, sin colecciones ni consultas nuevas:
//   - Consumos = imputado de Implantes, Consignación y Hemodinamia.
//   - Facturas = imputado de Laboratorio y Vacunatorio (factura electrónica).
//   - Valorización de bodega = saldo valorizado de Bodega al cierre del mes
//     (en vivo si el mes sigue abierto).
// Los módulos de cada uno son los grupos de controlMensual/constants.js, y
// cada celda (módulo, mes) sale de resumenImputacionesStore.obtenerCelda.
import { GRUPOS, MESES, MODULOS } from '../controlMensual/constants';
import { fechaISOEnChile } from '../../operaciones/shared/gestion/rangoFechaGestiones';

export const TODO_EL_ANIO = 'todo';

export const TOTALES_FINANZAS = Object.freeze({
  consumos: {
    ruta: '/administracion/consumos',
    titulo: 'Consumos',
    grupoId: 'consumos',
    permiteAnio: true,
    fuente: 'Monto imputado en el período (lo que consumió el cliente).',
  },
  facturas: {
    ruta: '/administracion/facturas',
    titulo: 'Facturas',
    grupoId: 'facturacion',
    permiteAnio: true,
    fuente: 'Monto imputado desde las facturas electrónicas recibidas (lo que pagamos).',
  },
  bodega: {
    ruta: '/administracion/valorizacionBodega',
    titulo: 'Valorización de bodega',
    grupoId: 'inventario',
    permiteAnio: false,
    fuente: 'Bodega General + tránsito, a costo promedio ponderado. Mes cerrado: saldo final; abierto: saldo actual.',
  },
});

export const modulosDeTotal = (tipo) => GRUPOS.find((g) => g.id === TOTALES_FINANZAS[tipo].grupoId).moduloIds;

// Mes actual en hora de Chile: { anio: '2026', mesId: 'octubre' }.
export const mesActualEnChile = (fecha = new Date()) => {
  const iso = fechaISOEnChile(fecha);
  return { anio: iso.slice(0, 4), mesId: MESES[Number(iso.slice(5, 7)) - 1].id };
};

// Años del selector: del actual hacia atrás.
export const aniosSeleccionables = (anioActual, cuantos = 5) =>
  Array.from({ length: cuantos }, (_, i) => String(Number(anioActual) - i));

// Celdas (módulo, mes) que hay que pedir. Un mes sin documento en
// cierres_periodos nunca se abrió: vale 0 y no se lee (igual que en Control
// Mensual), así que se deja fuera y se cuenta aparte.
export const celdasAConsultar = (moduloIds, estadosModulos, mes) => {
  const meses = mes === TODO_EL_ANIO ? MESES.map((m) => m.id) : [mes];
  return moduloIds.flatMap((modulo) => meses
    .map((mesId) => ({ modulo, mes: mesId, estado: estadosModulos?.[modulo]?.[mesId]?.estado || null }))
    .filter((c) => c.estado));
};

// [{ modulo, cantidad, montoTotal, error? }] -> total y desglose por módulo
// (en el orden de moduloIds, con 0 los que no tienen celdas).
export const totalizar = (moduloIds, resultados) => {
  const porModulo = moduloIds.map((moduloId) => {
    const delModulo = resultados.filter((r) => r.modulo === moduloId);
    return {
      moduloId,
      nombre: MODULOS.find((m) => m.id === moduloId)?.nombre || moduloId,
      cantidad: delModulo.reduce((s, r) => s + (Number(r.cantidad) || 0), 0),
      montoTotal: delModulo.reduce((s, r) => s + (Number(r.montoTotal) || 0), 0),
      meses: delModulo.length,
      conError: delModulo.some((r) => r.error),
    };
  });
  return {
    montoTotal: porModulo.reduce((s, m) => s + m.montoTotal, 0),
    cantidad: porModulo.reduce((s, m) => s + m.cantidad, 0),
    porModulo,
    conError: porModulo.some((m) => m.conError),
  };
};

export const pesos = (n) => `$${Math.round(Number(n) || 0).toLocaleString('es-CL')}`;
