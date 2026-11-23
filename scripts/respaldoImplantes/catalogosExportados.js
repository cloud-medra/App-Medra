// Lee los maestros exportados desde la app (Códigos, Empresas, Centros y
// Recargos) para cargarlos en la plantilla de contingencia. Lógica pura
// sobre filas ya leídas ({ ENCABEZADO: valor }); la lectura de archivos
// (CSV o Excel) está en leerArchivoExportado.
//
// Formatos (exportaciones de la app):
//   Códigos  (useImportExportConCodigo.js, CSV con ';'): CODIGO, REFERENCIA,
//            DESCRIPTOR_EMPRESA, EMPRESA, TIPO, SEGMENTO, CLASE,
//            DESCRIPTOR_AUTO, PRECIO_NETO, CX, OBSERVACION, REGISTRADO_POR,
//            ESTADO (desde el 23-11-2026; un CSV anterior no la trae y
//            entonces no se pueden quitar las inactivas).
//   Empresas (EmpresasMaestros.jsx): NOMBRE, RUT, ESTADO
//   Centros  (CentrosMaestros.jsx):  NOMBRE, COMENTARIO, ESTADO, USAR_EN_GESTIONES
//   Recargos (RecargosMaestros.jsx): DESDE, HASTA, VECES COSTO, COMENTARIO, ESTADO

import fs from 'node:fs/promises';
import path from 'node:path';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';

const texto = (v) => (v === undefined || v === null ? '' : String(v).trim());
const BOM = String.fromCharCode(0xfeff);
const sinBom = (t) => (t.startsWith(BOM) ? t.slice(1) : t);
const clave = (h) => sinBom(texto(h)).toUpperCase().replace(/\s+/g, '_');
const esInactivo = (v) => texto(v).toUpperCase() === 'INACTIVO';

// Precio desde CSV o Excel: número, "150000" o "150000.5". Un texto con
// separador de miles ("1.500.000") también se acepta.
export const numeroExportado = (v) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  let t = texto(v).replace(/\$/g, '').replace(/\s/g, '');
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^\d+,\d+$/.test(t)) t = t.replace(',', '.');
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
};

// Normaliza encabezados ("VECES COSTO" → VECES_COSTO, sin BOM, mayúsculas).
export const normalizarFilas = (filas) => (filas || []).map((f) => Object.fromEntries(
  Object.entries(f).map(([k, v]) => [clave(k), v]),
));

const faltan = (filas, requeridas) => {
  const presentes = new Set(Object.keys(filas[0] || {}));
  return requeridas.filter((c) => !presentes.has(c));
};

export const COLUMNAS_CODIGOS = ['CODIGO', 'REFERENCIA', 'DESCRIPTOR_EMPRESA', 'EMPRESA', 'TIPO', 'SEGMENTO', 'CLASE',
  'DESCRIPTOR_AUTO', 'PRECIO_NETO', 'CX', 'OBSERVACION', 'REGISTRADO_POR'];

export const codigosDesdeFilas = (filasCrudas) => {
  const filas = normalizarFilas(filasCrudas);
  const faltantes = faltan(filas, ['REFERENCIA', 'CODIGO', 'EMPRESA', 'PRECIO_NETO']);
  if (filas.length && faltantes.length) throw new Error(`El archivo de códigos no trae las columnas: ${faltantes.join(', ')}`);
  const advertencias = [];
  if (filas.length && faltan(filas, ['ESTADO']).length) {
    advertencias.push('El archivo de códigos no trae ESTADO (exportación anterior al 23-11-2026): no se pudieron quitar las inactivas. Vuelva a exportar desde la app.');
  }
  const otrasFaltantes = faltan(filas, COLUMNAS_CODIGOS);
  if (filas.length && otrasFaltantes.length) advertencias.push(`Columnas que no vienen (quedan vacías): ${otrasFaltantes.join(', ')}. Expórtelo con un usuario que vea todas las columnas.`);

  let inactivas = 0;
  const registros = [];
  filas.forEach((f) => {
    if (!texto(f.REFERENCIA)) return;
    if (esInactivo(f.ESTADO)) { inactivas += 1; return; }
    registros.push({
      codigo: texto(f.CODIGO),
      referencia: texto(f.REFERENCIA),
      descriptorEmpresa: texto(f.DESCRIPTOR_EMPRESA),
      empresa: texto(f.EMPRESA),
      tipo: texto(f.TIPO),
      segmento: texto(f.SEGMENTO),
      clase: texto(f.CLASE),
      descriptorAuto: texto(f.DESCRIPTOR_AUTO),
      precio: numeroExportado(f.PRECIO_NETO),
      cx: texto(f.CX),
      observacion: texto(f.OBSERVACION),
      registradoPor: texto(f.REGISTRADO_POR),
    });
  });
  return { registros, resumen: { leidas: filas.length, cargadas: registros.length, inactivas }, advertencias };
};

