// Bodega: reglas de negocio puras (sin Firebase). Las usan las Cloud
// Functions (functions/bodega/servicio.js, con require()) y la pantalla
// (validaciones y vistas previas), así ambos calculan exactamente lo mismo.
//
// Concepto de stock:
//   - La BODEGA GENERAL (implícita, no es un centro) es la única con
//     `disponible`.
//   - Lo egresado queda EN TRÁNSITO en un centro (maestros_centros): el
//     tránsito siempre pertenece a un `centroId`.
//   - El stock se lleva por producto + lote + vencimiento + dueño ("lote");
//     el producto y el centro guardan totales denormalizados que se
//     actualizan en la misma transacción que el lote.
//   - Dueño: propio (propietarioId null) o una empresa consignante
//     (maestros_empresas). El stock consignado entra por Ingreso ("en
//     consignación") o Carga inicial y se mueve igual que el propio.
//   - Desde el tránsito, lo no usado se puede DEJAR EN EL CENTRO (saldo
//     `enCentro`): sigue siendo stock, pero físicamente está en ese centro;
//     después se entrega (usado) o se devuelve a la Bodega General.

import { idVinculo } from './gs1.mjs';
import { admisionClaveDe } from '../descripcionesReporte/nucleo.mjs';

export const MODULO = 'bodega';

export const RUTAS = Object.freeze({
  maestro: '/bodega/maestroBodega',
  ingreso: '/bodega/ingresoBodega',
  cargaInicial: '/bodega/cargaInicialBodega',
  egreso: '/bodega/egresoBodega',
  transito: '/bodega/transitoBodega',
  centros: '/bodega/centrosBodega',
  inventario: '/bodega/inventarioBodega',
  catalogos: '/bodega/catalogosBodega',
  cajas: '/bodega/cajasBodega',
  consignaciones: '/bodega/consignacionesBodega',
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
  guardarBorradorIngreso: [MODULO, RUTAS.ingreso, 'documento', 'btn_guardar_borrador'],
  confirmarIngreso: [MODULO, RUTAS.ingreso, 'documento', 'btn_confirmar'],
  eliminarBorradorIngreso: [MODULO, RUTAS.ingreso, 'documento', 'btn_eliminar_borrador'],
  guardarBorradorCarga: [MODULO, RUTAS.cargaInicial, 'carga', 'btn_guardar_borrador'],
  // Sensibles (denegadas por defecto): confirmar la carga inicial y
  // cerrarla/reabrirla para todos.
  confirmarCarga: [MODULO, RUTAS.cargaInicial, 'carga', 'btn_confirmar'],
  cerrarCarga: [MODULO, RUTAS.cargaInicial, 'carga', 'btn_cerrar_carga'],
  eliminarBorradorCarga: [MODULO, RUTAS.cargaInicial, 'carga', 'btn_eliminar_borrador'],
  confirmarEgreso: [MODULO, RUTAS.egreso, 'egreso', 'btn_confirmar'],
  iniciarInventario: [MODULO, RUTAS.inventario, 'inventario', 'btn_iniciar'],
  contarInventario: [MODULO, RUTAS.inventario, 'inventario', 'btn_contar'],
  // Sensibles (denegadas por defecto): cerrar con ajuste y anular.
  cerrarInventario: [MODULO, RUTAS.inventario, 'inventario', 'btn_cerrar'],
  anularInventario: [MODULO, RUTAS.inventario, 'inventario', 'btn_anular'],
  guardarCaja: [MODULO, RUTAS.cajas, 'cajas', 'btn_guardar'],
  // Reordenar los productos de una caja es parte de editarla (mismo permiso).
  ordenarCaja: [MODULO, RUTAS.cajas, 'cajas', 'btn_guardar'],
  inventariarCaja: [MODULO, RUTAS.cajas, 'caja', 'btn_inventario'],
  reponerCaja: [MODULO, RUTAS.cajas, 'caja', 'btn_reponer'],
  guardarConsignacion: [MODULO, RUTAS.consignaciones, 'consignacion', 'btn_guardar'],
});

// Acciones sobre un tránsito: desde la vista Tránsito o desde Tránsito por
// centro (cada una con su propio permiso).
export const ACCIONES_TRANSITO = Object.freeze({
  ENTREGAR: 'btn_entregar',
  DEVOLVER: 'btn_devolver',
  NOTA: 'btn_nota',
  DEJAR_EN_CENTRO: 'btn_dejar_centro',
});
export const accionTransito = (origen, accion) => [MODULO, origen === 'centros' ? RUTAS.centros : RUTAS.transito, 'acciones', ACCIONES_TRANSITO[accion]];

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
  cajas: 'bodega_cajas',
  consignaciones: 'bodega_consignaciones',
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
  // Sale de la Bodega General hacia una caja (kit); no pasa por tránsito.
  REPOSICION_CAJA: { etiqueta: 'Reposición caja', disponible: -1, transito: 0 },
  // Lo no usado queda en el centro (sigue siendo stock) y desde ahí se
  // entrega o se devuelve.
  DEJADO_EN_CENTRO: { etiqueta: 'Dejado en centro', disponible: 0, transito: -1, enCentro: 1, centro: true },
  ENTREGA_DESDE_CENTRO: { etiqueta: 'Entrega desde centro', disponible: 0, transito: 0, enCentro: -1, centro: true },
  DEVOLUCION_DESDE_CENTRO: { etiqueta: 'Devolución desde centro', disponible: 1, transito: 0, enCentro: -1, centro: true },
});

// Movimientos que son consumo (lo usado): reportes de consumo por centro.
export const TIPOS_ENTREGA = Object.freeze(['ENTREGA', 'ENTREGA_DESDE_CENTRO']);

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
  caja: (nombre) => `caja__${idVinculo(normalizarClave(nombre))}`,
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

export const stockTotal = (p) => (Number(p?.disponible) || 0) + (Number(p?.transito) || 0) + (Number(p?.enCentro) || 0);
export const bajoMinimo = (p) => p?.stockMinimo !== null && p?.stockMinimo !== undefined
  && (Number(p?.disponible) || 0) < Number(p.stockMinimo);

// ---------------- Lotes ----------------

export const SIN_LOTE = 'SL';
export const SIN_VENCIMIENTO = 'SV';
export const PATRON_FECHA = /^\d{4}-\d{2}-\d{2}$/;

export const normalizarLote = (lote) => normalizarClave(lote).replace(/\s/g, '');

