// Reglas de los PDF de admisiones (Implantes y Hemodinamia), compartidas por
// la pestaña Documentos de Gestión y por Carga masiva de documentos (ambas
// pantallas deben aplicar exactamente las mismas). Los archivos llegan ya
// nombrados ("102030 - JOSE PEREZ - COT 12345678 - EMPRESA.pdf") y se suben
// con ese nombre; el id de admisión y el tipo se leen del propio nombre, en
// el navegador y sin consultar Firebase. El listado sale directo de Storage
// (listAll), sin getMetadata por archivo ni colección en Firestore.

// Orden de visualización: DP, RP, INF, COT y al final los "Sin tipo".
export const TIPOS_DOCUMENTO = [
  { id: 'DP', label: 'Datos Personales' },
  { id: 'RP', label: 'Reporte Pabellón' },
  { id: 'INF', label: 'Informe' },
  { id: 'COT', label: 'Cotización' },
];

const IDS_TIPO = TIPOS_DOCUMENTO.map(t => t.id);

// Mismo tope que storage.rules (match /implantes|hemodinamia/{admision}/documentos/...).
export const TAMANO_MAXIMO_MB = 20;
export const superaTamanoMaximo = (file) => (file?.size || 0) > TAMANO_MAXIMO_MB * 1024 * 1024;

// Separador " - " tolerando espacios extra alrededor del guion (pero exige al
// menos uno a cada lado, para no cortar apellidos como "PEREZ-SOTO").
const SEPARADOR = /\s+-\s+/;

const sinExtensionPdf = (nombre) => String(nombre ?? '').replace(/\.pdf$/i, '');

const segmentos = (nombre) => sinExtensionPdf(nombre).trim().split(SEPARADOR);

// Id de admisión = lo que está antes del primer " - ". '' si no hay
// separador o si ese segmento no es una sola palabra sin espacios ni guiones
// (vacío o ilegible, p. ej. " - JOSE PEREZ - DP.pdf").
export const idDesdeNombre = (nombre) => {
  const partes = segmentos(nombre);
  if (partes.length < 2) return '';
  const id = partes[0].trim();
  return /^[^\s-]+$/.test(id) ? id : '';
};

// Comparación exacta (102030 ≠ 1020300 ≠ 02030), ignorando solo espacios.
export const idCoincide = (nombre, idAdmision) => {
  const id = idDesdeNombre(nombre);
  return id !== '' && id === String(idAdmision ?? '').trim();
};

// Paciente = segmento entre el id y el tipo ('' si no se puede leer). Solo se
// usa para advertir si no coincide con la admisión; nunca bloquea.
export const pacienteDesdeNombre = (nombre) => {
  const partes = segmentos(nombre);
  return partes.length >= 3 ? partes[1].trim() : '';
};

// Para comparar nombres de personas: mayúsculas, sin tildes y sin espacios
// extra ("José  Pérez" = "JOSE PEREZ").
export const normalizarNombrePersona = (nombre) => String(nombre ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toUpperCase()
  .replace(/\s+/g, ' ')
  .trim();

// El tipo es el primer segmento después del paciente que COMIENZA con un
// código (sin distinguir mayúsculas): "COT 123", "cot123", "DP (2)". No
// acepta palabras que solo empiezan igual ("DPTO", "RPM"), y como gana el
// primer segmento, una empresa "RP MEDICAL" no convierte una COT en RP.
const REGEX_TIPO = new RegExp(`^(${IDS_TIPO.join('|')})(?![A-Z])`, 'i');

export const tipoDesdeNombre = (nombre) => {
  const partes = segmentos(nombre);
  for (let i = 2; i < partes.length; i++) {
    const m = REGEX_TIPO.exec(partes[i].trim());
    if (m) return m[1].toUpperCase();
  }
  return null;
};

export const esPdf = (file) => Boolean(file)
  && file.type === 'application/pdf'
  && /\.pdf$/i.test(file.name || '');

const esControl = (c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127;

// Nombre con el que se guarda en Storage: el original, salvo "/" y "\" (que
// cortan la ruta), caracteres de control y los que Firebase recomienda evitar
// (# [ ] * ?). La extensión queda en ".pdf" minúscula (storage.rules la exige).
export const nombreParaStorage = (nombreOriginal) => {
  const base = Array.from(sinExtensionPdf(nombreOriginal))
    .map(c => (esControl(c) ? ' ' : c))
    .join('')
    .replace(/[/\\#[\]*?]/g, '_')
    .trim();
  return `${base}.pdf`;
};

// Nunca se sobrescribe: si "{base}.pdf" ya existe se usa "{base} (2).pdf",
// "(3)", etc. La comparación ignora mayúsculas.
export const nombreDisponible = (nombre, nombresExistentes = []) => {
  const base = sinExtensionPdf(nombre);
  const usados = new Set(nombresExistentes.map(n => n.toLowerCase()));
  let candidato = `${base}.pdf`;
  for (let n = 2; usados.has(candidato.toLowerCase()); n++) {
    candidato = `${base} (${n}).pdf`;
  }
  return candidato;
};

// Separa lo seleccionado en lo que se puede subir y lo rechazado (con el
// motivo), antes de tocar Storage. Los PDF rechazados por id ilegible o
// distinto quedan `respaldable` (con su `file`) para poder enviarlos al
// Respaldo de documentos.
export const clasificarArchivos = (files, idAdmision) => {
  const validos = [];
  const rechazados = [];
  Array.from(files || []).forEach(file => {
    if (!esPdf(file)) {
      rechazados.push({ nombre: file.name, motivo: 'No es un archivo PDF. No se subió.' });
    } else if (!idDesdeNombre(file.name)) {
      rechazados.push({ nombre: file.name, motivo: `El nombre no comienza con un id de admisión legible ("${idAdmision} - ..."). No se subió.`, file, respaldable: true });
    } else if (!idCoincide(file.name, idAdmision)) {
      rechazados.push({ nombre: file.name, motivo: `El archivo '${file.name}' no corresponde a la admisión ${idAdmision}. No se subió.`, file, respaldable: true });
    } else {
      validos.push(file);
    }
  });
  return { validos, rechazados };
};

// Orden: DP, RP, INF, COT, Sin tipo; dentro del tipo por nombre con orden
// numérico ("(2)" antes que "(10)").
export const ordenarDocumentos = (lista) => [...lista].sort((a, b) => {
  const ia = IDS_TIPO.indexOf(a.tipo);
  const ib = IDS_TIPO.indexOf(b.tipo);
  const pa = ia === -1 ? IDS_TIPO.length : ia;
  const pb = ib === -1 ? IDS_TIPO.length : ib;
  if (pa !== pb) return pa - pb;
  return a.nombre.localeCompare(b.nombre, 'es', { numeric: true });
});

export const mensajeErrorStorage = (err) => {
  switch (err?.code) {
    case 'storage/unauthorized':
      return 'No tienes permiso para esta acción en estos documentos (o el archivo no es un PDF válido de hasta 20 MB).';
    case 'storage/retry-limit-exceeded':
    case 'storage/network-request-failed':
      return 'Se perdió la conexión con el servidor. Intenta nuevamente.';
    case 'storage/object-not-found':
      return 'El archivo ya no existe en el servidor.';
    case 'storage/quota-exceeded':
      return 'Se superó la cuota de almacenamiento. Avisa al administrador.';
    default:
      return 'Ocurrió un error inesperado. Intenta nuevamente.';
  }
};
