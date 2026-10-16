export const formatearFechaTabla = (fechaString) => {
  if (!fechaString || !fechaString.includes('-')) return fechaString || '-';
  const [yyyy, mm, dd] = fechaString.split('-');
  return `${dd}-${mm}-${yyyy}`;
};

export const calcularEmpresaNoCoincide = (item, bloqueEmpresa) => {
  if (item.sinCodigo) return false;
  if (item.padPadreId) return false; // los ítems de contenido de un PAD no llevan validación de empresa
  if (item.lotePadreId) return false; // las entradas de lote adicional heredan la empresa de su referencia principal
  if (!item.empresaVinculada || !bloqueEmpresa) return false;
  return item.empresaVinculada.trim().toUpperCase() !== bloqueEmpresa.trim().toUpperCase();
};

export const buscarRangoRecargo = (precio, recargosActivos) => {
  const p = Number(precio) || 0;
  return recargosActivos.find(r => p >= Number(r.desde) && p <= Number(r.hasta)) || null;
};

export const calcularVentaUnitaria = (precio, vecesCosto) => {
  const p = Number(precio) || 0;
  const v = Number(vecesCosto) || 1;
  return p * v;
};

export const calcularCamposFinancieros = (precio, cantidad, recargosActivos) => {
  const rango = buscarRangoRecargo(precio, recargosActivos);
  const vecesCosto = rango ? Number(rango.vecesCosto) : 1;
  const cantidadNum = Number(cantidad) || 0;
  const venta = calcularVentaUnitaria(precio, vecesCosto) * cantidadNum;
  const totalItem = (Number(precio) || 0) * cantidadNum;

  return { vecesCosto, recargoEncontrado: !!rango, venta, totalItem };
};

// SIN CARGO: la fila no se cobra; queda como el contenido de un PAD
// (ver camposCambioEstadoCarga).
export const ESTADO_SIN_CARGO = 'SIN CARGO';
export const ESTADO_CARGA_OPTIONS = ['PENDIENTE', 'CARGADO', 'REVISAR', 'S/COTIZACION', ESTADO_SIN_CARGO];

const ESTADO_CARGA_STYLES = {
  PENDIENTE: { text: 'text-orange-700 dark:text-orange-400', bg: 'bg-orange-50 dark:bg-orange-950/30', border: 'border-orange-300 dark:border-orange-800' },
  CARGADO: { text: 'text-emerald-700 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/30', border: 'border-emerald-300 dark:border-emerald-800' },
  REVISAR: { text: 'text-sky-700 dark:text-sky-400', bg: 'bg-sky-50 dark:bg-sky-950/30', border: 'border-sky-300 dark:border-sky-800' },
  'S/COTIZACION': { text: 'text-purple-700 dark:text-purple-400', bg: 'bg-purple-50 dark:bg-purple-950/30', border: 'border-purple-300 dark:border-purple-800' },
  PAD: { text: 'text-fuchsia-700 dark:text-fuchsia-400', bg: 'bg-fuchsia-50 dark:bg-fuchsia-950/30', border: 'border-fuchsia-300 dark:border-fuchsia-800' },
  [ESTADO_SIN_CARGO]: { text: 'text-slate-600 dark:text-slate-300', bg: 'bg-slate-100 dark:bg-slate-800/60', border: 'border-slate-300 dark:border-slate-600' }
};

export const getEstadoCargaStyle = (estado) => ESTADO_CARGA_STYLES[estado] || ESTADO_CARGA_STYLES.PENDIENTE;

// Color de fondo de la FILA completa según Estado Carga (distinto del color
// del pill del <select> de arriba, a propósito — mismo valor exacto que en
// CargasTab de Consignación, para que ambos módulos se vean consistentes.
// Solo se aplica a ítems con un <select> real de Estado Carga (ver
// CotizacionCard.jsx): ítems "Sin código" o contenido de PAD tienen su
// propio color de fila fijo y no pasan por acá.
const ESTADO_CARGA_ROW_STYLES = {
  PENDIENTE: 'bg-amber-50/40 dark:bg-amber-950/10 hover:bg-amber-50/70 dark:hover:bg-amber-950/20',
  CARGADO: 'bg-emerald-50/40 dark:bg-emerald-950/10 hover:bg-emerald-50/70 dark:hover:bg-emerald-950/20',
  REVISAR: 'bg-orange-50/40 dark:bg-orange-950/10 hover:bg-orange-50/70 dark:hover:bg-orange-950/20',
  'S/COTIZACION': 'bg-purple-50/30 dark:bg-purple-950/10 hover:bg-purple-50/60 dark:hover:bg-purple-950/20',
  [ESTADO_SIN_CARGO]: 'bg-slate-50/60 dark:bg-slate-900/20 hover:bg-slate-100/70 dark:hover:bg-slate-800/30'
};