// Producto + lote + vencimiento (+ dueño) -> id del documento en
// bodega_lotes. Es determinista: el mismo lote siempre cae en el mismo
// documento. El stock propio conserva el id de siempre; el consignado lleva
// además `__C_<empresaId>`, así el mismo lote de dos dueños son dos saldos.
export const PREFIJO_PROPIETARIO = 'C_';
export const idLote = (productoId, lote, vencimiento, propietarioId = null) => [
  productoId,
  idVinculo(normalizarLote(lote)) || SIN_LOTE,
  PATRON_FECHA.test(vencimiento || '') ? vencimiento : SIN_VENCIMIENTO,
  ...(propietarioId ? [`${PREFIJO_PROPIETARIO}${idVinculo(String(propietarioId))}`] : []),
].join('__');

// Datos de dueño que se copian al lote, tránsitos, movimientos y líneas.
export const datosPropietario = (x) => ({ propietarioId: x?.propietarioId || null, propietarioNombre: x?.propietarioId ? (x.propietarioNombre || '') : '' });

// ---------------- Movimientos ----------------

export class ErrorStock extends Error {}

const entero = (n) => Number.isInteger(n) && n > 0;

// Suma `delta` al centro en un mapa { [centroId]: n } (copia). El centro
// en 0 desaparece; lanza ErrorStock si queda negativo.
const sumarEnMapa = (mapa, centroId, delta, error) => {
  const copia = { ...(mapa || {}) };
  if (!delta) return copia;
  const n = (Number(copia[centroId]) || 0) + delta;
  if (n < 0) throw new ErrorStock(error(n - delta));
  if (n === 0) delete copia[centroId];
  else copia[centroId] = n;
  return copia;
};

// Saldo { disponible, transito, transitoPorCentro, enCentro,
// enCentroPorCentro } + movimiento { tipo, cantidad, centroId } -> saldo
// nuevo. Sirve igual para el lote y para los totales del producto. No
// modifica el saldo recibido. Lanza ErrorStock si el movimiento es inválido
// o deja algo negativo.
export const aplicarMovimiento = (saldo, { tipo, cantidad, centroId } = {}) => {
  const def = TIPOS_MOVIMIENTO[tipo];
  if (!def) throw new ErrorStock(`Tipo de movimiento inválido: ${tipo}.`);
  if (!entero(cantidad)) throw new ErrorStock('La cantidad debe ser un número entero mayor a cero.');
  if (def.centro && !centroId) throw new ErrorStock('El movimiento requiere un centro.');
  const deltaEnCentro = (def.enCentro || 0) * cantidad;

  const disponible = (Number(saldo?.disponible) || 0) + def.disponible * cantidad;
  const transito = (Number(saldo?.transito) || 0) + def.transito * cantidad;
  const enCentro = (Number(saldo?.enCentro) || 0) + deltaEnCentro;
  let transitoPorCentro = { ...(saldo?.transitoPorCentro || {}) };
  let enCentroPorCentro = { ...(saldo?.enCentroPorCentro || {}) };
  if (def.centro) {
    transitoPorCentro = sumarEnMapa(transitoPorCentro, centroId, def.transito * cantidad, (hay) => `No hay suficiente en tránsito en ese centro (hay ${hay}).`);
    enCentroPorCentro = sumarEnMapa(enCentroPorCentro, centroId, deltaEnCentro, (hay) => `No hay suficiente dejado en ese centro (hay ${hay}).`);
  }
  if (disponible < 0) throw new ErrorStock(`Stock disponible insuficiente (hay ${disponible - def.disponible * cantidad}).`);
  if (transito < 0) throw new ErrorStock(`No hay suficiente en tránsito (hay ${transito - def.transito * cantidad}).`);
  if (enCentro < 0) throw new ErrorStock(`No hay suficiente dejado en centros (hay ${enCentro - deltaEnCentro}).`);
  return { disponible, transito, transitoPorCentro, enCentro, enCentroPorCentro };
};

// Campos de saldo de un documento (lote o producto), con ceros por defecto.
export const saldoDe = (d) => ({
  disponible: d?.disponible || 0, transito: d?.transito || 0, transitoPorCentro: d?.transitoPorCentro || {},
  enCentro: d?.enCentro || 0, enCentroPorCentro: d?.enCentroPorCentro || {},
});

// Lo que queda de un saldo en el kardex (foto después del movimiento).
export const fotoSaldo = (s) => ({ disponible: s.disponible, transito: s.transito, enCentro: s.enCentro || 0 });

// Totales del tránsito de un centro (bodega_transito_centros/{centroId}):
// { unidades (en tránsito), productos: { [productoId]: cantidad },
// productosDistintos, enCentro (dejado en el centro), productosEnCentro }.
// Solo cambian con los movimientos de centro (salida, entrega, devolución,
// dejar en centro y entregar/devolver desde el centro).
export const aplicarMovimientoCentro = (centro, { tipo, cantidad, productoId } = {}) => {
  const def = TIPOS_MOVIMIENTO[tipo];
  if (!def?.centro) throw new ErrorStock(`El movimiento ${tipo} no afecta el tránsito de un centro.`);
  if (!entero(cantidad)) throw new ErrorStock('La cantidad debe ser un número entero mayor a cero.');
  if (!productoId) throw new ErrorStock('Falta el producto.');
  const deltaEnCentro = (def.enCentro || 0) * cantidad;
  const productos = sumarEnMapa(centro?.productos, productoId, def.transito * cantidad, () => 'No hay suficiente en tránsito en ese centro.');
  const productosEnCentro = sumarEnMapa(centro?.productosEnCentro, productoId, deltaEnCentro, () => 'No hay suficiente dejado en ese centro.');
  const unidades = (Number(centro?.unidades) || 0) + def.transito * cantidad;
  const enCentro = (Number(centro?.enCentro) || 0) + deltaEnCentro;
  if (unidades < 0) throw new ErrorStock('No hay suficiente en tránsito en ese centro.');
  if (enCentro < 0) throw new ErrorStock('No hay suficiente dejado en ese centro.');
  return { unidades, productos, productosDistintos: Object.keys(productos).length, enCentro, productosEnCentro };
};

// ---------------- Documentos (ingreso y carga inicial) ----------------

export const TIPOS_DOCUMENTO_BODEGA = Object.freeze({
  INGRESO: { etiqueta: 'Ingreso', movimiento: 'INGRESO' },
  CARGA_INICIAL: { etiqueta: 'Carga inicial', movimiento: 'CARGA_INICIAL' },
});
export const TIPOS_DOCUMENTO_INGRESO = Object.freeze({ GUIA: 'Guía de despacho', FACTURA: 'Factura' });
export const ESTADOS_DOCUMENTO = Object.freeze({ BORRADOR: 'BORRADOR', CONFIRMADO: 'CONFIRMADO' });

// Límite por documento: cada línea escribe su lote y su movimiento, más el
// total de cada producto, en UNA transacción (máx. 500 escrituras).
export const MAX_LINEAS_DOCUMENTO = 150;
export const MAX_OBSERVACION = 500;
const MAX_NUMERO_DOCUMENTO = 40;
const MAX_CANTIDAD_LINEA = 1e6;

