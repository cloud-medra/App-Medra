// Vista previa de Carga masiva de documentos: estado de cada PDF antes de
// subir. Todo se calcula en el navegador con las mismas reglas de la pestaña
// Documentos (shared/documentosAdmision); lo único que viene de Firebase son
// los dos cachés que se pasan como parámetro (existencia de la admisión y
// listado de su carpeta en Storage), pedidos una sola vez por admisión.
import {
  idDesdeNombre,
  tipoDesdeNombre,
  pacienteDesdeNombre,
  normalizarNombrePersona,
  nombreParaStorage,
  esPdf,
  superaTamanoMaximo,
  TAMANO_MAXIMO_MB
} from '../../documentosAdmision/documentosHelpers';

export const ESTADOS = {
  LISTO: { label: 'Listo para subir', subible: true },
  DUPLICADO: { label: 'Duplicado (se agregará sufijo)', subible: true },
  NO_ENCONTRADA: { label: 'Admisión no encontrada', subible: false },
  NOMBRE_INVALIDO: { label: 'Nombre inválido', subible: false },
  NO_PDF: { label: 'No es PDF', subible: false },
  MUY_GRANDE: { label: `Supera ${TAMANO_MAXIMO_MB} MB`, subible: false },
  VERIFICANDO: { label: 'Verificando...', subible: false },
  ERROR_VERIFICACION: { label: 'No se pudo verificar', subible: false },
};

export const esSubible = (fila) => Boolean(ESTADOS[fila.estado]?.subible);

// 'P' y 'SIN_ADMISION' son los marcadores de "sin ID" de Gestión Implantes:
// nunca son una admisión real.
const ID_PENDIENTE = new Set(['P', 'SIN_ADMISION']);
export const idAdmisionValido = (nombre) => {
  const id = idDesdeNombre(nombre);
  return id && !ID_PENDIENTE.has(id.toUpperCase()) ? id : '';
};

// Mismo archivo elegido dos veces (arrastrado de nuevo): se ignora.
export const claveArchivo = (file) => `${file.name}__${file.size}__${file.lastModified}`;

// Ids que hay que verificar: válidos, de PDF, y que aún no están en caché.
export const idsPorVerificar = (items, yaSolicitados) => [...new Set(
  items
    .filter(({ file }) => esPdf(file) && !superaTamanoMaximo(file))
    .map(({ file }) => idAdmisionValido(file.name))
    .filter(id => id && !yaSolicitados.has(id))
)];

const motivoRechazo = (fila, etiquetaModulo) => {
  switch (fila.estado) {
    case 'NO_ENCONTRADA': return `La admisión ${fila.idAdmision} no existe en ${etiquetaModulo}. No se subió.`;
    case 'NOMBRE_INVALIDO': return 'El nombre no comienza con un id de admisión legible ("102030 - PACIENTE - TIPO"). No se subió.';
    case 'NO_PDF': return 'No es un archivo PDF. No se subió.';
    case 'MUY_GRANDE': return `Supera el máximo de ${TAMANO_MAXIMO_MB} MB. No se subió.`;
    case 'ERROR_VERIFICACION': return `No se pudo verificar la admisión ${fila.idAdmision}. No se subió.`;
    default: return 'No se subió.';
  }
};

// `respaldable`: la admisión no existe en el módulo, así que el archivo se
// puede enviar al Respaldo de documentos (se conserva `file` para eso).
export const rechazoDeFila = (fila, etiquetaModulo = 'Implantes') => ({
  nombre: fila.nombre,
  motivo: motivoRechazo(fila, etiquetaModulo),
  file: fila.file,
  respaldable: fila.estado === 'NO_ENCONTRADA',
});

// items: [{ key, file }]
// admisiones: Map id -> { nombre } | null (null = no existe); sin clave = sin verificar
// listados: Map id -> [{ nombre, ... }] (carpeta de Storage); sin clave = sin listar
// idsConError: Set de ids cuya verificación o listado falló
export const construirVistaPrevia = (items, { admisiones, listados, idsConError }) => {
  const nombresEnTanda = new Map(); // id -> nombres (para Storage) de archivos anteriores en la lista

  return items.map(({ key, file }) => {
    const idAdmision = idAdmisionValido(file.name);
    const fila = {
      key,
      file,
      nombre: file.name,
      idAdmision,
      tipo: tipoDesdeNombre(file.name),
      advertencia: null
    };

    if (!esPdf(file)) return { ...fila, estado: 'NO_PDF' };
    if (!idAdmision) return { ...fila, estado: 'NOMBRE_INVALIDO' };
    if (superaTamanoMaximo(file)) return { ...fila, estado: 'MUY_GRANDE' };
    if (idsConError.has(idAdmision)) return { ...fila, estado: 'ERROR_VERIFICACION' };
    if (!admisiones.has(idAdmision)) return { ...fila, estado: 'VERIFICANDO' };

    const admision = admisiones.get(idAdmision);
    if (!admision) return { ...fila, estado: 'NO_ENCONTRADA' };

    const enCarpeta = listados.get(idAdmision);
    if (!enCarpeta) return { ...fila, estado: 'VERIFICANDO' };

    const nombreStorage = nombreParaStorage(file.name).toLowerCase();
    const previos = nombresEnTanda.get(idAdmision) || [];
    const duplicado = previos.includes(nombreStorage)
      || enCarpeta.some(d => d.nombre.toLowerCase() === nombreStorage);
    nombresEnTanda.set(idAdmision, [...previos, nombreStorage]);

    const paciente = pacienteDesdeNombre(file.name);
    const pacienteAdmision = admision.nombre && admision.nombre !== 'P' ? admision.nombre : '';
    if (paciente && pacienteAdmision && normalizarNombrePersona(paciente) !== normalizarNombrePersona(pacienteAdmision)) {
      fila.advertencia = `El paciente del archivo (${paciente}) no coincide con el de la admisión (${pacienteAdmision}).`;
    }

    return { ...fila, estado: duplicado ? 'DUPLICADO' : 'LISTO' };
  });
};

// Grupos por admisión (orden numérico) y al final los que no tienen id.
export const agruparPorAdmision = (filas) => {
  const grupos = new Map();
  filas.forEach(f => {
    const clave = f.idAdmision || '';
    if (!grupos.has(clave)) grupos.set(clave, []);
    grupos.get(clave).push(f);
  });
  return [...grupos.entries()].sort(([a], [b]) => {
    if (!a) return 1;
    if (!b) return -1;
    return a.localeCompare(b, 'es', { numeric: true });
  });
};
