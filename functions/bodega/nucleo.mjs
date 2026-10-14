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
  inventariarCaja: [MODULO, RUTAS.cajas, 'caja', 'btn_inventario'],
  reponerCaja: [MODULO, RUTAS.cajas, 'caja', 'btn_reponer'],
});

// Acciones sobre un tránsito: desde la vista Tránsito o desde Tránsito por
// centro (cada una con su propio permiso).
export const ACCIONES_TRANSITO = Object.freeze({
  ENTREGAR: 'btn_entregar',
  DEVOLVER: 'btn_devolver',
  NOTA: 'btn_nota',
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
  if (tipo !== 'INGRESO') return { errores, cabecera: { observacion } };

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
  return { errores, cabecera: { tipoDocumento, numero, ordenCompra, proveedorId, fecha, observacion } };
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
    },
  };
};

// Une las líneas del mismo producto + lote + vencimiento sumando la
// cantidad (conserva el orden de la primera aparición).
export const agruparLineas = (lineas) => {
  const porLote = new Map();
  lineas.forEach((l) => {
    const id = idLote(l.productoId, l.lote, l.vencimiento);
    const previa = porLote.get(id);
    if (previa) previa.cantidad += l.cantidad;
    else porLote.set(id, { ...l, loteId: id });
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
// vencimiento al final). Solo los que tienen disponible.
export const lotesFEFO = (lotes) => lotes
  .filter((l) => (Number(l.disponible) || 0) > 0)
  .sort((a, b) => (a.vencimiento || '9999-99-99').localeCompare(b.vencimiento || '9999-99-99') || String(a.lote || '').localeCompare(String(b.lote || '')));

// Une las líneas de egreso del mismo lote y centro (suma la cantidad).
export const agruparLineasEgreso = (lineas) => {
  const mapa = new Map();
  lineas.forEach((l) => {
    const clave = `${l.loteId}|${l.centroId}`;
    const previa = mapa.get(clave);
    if (previa) previa.cantidad += l.cantidad;
    else mapa.set(clave, { ...l });
  });
  return [...mapa.values()];
};

// Estado de un tránsito tras una acción. `transito`: { pendiente, entregado,
// devuelto }. Lanza ErrorStock si la cantidad no corresponde.
export const aplicarAccionTransito = (transito, { accion, cantidad }) => {
  if (accion === 'NOTA') return { ...transito };
  if (accion !== 'ENTREGAR' && accion !== 'DEVOLVER') throw new ErrorStock('Acción inválida.');
  if (!Number.isInteger(cantidad) || cantidad <= 0) throw new ErrorStock('La cantidad debe ser un número entero mayor a cero.');
  const pendiente = (Number(transito.pendiente) || 0) - cantidad;
  if (pendiente < 0) throw new ErrorStock(`Solo quedan ${transito.pendiente} en tránsito en este registro.`);
  return {
    ...transito,
    pendiente,
    entregado: (Number(transito.entregado) || 0) + (accion === 'ENTREGAR' ? cantidad : 0),
    devuelto: (Number(transito.devuelto) || 0) + (accion === 'DEVOLVER' ? cantidad : 0),
    estado: pendiente === 0 ? ESTADOS_TRANSITO.CERRADO : ESTADOS_TRANSITO.ABIERTO,
  };
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
