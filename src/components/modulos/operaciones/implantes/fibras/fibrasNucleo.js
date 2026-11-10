// Fibras reutilizables de Implantes (fibras láser de 5 o 10 usos): reglas de
// negocio puras, sin Firestore. Las usan la pantalla Implantes → Fibras, el
// selector de Cargas y el guardado de la gestión (fibrasTransacciones.js).
//
// Modelo (ver firestore.rules, implantes_fibras):
//   implantes_fibras/{FIB-0001}   una por fibra física (id = código interno)
//     usosTotales      5 o 10
//     usosPrevios      usos consumidos antes del sistema (sin detalle); ocupan
//                      los números 1..usosPrevios
//     numerosOcupados  números de los usos VIGENTES registrados (y de las
//                      pérdidas antiguas de un número, si queda alguna)
//     numerosPerdidos  números que se perdieron de una vez al quebrarse o
//                      cortarse la fibra (todos los restantes); vacío si no hay
//     usosConsumidos   usosPrevios + numerosOcupados.length + numerosPerdidos.length
//     fechasUso        { '<número>': 'AAAA-MM-DD' } de cada uso o pérdida
//                      vigente: las reglas validan con él que el vencimiento
//                      corregido no quede antes de ningún uso (sin leer usos)
//     estado           ACTIVA | AGOTADA (VENCIDA se calcula al mostrar)
//     ultimoCambio     { tipo: ALTA|BAJA|FECHA, numero, usoId }: lo valida la
//                      regla del uso que se crea, anula o cambia de fecha en la
//                      misma escritura
//     ultimaCorreccion { motivo, logId } de la última corrección (auditada)
//     ubicacion        EN BODEGA | EN USO | AGOTADA (aparte de `estado`: no
//                      cambia el contador). Al agotarse sale de uso sola; si
//                      vuelve a quedar activa (uso anulado), queda EN BODEGA.
//     ubicacionDesde   { fecha, por: { uid, nombre } } del último cambio
//   implantes_fibras_control/enUso__{referencia}
//                    { referencia, fibraId | null, origen, actualizadoEl }: la
//                    única fibra EN USO de la referencia. Las reglas exigen que
//                    cada cambio de ubicación lo actualice en la misma
//                    escritura (así nunca hay dos EN USO de una referencia).
//     /usos/{usoId}    cada uso o pérdida (nunca se borra: se anula)
//     /logs/{id}       auditoría de la fibra
//
// Numeración: cada uso conserva para siempre el número con que se registró
// (es el que se ve en la línea de la gestión y en Detalle). Al anular uno, su
// número queda libre y lo toma el siguiente uso (el menor libre). Así nunca hay
// dos usos vigentes con el mismo número y no hay que reescribir las etiquetas
// guardadas en otras gestiones (algunas ya solicitadas o de períodos cerrados).

export const COL_FIBRAS = 'implantes_fibras';
export const COL_CONTROL_FIBRAS = 'implantes_fibras_control';
export const DOC_CONTADOR_FIBRAS = 'contador';
export const RUTA_FIBRAS = '/implantes/fibrasReutilizables';

export const USOS_PERMITIDOS = Object.freeze([5, 10]);
export const MAX_FIBRAS_POR_REGISTRO = 20;

export const ESTADO_FIBRA = Object.freeze({ ACTIVA: 'ACTIVA', AGOTADA: 'AGOTADA', VENCIDA: 'VENCIDA' });
export const UBICACION = Object.freeze({ EN_BODEGA: 'EN BODEGA', EN_USO: 'EN USO', AGOTADA: 'AGOTADA' });
export const TIPO_USO = Object.freeze({ USO: 'USO', PERDIDA: 'PERDIDA' });
export const ESTADO_USO = Object.freeze({ VIGENTE: 'VIGENTE', ANULADO: 'ANULADO' });
export const MOTIVO_ANULACION = Object.freeze({
  LINEA_ELIMINADA: 'LINEA_ELIMINADA',
  GESTION_ELIMINADA: 'GESTION_ELIMINADA',
  REFERENCIA_CAMBIADA: 'REFERENCIA_CAMBIADA',
  FIBRA_CAMBIADA: 'FIBRA_CAMBIADA',
  PERDIDA_ANULADA: 'PERDIDA_ANULADA',
  // Pérdidas antiguas de un número agrupadas en una pérdida nueva (migración).
  MIGRADA_A_PERDIDA_TOTAL: 'MIGRADA_A_PERDIDA_TOTAL',
});
export const TEXTO_MOTIVO_ANULACION = Object.freeze({
  LINEA_ELIMINADA: 'Línea eliminada de la gestión',
  GESTION_ELIMINADA: 'Gestión eliminada',
  REFERENCIA_CAMBIADA: 'Se cambió la referencia de la línea',
  FIBRA_CAMBIADA: 'Se eligió otra fibra en la línea',
  PERDIDA_ANULADA: 'Pérdida anulada',
  MIGRADA_A_PERDIDA_TOTAL: 'Agrupada en una pérdida (migración)',
});

