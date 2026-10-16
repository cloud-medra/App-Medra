import { idLote, normalizarLote, validarLinea, fechaValida, normalizarPrecioUnitario } from '../../../../../../functions/bodega/nucleo.mjs';

export { totalLinea, totalValorLineas } from '../../../../../../functions/bodega/nucleo.mjs';

// Líneas de un documento en pantalla: { key, productoId, lote, vencimiento,
// cantidad, codigoLeido, precioUnitario? (solo Carga inicial) }. Lógica pura (la Cloud Function vuelve a validar
// y agrupar todo al confirmar).

export const claveLinea = (l) => idLote(l.productoId, l.lote, l.vencimiento);

// ¿La línea en curso (producto escaneado) está lista para agregarse?
// Devuelve el campo que lo impide ('cantidad' | 'vencimiento' mal escrito) o null.
// Lote y vencimiento son opcionales.
export const campoFaltante = (pendiente) => {
  const cantidad = Number(pendiente?.cantidad);
  if (!Number.isInteger(cantidad) || cantidad <= 0) return 'cantidad';
  if (pendiente?.producto?.manejaVencimiento && pendiente.vencimiento && !fechaValida(pendiente.vencimiento)) return 'vencimiento';
  return null;
};

// Dato opcional vacío que el producto maneja ('lote' | 'vencimiento') o
// null. No bloquea: solo evita agregar solo al escanear sin dar la opción
// de escribirlo.
export const campoSugerido = (pendiente) => {
  if (pendiente?.producto?.manejaLote && !normalizarLote(pendiente.lote)) return 'lote';
  if (pendiente?.producto?.manejaVencimiento && !pendiente.vencimiento) return 'vencimiento';
  return null;
};

// Agrega una línea; si ya hay una del mismo producto + lote + vencimiento,
// suma la cantidad. Devuelve { lineas, sumada, linea }.
export const agregarLinea = (lineas, nueva) => {
  const linea = {
    productoId: nueva.productoId,
    lote: nueva.producto?.manejaLote === false ? '' : normalizarLote(nueva.lote),
    vencimiento: nueva.producto?.manejaVencimiento === false ? '' : (nueva.vencimiento || ''),
    cantidad: Number(nueva.cantidad),
    codigoLeido: nueva.codigoLeido || '',
    ...('precioUnitario' in nueva ? { precioUnitario: normalizarPrecioUnitario(nueva.precioUnitario).valor } : {}),
  };
  const clave = claveLinea(linea);
  const i = lineas.findIndex((l) => claveLinea(l) === clave);
  if (i >= 0) {
    const copia = [...lineas];
    // Al sumar se conserva el precio de la línea existente (si no tenía, se toma el nuevo).
    const precio = copia[i].precioUnitario ?? linea.precioUnitario;
    copia[i] = { ...copia[i], cantidad: copia[i].cantidad + linea.cantidad, ...(precio !== undefined ? { precioUnitario: precio } : {}) };
    return { lineas: copia, sumada: true, linea: copia[i] };
  }
  const conClave = { ...linea, key: `${clave}-${Date.now()}-${lineas.length}` };
  return { lineas: [...lineas, conClave], sumada: false, linea: conClave };
};

export const cambiarCantidad = (lineas, key, cantidad) => lineas.map((l) => (l.key === key ? { ...l, cantidad } : l));
// Precio escrito en la tabla: '' se guarda como null; si no, pesos enteros.
export const cambiarPrecio = (lineas, key, valor) => lineas.map((l) => (l.key === key
  ? { ...l, precioUnitario: valor === '' ? null : normalizarPrecioUnitario(valor).valor ?? l.precioUnitario }
  : l));

// Precio con el que se precarga una línea: el precio neto del maestro
// clínico vinculado, redondeado a pesos enteros ('' si no hay).
export const precioSugerido = (producto) => {
  const precio = Number(producto?.maestroCodigo?.precioNeto);
  return precio > 0 ? Math.round(precio) : '';
};

// Precio neto de un producto del maestro clínico (maestros_codigos) para
// precargar el campo "Precio neto" al crear un producto en Carga inicial.
export const precioMaestroClinico = (codigo) => precioSugerido({ maestroCodigo: codigo });

// Precio de la línea al volver de crear un producto en Carga inicial: el
// "Precio neto" escrito en el formulario (si es válido); si viene vacío, el
// sugerido por el maestro clínico vinculado.
export const precioInicialLinea = (producto, precioNeto) => {
  const { valor, error } = normalizarPrecioUnitario(precioNeto);
  return valor !== null && !error ? valor : precioSugerido(producto);
};

// Referencia que se muestra del producto: la propia o la del maestro clínico.
export const referenciaProducto = (producto) => producto?.referencia || producto?.maestroCodigo?.referencia || '';

export const quitarLinea = (lineas, key) => lineas.filter((l) => l.key !== key);

export const totalUnidades = (lineas) => lineas.reduce((n, l) => n + (Number(l.cantidad) || 0), 0);

// Errores de todas las líneas contra el maestro en memoria.
export const erroresLineas = (lineas, productosPorId) => [...new Set(
  lineas.flatMap((l) => validarLinea(l, productosPorId[l.productoId] || null).errores)
)];

// Líneas guardadas (borrador) -> líneas de pantalla con key.
export const lineasDesdeDocumento = (lineas = []) => lineas.map((l, i) => ({ ...l, key: `${claveLinea(l)}-b${i}` }));

// Fecha de hoy 'AAAA-MM-DD' (hora local).
export const hoyISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
