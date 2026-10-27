// Bodymap (Implantes → Gestiones): zonas del cuerpo por descripción.
//
// Lo usan la Cloud Function que mantiene el Maestro "Zonas por diagnóstico"
// (functions/bodymap), el script inicial y la pantalla (Maestro y Bodymap),
// así ambos normalizan y sugieren exactamente igual. Sin dependencias.

// 20 zonas. `lateral`: tiene lado derecho e izquierdo separados.
export const ZONAS = Object.freeze([
  { id: 'cabeza', nombre: 'Cabeza', lateral: false },
  { id: 'cara', nombre: 'Cara', lateral: false },
  { id: 'columna_cervical', nombre: 'Cuello / columna cervical', lateral: false },
  { id: 'hombro', nombre: 'Hombro', lateral: true },
  { id: 'brazo', nombre: 'Brazo', lateral: true },
  { id: 'codo', nombre: 'Codo', lateral: true },
  { id: 'antebrazo', nombre: 'Antebrazo', lateral: true },
  { id: 'muneca', nombre: 'Muñeca', lateral: true },
  { id: 'mano', nombre: 'Mano', lateral: true },
  { id: 'torax', nombre: 'Tórax', lateral: false },
  { id: 'abdomen', nombre: 'Abdomen', lateral: false },
  { id: 'columna_dorsal', nombre: 'Columna dorsal', lateral: false },
  { id: 'columna_lumbar', nombre: 'Columna lumbar', lateral: false },
  { id: 'pelvis', nombre: 'Pelvis', lateral: false },
  { id: 'cadera', nombre: 'Cadera', lateral: true },
  { id: 'muslo', nombre: 'Muslo', lateral: true },
  { id: 'rodilla', nombre: 'Rodilla', lateral: true },
  { id: 'pierna', nombre: 'Pierna', lateral: true },
  { id: 'tobillo', nombre: 'Tobillo', lateral: true },
  { id: 'pie', nombre: 'Pie', lateral: true },
]);
export const ID_ZONAS = ZONAS.map((z) => z.id);
export const zonaPorId = (id) => ZONAS.find((z) => z.id === id) || null;

// "Sin zona específica": diagnósticos sin zona fija (biopsia, reparación de
// ligamento…). Se guarda como única zona de la lista, con estado
// Confirmada (cuenta como revisada y no suma en la notificación). No está
// en ZONAS: no se dibuja en el cuerpo ni la propone sugerirZonas.
export const SIN_ZONA_ESPECIFICA = 'sin_zona_especifica';
export const NOMBRE_SIN_ZONA_ESPECIFICA = 'Sin zona específica';
export const esSinZonaEspecifica = (zonas) => Array.isArray(zonas) && zonas.includes(SIN_ZONA_ESPECIFICA);
// Nombre para mostrar de cualquier valor de la lista de zonas.
export const nombreZona = (id) => (id === SIN_ZONA_ESPECIFICA ? NOMBRE_SIN_ZONA_ESPECIFICA : zonaPorId(id)?.nombre || id);

// Lado: de la gestión (campo "Lado", con prioridad) o del Maestro.
export const LADOS = Object.freeze([
  { id: 'no_especificado', nombre: 'No especificado' },
  { id: 'derecho', nombre: 'Derecho' },
  { id: 'izquierdo', nombre: 'Izquierdo' },
  { id: 'bilateral', nombre: 'Bilateral' },
]);
export const LADO_POR_DEFECTO = 'no_especificado';
export const nombreLado = (id) => LADOS.find((l) => l.id === id)?.nombre || 'No especificado';
// Lado efectivo: el de la gestión manda; si no lo especifica, el del Maestro.
export const ladoEfectivo = (ladoGestion, ladoMaestro) => (
  ladoGestion && ladoGestion !== LADO_POR_DEFECTO ? ladoGestion : (ladoMaestro || LADO_POR_DEFECTO)
);
// Lados a resaltar de una zona lateral: derecho / izquierdo o ambos
// (bilateral o no especificado).
export const ladosAResaltar = (lado) => (lado === 'derecho' ? ['der'] : lado === 'izquierdo' ? ['izq'] : ['der', 'izq']);

// Estados del Maestro.
export const ESTADOS = Object.freeze({ SIN_ASIGNAR: 'sin_asignar', SUGERIDA: 'sugerida', CONFIRMADA: 'confirmada' });

