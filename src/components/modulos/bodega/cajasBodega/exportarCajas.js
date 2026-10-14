// Exportaciones de Cajas (Excel y PDF imprimible) con las utilidades
// compartidas de Bodega. El PDF lleva el nombre de la caja como título y la
// fecha (del inventario / reposición, y la de generación).
import { exportarExcel, exportarPdf } from '../shared/exportar';
import { fechaHora } from '../shared/transito/transitos';
import { productosDeCaja, textoLotes } from './cajas';

const PRODUCTO = [
  { titulo: 'Código', valor: (l) => l.codigoMaestro || '—' },
  { titulo: 'Producto', valor: (l) => l.nombre },
];

export const COLUMNAS_CONTENIDO = [
  ...PRODUCTO,
  { titulo: 'Stock objetivo', valor: (p) => p.stockObjetivo },
  { titulo: 'Stock actual', valor: (p) => p.stockActual },
  { titulo: 'Faltante', valor: (p) => p.faltante },
];

export const COLUMNAS_CONSUMO = [
  ...PRODUCTO,
  { titulo: 'Actual previo', valor: (l) => l.actualPrevio },
  { titulo: 'Contado', valor: (l) => l.contado },
  { titulo: 'Consumo (actual − contado)', valor: (l) => l.consumo },
];

export const COLUMNAS_FALTANTE = [
  ...PRODUCTO,
  { titulo: 'Objetivo', valor: (l) => l.objetivo },
  { titulo: 'Contado', valor: (l) => l.contado },
  { titulo: 'Faltante (objetivo − contado)', valor: (l) => l.faltante },
];

export const COLUMNAS_REPOSICION = [
  ...PRODUCTO,
  { titulo: 'Faltante antes', valor: (l) => l.faltanteAntes },
  { titulo: 'Repuesto', valor: (l) => l.cantidad },
  { titulo: 'Pendiente', valor: (l) => l.pendiente },
  { titulo: 'Lotes (vencimiento) × cantidad', valor: (l) => textoLotes(l.lotes) },
];

const quien = (registro) => [fechaHora(registro.fecha) || fechaHora(new Date()), registro.usuario?.nombre].filter(Boolean).join(' · ');

export const exportarContenidoCaja = (caja, formato) => {
  const filas = productosDeCaja(caja);
  const base = `caja_${caja.nombre}`;
  if (formato === 'excel') return exportarExcel(base, [{ nombre: 'Contenido', columnas: COLUMNAS_CONTENIDO, filas }]);
  return exportarPdf(base, {
    titulo: caja.nombre,
    subtitulo: `Contenido de la caja · ${filas.length} producto(s) · ${caja.completitud ?? 0} % completa · ${caja.totalFaltante || 0} u. faltantes`,
    columnas: COLUMNAS_CONTENIDO, filas,
  });
};

// inventario: { fecha, usuario, lineas } (guardado o recién hecho).
export const exportarInventarioCaja = (caja, inventario, formato) => {
  const lineas = inventario.lineas || [];
  const conFaltante = lineas.filter((l) => l.faltante > 0);
  const base = `inventario_caja_${caja.nombre}`;
  if (formato === 'excel') {
    return exportarExcel(base, [
      { nombre: 'Consumo vs actual', columnas: COLUMNAS_CONSUMO, filas: lineas },
      { nombre: 'Faltante vs objetivo', columnas: COLUMNAS_FALTANTE, filas: conFaltante },
    ]);
  }
  return exportarPdf(base, {
    titulo: caja.nombre,
    subtitulo: `Inventario · ${quien(inventario)}`,
    secciones: [
      { titulo: '1. Consumo / diferencia vs. stock actual', columnas: COLUMNAS_CONSUMO, filas: lineas },
      { titulo: '2. Faltante vs. stock objetivo', columnas: COLUMNAS_FALTANTE, filas: conFaltante },
    ],
  });
};

// reposicion: { fecha, usuario, lineas, totalRepuesto, totalPendiente }.
export const exportarReposicionCaja = (caja, reposicion, formato) => {
  const lineas = reposicion.lineas || [];
  const base = `reposicion_caja_${caja.nombre}`;
  if (formato === 'excel') return exportarExcel(base, [{ nombre: 'Reposición', columnas: COLUMNAS_REPOSICION, filas: lineas }]);
  return exportarPdf(base, {
    titulo: caja.nombre,
    subtitulo: `Reposición · ${quien(reposicion)} · repuesto ${reposicion.totalRepuesto || 0} u. · pendiente ${reposicion.totalPendiente || 0} u.`,
    columnas: COLUMNAS_REPOSICION, filas: lineas,
  });
};
