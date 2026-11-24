// Genera el archivo de contingencia de Implantes: UN solo archivo,
// respaldo_implantes.xlsm, en Documentos\Medra\Contingencia del usuario (o en
// la carpeta de --salida), que se reemplaza en cada regeneración. Misma
// estructura que el respaldo, sin datos de pacientes, con los catálogos
// cargados desde los archivos que se exportan en la app y las macros
// "Mover cargados" / "Devolver a pendientes". No se conecta a Firestore ni
// cifra (la contraseña se pone en Excel).
//
// Uso (desde la raíz del repo; ver docs/respaldo-contingencia-implantes.md):
//   node scripts/respaldoImplantes/generarPlantillaImplantes.js \
//     --codigos "<registros_con_codigo_AAAA-MM-DD.csv>" --codigos "<codigos_pendientes_AAAA-MM-DD.xlsx>" --empresas "<empresas_maestros_AAAA-MM-DD.xlsx>" \
//     --centros "<centros_maestros_….xlsx>" --recargos "<recargos_maestros_….xlsx>" \
//     --reporte-info "<Excel de la clínica>" (se puede repetir) [--dias 60] \
//     --previsiones "<previsiones_maestros_….xlsx>" --convenios "<convenios_maestros_….xlsx>" \
//     [--salida "<otra carpeta>"]
//
// Cada catálogo es opcional: el que no se indique queda vacío para pegarlo a
// mano. Reporte Info se carga solo con los últimos --dias días (60 por
// defecto). Sin --previsiones / --convenios, esas listas se arman con los
// valores distintos de Reporte Info.
//
// Las macros se insertan con Excel (macros/armarXlsm.ps1): hace falta Excel
// instalado en este equipo. Los archivos intermedios (.xlsx sin macros, .bas,
// .xlsm armado) van a una carpeta temporal del sistema que se borra al
// terminar, también si algo falla: en la carpeta de salida solo queda
// respaldo_implantes.xlsm.

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import process from 'node:process';
import { Buffer } from 'node:buffer';
import { spawnSync } from 'node:child_process';
import { construirLibro } from './libroRespaldo.js';
import { quitarComentariosVba } from './macros/quitarComentariosVba.js';
import { datosPlantilla, fechaHoraChile, fechaISOChile, isoAFechaExcel, ARCHIVO_PLANTILLA } from './datosRespaldo.js';
import {
  leerArchivoExportado, codigosDesdeFilas, empresasDesdeFilas, centrosDesdeFilas, recargosDesdeFilas, fechaDesdeNombre,
  reporteInfoDesdeFilas, previsionesDesdeFilas, conveniosDesdeFilas, valoresDistintos, esExportOficial, unirCodigos,
} from './catalogosExportados.js';

const DIAS_REPORTE_INFO = 60;

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, '..', '..');
const BAS = path.join(AQUI, 'macros', 'ModContingencia.bas');
const ARMAR = path.join(AQUI, 'macros', 'armarXlsm.ps1');
const CARPETA_POR_DEFECTO = path.join(os.homedir(), 'Documents', 'Medra', 'Contingencia');

// Contraseña de protección de las hojas: solo desde la variable de entorno
// (nunca en el repo). En el .xlsm queda su hash y, para que los botones
// puedan desproteger, dentro del módulo VBA (decisión del 23-11-2026).
const VARIABLE_CLAVE_HOJAS = 'RESPALDO_IMPLANTES_CLAVE_HOJAS';
const LARGO_MINIMO_CLAVE_HOJAS = 8;

const salir = (mensaje) => { console.error(`\nERROR: ${mensaje}\n`); process.exit(1); };

const leerArgumentos = (argv) => {
  const args = { salida: CARPETA_POR_DEFECTO, reporteInfo: [], codigos: [], dias: DIAS_REPORTE_INFO };
  const conValor = {
    '--salida': 'salida', '--empresas': 'empresas', '--centros': 'centros', '--recargos': 'recargos',
    '--previsiones': 'previsiones', '--convenios': 'convenios',
  };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--reporte-info' || argv[i] === '--codigos') {
      // Se pueden repetir: Reporte Info (un Excel por mes) y Códigos (los
      // exports de "Con código" y "Sin código").
      if (!argv[i + 1]) salir(`Falta el valor de ${argv[i]}.`);
      args[argv[i] === '--codigos' ? 'codigos' : 'reporteInfo'].push(path.resolve(argv[++i]));
    } else if (argv[i] === '--dias') {
      const n = Number(argv[++i]);
      if (!Number.isInteger(n) || n < 1) salir('--dias debe ser un número entero mayor que 0.');
      args.dias = n;
    } else if (conValor[argv[i]]) {
      if (!argv[i + 1]) salir(`Falta el valor de ${argv[i]}.`);
      args[conValor[argv[i]]] = path.resolve(argv[++i]);
    } else salir(`Opción desconocida: ${argv[i]}`);
  }
  return args;
};

