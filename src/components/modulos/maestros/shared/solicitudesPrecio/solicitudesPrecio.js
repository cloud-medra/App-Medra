// Solicitud de precios a TI: referencias marcadas desde Cargas (Implantes,
// Hemodinamia y Consignación) cuya venta no coincide con la del sistema
// externo. Este sistema tiene el precio correcto; la lista se descarga en
// Excel desde Maestro Códigos → "Solicitud de precios a TI" para que TI
// actualice el otro sistema. Lógica pura (sin Firestore).
import { normalizarReferencia, buscarRangoRecargo, CODIGO_SIN_OC } from '../../../operaciones/implantes/gestionImplantes/components/Cargastab/cargasHelpers';
import { PORCENTAJE_RECARGO_HEMODINAMIA } from '../../../operaciones/hemodinamia/gestionHemodinamia/components/Cargastab/cargasHelpers';
import { buscarReglaRecargo } from '../../../operaciones/consignacion/utils/precioEspecial';

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

// Código del maestro: vacío si no tiene ("No lleva OC" y "0" no son códigos).
const codigoReal = (valor) => {
  const t = textoReal(valor);
  return t && t !== CODIGO_SIN_OC && t !== '0' ? t : '';
};

// Multiplicador con que la carga calculó la venta, tal cual (sin redondear).
const vecesCostoReal = (valor) => (Number(valor) > 0 ? Number(valor) : null);

// Costo y venta UNITARIOS (es el precio que TI actualiza). El costo va exacto,
// como en el maestro (puede tener decimales); la venta, redondeada a pesos.
// La venta de la fila trae el recargo por la cantidad, así que se divide por ella.
// Cómo calcula la venta cada módulo (veces costo = el multiplicador guardado):
// - Implantes: costo × veces costo (rango de Recargos; 1 si no cae en ninguno), sin redondeo.
// - Hemodinamia: costo / (1 − 27%) redondeado a pesos; veces costo = 1/0,73 = 1,369863…
// - Consignación: costo × veces costo (rango de Recargos), redondeado a pesos.
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
  codigo: codigoReal(it.codigo),
  descripcion: textoReal(it.descriptorAuto) || textoReal(it.detalle),
  costo: Number(it.precio) || 0,
  vecesCosto: vecesCostoReal(it.vecesCosto),
  venta: ventaUnitaria(it.venta, it.cantidad)
});

export const puedeSolicitarPrecioConsignacion = (it) =>
  !!textoReal(it?.referencia) && Number(it.costo) > 0;

// `venta` y `vecesCosto`: los guardados en el ítem (venta, recargoVecesCosto)
// o, si aún no están, los calculados en pantalla con la misma regla.
export const solicitudDesdeItemConsignacion = (it, venta, vecesCosto) => ({
  referencia: String(it.referencia).trim(),
  codigo: codigoReal(it.codigo),
  descripcion: textoReal(it.descripcion),
  costo: Number(it.costo) || 0,
  vecesCosto: vecesCostoReal(vecesCosto),
  venta: ventaUnitaria(venta, it.cantidad)
});

export const cambioPrecio = (anterior, nueva) =>
  Number(anterior?.costo) !== nueva.costo || Number(anterior?.venta) !== nueva.venta;

// Con decimales si los tiene (el costo del maestro puede tenerlos).
const pesos = (n) => `$${(Number(n) || 0).toLocaleString('es-CL', { maximumFractionDigits: 2 })}`;

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

// Veces costo con hasta 4 decimales (Hemodinamia: 1,3699; el resto tal cual: 1,3 · 3).
export const formatearVecesCosto = (valor) =>
  (Number(valor) > 0 ? Number(valor).toLocaleString('es-CL', { maximumFractionDigits: 4 }) : '');

// --- Referencias guardadas antes de que se registraran código y veces costo ---
// Se completan al mostrar la pestaña y al generar el Excel, sin escribir en la base.

// Código del catálogo de Maestro Códigos para una referencia: solo registros
// activos con código real; con dos códigos activos distintos, vacío (no se adivina).
export const codigoDelCatalogo = (catalogo, referencia) => {
  const ref = normalizarReferencia(referencia);
  if (!ref) return '';
  const codigos = new Set((catalogo || [])
    .filter((c) => normalizarReferencia(c.referencia) === ref && String(c.estado || 'ACTIVO').toUpperCase() !== 'INACTIVO')
    .map((c) => codigoReal(c.codigo))
    .filter(Boolean));
  return codigos.size === 1 ? [...codigos][0] : '';
};

// Módulo cuya regla aplica: el último donde se marcó o, en las antiguas, el
// único de la lista (con varios y sin `ultimoModulo` no se sabe cuál).
const moduloDeLaRegla = (registro) =>
  registro.ultimoModulo || (registro.modulos?.length === 1 ? registro.modulos[0] : null);

// Veces costo con la misma regla que usa la carga de ese módulo (no venta ÷ costo).
// `recargos`: catálogo maestros_recargos.
export const vecesCostoSegunModulo = (modulo, costo, recargos) => {
  const precio = Number(costo) || 0;
  if (!(precio > 0)) return null;
  if (modulo === MODULO_SOLICITUD.hemodinamia) return 1 / (1 - PORCENTAJE_RECARGO_HEMODINAMIA);
  if (modulo === MODULO_SOLICITUD.implantes) {
    // Implantes: solo rangos ACTIVO; sin rango, 1 (como en Cargas).
    const rango = buscarRangoRecargo(precio, (recargos || []).filter((r) => r.estado === 'ACTIVO'));
    return rango ? Number(rango.vecesCosto) : 1;
  }
  if (modulo === MODULO_SOLICITUD.consignacion) {
    const regla = buscarReglaRecargo(recargos, precio);
    return regla ? Number(regla.vecesCosto) : null;
  }
  return null;
};

// Lo guardado manda; solo se completa lo que falta.
export const completarSolicitud = (registro, { catalogo, recargos }) => ({
  ...registro,
  codigo: codigoReal(registro.codigo) || codigoDelCatalogo(catalogo, registro.referencia),
  vecesCosto: vecesCostoReal(registro.vecesCosto) ?? vecesCostoSegunModulo(moduloDeLaRegla(registro), registro.costo, recargos)
});

export const COLUMNAS_EXCEL = ['Código', 'Referencia', 'Descripción', 'Módulo', 'Costo', 'Veces costo', 'Venta', 'Fecha agregada'];

export const filasExcelSolicitudes = (registros) => registros.map((r) => ({
  'Código': r.codigo || '',
  Referencia: r.referencia || '',
  'Descripción': r.descripcion || '',
  'Módulo': textoModulos(r.modulos),
  Costo: Number(r.costo) || 0,
  'Veces costo': Number(r.vecesCosto) > 0 ? Number(r.vecesCosto) : '',
  Venta: Number(r.venta) || 0,
  'Fecha agregada': formatearFechaSolicitud(r.agregadoEl)
}));

// Más recientes primero.
export const ordenarSolicitudes = (registros) =>
  [...registros].sort((a, b) => (aFecha(b.agregadoEl)?.getTime() || 0) - (aFecha(a.agregadoEl)?.getTime() || 0));

// Marca de versión de un documento: al eliminar tras descargar, solo se
// borra si nadie lo volvió a marcar entre medio (ver eliminarDescargadas).
export const versionSolicitud = (registro) => aFecha(registro?.actualizadoEl)?.getTime() ?? null;