const activos = (filasCrudas, requeridas, nombre, filtro = () => true) => {
  const filas = normalizarFilas(filasCrudas);
  const faltantes = faltan(filas, requeridas);
  if (filas.length && faltantes.length) throw new Error(`El archivo de ${nombre} no trae las columnas: ${faltantes.join(', ')}`);
  const registros = filas.filter((f) => !esInactivo(f.ESTADO) && filtro(f));
  return { filas: registros, resumen: { leidas: filas.length, cargadas: registros.length } };
};

// Empresas activas con nombre, sin repetir, ordenadas.
export const empresasDesdeFilas = (filasCrudas) => {
  const { filas, resumen } = activos(filasCrudas, ['NOMBRE'], 'empresas', (f) => texto(f.NOMBRE));
  const vistas = new Set();
  const registros = filas
    .map((f) => ({ nombre: texto(f.NOMBRE), rut: texto(f.RUT), estado: texto(f.ESTADO) || 'ACTIVO' }))
    .filter((e) => (vistas.has(e.nombre.toUpperCase()) ? false : vistas.add(e.nombre.toUpperCase())))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  return { registros, resumen: { ...resumen, cargadas: registros.length } };
};

// Centros activos que se usan en Gestiones (como CentroSelect).
export const centrosDesdeFilas = (filasCrudas) => {
  const { filas, resumen } = activos(filasCrudas, ['NOMBRE'], 'centros',
    (f) => texto(f.NOMBRE) && texto(f.USAR_EN_GESTIONES).toUpperCase() !== 'NO');
  const registros = filas.map((f) => ({ nombre: texto(f.NOMBRE), comentario: texto(f.COMENTARIO), estado: texto(f.ESTADO) || 'ACTIVO', usarEnGestiones: 'SI' }));
  return { registros, resumen };
};

export const recargosDesdeFilas = (filasCrudas) => {
  const { filas, resumen } = activos(filasCrudas, ['DESDE', 'HASTA', 'VECES_COSTO'], 'recargos');
  const registros = filas.map((f) => ({
    desde: numeroExportado(f.DESDE), hasta: numeroExportado(f.HASTA), vecesCosto: numeroExportado(f.VECES_COSTO) || 1,
    comentario: texto(f.COMENTARIO), estado: texto(f.ESTADO) || 'ACTIVO',
  })).sort((a, b) => a.desde - b.desde);
  return { registros, resumen };
};

// Nombres activos (Previsiones y Convenios: NOMBRE, COMENTARIO, ESTADO, como
// PrevisionesMaestros.jsx y ConveniosMaestros.jsx), sin repetir y ordenados.
const nombresActivos = (filasCrudas, nombre) => {
  const { filas, resumen } = activos(filasCrudas, ['NOMBRE'], nombre, (f) => texto(f.NOMBRE));
  const vistas = new Set();
  const registros = filas
    .map((f) => ({ nombre: texto(f.NOMBRE), comentario: texto(f.COMENTARIO), estado: texto(f.ESTADO) || 'ACTIVO' }))
    .filter((e) => (vistas.has(e.nombre.toUpperCase()) ? false : vistas.add(e.nombre.toUpperCase())))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  return { registros, resumen: { ...resumen, cargadas: registros.length } };
};
export const previsionesDesdeFilas = (filas) => nombresActivos(filas, 'previsiones');
export const conveniosDesdeFilas = (filas) => nombresActivos(filas, 'convenios');

// --- Reporte Info -------------------------------------------------------------
// Viene del Excel de la clínica que se importa en Documentos → Reportes Info
// (ReportesInfo.jsx guarda todas sus columnas, salvo Rut) o del "Exportar"
// de esa pantalla (no trae Convenio). Encabezados con tildes y signos
// ("Admisión", "1° Cirujano", "Cod.Artículo"): se comparan sin ellos.
// Marcas de tilde que deja normalize('NFD') (U+0300 a U+036F).
const TILDES = new RegExp('[' + String.fromCharCode(0x300) + '-' + String.fromCharCode(0x36f) + ']', 'g');
const claveSuelta = (h) => sinBom(texto(h)).normalize('NFD').replace(TILDES, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const soloDigitos = (v) => texto(v).replace(/\D/g, '');

// Fecha de una fila (Date, número de serie de Excel o texto) → "AAAA-MM-DD".
const fechaISO = (v) => {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  if (typeof v === 'number' && v > 0) return new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000).toISOString().slice(0, 10);
  const t = texto(v);
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const m = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
};

/**
 * Una fila por admisión con lo que Gestiones toma de Reporte Info, igual que
 * el sistema (handleIdChange en useGestionesImplantesData.js):
 *   convenio ← "Convenio", previsión ← "Isapre" (no la columna "Previsión"),
 *   médico ← "1° Cirujano", descripción ← "Descripción"; y el nombre ←
 *   "Paciente" (el sistema no lo completa; se agrega a pedido).
 * El sistema usa el primer registro de la admisión; aquí, el primero por
 * fecha y Cod.Artículo, y si un campo viene vacío, el siguiente que lo tenga.
 * `desde` ("AAAA-MM-DD"): solo filas de esa fecha en adelante.
 */
