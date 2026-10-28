// Fechas de los documentos de Laboratorio y Vacunatorio (fchEmis): se
// guardan SIEMPRE como texto 'AAAA-MM-DD', igual que <FchEmis> del XML del
// SII. Ese formato ordena bien como texto y es el que filtran las consultas
// por rango (Finanzas → Comparativo mensual) y las reglas de Firestore.
// El editor de Documentos recibidos llegó a grabar 'DD/MM/AAAA'; aFechaISO
// lee ese formato para mostrar y corregir esos documentos al editarlos.

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const DD_MM_AAAA = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

const existe = (anio, mes, dia) => {
  const f = new Date(Date.UTC(anio, mes - 1, dia));
  return f.getUTCFullYear() === anio && f.getUTCMonth() === mes - 1 && f.getUTCDate() === dia;
};
const iso = (anio, mes, dia) => `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;

/** true si es 'AAAA-MM-DD' y la fecha existe (rechaza 2026-02-30). */
export const esFechaISO = (texto) => {
  const m = typeof texto === 'string' ? texto.match(ISO) : null;
  return !!m && existe(Number(m[1]), Number(m[2]), Number(m[3]));
};

/**
 * 'AAAA-MM-DD' (con o sin hora) o 'DD/MM/AAAA' -> 'AAAA-MM-DD'.
 * '' si está vacío o no es una fecha válida en esos formatos.
 */
export const aFechaISO = (texto) => {
  const t = String(texto ?? '').trim();
  if (!t) return '';
  const soloFecha = t.split('T')[0];
  if (esFechaISO(soloFecha)) return soloFecha;
  const m = t.match(DD_MM_AAAA);
  if (!m) return '';
  const [dia, mes, anio] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return existe(anio, mes, dia) ? iso(anio, mes, dia) : '';
};