export const getEstadoCargaRowStyle = (estado) => ESTADO_CARGA_ROW_STYLES[estado] || ESTADO_CARGA_ROW_STYLES.PENDIENTE;

// --- Reglas de PAD ---
export const CLASE_PAD = 'PAD';
export const CODIGO_SIN_OC = 'No lleva OC';
export const VALOR_LOTE_VENCIMIENTO_PAD = 'PAD';

export const esClasePad = (clase) => (clase || '').trim().toUpperCase() === CLASE_PAD;

// Considera "completo" CARGADO, PAD y SIN CARGO (para indicadores
// generales que agrupan el estado de carga de una cotización/ítem).
export const esEstadoCargaCompleto = (estado) => estado === 'CARGADO' || estado === 'PAD' || estado === ESTADO_SIN_CARGO;

// Campos a guardar al cambiar el Estado Carga de un ítem.
//   - A SIN CARGO: queda como el contenido de un PAD (código "No lleva OC",
//     precio/venta/total 0, sin aviso de recargo; no suma en los totales)
//     y guarda su código y precio en `sinCargoOriginal`.
//   - De SIN CARGO a otro estado: recupera código y precio y recalcula
//     venta y total con los recargos vigentes y la cantidad actual.
//   - Entre otros estados: solo cambia el estado.
export const camposCambioEstadoCarga = (item, nuevoEstado, recargosActivos = []) => {
  const eraSinCargo = item?.estadoCarga === ESTADO_SIN_CARGO;
  if (nuevoEstado === ESTADO_SIN_CARGO && !eraSinCargo) {
    return {
      estadoCarga: nuevoEstado,
      sinCargoOriginal: { codigo: item?.codigo ?? '', precio: Number(item?.precio) || 0 },
      codigo: CODIGO_SIN_OC,
      precio: 0,
      vecesCosto: 1,
      recargoEncontrado: true,
      venta: 0,
      totalItem: 0
    };
  }
  if (eraSinCargo && nuevoEstado !== ESTADO_SIN_CARGO) {
    const original = item?.sinCargoOriginal || {};
    const precio = Number(original.precio) || 0;
    return {
      estadoCarga: nuevoEstado,
      codigo: original.codigo ?? item?.codigo ?? '',
      precio,
      ...calcularCamposFinancieros(precio, item?.cantidad, recargosActivos),
      sinCargoOriginal: null
    };
  }
  return { estadoCarga: nuevoEstado };
};

// El contenido de un PAD es OPCIONAL al momento de crear el ítem: puede
// completarse después, en otra sesión. Esta función determina si un ítem
// PAD "padre" ya tiene al menos un ítem de contenido asociado.
export const tieneContenidoPad = (items, padPadreId) =>
  (items || []).some(it => it.padPadreId === padPadreId);

// Lista (sin duplicados) de los períodos {anio, mes} presentes entre los
// ítems de un bloque — usada por el candado de bloqueo para saber contra
// qué período(s) de Control Mensual hay que validar antes de permitir editar
// un bloque ya imputado.
export const obtenerPeriodosDeItems = (items) => {
  const mapa = new Map();
  (items || []).forEach(it => {
    if (!it.periodoAnio || !it.periodoMes) return;
    const clave = `${it.periodoAnio}__${it.periodoMes}`;
    if (!mapa.has(clave)) mapa.set(clave, { anio: it.periodoAnio, mes: it.periodoMes });
  });
  return [...mapa.values()];
};

// Si la tabla cabe con espacio de sobra (pantallas anchas), ese espacio se
// reparte entre las columnas de texto que más se cortan con "…", en estas
// proporciones; el scroll horizontal queda solo cuando realmente no cabe.
const REPARTO_EXTRA = { descriptorAuto: 0.4, referencia: 0.24, clase: 0.18, tipo: 0.18 };
export const anchosConExtra = (anchos, extra) => {
  if (!(extra > 0)) return anchos;
  const resultado = { ...anchos };
  Object.entries(REPARTO_EXTRA).forEach(([k, peso]) => { resultado[k] = (anchos[k] || 0) + Math.floor(extra * peso); });
  return resultado;
};
