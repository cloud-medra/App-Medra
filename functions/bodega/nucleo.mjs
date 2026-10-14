// Bodega: reglas de negocio puras (sin Firebase). Las usan las Cloud
// Functions (functions/bodega/servicio.js, con require()) y la pantalla
// (validaciones y vistas previas), así ambos calculan exactamente lo mismo.
//
// Concepto de stock:
//   - La BODEGA GENERAL (implícita, no es un centro) es la única con
//     `disponible`.
//   - Lo egresado queda EN TRÁNSITO en un centro (maestros_centros): el
//     tránsito siempre pertenece a un `centroId`.
//   - El stock se lleva por producto + lote + vencimiento ("lote"); el
//     producto y el centro guardan totales denormalizados que se actualizan
//     en la misma transacción que el lote.

import { idVinculo } from './gs1.mjs';

export const MODULO = 'bodega';

export const RUTAS = Object.freeze({
  maestro: '/bodega/maestroBodega',
  catalogos: '/bodega/catalogosBodega',
});

// Acciones granulares: [modulo, ruta, seccion, accion] (puedeAccion).
// btn_inactivar y btn_desvincular son sensibles (ACCIONES_DENEGADAS_POR_DEFECTO
// en functions/permisos/nucleo.mjs).
export const ACCIONES = Object.freeze({
  crearProducto: [MODULO, RUTAS.maestro, 'productos', 'btn_crear'],
  editarProducto: [MODULO, RUTAS.maestro, 'productos', 'btn_editar'],
  inactivarProducto: [MODULO, RUTAS.maestro, 'productos', 'btn_inactivar'],
  vincularCodigo: [MODULO, RUTAS.maestro, 'codigos', 'btn_vincular'],
  desvincularCodigo: [MODULO, RUTAS.maestro, 'codigos', 'btn_desvincular'],
  guardarCatalogo: [MODULO, RUTAS.catalogos, 'catalogos', 'btn_guardar'],
});

export const COL = Object.freeze({
  productos: 'bodega_productos',
  codigosBarra: 'bodega_codigos_barra',
  catalogos: 'bodega_catalogos',
  unicos: 'bodega_unicos',
  control: 'bodega_control',
  lotes: 'bodega_lotes',
  movimientos: 'bodega_movimientos',
  documentos: 'bodega_documentos',
  salidas: 'bodega_salidas',
  transitos: 'bodega_transitos',
  transitoCentros: 'bodega_transito_centros',
  inventarios: 'bodega_inventarios',
});

export const TIPOS_CATALOGO = Object.freeze({
  CATEGORIA: { etiqueta: 'Categoría', plural: 'Categorías' },
  UNIDAD: { etiqueta: 'Unidad de medida', plural: 'Unidades de medida' },
});

export const TIPOS_MOVIMIENTO = Object.freeze({
  CARGA_INICIAL: { etiqueta: 'Carga inicial', disponible: 1, transito: 0 },
  INGRESO: { etiqueta: 'Ingreso', disponible: 1, transito: 0 },
  SALIDA_A_TRANSITO: { etiqueta: 'Salida a tránsito', disponible: -1, transito: 1, centro: true },
  ENTREGA: { etiqueta: 'Entrega', disponible: 0, transito: -1, centro: true },
  DEVOLUCION: { etiqueta: 'Devolución', disponible: 1, transito: -1, centro: true },
  AJUSTE_POSITIVO: { etiqueta: 'Ajuste positivo', disponible: 1, transito: 0 },
  AJUSTE_NEGATIVO: { etiqueta: 'Ajuste negativo', disponible: -1, transito: 0 },
});

export const MAX = Object.freeze({
  nombre: 150, codigoMaestro: 40, referencia: 80, ubicacion: 60, catalogo: 60, stockMinimo: 1e9,
});
export const PREFIJO_CODIGO_AUTOMATICO = 'BOD-';

