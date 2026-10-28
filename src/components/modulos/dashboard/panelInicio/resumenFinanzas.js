// Inicio → Resumen de Finanzas: cuatro totales del mes en curso, con el
// MISMO cálculo que Finanzas (totalesFinanzas.js + useTotalesFinanzasData,
// que comparten el caché de Control Mensual). No hay consultas propias:
//   - Consumo = total de Finanzas → Consumos.
//   - Laboratorio y Vacunatorio = su línea del desglose de Finanzas → Facturas.
//   - Valorización de bodega = total de Finanzas → Valorización de bodega.
// Cada total lo ve quien ve esa pantalla en el menú (subItemsVisibles, con
// Gestión de módulos). Laboratorio y Vacunatorio por separado son el
// desglose de Facturas, así que además piden su sección `desglose`: sin
// ella la pantalla de Facturas tampoco los muestra separados.
import { subItemsVisibles } from '../../../../config/accesoMenu';
import { TOTALES_FINANZAS, modulosDeTotal, totalizar } from '../../administracion/totalesFinanzas/totalesFinanzas';

export const TOTALES_INICIO = Object.freeze([
  { id: 'consumo', etiqueta: 'Consumo', tipo: 'consumos', moduloIds: modulosDeTotal('consumos') },
  { id: 'laboratorio', etiqueta: 'Laboratorio', tipo: 'facturas', moduloIds: ['laboratorio'], requiereDesglose: true },
  { id: 'vacunatorio', etiqueta: 'Vacunatorio', tipo: 'facturas', moduloIds: ['vacunatorio'], requiereDesglose: true },
  { id: 'bodega', etiqueta: 'Valorización de bodega', tipo: 'bodega', moduloIds: modulosDeTotal('bodega') },
]);

// Totales que puede ver el usuario. `hasPermission(ruta, seccion)` es el de
// useGranularPermission.
export const totalesVisibles = (userData, modulosActivos, hasPermission) => {
  const rutas = new Set(subItemsVisibles(userData, 'administracion', modulosActivos).map((s) => s.path));
  return TOTALES_INICIO.filter((t) => {
    const ruta = TOTALES_FINANZAS[t.tipo].ruta;
    return rutas.has(ruta) && (!t.requiereDesglose || hasPermission(ruta, 'desglose'));
  });
};

// Módulos a pedir (sin repetir) para los totales visibles.
export const modulosDeTotales = (totales) => [...new Set(totales.flatMap((t) => t.moduloIds))];

// Valor de un total a partir de las celdas de useTotalesFinanzasData:
//   - 'cargando'.
//   - 'noDisponible': falló la lectura de los estados o de alguna celda del
//     total. Nunca se muestra $0 en ese caso.
//   - 'sinAbrir': el mes no se abrió (Finanzas muestra $0 y lo avisa).
//   - 'ok' con `monto`, el mismo número de la pantalla de Finanzas.
export const valorDeTotal = (total, { celdas, cargando, errorEstados }) => {
  if (errorEstados) return { estado: 'noDisponible' };
  if (cargando) return { estado: 'cargando' };
  const propias = celdas.filter((c) => total.moduloIds.includes(c.modulo));
  if (propias.some((c) => c.error)) return { estado: 'noDisponible' };
  if (propias.length === 0) return { estado: 'sinAbrir', monto: 0 };
  return { estado: 'ok', monto: totalizar(total.moduloIds, propias).montoTotal };
};
