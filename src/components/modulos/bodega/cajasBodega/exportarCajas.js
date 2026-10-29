// Exportaciones de Cajas: Excel con las utilidades compartidas de Bodega y
// PDF con el diseño propio de Cajas (pdfCajas.js), que se abre en una
// pestaña nueva. El PDF lleva el nombre de la caja como título, la fecha
// (del inventario / reposición, y la de generación) y los productos en el
// orden de la caja.
import { exportarExcel } from '../shared/exportar';
import { fechaHora } from '../shared/transito/transitos';
import { productosDeCaja, textoLotes } from './cajas';
import { generarPdfCaja, enOrdenDeCaja } from './pdfCajas';
import { referenciaPorId } from '../shared/referencias';

// `numero` (a la derecha) y `ancho` (mm) solo los usa el PDF.
const PRODUCTO = [
  { titulo: 'Referencia', valor: (l) => referenciaPorId(l.productoId) || '—', ancho: 30 },
  { titulo: 'Producto', valor: (l) => l.nombre },
];

export const COLUMNAS_CONTENIDO = [
  ...PRODUCTO,
  { titulo: 'Stock objetivo', valor: (p) => p.stockObjetivo, numero: true, ancho: 24 },
  { titulo: 'Stock actual', valor: (p) => p.stockActual, numero: true, ancho: 24 },
  { titulo: 'Faltante', valor: (p) => p.faltante, numero: true, ancho: 22 },
];

export const COLUMNAS_CONSUMO = [
  ...PRODUCTO,
  { titulo: 'Actual previo', valor: (l) => l.actualPrevio, numero: true, ancho: 22 },
  { titulo: 'Contado', valor: (l) => l.contado, numero: true, ancho: 22 },
  { titulo: 'Consumo (actual − contado)', valor: (l) => l.consumo, numero: true, ancho: 30 },
];

export const COLUMNAS_FALTANTE = [
  ...PRODUCTO,
  { titulo: 'Objetivo', valor: (l) => l.objetivo, numero: true, ancho: 22 },
  { titulo: 'Contado', valor: (l) => l.contado, numero: true, ancho: 22 },
  { titulo: 'Faltante (objetivo − contado)', valor: (l) => l.faltante, numero: true, ancho: 30 },
];

export const COLUMNAS_REPOSICION = [
  ...PRODUCTO,
  { titulo: 'Faltante antes', valor: (l) => l.faltanteAntes, numero: true, ancho: 20 },
  { titulo: 'Repuesto', valor: (l) => l.cantidad, numero: true, ancho: 20 },
  { titulo: 'Pendiente', valor: (l) => l.pendiente, numero: true, ancho: 20 },
  { titulo: 'Lotes (vencimiento) × cantidad', valor: (l) => textoLotes(l.lotes), ancho: 46 },
];

const quien = (registro) => [fechaHora(registro.fecha) || fechaHora(new Date()), registro.usuario?.nombre].filter(Boolean).join(' · ');
const idsDeCaja = (caja) => productosDeCaja(caja).map((p) => p.productoId);
const conFaltante = (l) => l.faltante > 0;

export const exportarContenidoCaja = (caja, formato) => {
  const filas = productosDeCaja(caja);
  const base = `caja_${caja.nombre}`;
  if (formato === 'excel') return exportarExcel(base, [{ nombre: 'Contenido', columnas: COLUMNAS_CONTENIDO, filas }]);
  return generarPdfCaja(base, {
    tipo: 'Contenido de la caja',
    titulo: caja.nombre,
    detalle: caja.descripcion || '',
    generado: fechaHora(new Date()),
    resumen: [
      { etiqueta: 'Productos', valor: filas.length },
      { etiqueta: 'Completitud', valor: `${(caja.completitud ?? 0).toLocaleString('es-CL')} %`, alerta: (caja.completitud ?? 0) < 100 },
      { etiqueta: 'Unidades objetivo', valor: caja.totalObjetivo || 0 },
      { etiqueta: 'Unidades faltantes', valor: caja.totalFaltante || 0, alerta: caja.totalFaltante > 0 },
    ],
    secciones: [{ columnas: COLUMNAS_CONTENIDO, filas, resaltar: conFaltante, alerta: 'Faltante', vacio: 'La caja no tiene productos.' }],
  });
};

// inventario: { fecha, usuario, lineas, resumen } (guardado o recién hecho).
export const exportarInventarioCaja = (caja, inventario, formato) => {
  const lineas = inventario.lineas || [];
  const base = `inventario_caja_${caja.nombre}`;
  if (formato === 'excel') {
    return exportarExcel(base, [
      { nombre: 'Consumo vs actual', columnas: COLUMNAS_CONSUMO, filas: lineas },
      { nombre: 'Faltante vs objetivo', columnas: COLUMNAS_FALTANTE, filas: lineas.filter(conFaltante) },
    ]);
  }
  const ordenadas = enOrdenDeCaja(lineas, idsDeCaja(caja));
  const faltantes = ordenadas.filter(conFaltante);
  const unidadesFaltantes = faltantes.reduce((n, l) => n + l.faltante, 0);
  return generarPdfCaja(base, {
    tipo: 'Inventario de la caja',
    titulo: caja.nombre,
    detalle: `Inventario del ${quien(inventario)}`,
    generado: fechaHora(new Date()),
    resumen: [
      { etiqueta: 'Productos contados', valor: lineas.length },
      { etiqueta: 'Consumo', valor: lineas.reduce((n, l) => n + Math.max(0, l.consumo || 0), 0) },
      { etiqueta: 'Productos con faltante', valor: faltantes.length, alerta: faltantes.length > 0 },
      { etiqueta: 'Unidades faltantes', valor: unidadesFaltantes, alerta: unidadesFaltantes > 0 },
    ],
    secciones: [
      { titulo: '1. Consumo / diferencia vs. stock actual', columnas: COLUMNAS_CONSUMO, filas: ordenadas, resaltar: conFaltante },
      { titulo: '2. Faltante vs. stock objetivo', columnas: COLUMNAS_FALTANTE, filas: faltantes, resaltar: conFaltante, alerta: 'Faltante (objetivo − contado)', vacio: 'Ningún producto quedó con faltante.' },
    ],
  });
};

// reposicion: { fecha, usuario, lineas, totalRepuesto, totalPendiente }.
export const exportarReposicionCaja = (caja, reposicion, formato) => {
  const lineas = reposicion.lineas || [];
  const base = `reposicion_caja_${caja.nombre}`;
  if (formato === 'excel') return exportarExcel(base, [{ nombre: 'Reposición', columnas: COLUMNAS_REPOSICION, filas: lineas }]);
  return generarPdfCaja(base, {
    tipo: 'Reposición de la caja',
    titulo: caja.nombre,
    detalle: `Reposición del ${quien(reposicion)} · desde la Bodega General`,
    generado: fechaHora(new Date()),
    resumen: [
      { etiqueta: 'Productos', valor: lineas.length },
      { etiqueta: 'Unidades repuestas', valor: reposicion.totalRepuesto || 0 },
      { etiqueta: 'Unidades pendientes', valor: reposicion.totalPendiente || 0, alerta: reposicion.totalPendiente > 0 },
    ],
    secciones: [{ columnas: COLUMNAS_REPOSICION, filas: enOrdenDeCaja(lineas, idsDeCaja(caja)), resaltar: (l) => l.pendiente > 0, alerta: 'Pendiente', vacio: 'Sin productos.' }],
  });
};