const LECTORES = {
  codigos: { nombre: 'Códigos', leer: codigosDesdeFilas },
  empresas: { nombre: 'Empresas', leer: empresasDesdeFilas },
  centros: { nombre: 'Centros', leer: centrosDesdeFilas },
  recargos: { nombre: 'Rangos de recargo', leer: recargosDesdeFilas },
  previsiones: { nombre: 'Previsiones', leer: previsionesDesdeFilas },
  convenios: { nombre: 'Convenios', leer: conveniosDesdeFilas },
};

// "AAAA-MM-DD" de hace `dias` días (hora de Chile).
const desdeHaceDias = (dias) => {
  const hoy = new Date(`${fechaISOChile()}T12:00:00Z`);
  hoy.setUTCDate(hoy.getUTCDate() - dias);
  return hoy.toISOString().slice(0, 10);
};

const detalleDe = (id, resumen) => {
  if (id === 'codigos') {
    return `${resumen.leidas} en ${resumen.archivos} archivo(s); sin ${resumen.inactivas} inactivas`
      + `${resumen.repetidos ? `; ${resumen.repetidos} repetidos quitados` : ''}; ${resumen.sinCodigo} sin código`;
  }
  return `${resumen.leidas} en el archivo; solo activos`;
};

// El .bas se importa en Windows-1252 con CRLF. Latin-1 coincide con
// Windows-1252 en los caracteres del español; cualquier otro se rechaza.
const basParaExcel = async (claveHojas) => {
  const original = await fs.readFile(BAS, 'utf8');
  if (!original.includes('__CLAVE_HOJAS__')) throw new Error('ModContingencia.bas no tiene el marcador __CLAVE_HOJAS__.');
  // En VBA las comillas dentro de un texto se escriben dobles.
  // El libro va sin comentarios en el VBA (decisión del 24-11-2026).
  const contenido = quitarComentariosVba(original).replace('__CLAVE_HOJAS__', claveHojas.replace(/"/g, '""')).replace(/\r?\n/g, '\r\n');
  const raro = [...contenido].find((ch) => ch.charCodeAt(0) > 0xff);
  if (raro) throw new Error(`ModContingencia.bas tiene un carácter que no es Windows-1252: "${raro}"`);
  return Buffer.from(contenido, 'latin1');
};

const main = async () => {
  const args = leerArgumentos(process.argv.slice(2));
  const claveHojas = process.env[VARIABLE_CLAVE_HOJAS] || '';
  if (!claveHojas) salir(`Falta la variable ${VARIABLE_CLAVE_HOJAS} con la contraseña de protección de las hojas (ver el doc).`);
  if (claveHojas.length < LARGO_MINIMO_CLAVE_HOJAS) salir(`La contraseña de ${VARIABLE_CLAVE_HOJAS} debe tener al menos ${LARGO_MINIMO_CLAVE_HOJAS} caracteres.`);
  if ([...claveHojas].some((ch) => ch.charCodeAt(0) > 0xff)) salir(`La contraseña de ${VARIABLE_CLAVE_HOJAS} solo puede tener letras, números y signos comunes.`);
  const rel = path.relative(RAIZ, args.salida);
  if (rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))) salir('La carpeta de salida debe estar fuera del repositorio.');
  await fs.mkdir(args.salida, { recursive: true });

  const catalogos = {};
  const origen = {};
  const advertencias = [];
  let fecha = null;
  for (const [id, lector] of Object.entries(LECTORES)) {
    const archivos = id === 'codigos' ? args.codigos : (args[id] ? [args[id]] : []);
    if (!archivos.length) continue;
    const leidos = [];
    for (const archivo of archivos) {
      const r = lector.leer(await leerArchivoExportado(archivo));
      advertencias.push(...(r.advertencias || []).map((a) => `${lector.nombre} (${path.basename(archivo)}): ${a}`));
      leidos.push(r);
    }
    const sumar = (campo) => leidos.reduce((s, r) => s + (r.resumen[campo] || 0), 0);
    let registros = leidos.flatMap((r) => r.registros);
    const resumen = { leidas: sumar('leidas'), inactivas: sumar('inactivas'), archivos: archivos.length };
    if (id === 'codigos') {
      const unidos = unirCodigos(leidos.map((r) => r.registros));
      registros = unidos.registros;
      Object.assign(resumen, { repetidos: unidos.repetidos, sinCodigo: unidos.sinCodigo });
    }
    if (!registros.length) salir(`${lector.nombre}: ${archivos.map((a) => path.basename(a)).join(', ')} no trajo registros usables.`);
    catalogos[id] = registros;
    const nombres = archivos.map((a) => path.basename(a));
    const oficial = nombres.every((n) => esExportOficial(id, n));
    const fechaArchivo = oficial ? (nombres.map(fechaDesdeNombre).find(Boolean) || null) : null;
    origen[id] = { archivo: nombres.join(', '), fecha: fechaArchivo, cargadas: registros.length, detalle: detalleDe(id, resumen), provisional: !oficial };
    if (!oficial) advertencias.push(`${lector.nombre}: el archivo no es la exportación oficial de la app; queda marcado como PROVISIONAL en Instrucciones.`);
    // Fecha de los catálogos: la del archivo de códigos (o la del primero que la traiga).
    if (fechaArchivo && (id === 'codigos' || !fecha)) fecha = isoAFechaExcel(fechaArchivo);
  }

  // Reporte Info: uno o varios archivos (por ejemplo, un Excel por mes).
  if (args.reporteInfo.length) {
    const desde = desdeHaceDias(args.dias);
    const filas = [];
    for (const archivo of args.reporteInfo) filas.push(...await leerArchivoExportado(archivo));
    const { registros, resumen, advertencias: avisos } = reporteInfoDesdeFilas(filas, { desde });
    if (!registros.length) salir(`Reporte Info: ninguna fila desde el ${desde} (últimos ${args.dias} días). Revise las fechas del archivo o use --dias.`);
    catalogos.reporteInfo = registros;
    origen.reporteInfo = {
      archivo: args.reporteInfo.map((a) => path.basename(a)).join(', '),
      fecha: null,
      cargadas: registros.length,
      detalle: `admisiones desde el ${desde} (últimos ${args.dias} días); ${resumen.leidas} filas leídas, ${resumen.fueraDePeriodo} fuera del período`,
    };
    advertencias.push(...avisos.map((a) => `Reporte Info: ${a}`));
    // Sin su exportación, Previsiones y Convenios salen de Reporte Info.
    [['previsiones', 'prevision'], ['convenios', 'convenio']].forEach(([id, campo]) => {
      if (catalogos[id]) return;
      const lista = valoresDistintos(registros, campo);
      if (!lista.length) return;
      catalogos[id] = lista;
      origen[id] = { archivo: 'valores distintos de Reporte Info', fecha: null, cargadas: lista.length, detalle: 'sin la exportación del maestro' };
    });
  }

  const { libro, filas } = await construirLibro({ ...datosPlantilla(fechaHoraChile(), { catalogos, origen, fecha }), claveHojas });
  const destino = path.join(args.salida, ARCHIVO_PLANTILLA);
  // Todo lo intermedio en una carpeta temporal del sistema, borrada al final.
  const temporal = await fs.mkdtemp(path.join(os.tmpdir(), 'medra-contingencia-'));
  try {
    const xlsx = path.join(temporal, 'sin_macros.xlsx');
    const bas = path.join(temporal, 'ModContingencia.bas');
    const xlsm = path.join(temporal, ARCHIVO_PLANTILLA);
    await fs.writeFile(xlsx, Buffer.from(await libro.xlsx.writeBuffer()));
    await fs.writeFile(bas, await basParaExcel(claveHojas));
    const r = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ARMAR, '-Xlsx', xlsx, '-Bas', bas, '-Xlsm', xlsm], { encoding: 'utf8' });
    if (r.status !== 0 || !String(r.stdout).includes('OK')) {
      throw new Error(`No se pudo armar el .xlsm con Excel:\n${r.stdout || ''}${r.stderr || ''}`);
    }
    // Reemplaza el archivo anterior. Si está abierto en Excel, Windows no
    // deja escribirlo y el anterior queda intacto.
    try {
      await fs.copyFile(xlsm, destino);
    } catch (e) {
      if (['EBUSY', 'EPERM', 'EACCES'].includes(e.code)) throw new Error(`No se pudo reemplazar ${destino}: ciérrelo en Excel y vuelva a intentarlo.`, { cause: e });
      throw e;
    }
  } finally {
    await fs.rm(temporal, { recursive: true, force: true });
  }

  console.log(`\nArchivo generado: ${destino}`);
  console.log(`Filas preparadas: Gestiones hasta la fila ${filas.ultimaGestion}, Ítems hasta la ${filas.ultimaItem}.`);
  [['reporteInfo', 'Reporte Info'], ...Object.entries(LECTORES).map(([id, { nombre }]) => [id, nombre])].forEach(([id, nombre]) => {
    if (!origen[id]) console.log(`${nombre}: vacío (para pegar a mano).`);
    else console.log(`${nombre}: ${origen[id].cargadas} cargados de ${origen[id].archivo} (${origen[id].detalle})${origen[id].provisional ? ' — PROVISIONAL' : ''}.`);
  });
  advertencias.forEach((a) => console.log(`AVISO — ${a}`));
  // Excel no permite bloquear el proyecto VBA por automatización: se hace a
  // mano después de cada regeneración (pasos en Instrucciones y en el doc).
  console.log('PENDIENTE — Bloquee el proyecto VBA con la contraseña de las hojas: Alt+F11 → clic derecho en "VBAProject (respaldo_implantes.xlsm)" → Propiedades → Protección → "Bloquear proyecto para visualización". Pasos completos en la hoja Instrucciones.');
  console.log('');
};

main().catch((e) => { console.error(`\nERROR: ${e.message}\n`); process.exit(1); });
