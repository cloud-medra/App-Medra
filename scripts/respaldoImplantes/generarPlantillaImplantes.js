// Genera la PLANTILLA del respaldo de contingencia de Implantes
// (respaldo_implantes_PLANTILLA.xlsm): misma estructura que el respaldo, sin
// datos de pacientes, con los catálogos cargados desde los archivos que se
// exportan en la app y las macros "Mover cargados" / "Devolver a pendientes".
// No se conecta a Firestore ni cifra (la contraseña se pone en Excel).
//
// Uso (desde la raíz del repo; ver docs/respaldo-contingencia-implantes.md):
//   node scripts/respaldoImplantes/generarPlantillaImplantes.js --salida "<carpeta>" \
//     --codigos "<registros_con_codigo_AAAA-MM-DD.csv>" --empresas "<empresas_maestros_AAAA-MM-DD.xlsx>" \
//     [--centros "<centros_maestros_….xlsx>"] [--recargos "<recargos_maestros_….xlsx>"] //     [--reporte-info "<Excel de la clínica>" (se puede repetir)] [--dias 60] //     [--previsiones "<previsiones_maestros_….xlsx>"] [--convenios "<convenios_maestros_….xlsx>"] [--sin-macros]
//
// Cada catálogo es opcional: el que no se indique queda vacío para pegarlo a
// mano. Reporte Info se carga solo con los últimos --dias días (60 por
// defecto). Sin --previsiones / --convenios, esas listas se arman con los
// valores distintos de Reporte Info. Con --sin-macros se genera .xlsx más ModContingencia.bas para
// importarlo a mano. Las macros se insertan con Excel (macros/armarXlsm.ps1):
// hace falta Excel instalado en este equipo.

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import process from 'node:process';
import { Buffer } from 'node:buffer';
import { spawnSync } from 'node:child_process';
import { construirLibro } from './libroRespaldo.js';
import { datosPlantilla, fechaHoraChile, fechaISOChile, isoAFechaExcel, ARCHIVO_PLANTILLA, ARCHIVO_PLANTILLA_MACROS } from './datosRespaldo.js';
import {
  leerArchivoExportado, codigosDesdeFilas, empresasDesdeFilas, centrosDesdeFilas, recargosDesdeFilas, fechaDesdeNombre,
  reporteInfoDesdeFilas, previsionesDesdeFilas, conveniosDesdeFilas, valoresDistintos,
} from './catalogosExportados.js';

const DIAS_REPORTE_INFO = 60;

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, '..', '..');
const BAS = path.join(AQUI, 'macros', 'ModContingencia.bas');
const ARMAR = path.join(AQUI, 'macros', 'armarXlsm.ps1');

const salir = (mensaje) => { console.error(`\nERROR: ${mensaje}\n`); process.exit(1); };

const leerArgumentos = (argv) => {
  const args = { sinMacros: false, reporteInfo: [], dias: DIAS_REPORTE_INFO };
  const conValor = {
    '--salida': 'salida', '--codigos': 'codigos', '--empresas': 'empresas', '--centros': 'centros', '--recargos': 'recargos',
    '--previsiones': 'previsiones', '--convenios': 'convenios',
  };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--sin-macros') args.sinMacros = true;
    else if (argv[i] === '--reporte-info') {
      if (!argv[i + 1]) salir('Falta el valor de --reporte-info.');
      args.reporteInfo.push(path.resolve(argv[++i]));
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
  if (id === 'codigos') return `${resumen.leidas} en el archivo; sin ${resumen.inactivas} inactivas`;
  return `${resumen.leidas} en el archivo; solo activos`;
};

// El .bas se importa en Windows-1252 con CRLF. Latin-1 coincide con
// Windows-1252 en los caracteres del español; cualquier otro se rechaza.
const basParaExcel = async () => {
  const contenido = (await fs.readFile(BAS, 'utf8')).replace(/\r?\n/g, '\r\n');
  const raro = [...contenido].find((ch) => ch.charCodeAt(0) > 0xff);
  if (raro) throw new Error(`ModContingencia.bas tiene un carácter que no es Windows-1252: "${raro}"`);
  return Buffer.from(contenido, 'latin1');
};

const main = async () => {
  const args = leerArgumentos(process.argv.slice(2));
  if (!args.salida) salir('Indique la carpeta de salida con --salida "<carpeta>".');
  const rel = path.relative(RAIZ, args.salida);
  if (rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))) salir('La carpeta de salida debe estar fuera del repositorio.');
  await fs.mkdir(args.salida, { recursive: true });

  const catalogos = {};
  const origen = {};
  const advertencias = [];
  let fecha = null;
  for (const [id, lector] of Object.entries(LECTORES)) {
    if (!args[id]) continue;
    const { registros, resumen, advertencias: avisos = [] } = lector.leer(await leerArchivoExportado(args[id]));
    if (!registros.length) salir(`${lector.nombre}: el archivo ${args[id]} no trajo registros usables.`);
    catalogos[id] = registros;
    const fechaArchivo = fechaDesdeNombre(path.basename(args[id]));
    origen[id] = { archivo: path.basename(args[id]), fecha: fechaArchivo, cargadas: registros.length, detalle: detalleDe(id, resumen) };
    advertencias.push(...avisos.map((a) => `${lector.nombre}: ${a}`));
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

  const { libro, filas } = await construirLibro(datosPlantilla(fechaHoraChile(), { catalogos, origen, fecha }));
  const xlsx = path.join(args.salida, ARCHIVO_PLANTILLA);
  const temporal = path.join(args.salida, `${path.parse(ARCHIVO_PLANTILLA).name}.tmp.xlsx`);
  await fs.writeFile(temporal, Buffer.from(await libro.xlsx.writeBuffer()));

  let destino;
  if (args.sinMacros) {
    await fs.rename(temporal, xlsx);
    await fs.writeFile(path.join(args.salida, 'ModContingencia.bas'), await basParaExcel());
    destino = xlsx;
  } else {
    const bas = path.join(args.salida, 'ModContingencia.tmp.bas');
    await fs.writeFile(bas, await basParaExcel());
    destino = path.join(args.salida, ARCHIVO_PLANTILLA_MACROS);
    const r = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ARMAR, '-Xlsx', temporal, '-Bas', bas, '-Xlsm', destino], { encoding: 'utf8' });
    await fs.rm(temporal, { force: true });
    await fs.rm(bas, { force: true });
    if (r.status !== 0 || !String(r.stdout).includes('OK')) {
      salir(`No se pudo armar el .xlsm con Excel:\n${r.stdout || ''}${r.stderr || ''}\nPruebe con --sin-macros y siga los pasos manuales del doc.`);
    }
  }

  console.log(`\nPlantilla generada: ${destino}`);
  console.log(`Filas preparadas: Gestiones hasta la fila ${filas.ultimaGestion}, Ítems hasta la ${filas.ultimaItem}, Documentos hasta la ${filas.ultimaDocumento}.`);
  [['reporteInfo', 'Reporte Info'], ...Object.entries(LECTORES).map(([id, { nombre }]) => [id, nombre])].forEach(([id, nombre]) => {
    console.log(origen[id] ? `${nombre}: ${origen[id].cargadas} cargados de ${origen[id].archivo} (${origen[id].detalle}).` : `${nombre}: vacío (para pegar a mano).`);
  });
  if (args.sinMacros) console.log('Sin macros: importe ModContingencia.bas a mano (ver el doc).');
  advertencias.forEach((a) => console.log(`AVISO — ${a}`));
  console.log('');
};

main().catch((e) => { console.error(e); process.exit(1); });
