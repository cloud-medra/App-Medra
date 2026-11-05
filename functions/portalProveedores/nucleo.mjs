// Portal Proveedores → Órdenes de Compra: copia de los Detalles OC que puede leer
// un proveedor. Las reglas no ocultan campos de un documento, y las filas originales
// (documentos_sistema/…/detalles) traen médico y admisión; por eso el portal lee otra
// colección, con SOLO los campos de esta lista blanca. Lo usan la app (importar y
// eliminar Detalles OC, la pantalla) y scripts/sincronizarPortalOC.js. Sin dependencias.

export const COL_PORTAL_OC = 'portal_ordenes_compra';
export const MODULO_PORTAL = 'portalProveedores';
export const RUTA_ORDENES_COMPRA = '/portalProveedores/ordenesCompra';

// Lo que ve el proveedor de cada fila de SU empresa. Nunca médico, admisión ni RUT. El
// nombre del paciente y los montos van por decisión del usuario: el proveedor ya los
// recibe con cada orden, porque los necesita para facturar. Agregar un campo aquí lo
// expone a todos los proveedores.
export const CAMPOS_PORTAL_OC = Object.freeze([
  'paciente', 'oc', 'codigo', 'descripcion', 'cantidad', 'precio_u', 'oc_monto', 'estado', 'numero_guia', 'numero_factura', 'fecha_cx',
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

// Opciones de scripts/sincronizarPortalOC.js. El alcance es obligatorio: comparar todo
// cuesta unas 31.000 lecturas y no debe pasar por olvidar una opción.
export const alcanceDeArgumentos = (argv) => {
  const meses = [];
  let todo = false;
  let aplicar = false;
  let estimar = false;
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--todo') todo = true;
    else if (a === '--aplicar') aplicar = true;
    else if (a === '--estimar') estimar = true;
    else if (a === '--mes' || a.startsWith('--mes=')) {
      const valor = a === '--mes' ? argv[(i += 1)] : a.slice('--mes='.length);
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(valor || '')) return { error: `Mes inválido: ${valor ?? '(vacío)'}. Formato: --mes 2026-10` };
      meses.push(valor);
    } else return { error: `Opción desconocida: ${a}` };
  }
  if (todo && meses.length) return { error: 'Usa --mes o --todo, no ambos.' };
  if (!todo && !meses.length) return { error: 'Falta el alcance: indica --mes AAAA-MM (repetible) o --todo.' };
  if (aplicar && estimar) return { error: 'Usa --estimar o --aplicar, no ambos.' };
  return {
    todo, aplicar, estimar,
    meses: [...new Set(meses)].sort().map((m) => { const [anio, mes] = m.split('-'); return { anio, mes }; }),
  };
};

// ¿Este cambio de una fila se ve en el portal? (si no, no hace falta escribir la copia).
export const cambioVisibleEnPortal = (cambios) => CAMPOS_PORTAL_OC.some((c) => c in (cambios || {}));

// Campos que una copia puede tener (actualizadoEn es solo la fecha de escritura).
const CAMPOS_COPIA = [...CAMPOS_PORTAL_OC, 'proveedor', 'empresaId', 'anio', 'mes'];

// Valor comparable. Texto: sin espacios de más, porque al actualizar una fila la copia
// recibe el valor normalizado del snapshot. Vacío y null son lo mismo. Fechas por instante.
const comparable = (v) => {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v?.toMillis === 'function') return v.toMillis();
  if (typeof v?.toDate === 'function') return v.toDate().getTime();
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'string') return v.replace(/\s+/g, ' ').trim() || null;
  return v;
};

// ¿En qué se diferencia una copia guardada de la que debería ser? { desfasados: campos con
// otro valor, noAutorizados: campos que no deberían existir en la copia }.
export const diferenciasCopiaPortal = (esperada, guardada) => ({
  desfasados: CAMPOS_COPIA.filter((c) => comparable(esperada?.[c]) !== comparable(guardada?.[c])),
  noAutorizados: Object.keys(guardada || {}).filter((c) => !CAMPOS_COPIA.includes(c) && c !== 'actualizadoEn'),
});

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