// Mayúsculas, sin tildes, sin espacios extra (la clave del Maestro).
export const normalizarDescripcion = (texto) => String(texto ?? '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toUpperCase()
  .replace(/\s+/g, ' ')
  .trim();

// Valores de relleno que no son una descripción (ya los excluye Estadísticas).
const EXCLUIDAS = new Set(['', 'P', '-', 'CARGANDO...']);
export const esDescripcionValida = (texto) => !EXCLUIDAS.has(normalizarDescripcion(texto));

// Id del documento del Maestro: la descripción normalizada, apta para un id
// de Firestore (sin "/").
export const idDescripcion = (texto) => encodeURIComponent(normalizarDescripcion(texto));

// --- Sugerencias por palabras clave ---------------------------------------
// Cada regla: prefijos de palabra (coincide si ALGUNA palabra de la
// descripción empieza con el prefijo; "RADIO" no coincide dentro de
// "RADIOFRECUENCIA" si el prefijo es la palabra completa 'RADIO$') y las
// zonas que sugiere. '$' al final = palabra completa.
const REGLAS = [
  { claves: ['HOMBRO', 'MANGUITO', 'ROTADOR'], zonas: ['hombro'] },
  { claves: ['RODILLA', 'MENISC', 'LCA$', 'PATELO', 'PATELA', 'ROTULA', 'PLATILLO'], zonas: ['rodilla'] },
  { claves: ['TOBILLO', 'MALEOL', 'AQUILES'], zonas: ['tobillo'] },
  { claves: ['CADERA', 'ACETABUL'], zonas: ['cadera'] },
  { claves: ['ORTEJO', 'PIE$', 'PIES$', 'HALLUX', 'METATARS', 'CALCANE'], zonas: ['pie'] },
  { claves: ['MANO$', 'MANOS$', 'METACARP', 'FALANGE', 'PULGAR', 'DEDO'], zonas: ['mano'] },
  { claves: ['MUNECA', 'ESCAFOIDES', 'CARPO$', 'CARPIANO'], zonas: ['muneca'] },
  { claves: ['CODO', 'OLECRANON'], zonas: ['codo'] },
  { claves: ['RADIO$', 'CUBITO', 'ANTEBRAZO'], zonas: ['antebrazo'] },
  { claves: ['HUMERO', 'BRAZO$'], zonas: ['brazo'] },
  { claves: ['TIBIO', 'TIBIA$', 'PERONE', 'PIERNA'], zonas: ['pierna'] },
  { claves: ['FEMUR', 'MUSLO'], zonas: ['muslo'] },
  { claves: ['COSTILLA', 'COSTAL', 'TORAX', 'TORACOTOMIA', 'ESTERNON'], zonas: ['torax'] },
  { claves: ['OIDO', 'TURBINECT', 'NARIZ', 'NASAL', 'SEPTUM', 'SENO$', 'SENOS$', 'MAXILAR', 'MANDIBUL', 'ORBITA'], zonas: ['cara'] },
  { claves: ['CRANEO', 'CRANEOTOMIA', 'CRANEAL'], zonas: ['cabeza'] },
  { claves: ['URETER', 'URINARI', 'RENAL', 'RINON', 'NEFRO'], zonas: ['abdomen', 'pelvis'] },
  { claves: ['VESICAL', 'VEJIGA', 'PROSTAT'], zonas: ['pelvis'] },
  { claves: ['ABDOMEN', 'ABDOMINAL', 'HERNIA'], zonas: ['abdomen'] },
  { claves: ['LUMBAR', 'LAMINECTOMIA', 'SACRO'], zonas: ['columna_lumbar'] },
];

const palabrasDe = (normalizada) => normalizada.split(/[^A-Z0-9]+/).filter(Boolean);
const coincide = (palabras, clave) => (clave.endsWith('$')
  ? palabras.includes(clave.slice(0, -1))
  : palabras.some((p) => p.startsWith(clave)));

// → { zonas: [ids], lado } (zonas vacío si no hay sugerencia).
export const sugerirZonas = (texto) => {
  const normalizada = normalizarDescripcion(texto);
  const palabras = palabrasDe(normalizada);
  const zonas = new Set();
  REGLAS.forEach((r) => { if (r.claves.some((c) => coincide(palabras, c))) r.zonas.forEach((z) => zonas.add(z)); });
  // Cuello de fémur es fractura de cadera, no de muslo.
  if (coincide(palabras, 'CUELLO') && coincide(palabras, 'FEMUR')) { zonas.delete('muslo'); zonas.add('cadera'); }
  // Columna: CERVICAL → cervical; DORSAL/TORACICA → dorsal; COLUMNA sola → lumbar.
  const cervical = coincide(palabras, 'CERVICAL');
  const dorsal = coincide(palabras, 'DORSAL') || coincide(palabras, 'TORACICA');
  if (cervical) zonas.add('columna_cervical');
  if (dorsal) zonas.add('columna_dorsal');
  if (coincide(palabras, 'COLUMNA') && !cervical && !dorsal) zonas.add('columna_lumbar');
  const der = coincide(palabras, 'DERECH') || coincide(palabras, 'DER$');
  const izq = coincide(palabras, 'IZQUIERD') || coincide(palabras, 'IZQ$');
  const lado = der && izq ? 'bilateral' : der ? 'derecho' : izq ? 'izquierdo' : (coincide(palabras, 'BILATERAL') ? 'bilateral' : LADO_POR_DEFECTO);
  return { zonas: ID_ZONAS.filter((z) => zonas.has(z)), lado };
};