// Texto para comparar (unicidad, búsqueda): sin espacios repetidos, en
// mayúsculas y sin tildes.
export const normalizarClave = (texto) => String(texto ?? '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .trim().replace(/\s+/g, ' ').toUpperCase();

const limpiar = (texto) => String(texto ?? '').trim().replace(/\s+/g, ' ');

// Correlativo -> código maestro automático (BOD-00001).
export const codigoAutomatico = (n) => `${PREFIJO_CODIGO_AUTOMATICO}${String(n).padStart(5, '0')}`;

// Ids de los candados de unicidad (bodega_unicos/{id}).
export const idUnico = Object.freeze({
  codigoMaestro: (codigo) => `codigo__${idVinculo(normalizarClave(codigo))}`,
  maestroClinico: (id) => `maestro__${idVinculo(id)}`,
  catalogo: (tipo, nombre) => `catalogo__${tipo}__${idVinculo(normalizarClave(nombre))}`,
});

// ---------------- Catálogos (categorías y unidades) ----------------

export const validarCatalogo = (datos) => {
  const errores = [];
  const tipo = String(datos?.tipo || '');
  const nombre = limpiar(datos?.nombre).toUpperCase();
  if (!TIPOS_CATALOGO[tipo]) errores.push('Tipo de catálogo inválido.');
  if (!nombre) errores.push('El nombre es obligatorio.');
  if (nombre.length > MAX.catalogo) errores.push(`El nombre no puede superar ${MAX.catalogo} caracteres.`);
  return { errores, catalogo: { tipo, nombre, activo: datos?.activo !== false } };
};

// ---------------- Productos ----------------

const PATRON_CODIGO_MAESTRO = /^[A-Z0-9][A-Z0-9._-]*$/;

// Datos del formulario -> { errores: [texto], producto } (normalizado). No
// valida que existan la categoría, la unidad ni el maestro clínico (eso lo
// hace la Cloud Function contra Firestore).
export const validarProducto = (datos) => {
  const errores = [];
  const nombre = limpiar(datos?.nombre);
  const codigoMaestro = normalizarClave(datos?.codigoMaestro).replace(/\s/g, '');
  const referencia = limpiar(datos?.referencia);
  const ubicacion = limpiar(datos?.ubicacion).toUpperCase();
  const unidadId = String(datos?.unidadId || '').trim();
  const categoriaId = String(datos?.categoriaId || '').trim();
  const maestroCodigoId = String(datos?.maestroCodigoId || '').trim();
  const minimoTexto = String(datos?.stockMinimo ?? '').trim();
  const stockMinimo = minimoTexto === '' ? null : Number(minimoTexto);

  if (!nombre) errores.push('El nombre es obligatorio.');
  if (nombre.length > MAX.nombre) errores.push(`El nombre no puede superar ${MAX.nombre} caracteres.`);
  if (codigoMaestro && !PATRON_CODIGO_MAESTRO.test(codigoMaestro)) errores.push('El código maestro solo admite letras, números, punto, guion y guion bajo.');
  if (codigoMaestro.length > MAX.codigoMaestro) errores.push(`El código maestro no puede superar ${MAX.codigoMaestro} caracteres.`);
  if (referencia.length > MAX.referencia) errores.push(`La referencia no puede superar ${MAX.referencia} caracteres.`);
  if (ubicacion.length > MAX.ubicacion) errores.push(`La ubicación no puede superar ${MAX.ubicacion} caracteres.`);
  if (!unidadId) errores.push('La unidad de medida es obligatoria.');
  if (stockMinimo !== null && (!Number.isInteger(stockMinimo) || stockMinimo < 0 || stockMinimo > MAX.stockMinimo)) {
    errores.push('El stock mínimo debe ser un número entero mayor o igual a cero.');
  }

  return {
    errores,
    producto: {
      nombre,
      codigoMaestro, // vacío = se genera uno automático al crear
      referencia,
      ubicacion,
      unidadId,
      categoriaId: categoriaId || null,
      manejaLote: datos?.manejaLote === true,
      manejaVencimiento: datos?.manejaVencimiento === true,
      stockMinimo,
      activo: datos?.activo !== false,
      maestroCodigoId: maestroCodigoId || null,
    },
  };
};

// Campos que no se pueden cambiar una vez que el producto tiene movimientos
// (cambiarían el significado de los lotes ya registrados).
export const CAMPOS_BLOQUEADOS_CON_MOVIMIENTOS = Object.freeze(['manejaLote', 'manejaVencimiento']);

// Texto en el que busca el listado (nombre, código maestro, referencia,
// ubicación, código del maestro clínico y códigos de barra).
export const textoBusquedaProducto = (p) => normalizarClave([
  p?.nombre, p?.codigoMaestro, p?.referencia, p?.ubicacion, p?.maestroCodigo?.codigo, ...(p?.codigosBarra || []),
].filter(Boolean).join(' '));

export const stockTotal = (p) => (Number(p?.disponible) || 0) + (Number(p?.transito) || 0);
export const bajoMinimo = (p) => p?.stockMinimo !== null && p?.stockMinimo !== undefined
  && (Number(p?.disponible) || 0) < Number(p.stockMinimo);

// ---------------- Lotes ----------------

export const SIN_LOTE = 'SL';
export const SIN_VENCIMIENTO = 'SV';
export const PATRON_FECHA = /^\d{4}-\d{2}-\d{2}$/;

export const normalizarLote = (lote) => normalizarClave(lote).replace(/\s/g, '');

// Producto + lote + vencimiento -> id del documento en bodega_lotes. Es
// determinista: el mismo lote siempre cae en el mismo documento.
export const idLote = (productoId, lote, vencimiento) => [
  productoId,
  idVinculo(normalizarLote(lote)) || SIN_LOTE,
  PATRON_FECHA.test(vencimiento || '') ? vencimiento : SIN_VENCIMIENTO,
].join('__');

// ---------------- Movimientos ----------------

export class ErrorStock extends Error {}

const entero = (n) => Number.isInteger(n) && n > 0;

// Saldo { disponible, transito, transitoPorCentro } + movimiento
// { tipo, cantidad, centroId } -> saldo nuevo. Sirve igual para el lote y
// para los totales del producto. No modifica el saldo recibido. Lanza
// ErrorStock si el movimiento es inválido o deja algo negativo.
export const aplicarMovimiento = (saldo, { tipo, cantidad, centroId } = {}) => {
  const def = TIPOS_MOVIMIENTO[tipo];
  if (!def) throw new ErrorStock(`Tipo de movimiento inválido: ${tipo}.`);
  if (!entero(cantidad)) throw new ErrorStock('La cantidad debe ser un número entero mayor a cero.');
  if (def.centro && !centroId) throw new ErrorStock('El movimiento requiere un centro.');

  const disponible = (Number(saldo?.disponible) || 0) + def.disponible * cantidad;
  const transito = (Number(saldo?.transito) || 0) + def.transito * cantidad;
  const transitoPorCentro = { ...(saldo?.transitoPorCentro || {}) };
  if (def.centro) {
    const enCentro = (Number(transitoPorCentro[centroId]) || 0) + def.transito * cantidad;
    if (enCentro < 0) throw new ErrorStock(`No hay suficiente en tránsito en ese centro (hay ${enCentro + cantidad}).`);
    if (enCentro === 0) delete transitoPorCentro[centroId];
    else transitoPorCentro[centroId] = enCentro;
  }
  if (disponible < 0) throw new ErrorStock(`Stock disponible insuficiente (hay ${disponible - def.disponible * cantidad}).`);
  if (transito < 0) throw new ErrorStock(`No hay suficiente en tránsito (hay ${transito - def.transito * cantidad}).`);
  return { disponible, transito, transitoPorCentro };
};

// Totales del tránsito de un centro (bodega_transito_centros/{centroId}):
// { unidades, productos: { [productoId]: cantidad }, productosDistintos }.
// Solo cambian con SALIDA_A_TRANSITO, ENTREGA y DEVOLUCION.
export const aplicarMovimientoCentro = (centro, { tipo, cantidad, productoId } = {}) => {
  const def = TIPOS_MOVIMIENTO[tipo];
  if (!def?.centro) throw new ErrorStock(`El movimiento ${tipo} no afecta el tránsito de un centro.`);
  if (!entero(cantidad)) throw new ErrorStock('La cantidad debe ser un número entero mayor a cero.');
  if (!productoId) throw new ErrorStock('Falta el producto.');
  const productos = { ...(centro?.productos || {}) };
  const enProducto = (Number(productos[productoId]) || 0) + def.transito * cantidad;
  const unidades = (Number(centro?.unidades) || 0) + def.transito * cantidad;
  if (enProducto < 0 || unidades < 0) throw new ErrorStock('No hay suficiente en tránsito en ese centro.');
  if (enProducto === 0) delete productos[productoId];
  else productos[productoId] = enProducto;
  return { unidades, productos, productosDistintos: Object.keys(productos).length };
};
