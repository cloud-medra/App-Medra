// Portal Proveedores → Órdenes de Compra: lógica pura de la pantalla.
import { where } from 'firebase/firestore';
import { filtroEmpresa } from '../../../../utils/empresaUsuario';
import { formatearPesos } from '../../../../utils/formatearMoneda';
import { crearIndiceEmpresas, empresaIdDeProveedor } from '../../../../../functions/portalProveedores/nucleo.mjs';

export const TAMANO_PAGINA = 50;
// Tope por período de la copia: si se alcanza, la pantalla lo avisa.
export const LIMITE_FILAS = 3000;
// Filtro de un interno: filas cuyo proveedor no se reconoció en el Maestro.
export const SIN_EMPRESA = '__sin_empresa__';
const PRIMER_ANIO = 2026;

// Un externo no puede leer los marcadores de años y meses de Detalles OC: las opciones
// no salen de la base. Un mes sin datos simplemente muestra la tabla vacía.
export const aniosDisponibles = (hoy = new Date()) => {
  const actual = Number(hoy.toLocaleDateString('en-CA', { timeZone: 'America/Santiago' }).slice(0, 4));
  const anios = [];
  for (let a = Math.max(actual, PRIMER_ANIO); a >= PRIMER_ANIO; a -= 1) anios.push(String(a));
  return anios;
};
export const MESES = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));

// Consulta de un externo. La condición de empresa es lo que permite la lectura: sin
// ella, Firestore rechaza la consulta completa.
export const restriccionesExterno = (userData, { anio, mes }) => [
  ...filtroEmpresa(userData),
  where('anio', '==', String(anio)),
  where('mes', '==', String(mes)),
];

// Fila original → lo que usa la vista interna. La empresa se calcula con la misma función
// que escribe la copia, y lo demás de la fila (médico, admisión, lote…) no se conserva.
export const filaInterna = (id, datos, indiceEmpresas) => ({
  id,
  paciente: datos.paciente ?? null,
  fecha_cx: datos.fecha_cx ?? null,
  proveedor: datos.proveedor ?? null,
  empresaId: empresaIdDeProveedor(indiceEmpresas, datos.proveedor),
  oc: datos.oc ?? null,
  codigo: datos.codigo ?? null,
  descripcion: datos.descripcion ?? null,
  cantidad: datos.cantidad ?? null,
  precio_u: datos.precio_u ?? null,
  oc_monto: datos.oc_monto ?? null,
  estado: datos.estado ?? null,
  numero_guia: datos.numero_guia ?? null,
  numero_factura: datos.numero_factura ?? null,
});
export { crearIndiceEmpresas };

// Filtro de empresa de un interno: sobre el mes ya leído, sin otra consulta.
export const filtrarPorEmpresa = (filas, empresaId) => {
  if (!empresaId) return filas;
  if (empresaId === SIN_EMPRESA) return filas.filter((f) => !f.empresaId);
  return filas.filter((f) => f.empresaId === empresaId);
};

const aFecha = (v) => (v?.toDate ? v.toDate() : v ? new Date(v) : null);

export const formatearFecha = (v) => {
  const f = aFecha(v);
  if (!f || Number.isNaN(f.getTime())) return '-';
  return `${String(f.getDate()).padStart(2, '0')}-${String(f.getMonth() + 1).padStart(2, '0')}-${f.getFullYear()}`;
};

// Un 0 guardado puede ser una celda vacía del Excel: "$0" parecería un precio real.
export const formatearMontoOGuion = (v) => (Number(v) ? `$${formatearPesos(Number(v))}` : '-');

// Más recientes primero, y por OC dentro del mismo día. Se ordena aquí para que la
// consulta no necesite un índice compuesto.
export const ordenarOrdenes = (filas) => [...filas].sort((a, b) =>
  (aFecha(b.fecha_cx)?.getTime() || 0) - (aFecha(a.fecha_cx)?.getTime() || 0)
  || String(a.oc ?? '').localeCompare(String(b.oc ?? ''))
  || String(a.codigo ?? '').localeCompare(String(b.codigo ?? '')));

export const CAMPOS_BUSQUEDA_EXTERNO = ['oc', 'codigo', 'descripcion', 'numero_guia', 'numero_factura', 'estado'];
export const CAMPOS_BUSQUEDA_INTERNO = [...CAMPOS_BUSQUEDA_EXTERNO, 'proveedor', 'paciente'];

export const filtrarOrdenes = (filas, texto, campos = CAMPOS_BUSQUEDA_EXTERNO) => {
  const t = String(texto ?? '').trim().toLowerCase();
  if (!t) return filas;
  return filas.filter((f) => campos.some((c) => String(f[c] ?? '').toLowerCase().includes(t)));
};
