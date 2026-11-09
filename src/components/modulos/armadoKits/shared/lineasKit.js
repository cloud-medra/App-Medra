import { lotesParaKit, repartoDesde, lotesFueraDeFEFO, referenciaDe } from '../../../../../functions/armadoKits/nucleo.mjs';

// Líneas del kit en edición y cálculo de lo disponible. Lógica pura.

// 'AAAA-MM-DD' -> 'DD-MM-AAAA' (formato de Chile, sin pasar por Date).
export const fechaCorta = (iso) => (iso ? iso.split('-').reverse().join('-') : '');

export const etiquetaLote = (lote) => lote || 'S/L';

const cantidadPorLote = (lineas = []) => lineas.reduce((acc, l) => ({ ...acc, [l.loteId]: (acc[l.loteId] || 0) + l.cantidad }), {});

// Lotes ofrecidos al armar, con lo que queda libre: el disponible de Bodega,
// más lo que este kit ya tiene guardado de ese lote (al editar), menos lo que
// está en la lista. Sin vencidos ni consignados, en orden FEFO.
export const lotesVisibles = (lotes, lineas, originales, hoy) => {
  const enLista = cantidadPorLote(lineas);
  const guardado = cantidadPorLote(originales);
  const ajustados = lotes.map((l) => ({ ...l, disponible: (Number(l.disponible) || 0) + (guardado[l.id] || 0) - (enLista[l.id] || 0) }));
  return lotesParaKit(ajustados, hoy);
};

// Qué se agregará y qué hay que confirmar al elegir un lote y una cantidad.
//   { partes, faltante, completa, fueraDeFEFO, sinVencimiento }
export const propuestaAgregar = (visibles, loteId, cantidad) => {
  const { partes, faltante } = repartoDesde(visibles, loteId, cantidad);
  const asignado = Object.fromEntries(partes.map((p) => [p.lote.id, p.cantidad]));
  const fuera = lotesFueraDeFEFO(visibles, asignado);
  return {
    partes, faltante,
    completa: partes.length > 1,
    fueraDeFEFO: partes.filter((p) => fuera.has(p.lote.id)),
    sinVencimiento: partes.filter((p) => !p.lote.vencimiento),
  };
};

// Agrega las partes a la lista; si el lote ya está, suma la cantidad.
export const agregarPartes = (lineas, producto, partes, confirmaciones = {}) => partes.reduce((lista, { lote, cantidad }) => {
  const i = lista.findIndex((l) => l.loteId === lote.id);
  const confirmar = {
    confirmarFueraFEFO: Boolean(confirmaciones.fueraDeFEFO?.has(lote.id)),
    confirmarSinVencimiento: !lote.vencimiento,
  };
  if (i >= 0) {
    const copia = [...lista];
    copia[i] = {
      ...copia[i], cantidad: copia[i].cantidad + cantidad,
      confirmarFueraFEFO: copia[i].confirmarFueraFEFO || confirmar.confirmarFueraFEFO,
      confirmarSinVencimiento: copia[i].confirmarSinVencimiento || confirmar.confirmarSinVencimiento,
    };
    return copia;
  }
  return [...lista, {
    productoId: producto.id, productoNombre: producto.nombre, referencia: referenciaDe(producto),
    loteId: lote.id, lote: lote.lote || null, vencimiento: lote.vencimiento || null, cantidad, ...confirmar,
  }];
}, lineas);

export const quitarLineaKit = (lineas, loteId) => lineas.filter((l) => l.loteId !== loteId);

// Lo que se envía a la Function por cada línea.
export const lineasParaGuardar = (lineas) => lineas.map(({ productoId, loteId, cantidad, confirmarFueraFEFO, confirmarSinVencimiento }) => ({
  productoId, loteId, cantidad, confirmarFueraFEFO: Boolean(confirmarFueraFEFO), confirmarSinVencimiento: Boolean(confirmarSinVencimiento),
}));

// Tras una confirmación pedida por el servidor (motivo y loteIds del error).
export const marcarConfirmados = (lineas, motivo, loteIds = []) => lineas.map((l) => {
  if (!loteIds.includes(l.loteId)) return l;
  return motivo === 'fuera-fefo' ? { ...l, confirmarFueraFEFO: true } : { ...l, confirmarSinVencimiento: true };
});

export const textoParte = ({ lote, cantidad }) => `${cantidad} del lote ${etiquetaLote(lote.lote)} (${lote.vencimiento ? `vence ${fechaCorta(lote.vencimiento)}` : 'sin vencimiento'})`;

// Filtro por tipo y paginación sin repetidos al traer otra página.
export const unirPagina = (actuales, nuevos) => {
  const ids = new Set(actuales.map((k) => k.id));
  return [...actuales, ...nuevos.filter((k) => !ids.has(k.id))];
};
