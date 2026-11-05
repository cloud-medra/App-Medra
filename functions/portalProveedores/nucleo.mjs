// Portal Proveedores → Órdenes de Compra: copia de los Detalles OC que puede leer
// un proveedor. Las reglas no ocultan campos de un documento, y las filas originales
// (documentos_sistema/…/detalles) traen paciente y médico; por eso el portal lee otra
// colección, con SOLO los campos de esta lista blanca. Lo usan la app (importar y
// eliminar Detalles OC, la pantalla) y scripts/sincronizarPortalOC.js. Sin dependencias.

export const COL_PORTAL_OC = 'portal_ordenes_compra';
export const MODULO_PORTAL = 'portalProveedores';
export const RUTA_ORDENES_COMPRA = '/portalProveedores/ordenesCompra';

// Lo que ve el proveedor de cada fila. Nunca paciente, médico ni admisión; los montos
// (precio_u, oc_monto) quedaron fuera por decisión del usuario. Agregar un campo aquí
// lo expone a todos los proveedores.
export const CAMPOS_PORTAL_OC = Object.freeze([
  'oc', 'codigo', 'descripcion', 'cantidad', 'estado', 'numero_guia', 'numero_factura', 'fecha_cx',
]);

// Nombre del proveedor para compararlo con el Maestro: sin tildes, mayúsculas ni signos.
export const normalizarNombreEmpresa = (nombre) => String(nombre ?? '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();

// El Detalle OC no trae RUT: la relación con el Maestro de Empresas es por nombre, y
// solo cuando es exacta (normalizada). Un nombre repetido en el Maestro no se resuelve:
// mostrarle datos a la empresa equivocada es peor que dejar la fila sin empresa.
export const crearIndiceEmpresas = (empresas) => {
  const indice = new Map();
  (empresas || []).forEach((e) => {
    const n = normalizarNombreEmpresa(e.nombre);
    if (n) indice.set(n, indice.has(n) ? null : e.id);
  });
  return indice;
};
export const empresaIdDeProveedor = (indice, proveedor) => indice.get(normalizarNombreEmpresa(proveedor)) ?? null;

// Documento del portal. `empresaId` null: sin empresa reconocida, ningún externo lo ve.
export const proyeccionPortalOC = ({ datos, proveedor, empresaId, anio, mes }) => ({
  ...Object.fromEntries(CAMPOS_PORTAL_OC.map((c) => [c, datos?.[c] ?? null])),
  proveedor: proveedor ?? null,
  empresaId: empresaId ?? null,
  anio: String(anio),
  mes: String(mes),
});

// ¿Este cambio de una fila se ve en el portal? (si no, no hace falta escribir la copia).
export const cambioVisibleEnPortal = (cambios) => CAMPOS_PORTAL_OC.some((c) => c in (cambios || {}));

// ID de la copia: hash del ID de la fila, porque ese ID contiene admisión y fecha
// (114584_20260915_medtronic_510012_1) y un proveedor no debe verlas. Determinístico:
// importar, eliminar y el script llegan al mismo documento.
export const idPortalOC = async (idFila) => {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(idFila)));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
};
export const idsPortalOC = async (idsFila) => {
  const lista = [...new Set(idsFila)];
  const ids = await Promise.all(lista.map(idPortalOC));
  return new Map(lista.map((id, i) => [id, ids[i]]));
};
