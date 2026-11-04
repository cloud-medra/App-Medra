// Solicitud de precios a TI: referencias marcadas desde Cargas (Implantes,
// Hemodinamia y Consignación) cuya venta no coincide con la del sistema
// externo. Este sistema tiene el precio correcto; la lista se descarga en
// Excel desde Maestro Códigos → "Solicitud de precios a TI" para que TI
// actualice el otro sistema. Lógica pura (sin Firestore).
import { normalizarReferencia } from '../../../operaciones/implantes/gestionImplantes/components/Cargastab/cargasHelpers';

export const COL_SOLICITUDES_PRECIO = 'maestros_solicitudes_precio';

export const MODULO_SOLICITUD = {
  implantes: 'Implantes',
  hemodinamia: 'Hemodinamia',
  consignacion: 'Consignación'
};

// Un documento por referencia: el ID es la referencia normalizada (sin
// espacios al inicio/final ni mayúsculas, igual que la validación de
// duplicados de Cargas), así marcarla de nuevo, desde otra carga u otro
// módulo, cae en el mismo documento. Codificada para que una "/" no arme
// una ruta; el prefijo evita IDs reservados ("." o "__x__").
export const idSolicitudPrecio = (referencia) => {
  const ref = normalizarReferencia(referencia);
  return ref ? `ref_${encodeURIComponent(ref)}` : '';
};

// "P" es el relleno de Cargas para un dato que no vino del maestro.
const textoReal = (valor) => {
  const t = String(valor ?? '').trim();
  return t && t !== 'P' ? t : '';
};

// Costo y venta UNITARIOS (es el precio que TI actualiza). La venta de la
// fila ya trae el recargo (rango de Recargos o el 27% de Hemodinamia) por
// la cantidad, así que se divide por ella.
const ventaUnitaria = (venta, cantidad) => {
  const v = Number(venta) || 0;
  const c = Number(cantidad) || 0;
  return Math.round(c > 0 ? v / c : v);
};

// Implantes y Hemodinamia (misma forma de ítem). Sin el contenido de un PAD,
// el detalle de lotes ni SIN CARGO: no tienen precio propio.
export const puedeSolicitarPrecioCargas = (it) =>
  !!textoReal(it?.referencia) && !it.padPadreId && !it.lotePadreId
  && it.estadoCarga !== 'SIN CARGO' && Number(it.precio) > 0;

export const solicitudDesdeItemCargas = (it) => ({
  referencia: String(it.referencia).trim(),
  descripcion: textoReal(it.descriptorAuto) || textoReal(it.detalle),
  costo: Math.round(Number(it.precio) || 0),
  venta: ventaUnitaria(it.venta, it.cantidad)
});

export const puedeSolicitarPrecioConsignacion = (it) =>
  !!textoReal(it?.referencia) && Number(it.costo) > 0;

// `venta`: la guardada en el ítem o, si aún no está, la calculada en pantalla.
export const solicitudDesdeItemConsignacion = (it, venta) => ({
  referencia: String(it.referencia).trim(),
  descripcion: textoReal(it.descripcion),
  costo: Math.round(Number(it.costo) || 0),
  venta: ventaUnitaria(venta, it.cantidad)
});

export const cambioPrecio = (anterior, nueva) =>
  Number(anterior?.costo) !== nueva.costo || Number(anterior?.venta) !== nueva.venta;

const pesos = (n) => `$${Math.round(Number(n) || 0).toLocaleString('es-CL')}`;

// Aviso al marcar. Si la referencia ya estaba con otro precio, se dice
// cuál cambió para que no pase inadvertido.
export const mensajeSolicitudAgregada = ({ precioAnterior, nueva }) => {
  const base = 'Se ha añadido a la solicitud de actualización de precios';
  if (!precioAnterior) return { mensaje: base, tipo: 'success' };
  const partes = [];
  if (Number(precioAnterior.costo) !== nueva.costo) partes.push(`costo ${pesos(precioAnterior.costo)} → ${pesos(nueva.costo)}`);
  if (Number(precioAnterior.venta) !== nueva.venta) partes.push(`venta ${pesos(precioAnterior.venta)} → ${pesos(nueva.venta)}`);
  return { mensaje: `${base}. Ya estaba con otro precio y se actualizó: ${partes.join(', ')}.`, tipo: 'warning' };
};

export const textoModulos = (modulos) => (Array.isArray(modulos) ? modulos.join(', ') : '');

const aFecha = (valor) => (valor?.toDate ? valor.toDate() : valor ? new Date(valor) : null);

export const formatearFechaSolicitud = (valor) => {
  const fecha = aFecha(valor);
  if (!fecha || Number.isNaN(fecha.getTime())) return '';
  return fecha.toLocaleString('es-CL', {
    timeZone: 'America/Santiago', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
};

export const COLUMNAS_EXCEL = ['Referencia', 'Descripción', 'Módulo', 'Costo', 'Venta', 'Fecha agregada'];

export const filasExcelSolicitudes = (registros) => registros.map((r) => ({
  Referencia: r.referencia || '',
  'Descripción': r.descripcion || '',
  'Módulo': textoModulos(r.modulos),
  Costo: Number(r.costo) || 0,
  Venta: Number(r.venta) || 0,
  'Fecha agregada': formatearFechaSolicitud(r.agregadoEl)
}));

// Más recientes primero.
export const ordenarSolicitudes = (registros) =>
  [...registros].sort((a, b) => (aFecha(b.agregadoEl)?.getTime() || 0) - (aFecha(a.agregadoEl)?.getTime() || 0));

// Marca de versión de un documento: al eliminar tras descargar, solo se
// borra si nadie lo volvió a marcar entre medio (ver eliminarDescargadas).
export const versionSolicitud = (registro) => aFecha(registro?.actualizadoEl)?.getTime() ?? null;
