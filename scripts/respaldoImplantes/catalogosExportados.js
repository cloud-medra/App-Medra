// Lee los maestros exportados desde la app (Códigos, Empresas, Centros y
// Recargos) para cargarlos en la plantilla de contingencia. Lógica pura
// sobre filas ya leídas ({ ENCABEZADO: valor }); la lectura de archivos
// (CSV o Excel) está en leerArchivoExportado.
//
// Formatos (exportaciones de la app):
//   Códigos  (useImportExportConCodigo.js, CSV con ';'): CODIGO, REFERENCIA,
//            DESCRIPTOR_EMPRESA, EMPRESA, TIPO, SEGMENTO, CLASE,
//            DESCRIPTOR_AUTO, PRECIO_NETO, CX, OBSERVACION, REGISTRADO_POR,
//            ESTADO, FIBRA_REUTILIZABLE (las dos últimas desde el 23-11-2026;
//            un CSV anterior no las trae y entonces no se puede filtrar).
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
const esSi = (v) => ['SI', 'SÍ', 'TRUE', '1', 'X'].includes(texto(v).toUpperCase());

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
  const sinFiltro = faltan(filas, ['ESTADO', 'FIBRA_REUTILIZABLE']);
  if (filas.length && sinFiltro.length) {
    advertencias.push(`El archivo de códigos no trae ${sinFiltro.join(' ni ')} (exportación anterior al 23-11-2026): no se pudieron quitar ${sinFiltro.includes('ESTADO') ? 'las inactivas' : ''}${sinFiltro.length === 2 ? ' ni ' : ''}${sinFiltro.includes('FIBRA_REUTILIZABLE') ? 'las fibras' : ''}. Vuelva a exportar desde la app.`);
  }
  const otrasFaltantes = faltan(filas, COLUMNAS_CODIGOS);
  if (filas.length && otrasFaltantes.length) advertencias.push(`Columnas que no vienen (quedan vacías): ${otrasFaltantes.join(', ')}. Expórtelo con un usuario que vea todas las columnas.`);

  let inactivas = 0;
  let fibras = 0;
  const registros = [];
  filas.forEach((f) => {
    if (!texto(f.REFERENCIA)) return;
    if (esInactivo(f.ESTADO)) { inactivas += 1; return; }
    if (esSi(f.FIBRA_REUTILIZABLE)) { fibras += 1; return; }
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
  return { registros, resumen: { leidas: filas.length, cargadas: registros.length, inactivas, fibras }, advertencias };
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
