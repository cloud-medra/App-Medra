// Respaldo de documentos (Implantes y Hemodinamia, cada uno con su colección
// y carpeta, ver modulosGestion.js): PDF cuyo ID / N° de Admisión no
// coincide con ninguna gestión del módulo. Reutiliza las reglas de los documentos de
// admisión (documentosHelpers.js): misma lista de tipos, mismo tope de tamaño
// y la misma limpieza de nombres para Storage.
import {
  TIPOS_DOCUMENTO,
  TAMANO_MAXIMO_MB,
  esPdf,
  superaTamanoMaximo,
  nombreParaStorage,
  idDesdeNombre,
  pacienteDesdeNombre,
  tipoDesdeNombre,
  normalizarNombrePersona,
} from '../documentosAdmision/documentosHelpers';
export { TIPOS_DOCUMENTO, TAMANO_MAXIMO_MB };

const IDS_TIPO = new Set(TIPOS_DOCUMENTO.map((t) => t.id));
const FECHA_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

// Dentro de un segmento no puede quedar " - " (es el separador del nombre).
const limpiarSegmento = (texto) => String(texto ?? '').replace(/\s+-\s+/g, ' ').replace(/\s+/g, ' ').trim();

// "ID - Nombre - TIPO.pdf", con el mismo formato que leen Gestión y Carga
// masiva (id, paciente, tipo) y la limpieza de nombreParaStorage.
export const construirNombreRespaldo = ({ idAdmision, nombre, tipo }) =>
  nombreParaStorage(`${limpiarSegmento(idAdmision).replace(/\s+/g, '')} - ${limpiarSegmento(nombre)} - ${String(tipo).trim().toUpperCase()}.pdf`);

export const fechaValida = (fecha) => {
  const m = FECHA_ISO.exec(String(fecha ?? ''));
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
};

// Errores por campo de una fila del formulario ({} = válida).
export const validarFilaRespaldo = ({ file, idAdmision, fecha, nombre, tipo }) => {
  const e = {};
  if (!file) e.file = 'Falta el archivo.';
  else if (!esPdf(file)) e.file = 'Solo se aceptan archivos PDF.';
  else if (superaTamanoMaximo(file)) e.file = `Supera el máximo de ${TAMANO_MAXIMO_MB} MB.`;
  const id = String(idAdmision ?? '').trim();
  if (!id) e.idAdmision = 'Ingresa el ID / N° de Admisión.';
  else if (/\s|\//.test(id)) e.idAdmision = 'El ID no puede tener espacios ni "/".';
  if (!fecha) e.fecha = 'Elige la fecha.';
  else if (!fechaValida(fecha)) e.fecha = 'Fecha no válida.';
  if (!limpiarSegmento(nombre)) e.nombre = 'Ingresa el nombre.';
  if (!IDS_TIPO.has(String(tipo ?? '').toUpperCase())) e.tipo = 'Elige el tipo de documento.';
  return e;
};

// Prellenado desde un nombre "ID - NOMBRE - TIPO ... .pdf" (lo que se pueda leer).
export const datosDesdeNombreArchivo = (nombreArchivo) => ({
  idAdmision: idDesdeNombre(nombreArchivo),
  nombre: pacienteDesdeNombre(nombreArchivo),
  tipo: tipoDesdeNombre(nombreArchivo) || '',
});

// Búsqueda por ID o nombre (sin tildes ni mayúsculas) y filtro por tipo.
export const filtrarRespaldos = (docs, { busqueda = '', tipo = '' } = {}) => {
  const q = normalizarNombrePersona(busqueda);
  return docs.filter((d) => (!tipo || d.tipo === tipo)
    && (!q || normalizarNombrePersona(d.idAdmision).includes(q) || normalizarNombrePersona(d.nombre).includes(q)));
};

const msSubida = (d) => (d.subidoEl?.toMillis ? d.subidoEl.toMillis() : 0);

// Fecha del documento (más reciente primero); a igual fecha, lo último subido.
export const ordenarRespaldos = (docs) => [...docs].sort((a, b) =>
  String(b.fecha || '').localeCompare(String(a.fecha || '')) || msSubida(b) - msSubida(a));