export const reporteInfoDesdeFilas = (filasCrudas, { desde = null } = {}) => {
  const filas = (filasCrudas || []).map((f) => Object.fromEntries(Object.entries(f).map(([k, v]) => [claveSuelta(k), v])));
  const presentes = new Set(filas.flatMap((f) => Object.keys(f)));
  const faltantes = ['ADMISION', 'FECHA'].filter((c) => !presentes.has(c));
  if (filas.length && faltantes.length) throw new Error(`El archivo de Reporte Info no trae las columnas: ${faltantes.join(', ')}`);
  const advertencias = [];
  const sinColumna = [['CONVENIO', 'Convenio'], ['ISAPRE', 'Isapre'], ['1CIRUJANO', '1° Cirujano'], ['DESCRIPCION', 'Descripción'], ['PACIENTE', 'Paciente']]
    .filter(([c]) => !presentes.has(c)).map(([, n]) => n);
  if (filas.length && sinColumna.length) {
    advertencias.push(`No trae ${sinColumna.join(', ')}: esos datos quedan vacíos.${sinColumna.includes('Convenio') ? ' El "Exportar" de Reportes Info no incluye Convenio: use el archivo original de la clínica.' : ''}`);
  }

  let fueraDePeriodo = 0;
  let sinAdmision = 0;
  const porAdmision = new Map();
  filas.forEach((f) => {
    const admision = soloDigitos(f.ADMISION);
    const fecha = fechaISO(f.FECHA);
    if (!admision) { sinAdmision += 1; return; }
    if (desde && (!fecha || fecha < desde)) { fueraDePeriodo += 1; return; }
    if (!porAdmision.has(admision)) porAdmision.set(admision, []);
    porAdmision.get(admision).push({ ...f, _fecha: fecha || '', _art: texto(f.CODARTICULO) });
  });

  const primero = (lista, campo) => lista.map((f) => texto(f[campo])).find(Boolean) || '';
  const registros = [...porAdmision.entries()].map(([admision, lista]) => {
    lista.sort((a, b) => a._fecha.localeCompare(b._fecha) || a._art.localeCompare(b._art));
    return {
      admision,
      fecha: lista.map((f) => f._fecha).filter(Boolean).sort().pop() || '',
      paciente: primero(lista, 'PACIENTE'),
      convenio: primero(lista, 'CONVENIO'),
      prevision: primero(lista, 'ISAPRE'),
      cirujano: primero(lista, '1CIRUJANO'),
      descripcion: primero(lista, 'DESCRIPCION'),
    };
  }).sort((a, b) => b.fecha.localeCompare(a.fecha) || a.admision.localeCompare(b.admision));

  return { registros, resumen: { leidas: filas.length, cargadas: registros.length, fueraDePeriodo, sinAdmision }, advertencias };
};

// Listas de respaldo para Previsiones y Convenios cuando no se pasa su
// exportación: los valores distintos que aparecen en Reporte Info.
export const valoresDistintos = (registros, campo) => [...new Set((registros || []).map((r) => texto(r[campo])).filter(Boolean))]
  .sort((a, b) => a.localeCompare(b, 'es'))
  .map((nombre) => ({ nombre, comentario: 'Desde Reporte Info', estado: 'ACTIVO' }));

// Fecha del archivo para la plantilla: la del nombre (las exportaciones de
// la app terminan en _AAAA-MM-DD) o, si no la trae, null.
export const fechaDesdeNombre = (nombre) => texto(nombre).match(/(\d{4}-\d{2}-\d{2})/)?.[1] || null;

// --- Lectura de archivos -------------------------------------------------------

// CSV (separador detectado: la app usa ';' en Códigos) o Excel (.xlsx/.xls,
// primera hoja). Todo se lee como texto para no perder ceros a la izquierda.
export const leerArchivoExportado = async (ruta) => {
  const ext = path.extname(ruta).toLowerCase();
  if (ext === '.csv' || ext === '.txt') {
    const contenido = sinBom(await fs.readFile(ruta, 'utf8'));
    const r = Papa.parse(contenido, { header: true, skipEmptyLines: 'greedy', delimitersToGuess: [';', ',', '\t'] });
    if (r.errors.length && !r.data.length) throw new Error(`No se pudo leer ${ruta}: ${r.errors[0].message}`);
    return r.data;
  }
  if (ext === '.xlsx' || ext === '.xls') {
    const libro = XLSX.read(await fs.readFile(ruta), { type: 'buffer' });
    return XLSX.utils.sheet_to_json(libro.Sheets[libro.SheetNames[0]], { defval: '', raw: true });
  }
  throw new Error(`Formato no soportado (${ext}): use el .csv o .xlsx exportado desde la app.`);
};
