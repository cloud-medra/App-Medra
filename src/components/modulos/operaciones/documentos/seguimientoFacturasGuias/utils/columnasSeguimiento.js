// Columnas de Seguimiento de Facturas/Guías: las usa la tabla, la búsqueda
// (useSeguimientoFiltros) y la exportación a Excel, así las tres muestran
// exactamente lo mismo. Anchos en px, redimensionables (useColumnResize los
// recuerda por usuario en este navegador).
//
// Los campos son los que escribe Importar Detalles OC
// (parsearFilaDetalleOC.js): oc_monto y precio_u como número, atributo y
// lote como texto, fecha_vencimiento como fecha (Timestamp).
import { formatearPesos } from '../../../../../../utils/formatearMoneda';
import { numeroFlexible } from '../../importarDetallesOC/utils/parsearFilaDetalleOC';

// Monto como número: tolera vacío, null, NaN y texto ("$ 1.234.567",
// "1.234,5"). null si no hay un número.
export const montoNumerico = (valor) => {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null;
  return numeroFlexible(valor);
};

// "$ 1.234.567" ('-' si no hay monto).
export const formatearMonedaCLP = (valor) => {
  const n = montoNumerico(valor);
  return n === null ? '-' : `$ ${formatearPesos(n)}`;
};

// dd-mm-aaaa ('-' si no hay fecha). Acepta Timestamp, Date o texto.
export const formatearFechaCelda = (valor) => {
  if (!valor) return '-';
  const fecha = valor.toDate ? valor.toDate() : new Date(valor);
  if (isNaN(fecha.getTime())) return '-';
  const dd = String(fecha.getDate()).padStart(2, '0');
  const mm = String(fecha.getMonth() + 1).padStart(2, '0');
  return `${dd}-${mm}-${fecha.getFullYear()}`;
};

const MONTO = 'text-right font-num';

// `tipo: 'moneda'` se exporta como número con formato $ (sumable en Excel).
export const COLUMNAS = [
  { key: 'id', label: 'ID', ancho: 90, min: 60, td: 'font-num text-slate-600 dark:text-gray-400', valor: (i) => i.id },
  { key: 'admision', label: 'Admisión', ancho: 80, min: 60, td: 'font-semibold text-[#2383C2]', valor: (i) => i.admision },
  { key: 'paciente', label: 'Paciente', ancho: 160, min: 60, valor: (i) => i.paciente || '-' },
  { key: 'medico', label: 'Médico', ancho: 140, min: 60, valor: (i) => i.medico || '-' },
  { key: 'fecha_cx', label: 'Fecha Cx', ancho: 85, min: 60, valor: (i) => formatearFechaCelda(i.fecha_cx) },
  { key: 'proveedor', label: 'Empresa', ancho: 160, min: 60, valor: (i) => i.proveedor || '-' },
  { key: 'codigo', label: 'Código', ancho: 85, min: 60, td: 'font-num text-emerald-600 dark:text-emerald-400', valor: (i) => i.codigo || '-' },
  { key: 'descripcion', label: 'Descripción', ancho: 200, min: 60, valor: (i) => i.descripcion || '-' },
  { key: 'atributo', label: 'Atributo', ancho: 110, min: 60, valor: (i) => i.atributo || '-' },
  { key: 'lote', label: 'Lote', ancho: 90, min: 60, td: 'font-num', valor: (i) => i.lote || '-' },
  { key: 'fecha_vencimiento', label: 'Vencimiento', ancho: 90, min: 60, valor: (i) => formatearFechaCelda(i.fecha_vencimiento) },
  { key: 'cantidad', label: 'Cant.', ancho: 60, min: 60, th: 'text-center', td: 'text-center', valor: (i) => i.cantidad ?? '-' },
  { key: 'precio_u', label: 'Precio U.', ancho: 100, min: 60, th: 'text-right', td: MONTO, tipo: 'moneda', valor: (i) => formatearMonedaCLP(i.precio_u) },
  { key: 'oc', label: 'OC', ancho: 95, min: 60, valor: (i) => i.oc || '-' },
  { key: 'oc_monto', label: 'Monto OC', ancho: 110, min: 60, th: 'text-right', td: MONTO, tipo: 'moneda', valor: (i) => formatearMonedaCLP(i.oc_monto) },
  { key: 'numero_guia', label: 'N° Guía', ancho: 90, min: 60, valor: (i) => i.numero_guia || '-' },
  { key: 'numero_factura', label: 'N° Factura', ancho: 90, min: 60, valor: (i) => i.numero_factura || '-' }
];
