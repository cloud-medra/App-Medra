// Portal Proveedores → Órdenes de Compra: lógica pura de la pantalla.
import { where } from 'firebase/firestore';
import { filtroEmpresa } from '../../../../utils/empresaUsuario';
import { esExterno } from '../../../../../functions/permisos/nucleo.mjs';

export const TAMANO_PAGINA = 50;
// Tope por período: si se alcanza, la pantalla lo avisa.
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

// Condiciones de la consulta. La de empresa es lo que permite la lectura de un externo:
// sin ella, Firestore rechaza la consulta completa. Un externo siempre consulta la suya.
export const restriccionesConsulta = (userData, { anio, mes, empresaId = '' }) => [
  ...(!esExterno(userData) && empresaId === SIN_EMPRESA
    ? [where('empresaId', '==', null)]
    : filtroEmpresa(userData, { empresaId })),
  where('anio', '==', String(anio)),
  where('mes', '==', String(mes)),
];

const aFecha = (v) => (v?.toDate ? v.toDate() : v ? new Date(v) : null);

export const formatearFecha = (v) => {
  const f = aFecha(v);
  if (!f || Number.isNaN(f.getTime())) return '-';
  return `${String(f.getDate()).padStart(2, '0')}-${String(f.getMonth() + 1).padStart(2, '0')}-${f.getFullYear()}`;
};

// Más recientes primero, y por OC dentro del mismo día. Se ordena aquí para que la
// consulta no necesite un índice compuesto.
export const ordenarOrdenes = (filas) => [...filas].sort((a, b) =>
  (aFecha(b.fecha_cx)?.getTime() || 0) - (aFecha(a.fecha_cx)?.getTime() || 0)
  || String(a.oc ?? '').localeCompare(String(b.oc ?? ''))
  || String(a.codigo ?? '').localeCompare(String(b.codigo ?? '')));

const CAMPOS_BUSQUEDA = ['oc', 'codigo', 'descripcion', 'numero_guia', 'numero_factura', 'estado', 'proveedor'];

export const filtrarOrdenes = (filas, texto) => {
  const t = String(texto ?? '').trim().toLowerCase();
  if (!t) return filas;
  return filas.filter((f) => CAMPOS_BUSQUEDA.some((c) => String(f[c] ?? '').toLowerCase().includes(t)));
};
