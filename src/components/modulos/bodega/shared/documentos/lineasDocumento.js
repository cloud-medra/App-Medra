import { idLote, normalizarLote, validarLinea, fechaValida } from '../../../../../../functions/bodega/nucleo.mjs';

// Líneas de un documento en pantalla: { key, productoId, lote, vencimiento,
// cantidad, codigoLeido }. Lógica pura (la Cloud Function vuelve a validar
// y agrupar todo al confirmar).

export const claveLinea = (l) => idLote(l.productoId, l.lote, l.vencimiento);

// ¿La línea en curso (producto escaneado) está lista para agregarse?
// Devuelve el primer campo que falta ('cantidad' | 'lote' | 'vencimiento') o null.
export const campoFaltante = (pendiente) => {
  const cantidad = Number(pendiente?.cantidad);
  if (!Number.isInteger(cantidad) || cantidad <= 0) return 'cantidad';
  if (pendiente?.producto?.manejaLote && !normalizarLote(pendiente.lote)) return 'lote';
  if (pendiente?.producto?.manejaVencimiento && !fechaValida(pendiente.vencimiento)) return 'vencimiento';
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
  };
  const clave = claveLinea(linea);
  const i = lineas.findIndex((l) => claveLinea(l) === clave);
  if (i >= 0) {
    const copia = [...lineas];
    copia[i] = { ...copia[i], cantidad: copia[i].cantidad + linea.cantidad };
    return { lineas: copia, sumada: true, linea: copia[i] };
  }
  const conClave = { ...linea, key: `${clave}-${Date.now()}-${lineas.length}` };
  return { lineas: [...lineas, conClave], sumada: false, linea: conClave };
};

export const cambiarCantidad = (lineas, key, cantidad) => lineas.map((l) => (l.key === key ? { ...l, cantidad } : l));
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
