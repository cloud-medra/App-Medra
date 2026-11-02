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
