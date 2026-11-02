// Consulta de Gestiones (Implantes y Hemodinamia) por mes.
//
// Antes la pantalla escuchaba solo las 150 gestiones más recientes y armaba
// el filtro de meses con lo cargado: cuando octubre y noviembre pasaron de
// 150, septiembre desapareció de la tabla y del selector. Ahora, con año y
// mes elegidos, se escucha el mes completo por rango de ruta:
// '{coleccion}/{anio}/mes/{mes}' a '{coleccion}/{anio}/mes/{mes}~' (el '~'
// ordena después de cualquier dígito o letra). Usa el orden por __name__,
// que no necesita índice.
//
// El rango compara el segmento del mes como texto: con '1' traería también
// '10', '11' y '12'. Por eso el mes se normaliza siempre a dos dígitos
// ('01'..'12', como lo escribe getDetallesRef desde la fecha YYYY-MM-DD) y,
// además, se descartan en el cliente los documentos cuyo segmento no sea
// exactamente ese mes.

// Mes '1'..'12' o '01'..'12' (texto o número) -> '01'..'12'; null si no es válido.
export const normalizarMesRuta = (mes) => {
  const texto = String(mes ?? '').trim();
  if (!/^\d{1,2}$/.test(texto)) return null;
  const n = Number(texto);
  return n >= 1 && n <= 12 ? String(n).padStart(2, '0') : null;
};

// Año de 4 dígitos -> texto; null si no es válido.
export const normalizarAnioRuta = (anio) => {
  const texto = String(anio ?? '').trim();
  return /^\d{4}$/.test(texto) ? texto : null;
};

// { anio, mes } listo para consultar, o null si falta alguno o no es válido
// (en ese caso la pantalla usa la ventana de las más recientes).
export const periodoConsultaGestiones = ({ anio, mes } = {}) => {
  const a = normalizarAnioRuta(anio);
  const m = normalizarMesRuta(mes);
  return a && m ? { anio: a, mes: m } : null;
};

// Límites de documentId() para el mes (rutas de documento de 4 segmentos,
// válidas en un collectionGroup).
export const rangoRutaMesGestiones = (coleccion, { anio, mes }) => ({
  desde: `${coleccion}/${anio}/mes/${mes}`,
  hasta: `${coleccion}/${anio}/mes/${mes}~`
});

// La ruta es exactamente de ese año y mes (no de un segmento parecido).
export const esRutaDelMes = (ruta, coleccion, { anio, mes }) => {
  const partes = String(ruta || '').split('/');
  return partes[0] === coleccion && partes[1] === anio && partes[2] === 'mes' && partes[3] === mes;
};

// --- Años y meses con gestiones (usePeriodosConDatos.js) --------------------
// Los documentos de año y mes no existen (las gestiones se guardan directo en
// .../detalles), así que no se pueden listar: se cuentan por rango de ruta.

// Año de respaldo si no se puede leer la gestión más antigua.
export const ANIO_RESPALDO_GESTIONES = 2026;
export const MESES_DEL_ANIO = Object.freeze(Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')));

// Rango de la gestión más antigua: desde el año 2000, para que una ruta de
// respaldo '0000' (gestión sin fecha, ver getDetallesRef) no arrastre el
// primer año a cero.
export const rangoRutaGestionesReales = (coleccion) => ({ desde: `${coleccion}/2000`, hasta: `${coleccion}/9999` });

// Límites de documentId() para un año completo.
export const rangoRutaAnioGestiones = (coleccion, anio) => ({ desde: `${coleccion}/${anio}`, hasta: `${coleccion}/${anio}~` });

// Año (número) de la ruta de una gestión de esa colección, o null.
export const anioDeRutaGestion = (ruta, coleccion) => {
  const [col, anio] = String(ruta || '').split('/');
  return col === coleccion && /^\d{4}$/.test(anio || '') ? Number(anio) : null;
};

// Años a contar: del de la gestión más antigua (o el de respaldo) hasta el
// próximo al actual (agendas de enero cargadas en diciembre).
export const aniosAContar = (primerAnio, anioActual) => {
  const desde = Number.isInteger(primerAnio) ? primerAnio : ANIO_RESPALDO_GESTIONES;
  const hasta = Math.max(anioActual + 1, desde);
  return Array.from({ length: hasta - desde + 1 }, (_, i) => String(desde + i));
};

// Año con gestiones más cercano al actual: el actual; si no, el más reciente
// anterior; si no, el primero posterior. null si no hay ninguno.
export const anioMasRecienteConDatos = (conteoAnios, anioActual) => {
  const conDatos = Object.entries(conteoAnios || {}).filter(([, n]) => n > 0).map(([a]) => Number(a));
  if (conDatos.includes(anioActual)) return anioActual;
  const anteriores = conDatos.filter((a) => a < anioActual);
  if (anteriores.length) return Math.max(...anteriores);
  const posteriores = conDatos.filter((a) => a > anioActual);
  return posteriores.length ? Math.min(...posteriores) : null;
};

// Mes con gestiones más cercano a `mesReferencia` ('01'..'12'): ese mismo; si
// no, el más reciente anterior; si no, el primero posterior. null si ninguno.
// Para un año pasado se usa '12' (el último con datos); para uno futuro, '00'.
export const mesMasRecienteConDatos = (conteoMeses, mesReferencia) => {
  const conDatos = MESES_DEL_ANIO.filter((m) => (conteoMeses?.[m] || 0) > 0);
  if (conDatos.includes(mesReferencia)) return mesReferencia;
  const anteriores = conDatos.filter((m) => m < mesReferencia);
  if (anteriores.length) return anteriores[anteriores.length - 1];
  return conDatos.find((m) => m > mesReferencia) || null;
};
