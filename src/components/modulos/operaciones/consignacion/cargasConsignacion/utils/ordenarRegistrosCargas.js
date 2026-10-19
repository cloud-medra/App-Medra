// Orden de la tabla de Cargas (en el navegador, sobre lo ya leído; sin
// consultas extra):
//   1. Por carga: `fechaRegistro` de la más nueva a la más antigua (igual
//      que la consulta). Una carga masiva guarda todas sus filas con el
//      mismo `fechaRegistro`; un registro individual es su propia carga.
//   2. Dentro de una carga, las filas de una misma admisión (`gestionId`)
//      van juntas, y las admisiones en el orden en que se ingresaron: por
//      la menor `posicionCarga` de sus filas.
//   3. Dentro de una admisión, por `posicionCarga`.
// Cargas antiguas (sin `posicionCarga`): por admisión y luego por id, ya que
// el orden en que se pegaron no se guardó. Firestore desempataba por id del
// documento (aleatorio), por eso la misma admisión quedaba repartida.

// Timestamp de Firestore, Date o { seconds } -> milisegundos (0 si no hay).
export const milisDeFecha = (valor) => {
  if (!valor) return 0;
  if (typeof valor.toMillis === 'function') return valor.toMillis();
  if (valor instanceof Date) return valor.getTime();
  if (typeof valor.seconds === 'number') return valor.seconds * 1000 + Math.floor((valor.nanoseconds || 0) / 1e6);
  const n = new Date(valor).getTime();
  return Number.isNaN(n) ? 0 : n;
};

const posicion = (r) => (Number.isInteger(r.posicionCarga) ? r.posicionCarga : Infinity);
const compararTexto = (a, b) => String(a ?? '').localeCompare(String(b ?? ''), 'es', { numeric: true });

const ordenarCarga = (filas) => {
  if (filas.length < 2) return filas;
  const admisiones = new Map();
  filas.forEach((r) => {
    const clave = String(r.gestionId ?? '').trim() || `__sin-admision:${r.id}`;
    if (!admisiones.has(clave)) admisiones.set(clave, { clave, primera: Infinity, filas: [] });
    const grupo = admisiones.get(clave);
    grupo.filas.push(r);
    grupo.primera = Math.min(grupo.primera, posicion(r));
  });
  return [...admisiones.values()]
    .sort((a, b) => (a.primera !== b.primera ? a.primera - b.primera : compararTexto(a.clave, b.clave)))
    .flatMap((g) => g.filas.sort((a, b) => (posicion(a) !== posicion(b) ? posicion(a) - posicion(b) : compararTexto(a.id, b.id))));
};

// Copia ordenada (no modifica `registros`).
export const ordenarRegistrosCargas = (registros) => {
  const cargas = new Map();
  (registros || []).forEach((r) => {
    const t = milisDeFecha(r.fechaRegistro);
    if (!cargas.has(t)) cargas.set(t, []);
    cargas.get(t).push(r);
  });
  return [...cargas.entries()]
    .sort(([a], [b]) => b - a)
    .flatMap(([, filas]) => ordenarCarga(filas));
};