const fechaValida = (f) => {
  if (!PATRON_FECHA.test(f || '')) return false;
  const d = new Date(`${f}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === f;
};
export { fechaValida };

// Candado: mismo proveedor + tipo + número de documento (sin espacios ni
// mayúsculas/minúsculas) solo se confirma una vez.
export const idUnicoDocumento = ({ proveedorId, tipoDocumento, numero }) =>
  `documento__${idVinculo(proveedorId)}__${tipoDocumento}__${idVinculo(normalizarClave(numero).replace(/\s/g, ''))}`;

// Cabecera de un documento -> { errores, cabecera }. La carga inicial no
// pide guía, factura ni orden de compra.
export const validarCabecera = (tipo, datos = {}) => {
  const errores = [];
  const observacion = limpiar(datos.observacion);
  if (!TIPOS_DOCUMENTO_BODEGA[tipo]) errores.push('Tipo de documento inválido.');
  if (observacion.length > MAX_OBSERVACION) errores.push(`La observación no puede superar ${MAX_OBSERVACION} caracteres.`);
  if (tipo !== 'INGRESO') return { errores, cabecera: { observacion, propietarioId: String(datos.propietarioId || '').trim() || null } };

  const tipoDocumento = String(datos.tipoDocumento || '');
  const numero = limpiar(datos.numero).toUpperCase();
  const ordenCompra = limpiar(datos.ordenCompra).toUpperCase();
  const proveedorId = String(datos.proveedorId || '').trim();
  const fecha = String(datos.fecha || '').trim();
  if (!TIPOS_DOCUMENTO_INGRESO[tipoDocumento]) errores.push('Elige si es guía de despacho o factura.');
  if (!numero) errores.push('El número de documento es obligatorio.');
  if (numero.length > MAX_NUMERO_DOCUMENTO || ordenCompra.length > MAX_NUMERO_DOCUMENTO) errores.push(`El número de documento y la orden de compra no pueden superar ${MAX_NUMERO_DOCUMENTO} caracteres.`);
  if (!proveedorId) errores.push('El proveedor es obligatorio.');
  if (!fechaValida(fecha)) errores.push('La fecha del documento es obligatoria.');
  // En consignación: el stock que entra es del proveedor (no propio).
  return { errores, cabecera: { tipoDocumento, numero, ordenCompra, proveedorId, fecha, observacion, consignacion: datos.consignacion === true } };
};

// Línea + su producto -> { errores, linea } normalizada. Si el producto no
// maneja lote/vencimiento se descartan; si los maneja, son opcionales (hay
// stock sin lote ni vencimiento) y vacíos quedan en null. Un vencimiento
// escrito debe ser una fecha válida.
export const validarLinea = (linea = {}, producto = null) => {
  const errores = [];
  const cantidad = Number(linea.cantidad);
  const nombre = producto?.nombre || 'Producto';
  if (!producto) errores.push('El producto no existe.');
  else if (producto.activo === false) errores.push(`${nombre}: el producto está inactivo.`);
  if (!Number.isInteger(cantidad) || cantidad <= 0 || cantidad > MAX_CANTIDAD_LINEA) errores.push(`${nombre}: la cantidad debe ser un número entero mayor a cero.`);
  const lote = producto?.manejaLote ? normalizarLote(linea.lote) : '';
  const vencimiento = producto?.manejaVencimiento ? String(linea.vencimiento || '').trim() : '';
  if (lote.length > 40) errores.push(`${nombre}: el lote no puede superar 40 caracteres.`);
  if (vencimiento && !fechaValida(vencimiento)) errores.push(`${nombre}: el vencimiento no es una fecha válida.`);
  return {
    errores,
    linea: {
      productoId: String(linea.productoId || ''),
      lote: lote || null,
      vencimiento: vencimiento || null,
      cantidad,
      codigoLeido: String(linea.codigoLeido || '').slice(0, 300),
      // Segundo código GS1 (lote/vencimiento) leído: solo trazabilidad.
      codigoLote: String(linea.codigoLote || '').slice(0, 300),
    },
  };
};

// Precio unitario (opcional) de una línea de documento, en pesos enteros.
// Vacío -> null. Solo se guarda en el documento: no afecta saldos ni kardex.
export const MAX_PRECIO_UNITARIO = 1e10;
export const normalizarPrecioUnitario = (valor) => {
  if (valor === '' || valor === null || valor === undefined) return { valor: null, error: null };
  const n = Number(valor);
  if (!Number.isFinite(n) || n < 0 || n > MAX_PRECIO_UNITARIO) return { valor: null, error: 'El precio unitario debe ser un número mayor o igual a cero.' };
  return { valor: Math.round(n), error: null };
};

// Total de una línea y de un documento (las líneas sin precio suman 0).
export const totalLinea = (l) => (Number(l?.cantidad) || 0) * (Number(l?.precioUnitario) || 0);
export const totalValorLineas = (lineas = []) => lineas.reduce((n, l) => n + totalLinea(l), 0);

// Une las líneas del mismo producto + lote + vencimiento (+ dueño) sumando
// la cantidad (conserva el orden de la primera aparición y, si tiene, el
// precio unitario de la primera línea que lo trae).
export const agruparLineas = (lineas) => {
  const porLote = new Map();
  lineas.forEach((l) => {
    const id = idLote(l.productoId, l.lote, l.vencimiento, l.propietarioId);
    const previa = porLote.get(id);
    if (previa) {
      previa.cantidad += l.cantidad;
      if (previa.precioUnitario == null && l.precioUnitario != null) previa.precioUnitario = l.precioUnitario;
      if (!previa.codigoLote && l.codigoLote) previa.codigoLote = l.codigoLote;
    } else porLote.set(id, { ...l, loteId: id });
  });
  return [...porLote.values()];
};

// ---------------- Inventario abierto (bloqueo de movimientos) ----------------

// ¿El inventario abierto (bodega_control/estado.inventarioAbierto) incluye
// este producto? `alcance.categorias` vacío o ausente = todos.
export const productoEnInventario = (inventarioAbierto, producto) => {
  if (!inventarioAbierto?.id) return false;
  const categorias = inventarioAbierto.alcance?.categorias || [];
  return categorias.length === 0 || categorias.includes(producto?.categoriaId || '');
};

// ---------------- RUT chileno ----------------

// '12.345.678-5' / '12345678-5' / '123456785' -> '12345678-5' o '' si no es válido.
export const normalizarRut = (texto) => {
  const limpio = String(texto ?? '').replace(/[.\s-]/g, '').toUpperCase();
  if (!/^\d{7,8}[0-9K]$/.test(limpio)) return '';
  const cuerpo = limpio.slice(0, -1);
  const dv = limpio.slice(-1);
  let suma = 0;
  let multiplicador = 2;
  for (let i = cuerpo.length - 1; i >= 0; i -= 1) {
    suma += Number(cuerpo[i]) * multiplicador;
    multiplicador = multiplicador === 7 ? 2 : multiplicador + 1;
  }
  const resto = 11 - (suma % 11);
  const esperado = resto === 11 ? '0' : resto === 10 ? 'K' : String(resto);
  return dv === esperado ? `${cuerpo}-${dv}` : '';
};

// ---------------- Egreso y tránsito ----------------

export const MAX_LINEAS_EGRESO = 60;
export const MAX_ACCIONES_TRANSITO = 50;
// Un tránsito sigue ABIERTO mientras tenga algo pendiente o dejado en el centro.
export const ESTADOS_TRANSITO = Object.freeze({ ABIERTO: 'ABIERTO', CERRADO: 'CERRADO' });
export const MAX_ID_ENTREGA = 20;
export const MAX_NOTA = 500;

// N° de admisión de la entrega (dato del paciente que usó el insumo). Mismo
// formato que el resto del proyecto (admisionClaveDe, Reporte Info /
// Implantes): solo dígitos, mayor a cero, sin ceros a la izquierda.
export const ETIQUETA_ID_ENTREGA = 'N° de admisión';

// Texto ingresado -> { valor, error }.
export const normalizarIdEntrega = (texto) => {
  const limpio = String(texto ?? '').trim();
  if (!limpio) return { valor: '', error: `El ${ETIQUETA_ID_ENTREGA} es obligatorio para entregar.` };
  if (limpio.length > MAX_ID_ENTREGA) return { valor: limpio, error: `El ${ETIQUETA_ID_ENTREGA} no puede superar ${MAX_ID_ENTREGA} caracteres.` };
  const admision = admisionClaveDe(limpio);
  if (!admision) return { valor: limpio, error: `El ${ETIQUETA_ID_ENTREGA} debe tener solo números (sin letras ni espacios).` };
  return { valor: admision, error: null };
};

// Lotes de un producto para egresar, en orden FEFO (vence primero; sin
// vencimiento al final). Solo los que tienen disponible. No distingue
// dueño (el lote consignado se muestra marcado y el usuario puede elegir otro).
export const lotesFEFO = (lotes) => lotes
  .filter((l) => (Number(l.disponible) || 0) > 0)
  .sort((a, b) => (a.vencimiento || '9999-99-99').localeCompare(b.vencimiento || '9999-99-99') || String(a.lote || '').localeCompare(String(b.lote || '')));

// Une las líneas de egreso del mismo lote y centro (suma la cantidad).
export const agruparLineasEgreso = (lineas) => {
  const mapa = new Map();
  lineas.forEach((l) => {
    const clave = `${l.loteId}|${l.centroId}`;
    const previa = mapa.get(clave);
    if (previa) {
      previa.cantidad += l.cantidad;
      if (!previa.codigoLote && l.codigoLote) previa.codigoLote = l.codigoLote;
    } else mapa.set(clave, { ...l });
  });
  return [...mapa.values()];
};

export const ACCIONES_SOBRE_TRANSITO = Object.freeze(['ENTREGAR', 'DEVOLVER', 'NOTA', 'DEJAR_EN_CENTRO']);
// Desde dónde se entrega o devuelve: lo pendiente en tránsito o lo dejado
// en el centro.
export const DESDE = Object.freeze({ TRANSITO: 'TRANSITO', CENTRO: 'CENTRO' });

// Estado de un tránsito tras una acción. `transito`: { pendiente, enCentro,
// entregado, devuelto }; `desde` (ENTREGAR/DEVOLVER): TRANSITO (por
// defecto) o CENTRO. Lanza ErrorStock si la cantidad no corresponde.
export const aplicarAccionTransito = (transito, { accion, cantidad, desde = DESDE.TRANSITO }) => {
  if (accion === 'NOTA') return { ...transito };
  if (!ACCIONES_SOBRE_TRANSITO.includes(accion)) throw new ErrorStock('Acción inválida.');
  if (!Number.isInteger(cantidad) || cantidad <= 0) throw new ErrorStock('La cantidad debe ser un número entero mayor a cero.');
  const delCentro = accion !== 'DEJAR_EN_CENTRO' && desde === DESDE.CENTRO;
  let pendiente = Number(transito.pendiente) || 0;
  let enCentro = Number(transito.enCentro) || 0;
  if (delCentro) {
    if (cantidad > enCentro) throw new ErrorStock(`Solo quedan ${enCentro} dejados en el centro en este registro.`);
    enCentro -= cantidad;
  } else {
    if (cantidad > pendiente) throw new ErrorStock(`Solo quedan ${pendiente} en tránsito en este registro.`);
    pendiente -= cantidad;
    if (accion === 'DEJAR_EN_CENTRO') enCentro += cantidad;
  }
  return {
    ...transito,
    pendiente,
    enCentro,
    entregado: (Number(transito.entregado) || 0) + (accion === 'ENTREGAR' ? cantidad : 0),
    devuelto: (Number(transito.devuelto) || 0) + (accion === 'DEVOLVER' ? cantidad : 0),
    estado: pendiente === 0 && enCentro === 0 ? ESTADOS_TRANSITO.CERRADO : ESTADOS_TRANSITO.ABIERTO,
  };
};

// Movimiento del kardex de cada acción (NOTA no mueve stock).
export const movimientoDeAccion = (accion, desde = DESDE.TRANSITO) => {
  if (accion === 'DEJAR_EN_CENTRO') return 'DEJADO_EN_CENTRO';
  const delCentro = desde === DESDE.CENTRO;
  if (accion === 'ENTREGAR') return delCentro ? 'ENTREGA_DESDE_CENTRO' : 'ENTREGA';
  if (accion === 'DEVOLVER') return delCentro ? 'DEVOLUCION_DESDE_CENTRO' : 'DEVOLUCION';
  return null;
};
export const MOVIMIENTO_DE_ACCION = Object.freeze({ ENTREGAR: 'ENTREGA', DEVOLVER: 'DEVOLUCION' });

// ---------------- Inventario físico ----------------
//
// Cuenta el DISPONIBLE de la Bodega General (lo que está en tránsito no
// está físicamente en la bodega). Al iniciarse se guarda la foto del stock
// teórico por lote; mientras está abierto no se mueve stock de los
// productos de su alcance (salvo entregas desde tránsito). Al cerrarlo se
// generan AJUSTE_POSITIVO / AJUSTE_NEGATIVO para dejar cada lote igual a
// lo contado.

export const ESTADOS_INVENTARIO = Object.freeze({
  PREPARANDO: 'PREPARANDO', ABIERTO: 'ABIERTO', CERRANDO: 'CERRANDO', CERRADO: 'CERRADO', ANULADO: 'ANULADO',
});
// Qué hacer al cerrar con las líneas que nadie contó.
export const NO_CONTADOS = Object.freeze({
  IGNORAR: 'Dejarlos como están (sin ajuste)',
  CERO: 'Ajustarlos a cero (no se encontraron)',
});
export const MAX_CONTEOS_POR_ENVIO = 100;
export const MAX_NOMBRE_INVENTARIO = 80;

// Línea { teorico, contado (null = no contado) } -> { contadoFinal, diferencia }.
export const diferenciaLinea = (linea, noContados = 'IGNORAR') => {
  const teorico = Number(linea.teorico) || 0;
  const contado = linea.contado === null || linea.contado === undefined ? null : Number(linea.contado);
  if (contado === null) {
    return noContados === 'CERO' ? { contadoFinal: 0, diferencia: -teorico } : { contadoFinal: teorico, diferencia: 0 };
  }
  return { contadoFinal: contado, diferencia: contado - teorico };
};

// Resumen para la comparación y el cierre (valor = diferencia × precio).
export const resumenInventario = (lineas, noContados = 'IGNORAR') => lineas.reduce((r, l) => {
  const { diferencia } = diferenciaLinea(l, noContados);
  const precio = Number(l.precio) || 0;
  const contada = l.contado !== null && l.contado !== undefined;
  return {
    lineas: r.lineas + 1,
    contadas: r.contadas + (contada ? 1 : 0),
    noContadas: r.noContadas + (contada ? 0 : 1),
    agregadas: r.agregadas + (l.agregado ? 1 : 0),
    teorico: r.teorico + (Number(l.teorico) || 0),
    sobrantes: r.sobrantes + (diferencia > 0 ? 1 : 0),
    faltantes: r.faltantes + (diferencia < 0 ? 1 : 0),
    unidadesSobrantes: r.unidadesSobrantes + Math.max(0, diferencia),
    unidadesFaltantes: r.unidadesFaltantes + Math.max(0, -diferencia),
    valorSobrante: r.valorSobrante + Math.max(0, diferencia) * precio,
    valorFaltante: r.valorFaltante + Math.max(0, -diferencia) * precio,
    conPrecio: r.conPrecio || precio > 0,
  };
}, { lineas: 0, contadas: 0, noContadas: 0, agregadas: 0, teorico: 0, sobrantes: 0, faltantes: 0, unidadesSobrantes: 0, unidadesFaltantes: 0, valorSobrante: 0, valorFaltante: 0, conPrecio: false });

// Filtros de la comparación: todos | diferencias | faltantes | sobrantes | noContados.
export const filtrarComparacion = (lineas, filtro, noContados = 'IGNORAR') => lineas.filter((l) => {
  const contada = l.contado !== null && l.contado !== undefined;
  if (filtro === 'noContados') return !contada;
  if (filtro === 'todos' || !filtro) return true;
  const { diferencia } = diferenciaLinea(l, noContados);
  if (filtro === 'diferencias') return diferencia !== 0;
  if (filtro === 'faltantes') return diferencia < 0;
  if (filtro === 'sobrantes') return diferencia > 0;
  return true;
});

// Conteo enviado sobre una línea: sumar (escaneo) o reemplazar (corrección).
export const aplicarConteo = (contadoActual, { cantidad, modo }) => {
  const n = Number(cantidad);
  if (!Number.isInteger(n) || n < 0 || (modo !== 'reemplazar' && n === 0)) throw new ErrorStock('La cantidad contada debe ser un número entero (mayor a cero al sumar).');
  return modo === 'reemplazar' ? n : (Number(contadoActual) || 0) + n;
};

// ---------------- Cajas (kits con stock objetivo) ----------------
//
// Una caja tiene una lista fija de productos, cada uno con stock objetivo
// (lo que debe tener siempre) y stock actual (lo que tiene; solo cambia
// por inventario de la caja o reposición desde la Bodega General).

export const MAX_PRODUCTOS_CAJA = 150;
export const MAX_NOMBRE_CAJA = 80;
export const MAX_DESCRIPCION_CAJA = 300;
export const MAX_STOCK_CAJA = 100000;

const enteroNoNegativo = (n) => Number.isInteger(n) && n >= 0;

// datos: { nombre, descripcion, activa, productos: [{ productoId, stockObjetivo }] }
export const validarCaja = (datos = {}) => {
  const errores = [];
  const nombre = String(datos.nombre ?? '').trim().replace(/\s+/g, ' ');
  const descripcion = String(datos.descripcion ?? '').trim().slice(0, MAX_DESCRIPCION_CAJA);
  if (!nombre) errores.push('El nombre de la caja es obligatorio.');
  if (nombre.length > MAX_NOMBRE_CAJA) errores.push(`El nombre no puede superar ${MAX_NOMBRE_CAJA} caracteres.`);
  const entrada = Array.isArray(datos.productos) ? datos.productos : [];
  if (entrada.length > MAX_PRODUCTOS_CAJA) errores.push(`Máximo ${MAX_PRODUCTOS_CAJA} productos por caja.`);
  const vistos = new Set();
  const productos = [];
  entrada.forEach((p) => {
    const productoId = String(p?.productoId || '');
    const stockObjetivo = Number(p?.stockObjetivo);
    if (!productoId) { errores.push('Hay un producto sin identificar.'); return; }
    if (vistos.has(productoId)) { errores.push('Un producto está repetido en la caja.'); return; }
    vistos.add(productoId);
    if (!enteroNoNegativo(stockObjetivo) || stockObjetivo > MAX_STOCK_CAJA) errores.push('El stock objetivo debe ser un número entero mayor o igual a cero.');
    productos.push({ productoId, stockObjetivo });
  });
  return { errores: [...new Set(errores)], caja: { nombre, descripcion, activa: datos.activa !== false }, productos };
};

// Orden de los productos dentro de una caja. Cada producto del mapa guarda
// `orden` (número); los que no lo tienen (cajas anteriores al orden manual)
// van después, por nombre en comparación natural ("Tornillo 2" antes que
// "Tornillo 10"), y el id desempata. Así una caja sin `orden` se sigue
// viendo como antes, sin migración: el orden completo se escribe la primera
// vez que se reordena o se edita.
export const compararNombreNatural = (a, b) => String(a ?? '').localeCompare(String(b ?? ''), 'es', { numeric: true, sensitivity: 'base' });

const tieneOrden = (p) => typeof p?.orden === 'number' && Number.isFinite(p.orden);

// productos: { [productoId]: { nombre, orden? } } -> [productoId] en orden.
export const idsOrdenadosCaja = (productos = {}) => Object.entries(productos)
  .sort(([idA, a], [idB, b]) => {
    if (tieneOrden(a) !== tieneOrden(b)) return tieneOrden(a) ? -1 : 1;
    if (tieneOrden(a) && a.orden !== b.orden) return a.orden - b.orden;
    return compararNombreNatural(a.nombre, b.nombre) || (idA < idB ? -1 : idA > idB ? 1 : 0);
  })
  .map(([id]) => id);

// Reordenamiento manual: `orden` debe traer exactamente los productos
// actuales de la caja, sin repetir. Si la caja cambió mientras tanto (alguien
// agregó o quitó un producto) se rechaza para no pisar ese cambio.
// -> { errores, cambios: { [productoId]: nuevoOrden } } (solo los que cambian).
export const validarOrdenCaja = (productos = {}, orden) => {
  if (!Array.isArray(orden) || !orden.length) return { errores: ['Falta el orden de los productos.'], cambios: {} };
  const ids = orden.map((id) => String(id ?? ''));
  if (new Set(ids).size !== ids.length) return { errores: ['Un producto está repetido en el orden.'], cambios: {} };
  const actuales = Object.keys(productos);
  if (ids.length !== actuales.length || ids.some((id) => !productos[id])) {
    return { errores: ['La caja cambió mientras la ordenabas. Actualiza e inténtalo de nuevo.'], cambios: {} };
  }
  const cambios = {};
  ids.forEach((id, i) => { if (productos[id].orden !== i) cambios[id] = i; });
  return { errores: [], cambios };
};

// Faltante de un producto de la caja para llegar al objetivo (nunca negativo).
export const faltanteCaja = (p) => Math.max(0, (Number(p?.stockObjetivo) || 0) - (Number(p?.stockActual) || 0));

// Totales de la caja (productos: { [productoId]: { stockObjetivo, stockActual } }).
// La completitud no premia el sobrante: cada producto aporta como máximo su objetivo.
export const totalesCaja = (productos = {}) => {
  const lista = Object.values(productos);
  const totalObjetivo = lista.reduce((n, p) => n + (Number(p.stockObjetivo) || 0), 0);
  const totalCubierto = lista.reduce((n, p) => n + Math.min(Number(p.stockActual) || 0, Number(p.stockObjetivo) || 0), 0);
  return {
    cantidadProductos: lista.length,
    totalObjetivo,
    totalActual: lista.reduce((n, p) => n + (Number(p.stockActual) || 0), 0),
    totalFaltante: lista.reduce((n, p) => n + faltanteCaja(p), 0),
    completitud: totalObjetivo ? Math.round((totalCubierto / totalObjetivo) * 1000) / 10 : 100,
  };
};

// Resultado de un inventario de caja. conteos: { [productoId]: contado }.
// Por producto: consumo = actual previo − contado (lo usado o perdido desde
// la última vez; negativo si apareció de más) y faltante = objetivo −
// contado (lo que hay que reponer; nunca negativo). Exige contar todos.
export const resultadoInventarioCaja = (productos = {}, conteos = {}) => {
  const errores = [];
  const lineas = Object.entries(productos).map(([productoId, p]) => {
    const contado = Number(conteos[productoId]);
    if (conteos[productoId] === undefined || conteos[productoId] === null || conteos[productoId] === '' || !enteroNoNegativo(contado) || contado > MAX_STOCK_CAJA) {
      errores.push(`${p.nombre}: ingresa la cantidad contada (entero mayor o igual a cero).`);
    }
    const actualPrevio = Number(p.stockActual) || 0;
    const objetivo = Number(p.stockObjetivo) || 0;
    return {
      productoId, nombre: p.nombre, codigoMaestro: p.codigoMaestro || '', objetivo, actualPrevio, contado,
      consumo: actualPrevio - contado, faltante: Math.max(0, objetivo - contado),
    };
  }).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  return {
    errores,
    lineas,
    resumen: {
      consumo: lineas.reduce((n, l) => n + Math.max(0, l.consumo), 0),
      faltante: lineas.reduce((n, l) => n + l.faltante, 0),
      productosConFaltante: lineas.filter((l) => l.faltante > 0).length,
    },
  };
};

// Reparte `cantidad` entre los lotes de un producto en orden FEFO (la misma
// regla de las salidas: vence primero; sin vencimiento al final). Quien la
// llama decide qué lotes entran (la reposición de cajas usa solo los
// propios: ver lotesPropios). Devuelve
// [{ loteId, lote, vencimiento, cantidad }]. Lanza ErrorStock si no alcanza.
export const repartirFEFO = (lotes, cantidad) => {
  const partes = [];
  let resta = cantidad;
  for (const l of lotesFEFO(lotes)) {
    if (resta <= 0) break;
    const toma = Math.min(resta, Number(l.disponible) || 0);
    partes.push({ loteId: l.id, lote: l.lote || null, vencimiento: l.vencimiento || null, cantidad: toma });
    resta -= toma;
  }
  if (resta > 0) throw new ErrorStock(`Stock disponible insuficiente (faltan ${resta}).`);
  return partes;
};

// Solo los lotes de stock propio (no consignado).
export const lotesPropios = (lotes) => lotes.filter((l) => !l.propietarioId);

// Plan de reposición de una caja. cantidades: { [productoId]: n }
// (0/vacío = no se repone ahora); disponibles: { [productoId]: n } en la
// Bodega General. No se puede reponer más del faltante ni más de lo
// disponible. Las líneas cubren todo producto con faltante o con cantidad,
// así el historial muestra lo repuesto y lo que quedó pendiente.
export const planReposicionCaja = (productos = {}, cantidades = {}, disponibles = {}) => {
  const errores = [];
  Object.keys(cantidades).forEach((id) => { if (!productos[id] && Number(cantidades[id])) errores.push('Un producto ya no está en la caja.'); });
  const lineas = Object.entries(productos).map(([productoId, p]) => {
    const bruto = cantidades[productoId];
    const cantidad = bruto === undefined || bruto === null || bruto === '' ? 0 : Number(bruto);
    const faltanteAntes = faltanteCaja(p);
    if (!enteroNoNegativo(cantidad)) errores.push(`${p.nombre}: la cantidad a reponer debe ser un número entero.`);
    else if (cantidad > faltanteAntes) errores.push(`${p.nombre}: no se puede reponer más del faltante (${faltanteAntes}).`);
    else if (cantidad > (Number(disponibles[productoId]) || 0)) errores.push(`${p.nombre}: la Bodega General solo tiene ${Number(disponibles[productoId]) || 0}.`);
    return { productoId, nombre: p.nombre, codigoMaestro: p.codigoMaestro || '', faltanteAntes, cantidad, pendiente: Math.max(0, faltanteAntes - (enteroNoNegativo(cantidad) ? cantidad : 0)) };
  }).filter((l) => l.faltanteAntes > 0 || l.cantidad > 0)
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  if (!errores.length && !lineas.some((l) => l.cantidad > 0)) errores.push('Ingresa al menos una cantidad a reponer.');
  return { errores: [...new Set(errores)], lineas };
};

// ---------------- Stock consignado ----------------
//
// Lo que cada empresa consignante dejó (lo que "debo tener") por producto +
// lote + vencimiento. No mueve stock: el stock consignado entra por Ingreso
// en consignación o Carga inicial con dueño, y se compara contra los lotes
// de esa empresa (bodega_lotes con propietarioId = empresa).

export const MAX_LINEAS_CONSIGNACION = 300;
export const MAX_CANTIDAD_CONSIGNADA = 1e6;

// datos: { empresaId, observacion, lineas: [{ productoId, lote, vencimiento,
// cantidadConsignada }] } + productos { [id]: producto } -> { errores,
// consignacion, lineas } normalizadas (con su loteId del dueño). El lote y
// el vencimiento siguen la misma regla que los documentos (solo si el
// producto los maneja). Cantidad 0 se permite (consignación ya retirada).
export const validarConsignacion = (datos = {}, productos = {}) => {
  const errores = [];
  const empresaId = String(datos.empresaId || '').trim();
  const observacion = limpiar(datos.observacion).slice(0, MAX_OBSERVACION);
  if (!empresaId) errores.push('Elige la empresa consignante.');
  const entrada = Array.isArray(datos.lineas) ? datos.lineas : [];
  if (entrada.length > MAX_LINEAS_CONSIGNACION) errores.push(`Máximo ${MAX_LINEAS_CONSIGNACION} líneas por consignación.`);
  const vistos = new Set();
  const lineas = [];
  entrada.forEach((l) => {
    const productoId = String(l?.productoId || '');
    const producto = productos[productoId];
    const nombre = producto?.nombre || 'Producto';
    if (!producto) { errores.push('Un producto ya no existe en el maestro.'); return; }
    const cantidad = Number(l?.cantidadConsignada);
    if (!Number.isInteger(cantidad) || cantidad < 0 || cantidad > MAX_CANTIDAD_CONSIGNADA) errores.push(`${nombre}: la cantidad consignada debe ser un número entero mayor o igual a cero.`);
    const lote = producto.manejaLote ? normalizarLote(l?.lote) : '';
    const vencimiento = producto.manejaVencimiento ? String(l?.vencimiento || '').trim() : '';
    if (lote.length > 40) errores.push(`${nombre}: el lote no puede superar 40 caracteres.`);
    if (vencimiento && !fechaValida(vencimiento)) errores.push(`${nombre}: el vencimiento no es una fecha válida.`);
    const loteId = idLote(productoId, lote, vencimiento, empresaId || null);
    if (vistos.has(loteId)) { errores.push(`${nombre}${lote ? ` lote ${lote}` : ''}: está repetido en la consignación.`); return; }
    vistos.add(loteId);
    lineas.push({
      productoId, productoNombre: producto.nombre || '', codigoMaestro: producto.codigoMaestro || '',
      lote: lote || null, vencimiento: vencimiento || null, cantidadConsignada: cantidad, loteId,
    });
  });
  return { errores: [...new Set(errores)], consignacion: { empresaId, observacion }, lineas };
};

// ---------------- Valorización y periodos (Control Mensual) ----------------
//
// Plata en la bodega = stock (propio y consignado) de la Bodega General +
// lo que está en tránsito. Lo dejado en centros queda fuera: sale al
// dejarlo (salida a centros) y vuelve al devolverlo (retorno desde centros).
// Se valoriza a COSTO PROMEDIO PONDERADO por producto: el producto guarda
// `costoPromedio` y `valorStock` (valor de disponible + tránsito) y cada
// movimiento guarda `costoUnitario`, `valor`, `linea` y `periodoId`.
// Cuadratura del periodo:
//   saldo inicial + carga inicial + ingresos + retornos − consumo
//   − salida a centros − salida a cajas ± ajustes = saldo final

export const LINEAS_PERIODO = Object.freeze({
  cargaInicial: { etiqueta: 'Carga inicial', signo: 1 },
  ingresos: { etiqueta: 'Ingresos por compra', signo: 1 },
  retornosCentros: { etiqueta: 'Retorno desde centros', signo: 1 },
  consumo: { etiqueta: 'Consumo', signo: -1 },
  salidaCentros: { etiqueta: 'Salida a centros', signo: -1 },
  salidaCajas: { etiqueta: 'Salida a cajas', signo: -1 },
  ajustePositivo: { etiqueta: 'Ajustes positivos', signo: 1 },
  ajusteNegativo: { etiqueta: 'Ajustes negativos', signo: -1 },
});

// Línea de la cuadratura de cada tipo de movimiento. Los que no están
// (salida a tránsito, devolución a la Bodega General, entrega desde el
// centro) no cambian el valor de la bodega.
export const LINEA_DE_MOVIMIENTO = Object.freeze({
  CARGA_INICIAL: 'cargaInicial',
  INGRESO: 'ingresos',
  DEVOLUCION_DESDE_CENTRO: 'retornosCentros',
  ENTREGA: 'consumo',
  DEJADO_EN_CENTRO: 'salidaCentros',
  REPOSICION_CAJA: 'salidaCajas',
  AJUSTE_POSITIVO: 'ajustePositivo',
  AJUSTE_NEGATIVO: 'ajusteNegativo',
});
export const lineaDeMovimiento = (tipo) => LINEA_DE_MOVIMIENTO[tipo] || null;

// Unidades que se valorizan de un saldo (producto o lote).
export const unidadesValorizadas = (s) => (Number(s?.disponible) || 0) + (Number(s?.transito) || 0);

const pesos = (n) => Math.round(Number(n) || 0);
export const precioNetoDe = (p) => {
  const n = Number(p?.maestroCodigo?.precioNeto);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

// Costo de un producto { costoPromedio, valorStock }. Un producto que aún
// no tiene costoPromedio (antes de la migración) usa el precio neto del
// maestro clínico como respaldo y valoriza su stock actual a ese precio.
export const tieneCosto = (p) => typeof p?.costoPromedio === 'number' && Number.isFinite(p.costoPromedio)
  && typeof p?.valorStock === 'number' && Number.isFinite(p.valorStock);
export const costoDe = (p) => {
  if (tieneCosto(p)) return { costoPromedio: p.costoPromedio, valorStock: unidadesValorizadas(p) > 0 ? p.valorStock : 0 };
  const base = precioNetoDe(p);
  return { costoPromedio: base, valorStock: pesos(base * unidadesValorizadas(p)) };
};

// Costo unitario con que ENTRA un movimiento de entrada:
//   - carga inicial e ingreso: el precio unitario de la línea del documento
//     o, si no tiene, el precio neto vigente;
//   - ajuste positivo: el precio neto vigente;
//   - retorno desde centros: el costo con que salió al dejarlo (guardado en
//     el tránsito) o, si no se conoce, el costo promedio.
// Sin ninguno de esos datos: el costo promedio actual (puede ser 0).
const numeroNoNegativo = (v) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v)) && Number(v) >= 0;
export const costoEntrada = (tipo, { producto, costo, precioLinea = null, costoCentro = null } = {}) => {
  const promedio = Number(costo?.costoPromedio) || 0;
  if (tipo === 'DEVOLUCION_DESDE_CENTRO') return numeroNoNegativo(costoCentro) ? Number(costoCentro) : promedio;
  if ((tipo === 'CARGA_INICIAL' || tipo === 'INGRESO') && numeroNoNegativo(precioLinea)) return Number(precioLinea);
  return precioNetoDe(producto) || promedio;
};

// Aplica un movimiento al costo del producto. `saldoAntes`: saldo del
// producto antes del movimiento (para las unidades valorizadas). Devuelve
// { costo, valorizado: { linea, costoUnitario, valor } }. Las entradas
// recalculan el promedio; las salidas salen al promedio (la última unidad
// se lleva el valor que quede, así no quedan restos por redondeo). Los
// movimientos internos no cambian el costo (valor 0).
export const aplicarCosto = (costo, saldoAntes, { tipo, cantidad, costoUnitario = null }) => {
  const linea = lineaDeMovimiento(tipo);
  const promedio = Number(costo?.costoPromedio) || 0;
  const unidadesAntes = unidadesValorizadas(saldoAntes);
  const valorAntes = unidadesAntes > 0 ? Number(costo?.valorStock) || 0 : 0;
  if (!linea) return { costo: { costoPromedio: promedio, valorStock: valorAntes }, valorizado: { linea: null, costoUnitario: promedio, valor: 0 } };
  if (LINEAS_PERIODO[linea].signo > 0) {
    const cu = numeroNoNegativo(costoUnitario) ? Number(costoUnitario) : promedio;
    const valor = pesos(cu * cantidad);
    const valorStock = valorAntes + valor;
    const unidades = unidadesAntes + cantidad;
    return { costo: { costoPromedio: unidades > 0 ? valorStock / unidades : cu, valorStock }, valorizado: { linea, costoUnitario: cu, valor } };
  }
  const unidades = unidadesAntes - cantidad;
  const valor = unidades <= 0 ? valorAntes : Math.min(valorAntes, pesos(promedio * cantidad));
  return { costo: { costoPromedio: promedio, valorStock: unidades <= 0 ? 0 : valorAntes - valor }, valorizado: { linea, costoUnitario: promedio, valor } };
};

// Valoriza un movimiento { tipo, cantidad } del producto: decide el costo
// de entrada (si es una entrada) y lo aplica. `datos`: { precioLinea,
// costoCentro } (ver costoEntrada). Devuelve { costo, valorizado }.
export const valorizarMovimiento = (costo, saldoAntes, producto, { tipo, cantidad }, datos = {}) => {
  const linea = lineaDeMovimiento(tipo);
  const costoUnitario = linea && LINEAS_PERIODO[linea].signo > 0 ? costoEntrada(tipo, { producto, costo, ...datos }) : null;
  return aplicarCosto(costo, saldoAntes, { tipo, cantidad, costoUnitario });
};

// Campos de costo que se guardan en el producto.
export const camposCosto = (costo) => ({ costoPromedio: Number(costo.costoPromedio) || 0, valorStock: Number(costo.valorStock) || 0 });

// Costo promedio de lo dejado en un centro desde un tránsito (para que el
// retorno vuelva al mismo costo con que salió).
export const costoEnCentro = (transito, cantidad, costoUnitario) => {
  const previo = Number(transito?.enCentro) || 0;
  const costoPrevio = transito?.costoUnitarioCentro;
  if (!previo || !numeroNoNegativo(costoPrevio)) return costoUnitario;
  return (previo * Number(costoPrevio) + cantidad * costoUnitario) / (previo + cantidad);
};

// --- Periodos ---

// Mismo orden e ids que MESES de Control Mensual (src/components/modulos/
// administracion/controlMensual/constants.js).
export const MESES_PERIODO = Object.freeze(['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']);
export const MODULO_PERIODO = 'bodega';
export const COL_PERIODOS = 'bodega_periodos';
export const ESTADOS_PERIODO_ABIERTO = Object.freeze(['ABIERTO', 'REABIERTO']);
export const idPeriodo = (anio, mes) => `${anio}_${mes}`;
export const ordenPeriodo = (anio, mes) => Number(anio) * 12 + MESES_PERIODO.indexOf(mes);
export const periodoSiguiente = (anio, mes) => {
  const i = MESES_PERIODO.indexOf(mes);
  return i === 11 ? { anio: String(Number(anio) + 1), mes: MESES_PERIODO[0] } : { anio: String(anio), mes: MESES_PERIODO[i + 1] };
};

// Periodo de Bodega al que va un movimiento nuevo: el abierto más reciente
// (cierres_periodos de Bodega en ABIERTO/REABIERTO). Sin periodo abierto:
// null (se asigna al próximo que se abra).
export const periodoVigente = (abiertos = []) => {
  const validos = abiertos.filter((p) => p?.anio && MESES_PERIODO.includes(p.mes));
  if (!validos.length) return null;
  const p = validos.reduce((a, b) => (ordenPeriodo(b.anio, b.mes) > ordenPeriodo(a.anio, a.mes) ? b : a));
  return idPeriodo(p.anio, p.mes);
};

// Totales de las líneas de un conjunto de movimientos:
// { [linea]: { unidades, valor } } (todas las líneas, en 0 si no hubo).
export const lineasVacias = () => Object.fromEntries(Object.keys(LINEAS_PERIODO).map((l) => [l, { unidades: 0, valor: 0 }]));
export const sumarLineas = (movimientos = []) => movimientos.reduce((acc, m) => {
  const linea = m?.linea || lineaDeMovimiento(m?.tipo);
  if (!linea || !acc[linea]) return acc;
  acc[linea] = { unidades: acc[linea].unidades + (Number(m.cantidad) || 0), valor: acc[linea].valor + (Number(m.valor) || 0) };
  return acc;
}, lineasVacias());

// Saldo final = saldo inicial + Σ (signo × valor de cada línea).
export const saldoFinalPeriodo = (saldoInicial, lineas) => Object.entries(lineas || {})
  .reduce((n, [l, t]) => n + (LINEAS_PERIODO[l]?.signo || 0) * (Number(t?.valor) || 0), Number(saldoInicial) || 0);

// Valor con signo que un movimiento suma (+) o resta (−) a la bodega.
export const valorConSigno = (m) => {
  const linea = m?.linea || lineaDeMovimiento(m?.tipo);
  return linea ? LINEAS_PERIODO[linea].signo * (Number(m?.valor) || 0) : 0;
};
