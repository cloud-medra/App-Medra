// Campos que se comparan ítem por ítem entre implantes_gestiones (fuente de
// verdad) e implantes_imputadas (lo ya copiado, potencialmente desactualizado).
// `gestionKey`/`imputadaKey` difieren porque los nombres de campo no son
// simétricos entre ambas colecciones (ver construirPayloadImputada).
export const CAMPOS_COMPARADOS = [
  { campo: 'referencia', gestionKey: 'referencia', imputadaKey: 'referencia', label: 'Referencia' },
  { campo: 'codigo', gestionKey: 'codigo', imputadaKey: 'codigo', label: 'Código' },
  { campo: 'cantidad', gestionKey: 'cantidad', imputadaKey: 'cantidad', label: 'Cantidad', numerico: true },
  { campo: 'lote', gestionKey: 'lote', imputadaKey: 'lote', label: 'Lote' },
  { campo: 'vencimiento', gestionKey: 'vencimiento', imputadaKey: 'vencimiento', label: 'Vencimiento' },
  { campo: 'precio', gestionKey: 'precio', imputadaKey: 'precio', label: 'Precio', numerico: true },
  { campo: 'vecesCosto', gestionKey: 'vecesCosto', imputadaKey: 'vecesCosto', label: 'Recargo (veces costo)', numerico: true },
  { campo: 'venta', gestionKey: 'venta', imputadaKey: 'venta', label: 'Venta', numerico: true },
  { campo: 'totalItem', gestionKey: 'totalItem', imputadaKey: 'total', label: 'Total', numerico: true },
  { campo: 'numCotizacion', gestionKey: 'numCotizacion', imputadaKey: 'numCotizacion', label: 'N° Cotización' },
  { campo: 'estadoCarga', gestionKey: 'estadoCarga', imputadaKey: 'estadoCarga', label: 'Estado Carga' },
  { campo: 'empresaVinculada', gestionKey: 'empresaVinculada', imputadaKey: 'empresaVinculada', label: 'Empresa Vinculada' },
  { campo: 'detalle', gestionKey: 'detalle', imputadaKey: 'detalle', label: 'Detalle' },
];

const normalizar = (valor, numerico) => {
  if (numerico) return Number(valor) || 0;
  if (valor === null || valor === undefined) return '';
  return String(valor).trim();
};

/**
 * Compara un ítem de implantes_gestiones con su contraparte (si existe) en
 * implantes_imputadas. Devuelve la lista de campos con su valor a cada lado
 * y si difieren.
 */
export const diffItem = (itemGestion, itemImputada) => {
  return CAMPOS_COMPARADOS.map(({ campo, gestionKey, imputadaKey, label, numerico }) => {
    const valorGestion = itemGestion ? itemGestion[gestionKey] : undefined;
    const valorImputada = itemImputada ? itemImputada[imputadaKey] : undefined;
    const difiere = normalizar(valorGestion, numerico) !== normalizar(valorImputada, numerico);
    return { campo, label, valorGestion, valorImputada, difiere };
  });
};

/**
 * Compara el set de ítems actuales de un bloque de implantes_gestiones
 * contra el set de documentos ya presentes en implantes_imputadas para esa
 * misma admisión/período (ambos indexados por itemId).
 *
 * Devuelve, por ítem: 'IGUAL' | 'DIFIERE' | 'FALTA_EN_IMPUTADAS'
 * y además la lista de ítems que sobran del lado de imputadas (existen ahí
 * pero ya no están en la gestión actual).
 */
export const diffBloque = (itemsGestion, itemsImputadaPorId) => {
  const idsGestion = new Set(itemsGestion.map(it => it.id).filter(Boolean));

  const itemsComparados = itemsGestion.map(itemGestion => {
    const itemImputada = itemGestion.id ? itemImputadaPorIdGet(itemsImputadaPorId, itemGestion.id) : undefined;

    if (!itemImputada) {
      return {
        itemId: itemGestion.id,
        itemGestion,
        itemImputada: null,
        estado: 'FALTA_EN_IMPUTADAS',
        campos: diffItem(itemGestion, null)
      };
    }

    const campos = diffItem(itemGestion, itemImputada);
    const hayDiferencias = campos.some(c => c.difiere);

    return {
      itemId: itemGestion.id,
      itemGestion,
      itemImputada,
      estado: hayDiferencias ? 'DIFIERE' : 'IGUAL',
      campos
    };
  });

  const itemsSobrantesEnImputadas = Object.keys(itemsImputadaPorId || {})
    .filter(itemId => !idsGestion.has(itemId))
    .map(itemId => itemsImputadaPorId[itemId]);

  const sinDiferencias = itemsComparados.every(it => it.estado === 'IGUAL') && itemsSobrantesEnImputadas.length === 0;

  return { itemsComparados, itemsSobrantesEnImputadas, sinDiferencias };
};

const itemImputadaPorIdGet = (mapa, itemId) => (mapa ? mapa[itemId] : undefined);