// Error de negocio de las fibras: su mensaje se muestra tal cual y el detalle
// de la gestión queda abierto para corregir (ver guardarDesdeDetalle).
export class ErrorFibra extends Error {
  constructor(mensaje) {
    super(mensaje);
    this.name = 'ErrorFibra';
    this.esErrorFibra = true;
  }
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
export const esISO = (texto) => typeof texto === 'string' && ISO.test(texto);

export const normalizarLote = (lote) => String(lote ?? '').trim().toUpperCase();
export const normalizarReferencia = (referencia) => String(referencia ?? '').trim().toUpperCase();

export const codigoInterno = (n) => `FIB-${String(n).padStart(4, '0')}`;

// ¿El código maestro es una fibra reutilizable? (check en Códigos Maestros).
export const esCodigoFibra = (codigoMaestro) => codigoMaestro?.fibraReutilizable === true;

export const numerosPerdidosDe = (fibra) => fibra?.numerosPerdidos || [];
// Una fibra con pérdida queda inutilizable, aunque después se libere un número.
export const tienePerdida = (fibra) => numerosPerdidosDe(fibra).length > 0;
// Usos reales: previos + registrados (sin los perdidos).
export const usosRealizadosDe = (fibra) => (Number(fibra?.usosPrevios) || 0) + (fibra?.numerosOcupados || []).length;

export const usosConsumidosDe = (fibra) => usosRealizadosDe(fibra) + numerosPerdidosDe(fibra).length;

export const usosRestantes = (fibra) => (tienePerdida(fibra) ? 0 : Math.max(0, (Number(fibra?.usosTotales) || 0) - usosConsumidosDe(fibra)));

// --- Colores por usos (pantalla Fibras y panel de Inicio) -----------------------
// Hasta el primer límite, verde; hasta el segundo, naranjo; sobre él, rojo. Solo
// existen fibras de 5 y 10 usos (USOS_PERMITIDOS): otra cantidad no tiene color.
export const LIMITES_COLOR_USOS = Object.freeze({ 5: Object.freeze([2, 4]), 10: Object.freeze([5, 8]) });
export const COLOR_USOS = Object.freeze({ VERDE: 'verde', NARANJO: 'naranjo', ROJO: 'rojo' });
export const LEYENDA_COLOR_USOS = Object.freeze([
  { color: 'verde', texto: 'Verde: 0 a 2 usos (de 5) · 0 a 5 (de 10)' },
  { color: 'naranjo', texto: 'Naranjo: 3 a 4 usos (de 5) · 6 a 8 (de 10)' },
  { color: 'rojo', texto: 'Rojo: 5 usos (de 5) · 9 a 10 (de 10): gestionarla' },
]);
// Cuenta los usos consumidos (también los perdidos): una fibra con pérdida es roja.
export const colorUsos = (fibra) => {
  const limites = LIMITES_COLOR_USOS[Number(fibra?.usosTotales)];
  if (!limites) return null;
  if (tienePerdida(fibra)) return COLOR_USOS.ROJO;
  const n = usosConsumidosDe(fibra);
  if (n <= limites[0]) return COLOR_USOS.VERDE;
  return n <= limites[1] ? COLOR_USOS.NARANJO : COLOR_USOS.ROJO;
};
// "3/5", o "2/5 · 3 perdidos" con pérdida: los perdidos aparte de los usos reales.
export const textoUsos = (fibra) => {
  const total = Number(fibra?.usosTotales) || 0;
  const perdidos = numerosPerdidosDe(fibra).length;
  return perdidos ? `${usosRealizadosDe(fibra)}/${total} · ${perdidos} perdido${perdidos === 1 ? '' : 's'}` : `${usosConsumidosDe(fibra)}/${total}`;
};
// "3/5, 4/5 y 5/5".
export const textoNumeros = (numeros = [], total) => {
  const partes = numeros.map((n) => `${n}/${total}`);
  return partes.length > 1 ? `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}` : (partes[0] || '');
};

// Con pérdida, AGOTADA aunque después se libere un número (anular un uso de
// la fibra): sigue inutilizable hasta anular la pérdida. Lo exigen las reglas.
export const estadoGuardado = (usosConsumidos, usosTotales, conPerdida = false) =>
  conPerdida || usosConsumidos >= usosTotales ? ESTADO_FIBRA.AGOTADA : ESTADO_FIBRA.ACTIVA;

// Estado que se muestra: AGOTADA manda (también con pérdida); si no, VENCIDA con el vencimiento ya
// pasado respecto de hoy (AAAA-MM-DD en Chile).
export const estadoVisible = (fibra, hoyISO) => {
  if (usosRestantes(fibra) === 0) return ESTADO_FIBRA.AGOTADA;
  if (esISO(fibra?.vencimiento) && esISO(hoyISO) && fibra.vencimiento < hoyISO) return ESTADO_FIBRA.VENCIDA;
  return ESTADO_FIBRA.ACTIVA;
};

// Números libres entre usosPrevios+1 y usosTotales (sin ocupados ni perdidos).
export const numerosLibres = (fibra) => {
  const ocupados = new Set([...(fibra?.numerosOcupados || []), ...numerosPerdidosDe(fibra)]);
  const libres = [];
  for (let n = (Number(fibra?.usosPrevios) || 0) + 1; n <= (Number(fibra?.usosTotales) || 0); n++) {
    if (!ocupados.has(n)) libres.push(n);
  }
  return libres;
};

// Menor número libre entre usosPrevios+1 y usosTotales; null si no queda o si
// la fibra tiene una pérdida (no se usa más).
export const siguienteNumeroUso = (fibra) => {
  if (tienePerdida(fibra)) return null;
  const ocupados = new Set(fibra?.numerosOcupados || []);
  for (let n = (Number(fibra?.usosPrevios) || 0) + 1; n <= (Number(fibra?.usosTotales) || 0); n++) {
    if (!ocupados.has(n)) return n;
  }
  return null;
};

// Cómo se nombra una fibra en textos (avisos, confirmaciones, errores): la
// referencia es lo principal y el código interno va entre paréntesis, porque
// distingue fibras de la misma referencia (ej. "FL-272 (FIB-0005)"). En
// pantalla, con estilos, ver NombreFibra.jsx.
export const textoFibra = (fibra) => {
  const codigo = fibra?.codigoInterno || fibra?.id || '';
  const referencia = fibra?.referencia || '';
  if (referencia && codigo) return `${referencia} (${codigo})`;
  return referencia || codigo || 'Fibra';
};

export const etiquetaFibra = (fibra) => `${textoFibra(fibra)} · lote ${fibra?.lote || 'sin lote'}`;

// Motivo por el que no se puede registrar un USO con esta fibra en una
// cirugía de fecha `fechaCirugia` (AAAA-MM-DD); null si se puede.
export const motivoNoUsable = (fibra, fechaCirugia) => {
  if (!fibra) return 'La fibra ya no existe.';
  if (tienePerdida(fibra)) return `La fibra ${etiquetaFibra(fibra)} tiene una pérdida registrada: no se puede usar.`;
  if (usosRestantes(fibra) === 0 || siguienteNumeroUso(fibra) === null) {
    return `La fibra ${etiquetaFibra(fibra)} está agotada.`;
  }
  if (!esISO(fechaCirugia)) return 'La gestión no tiene una fecha de cirugía válida.';
  if (!esISO(fibra.vencimiento)) return `La fibra ${etiquetaFibra(fibra)} no tiene un vencimiento válido.`;
  if (fibra.vencimiento < fechaCirugia) {
    return `La fibra ${etiquetaFibra(fibra)} vence el ${fibra.vencimiento}, antes de la cirugía (${fechaCirugia}).`;
  }
  return null;
};

// Pérdida: solo exige usos restantes (no importa el vencimiento). Se pierden
// todos de una vez.
export const motivoNoPerdible = (fibra) => {
  if (!fibra) return 'La fibra ya no existe.';
  if (tienePerdida(fibra)) return `La fibra ${etiquetaFibra(fibra)} ya tiene una pérdida registrada.`;
  if (numerosLibres(fibra).length === 0) return `La fibra ${etiquetaFibra(fibra)} está agotada: no le quedan usos que perder.`;
  return null;
};

export const MOTIVOS_PERDIDA = Object.freeze(['Quebrada', 'Cortada', 'Dañada', 'Otro']);

// --- Ubicación --------------------------------------------------------------

export const ubicacionDe = (fibra) => fibra?.ubicacion || UBICACION.EN_BODEGA;

// Documento de control con la fibra EN USO de una referencia.
export const idControlEnUso = (referencia) => `enUso__${normalizarReferencia(referencia).replace(/\//g, '_')}`;

// Ubicación tras un cambio de estado: al agotarse sale de uso (AGOTADA); si
// una agotada vuelve a quedar activa, queda EN BODEGA.
export const ubicacionTrasEstado = (ubicacion, estado) => {
  if (estado === ESTADO_FIBRA.AGOTADA) return UBICACION.AGOTADA;
  return ubicacion === UBICACION.AGOTADA ? UBICACION.EN_BODEGA : ubicacion;
};

// Motivo por el que no se puede poner EN USO (null si se puede): agotada o
// vencida respecto de hoy (AAAA-MM-DD en Chile).
export const motivoNoPonerEnUso = (fibra, hoyISO) => {
  if (!fibra) return 'La fibra ya no existe.';
  if (tienePerdida(fibra)) return `La fibra ${etiquetaFibra(fibra)} tiene una pérdida registrada.`;
  if (usosRestantes(fibra) === 0) return `La fibra ${etiquetaFibra(fibra)} está agotada.`;
  if (esISO(hoyISO) && fibra.vencimiento < hoyISO) return `La fibra ${etiquetaFibra(fibra)} está vencida (${fibra.vencimiento}).`;
  if (ubicacionDe(fibra) === UBICACION.EN_USO) return `La fibra ${etiquetaFibra(fibra)} ya está en uso.`;
  return null;
};

// Siguiente fibra de la referencia para poner en uso: en bodega, usable hoy,
// la de vencimiento más próximo. null si no hay.
export const siguienteEnBodega = (fibras = [], referencia, hoyISO, excluirId) =>
  fibras
    .filter((f) => f.id !== excluirId && normalizarReferencia(f.referencia) === normalizarReferencia(referencia)
      && ubicacionDe(f) === UBICACION.EN_BODEGA && motivoNoPonerEnUso(f, hoyISO) === null)
    .sort((a, b) => (a.vencimiento || '').localeCompare(b.vencimiento || '') || (a.codigoInterno || '').localeCompare(b.codigoInterno || ''))[0] || null;

// Campos de la fibra al ocupar un número (alta, con la fecha del uso),
// liberarlo (baja) o cambiar la fecha de un uso vigente (la gestión cambió de
// fecha). `ubicacionBase` (alta): EN USO si se pone en uso en esta misma
// escritura (Cargas, fibra elegida de bodega).
export const fibraConAlta = (fibra, numero, usoId, fecha, ubicacionBase = ubicacionDe(fibra)) => {
  const numerosOcupados = [...(fibra.numerosOcupados || []), numero].sort((a, b) => a - b);
  const usosConsumidos = (Number(fibra.usosPrevios) || 0) + numerosOcupados.length + numerosPerdidosDe(fibra).length;
  const estado = estadoGuardado(usosConsumidos, fibra.usosTotales);
  return {
    numerosOcupados,
    usosConsumidos,
    fechasUso: { ...(fibra.fechasUso || {}), [String(numero)]: fecha },
    estado,
    ubicacion: ubicacionTrasEstado(ubicacionBase, estado),
    ultimoCambio: { tipo: 'ALTA', numero, usoId },
  };
};

export const fibraConBaja = (fibra, numero, usoId) => {
  const numerosOcupados = (fibra.numerosOcupados || []).filter((n) => n !== numero);
  const usosConsumidos = (Number(fibra.usosPrevios) || 0) + numerosOcupados.length + numerosPerdidosDe(fibra).length;
  const fechasUso = { ...(fibra.fechasUso || {}) };
  delete fechasUso[String(numero)];
  const estado = estadoGuardado(usosConsumidos, fibra.usosTotales, tienePerdida(fibra));
  return {
    numerosOcupados,
    usosConsumidos,
    fechasUso,
    estado,
    ubicacion: ubicacionTrasEstado(ubicacionDe(fibra), estado),
    ultimoCambio: { tipo: 'BAJA', numero, usoId },
  };
};

// Pérdida: todos los números libres pasan a perdidos y la fibra queda agotada
// (sale de uso). Su anulación los libera y la fibra vuelve a quedar activa, en
// bodega (como cualquier agotada que recupera usos).
export const fibraConPerdida = (fibra, usoId) => {
  const numerosPerdidos = numerosLibres(fibra);
  const usosConsumidos = usosRealizadosDe(fibra) + numerosPerdidos.length;
  const estado = estadoGuardado(usosConsumidos, fibra.usosTotales, true);
  return { numerosPerdidos, usosConsumidos, estado, ubicacion: ubicacionTrasEstado(ubicacionDe(fibra), estado), ultimoCambio: { tipo: 'PERDIDA', usoId } };
};

export const fibraSinPerdida = (fibra, usoId) => {
  const usosConsumidos = usosRealizadosDe(fibra);
  const estado = estadoGuardado(usosConsumidos, fibra.usosTotales);
  return { numerosPerdidos: [], usosConsumidos, estado, ubicacion: ubicacionTrasEstado(ubicacionDe(fibra), estado), ultimoCambio: { tipo: 'BAJA_PERDIDA', usoId } };
};

export const fibraConFecha = (fibra, numero, usoId, fecha) => ({
  fechasUso: { ...(fibra.fechasUso || {}), [String(numero)]: fecha },
  ultimoCambio: { tipo: 'FECHA', numero, usoId },
});

// Fecha más tardía entre los usos y pérdidas vigentes ('' si no hay).
export const fechaUltimoUsoVigente = (fibra) =>
  Object.values(fibra?.fechasUso || {}).reduce((max, f) => (f > max ? f : max), '');

// Aviso tras registrar una pérdida.
export const textoPerdidaRegistrada = ({ referencia, codigoInterno, numerosPerdidos = [], usosRealizados, usosTotales }) =>
  `Fibra ${textoFibra({ referencia, codigoInterno })}: pérdida registrada con ${usosRealizados}/${usosTotales} usos realizados. Se perdieron ${numerosPerdidos.length} (${textoNumeros(numerosPerdidos, usosTotales)}). La fibra quedó inutilizable.`;

// Aviso tras registrar un uso o pérdida.
export const textoUsoRegistrado = ({ referencia, lote, codigoInterno, numeroUso, usosTotales, restantes, tipo }) => {
  const que = tipo === TIPO_USO.PERDIDA ? 'pérdida registrada como uso' : 'uso';
  const nombre = referencia || codigoInterno ? `${textoFibra({ referencia, codigoInterno })}, lote ${lote}` : `lote ${lote}`;
  const base = `Fibra ${nombre}: ${que} ${numeroUso}/${usosTotales}`;
  return restantes === 0 ? `${base}. Era el último uso: la fibra quedó AGOTADA.` : `${base}, quedan ${restantes}.`;
};

// --- Validación del formulario de la pantalla Fibras ------------------------

export const validarNuevaFibra = ({ referencia, lote, vencimiento, usosTotales, usosPrevios, cantidad }) => {
  const errores = {};
  if (!normalizarReferencia(referencia)) errores.referencia = 'Elige la referencia';
  if (!normalizarLote(lote)) errores.lote = 'Ingresa el lote';
  if (!esISO(vencimiento)) errores.vencimiento = 'Ingresa el vencimiento';
  if (!USOS_PERMITIDOS.includes(Number(usosTotales))) errores.usosTotales = 'Elige 5 o 10 usos';
  const previos = Number(usosPrevios);
  if (!Number.isInteger(previos) || previos < 0) errores.usosPrevios = 'Número entero, 0 o más';
  else if (previos >= Number(usosTotales)) errores.usosPrevios = 'Debe quedar al menos un uso (si ya está agotada, no la registres)';
  const n = Number(cantidad);
  if (!Number.isInteger(n) || n < 1 || n > MAX_FIBRAS_POR_REGISTRO) errores.cantidad = `Entre 1 y ${MAX_FIBRAS_POR_REGISTRO}`;
  return errores;
};

// Edición: el lote solo sin usos registrados en el sistema; el vencimiento,
// sin quedar antes de la fecha de ningún uso o pérdida vigente; los usos
// totales y los previos, sin que los consumidos pasen del total ni choquen con
// un número ya ocupado (los previos ocupan 1..usosPrevios). Devuelve
// { errores, cambios } (cambios: solo lo que cambia; con estado si cambia).
export const validarEdicionFibra = (fibra, { lote, vencimiento, usosTotales, usosPrevios = fibra.usosPrevios }) => {
  const errores = {};
  const cambios = {};
  const sinUsos = (fibra.numerosOcupados || []).length === 0;
  if (tienePerdida(fibra) && (Number(usosTotales) !== Number(fibra.usosTotales) || Number(usosPrevios) !== (Number(fibra.usosPrevios) || 0))) {
    errores.usosTotales = 'La fibra tiene una pérdida registrada: anúlala antes de corregir sus usos';
  }
  const loteN = normalizarLote(lote);
  if (loteN !== fibra.lote) {
    if (!sinUsos) errores.lote = 'No se puede cambiar: la fibra ya tiene usos registrados';
    else if (!loteN) errores.lote = 'Ingresa el lote';
    else cambios.lote = loteN;
  }
  if (vencimiento !== fibra.vencimiento) {
    const ultimo = fechaUltimoUsoVigente(fibra);
    if (!esISO(vencimiento)) errores.vencimiento = 'Ingresa el vencimiento';
    else if (ultimo && vencimiento < ultimo) errores.vencimiento = `No puede quedar antes de un uso vigente (${ultimo})`;
    else cambios.vencimiento = vencimiento;
  }
  const ocupados = fibra.numerosOcupados || [];
  const previos = Number(usosPrevios);
  if (previos !== (Number(fibra.usosPrevios) || 0)) {
    const menorOcupado = Math.min(...ocupados);
    if (!Number.isInteger(previos) || previos < 0) errores.usosPrevios = 'Número entero, 0 o más';
    else if (ocupados.length > 0 && previos >= menorOcupado) errores.usosPrevios = `Ya hay un uso registrado con el número ${menorOcupado}: los previos no pueden pasar de ${menorOcupado - 1}`;
    else cambios.usosPrevios = previos;
  }
  const previosFinal = cambios.usosPrevios ?? (Number(fibra.usosPrevios) || 0);
  const consumidos = previosFinal + ocupados.length + numerosPerdidosDe(fibra).length;
  const total = Number(usosTotales);
  if (total !== Number(fibra.usosTotales)) {
    const maxOcupado = Math.max(previosFinal, ...ocupados);
    if (!USOS_PERMITIDOS.includes(total)) errores.usosTotales = 'Elige 5 o 10 usos';
    else if (total < consumidos) errores.usosTotales = `No puede ser menor que los usos consumidos (${consumidos})`;
    else if (total < maxOcupado) errores.usosTotales = `Ya hay un uso con el número ${maxOcupado}`;
    else cambios.usosTotales = total;
  } else if ('usosPrevios' in cambios && consumidos > total) {
    errores.usosPrevios = `Los usos consumidos (${consumidos}) pasarían del total (${total})`;
    delete cambios.usosPrevios;
  }
  if ('usosPrevios' in cambios) cambios.usosConsumidos = consumidos;
  if ('usosPrevios' in cambios || 'usosTotales' in cambios) {
    const estado = estadoGuardado(consumidos, cambios.usosTotales ?? Number(fibra.usosTotales), tienePerdida(fibra));
    if (estado !== fibra.estado) cambios.estado = estado;
  }
  return { errores, cambios };
};

// --- Plan de cambios al guardar una gestión ---------------------------------

// Datos de la gestión que se copian en el uso (foto al registrarlo).
export const datosGestionDeUso = ({ gestionId, paciente, medico, empresa, fecha, gestionRefPath }) => ({
  gestionId: String(gestionId ?? ''),
  paciente: String(paciente ?? ''),
  medico: String(medico ?? ''),
  empresa: String(empresa ?? ''),
  fecha: String(fecha ?? ''),
  gestionRefPath: String(gestionRefPath ?? ''),
});

const conUso = (it) => Boolean(it?.fibra?.usoId);

// En el formulario, una línea con fibra elegida trae `fibra` sin usoId. Antes
// de guardar se copian las cotizaciones y esas líneas reciben su usoId (el
// número se completa dentro de la transacción, sobre la copia): el estado de
// React nunca se modifica. Devuelve { cotizaciones, nuevas: [línea copiada] }.
export const prepararFibrasNuevas = (cotizaciones = [], generarUsoId) => {
  const nuevas = [];
  const copia = cotizaciones.map((cot, i) => (i !== 0 ? cot : {
    ...cot,
    items: (cot.items || []).map((it) => {
      if (!it?.fibra?.id || it.fibra.usoId) return it;
      const nueva = { ...it, fibra: { ...it.fibra, usoId: generarUsoId(it.fibra.id) } };
      nuevas.push(nueva);
      return nueva;
    }),
  }));
  return { cotizaciones: copia, nuevas };
};

/**
 * Qué hacer con las fibras al guardar un bloque (documento) de la gestión.
 *   itemsAntes / itemsDespues: cotizaciones[0].items guardados y a guardar
 *   (los nuevos ya pasados por prepararFibrasNuevas).
 *   cambiaGestion: true si cambió algún dato que se copia en el uso (ID,
 *   paciente, médico, empresa, fecha o ruta del documento).
 * Devuelve { registrar: [item], anular: [{ item, motivo }], actualizar: [item] }.
 */
export const planFibrasBloque = ({ itemsAntes = [], itemsDespues = [], cambiaGestion = false }) => {
  if (itemsDespues.some((it) => it?.fibra?.id && !it.fibra.usoId)) {
    throw new ErrorFibra('Hay una línea de fibra sin preparar para guardar.');
  }
  const despuesPorId = new Map(itemsDespues.map((it) => [it.id, it]));
  const usosAntes = new Set(itemsAntes.filter(conUso).map((it) => it.fibra.usoId));
  const plan = { registrar: [], anular: [], actualizar: [] };
  itemsAntes.filter(conUso).forEach((antes) => {
    const despues = despuesPorId.get(antes.id);
    if (!despues) {
      plan.anular.push({ item: antes, motivo: MOTIVO_ANULACION.LINEA_ELIMINADA });
    } else if (despues.fibra?.usoId !== antes.fibra.usoId) {
      plan.anular.push({ item: antes, motivo: despues.fibra?.id ? MOTIVO_ANULACION.FIBRA_CAMBIADA : MOTIVO_ANULACION.REFERENCIA_CAMBIADA });
    } else if (cambiaGestion) {
      plan.actualizar.push(despues);
    }
  });
  itemsDespues.filter((it) => conUso(it) && !usosAntes.has(it.fibra.usoId)).forEach((it) => plan.registrar.push(it));
  return plan;
};

// Operaciones de fibra (ver fibrasTransacciones.js) de un plan, con los datos
// de la gestión que se copian en el uso.
export const operacionesDePlan = (plan, datosGestion) => [
  ...plan.anular.map(({ item, motivo }) => ({ tipo: 'anular', fibraId: item.fibra.id, usoId: item.fibra.usoId, motivo })),
  ...plan.registrar.map((item) => ({
    tipo: 'registrar', fibraId: item.fibra.id, usoId: item.fibra.usoId, item, datosGestion,
    // Fibra elegida de bodega en Cargas: pasa a EN USO en este guardado y la
    // que estaba en uso (`devolver`) vuelve a bodega.
    ...(item.fibra.ponerEnUso ? { ponerEnUso: true, devolver: item.fibra.devolver || null } : {}),
  })),
  ...plan.actualizar.map((item) => ({ tipo: 'actualizar', fibraId: item.fibra.id, usoId: item.fibra.usoId, datosGestion })),
];

// Al eliminar la gestión: se anulan todos sus usos.
export const planFibrasEliminacion = (items = []) => ({
  registrar: [],
  anular: items.filter(conUso).map((item) => ({ item, motivo: MOTIVO_ANULACION.GESTION_ELIMINADA })),
  actualizar: [],
});

// Lecturas que hacen las reglas de Firestore por operación de fibra (get,
// exists y getAfter de documentos distintos; las repetidas del mismo
// documento se cobran una vez por transacción). Firestore permite 20 por
// transacción: 2 son del perfil del usuario (getUsuario). Ver firestore.rules.
// Registrar: 4 (uso nuevo y fibra antes/después); 6 si la fibra cambia de
// ubicación (`cambiaUbicacion`: control "en uso" y la fibra que vuelve a
// bodega). Se deja un margen de 4: hasta 3 líneas de fibra por guardado, o 2
// si alguna cambia de ubicación.
export const MAX_ACCESOS_REGLAS = 20;
export const LIMITE_ACCESOS_REGLAS = 16;
const ACCESOS_PERFIL = 2;
const accesosDe = (op) => (op.tipo === 'registrar' ? (op.cambiaUbicacion ? 6 : 4) : op.tipo === 'perder' ? 6 : op.tipo === 'anular' || op.tipo === 'actualizar' ? 3 : 0);
export const accesosReglas = (operaciones) => ACCESOS_PERFIL + operaciones.reduce((n, op) => n + accesosDe(op), 0);
export const validarLecturasReglas = (operaciones) => (accesosReglas(operaciones) > LIMITE_ACCESOS_REGLAS
  ? 'Hay demasiados cambios de fibras en un solo guardado: guarda en partes (hasta 3 líneas de fibra, o 2 si alguna pone en uso una fibra de bodega o agota la fibra en uso).'
  : null);

// Una misma fibra no puede tener dos altas o bajas en una sola escritura (la
// regla valida un único `ultimoCambio` por fibra). Tampoco se pueden pasar las
// lecturas que permiten las reglas en una transacción. Devuelve el mensaje de
// error o null.
export const validarUnCambioPorFibra = (operaciones) => {
  // Antes de leer: solo se sabe qué líneas eligen una fibra de bodega (la
  // transacción vuelve a validar con lo leído, ver aplicarOperacionesFibra).
  const lecturas = validarLecturasReglas(operaciones.map((op) => ({ ...op, cambiaUbicacion: Boolean(op.ponerEnUso) })));
  if (lecturas) return lecturas;
  const vistas = new Map();
  for (const op of operaciones) {
    if (op.tipo === 'actualizar') continue;
    const previa = vistas.get(op.fibraId);
    if (previa) {
      return previa === 'anular' && op.tipo === 'registrar'
        ? `La fibra ${op.fibraId} tiene una línea eliminada y otra nueva en este guardado: guarda primero la eliminación y luego agrega la línea.`
        : `La fibra ${op.fibraId} aparece en más de una línea de este guardado.`;
    }
    vistas.set(op.fibraId, op.tipo);
  }
  return null;
};

// Fibras ya usadas (o elegidas sin guardar) en los bloques de la admisión: no
// se ofrecen de nuevo en el selector (una fibra, un uso por cirugía).
export const fibrasUsadasEnBloques = (bloques = []) => {
  const ids = new Set();
  bloques.forEach((b) => (b?.cotizaciones?.[0]?.items || []).forEach((it) => { if (it?.fibra?.id) ids.add(it.fibra.id); }));
  return ids;
};

// Fibras elegibles para una cirugía, ordenadas por vencimiento (la que vence
// primero arriba) y luego por código.
export const fibrasElegibles = (fibras = [], fechaCirugia, excluir = new Set()) =>
  fibras
    .filter((f) => !excluir.has(f.id) && motivoNoUsable(f, fechaCirugia) === null)
    .sort((a, b) => (a.vencimiento || '').localeCompare(b.vencimiento || '') || (a.codigoInterno || '').localeCompare(b.codigoInterno || ''));

// Opciones del selector de Cargas: solo las EN USO elegibles; si ninguna
// sirve para esta cirugía, las de bodega elegibles (al elegir una se pone en
// uso en el mismo guardado y `enUsoActual` vuelve a bodega).
export const opcionesSelectorFibra = (fibras = [], fechaCirugia, excluir = new Set()) => {
  const elegibles = fibrasElegibles(fibras, fechaCirugia, excluir);
  const enUso = elegibles.filter((f) => ubicacionDe(f) === UBICACION.EN_USO);
  const bodega = elegibles.filter((f) => ubicacionDe(f) === UBICACION.EN_BODEGA);
  const enUsoActual = fibras.find((f) => ubicacionDe(f) === UBICACION.EN_USO) || null;
  return enUso.length > 0
    ? { opciones: enUso, desdeBodega: false, enUsoActual }
    : { opciones: bodega, desdeBodega: true, enUsoActual };
};

// --- Detalle -----------------------------------------------------------------

// Usos y pérdidas en orden: por número; con el mismo número (uno anulado y el
// que lo reemplazó), primero el más antiguo.
const ms = (t) => (t?.toMillis ? t.toMillis() : t instanceof Date ? t.getTime() : Number(t) || 0);
export const ordenarUsos = (usos = []) =>
  [...usos].sort((a, b) => (a.numeroUso - b.numeroUso) || (ms(a.registradoEl) - ms(b.registradoEl)));

// --- Migración de pérdidas antiguas ----------------------------------------------
//
// Antes, cada pérdida ocupaba un solo número (un registro por número). Si las
// pérdidas vigentes de una fibra son exactamente sus últimos números (los que
// quedarían libres sin ellas), se agrupan en una pérdida nueva con
// numerosPerdidos, conservando fecha, usuario, motivo y observación originales.
// Los registros antiguos no se borran: quedan anulados con el motivo
// MIGRADA_A_PERDIDA_TOTAL y la referencia a la nueva. Devuelve
// { aplica: false, motivo } o { aplica: true, numeros, cambiosFibra, perdida, anulaciones, log }.
export const planMigracionPerdidas = (fibra, usos = [], { nuevoUsoId, ahora, por }) => {
  const antiguas = usos.filter((u) => u.tipo === TIPO_USO.PERDIDA && u.estado === ESTADO_USO.VIGENTE && !u.numerosPerdidos)
    .sort((a, b) => a.numeroUso - b.numeroUso);
  if (!antiguas.length) return { aplica: false, motivo: 'Sin pérdidas antiguas vigentes.' };
  if (tienePerdida(fibra)) return { aplica: false, motivo: 'Ya tiene una pérdida con el formato nuevo.' };
  const numeros = antiguas.map((u) => u.numeroUso);
  const ocupados = (fibra.numerosOcupados || []).filter((n) => !numeros.includes(n));
  const sinAntiguas = { ...fibra, numerosOcupados: ocupados };
  const libres = numerosLibres(sinAntiguas);
  // Deben ser los números libres y estar después de todos los usos reales
  // (una pérdida con usos posteriores no es una pérdida de la fibra).
  if (libres.join(',') !== numeros.join(',') || ocupados.some((n) => n > numeros[0])) {
    return { aplica: false, motivo: `Sus pérdidas (${numeros.join(', ')}) no son sus últimos usos (${libres.join(', ') || 'ninguno'}): se dejan como están.` };
  }
  const primera = antiguas[0];
  const unicos = (campo) => [...new Set(antiguas.map((u) => u[campo]).filter(Boolean))];
  const fechasUso = { ...(fibra.fechasUso || {}) };
  numeros.forEach((n) => delete fechasUso[String(n)]);
  return {
    aplica: true,
    numeros,
    cambiosFibra: { numerosOcupados: ocupados, fechasUso, numerosPerdidos: numeros, usosConsumidos: usosConsumidosDe({ ...sinAntiguas, numerosPerdidos: numeros }), ultimoCambio: { tipo: 'PERDIDA', usoId: nuevoUsoId }, actualizadoEl: ahora },
    perdida: {
      tipo: TIPO_USO.PERDIDA, estado: ESTADO_USO.VIGENTE, numerosPerdidos: numeros, numeroUso: numeros[0], usosTotales: fibra.usosTotales,
      usosRealizados: usosRealizadosDe(sinAntiguas), fibraId: fibra.id,
      fecha: primera.fecha, motivo: unicos('motivo').join(' / '), observacion: unicos('observacion').join(' / '),
      registradoEl: primera.registradoEl, registradoPor: primera.registradoPor,
      migracion: { migradoEl: ahora, por, desde: antiguas.map((u) => ({ usoId: u.id, numeroUso: u.numeroUso, fecha: u.fecha, motivo: u.motivo || '', registradoEl: u.registradoEl || null, registradoPor: u.registradoPor || null })) },
    },
    anulaciones: antiguas.map((u) => ({ usoId: u.id, cambios: { estado: ESTADO_USO.ANULADO, motivoAnulacion: MOTIVO_ANULACION.MIGRADA_A_PERDIDA_TOTAL, detalleAnulacion: `Agrupada en la pérdida ${nuevoUsoId}`, anuladoEl: ahora, anuladoPor: por, migradaA: nuevoUsoId } })),
    log: { accion: 'PERDIDA_MIGRADA', detalles: { de: antiguas.map((u) => u.id), a: nuevoUsoId, numerosPerdidos: numeros, motivo: unicos('motivo').join(' / ') }, usuario: por.nombre, uid: por.uid, timestamp: ahora },
  };
};
