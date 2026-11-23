// Genera el respaldo de contingencia de Implantes (Excel cifrado) con las
// gestiones del mes abierto y los catálogos. SOLO LECTURA en Firestore.
//
// Uso (desde la raíz del repo):
//   node scripts/respaldoImplantes/generarRespaldoImplantes.js --salida "D:\Respaldos\Implantes"
//   … --contar           solo cuenta y dice cuántas lecturas hará (≈ 10 lecturas)
//   … --mes 2026-10      otro mes en vez del abierto
//   … --demo             datos ficticios, sin Firestore (para probar)
//
// Requisitos:
//   - Variable RESPALDO_IMPLANTES_CLAVE con la contraseña del archivo. Sin
//     ella el script se detiene: nunca se genera un archivo sin cifrar.
//   - Credenciales de Google (GOOGLE_APPLICATION_CREDENTIALS o las de
//     gcloud) con lectura de Firestore, salvo con --demo.
//   - La carpeta de salida debe estar FUERA del repositorio.
//
// Guarda respaldo_implantes_AAAA-MM-DD.xlsx (fecha de Chile; si se corre
// dos veces el mismo día, reemplaza el del día) y deja solo las 3 copias
// más recientes de la carpeta.
//
// Lecturas por corrida: períodos abiertos (pocas) + 1 por gestión del mes +
// 1 por documento de maestros_codigos, empresas, centros y recargos + 1 del
// conteo del mes anterior.

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import process from 'node:process';
import { Buffer } from 'node:buffer';
import officeCrypto from 'officecrypto-tool';
import {
  filasDesdeGestiones, catalogoReferencias, listaEmpresas, listaCentros, listaRecargos, dimensionar,
  periodoAbiertoDe, periodoARuta, mesDesdeTexto, mesAnterior, fechaISOChile, fechaHoraChile,
  nombreArchivo, copiasABorrar, MESES,
} from './datosRespaldo.js';
import { construirLibro } from './libroRespaldo.js';
import { datosDemo } from './datosDemo.js';
import { rangoRutaMesGestiones, esRutaDelMes } from '../../src/components/modulos/operaciones/shared/gestion/consultaGestiones.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PROYECTO = 'workcraft-491b7';
const COLECCION = 'implantes_gestiones';
const VARIABLE_CLAVE = 'RESPALDO_IMPLANTES_CLAVE';
const LARGO_MINIMO_CLAVE = 12;

const salir = (mensaje) => { console.error(`\nERROR: ${mensaje}\n`); process.exit(1); };

const leerArgumentos = (argv) => {
  const args = { salida: null, mes: null, contar: false, demo: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--salida') args.salida = argv[++i];
    else if (a === '--mes') args.mes = argv[++i];
    else if (a === '--contar') args.contar = true;
    else if (a === '--demo') args.demo = true;
    else salir(`Opción desconocida: ${a}`);
  }
  return args;
};

const estaDentro = (padre, hijo) => {
  const rel = path.relative(padre, hijo);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
};

// --- Firestore (firebase-admin de functions/node_modules) -------------------

const conectar = () => {
  const requerir = createRequire(path.join(RAIZ, 'functions', 'package.json'));
  const { initializeApp } = requerir('firebase-admin/app');
  const { getFirestore, FieldPath } = requerir('firebase-admin/firestore');
  initializeApp({ projectId: PROYECTO });
  return { db: getFirestore(), FieldPath };
};

const consultaMes = ({ db, FieldPath }, mes) => {
  const { desde, hasta } = rangoRutaMesGestiones(COLECCION, mes);
  return db.collectionGroup('detalles')
    .where(FieldPath.documentId(), '>=', desde)
    .where(FieldPath.documentId(), '<', hasta);
};

const resolverMes = async (fs_, args, lecturas) => {
  const snap = await fs_.db.collection('cierres_periodos').where('estado', 'in', ['ABIERTO', 'REABIERTO']).get();
  lecturas.periodos = snap.size;
  const abierto = periodoAbiertoDe(snap.docs.map((d) => d.data()));
  const periodoTexto = abierto ? `${abierto.mes} ${abierto.anio} (${abierto.estado})` : 'sin período abierto';
  if (args.mes) return { mes: mesDesdeTexto(args.mes), periodoTexto };
  if (!abierto) salir('Implantes no tiene período abierto: indique --mes AAAA-MM.');
  return { mes: periodoARuta(abierto), periodoTexto };
};

const contar = async (q) => (await q.count().get()).data().count;

const modoContar = async (args) => {
  const fs_ = conectar();
  const lecturas = {};
  const { mes, periodoTexto } = await resolverMes(fs_, args, lecturas);
  const gestiones = await contar(consultaMes(fs_, mes));
  const anterior = await contar(consultaMes(fs_, mesAnterior(mes)));
  const maestros = {};
  for (const col of ['maestros_codigos', 'maestros_empresas', 'maestros_centros', 'maestros_recargos']) {
    maestros[col] = await contar(fs_.db.collection(col));
  }
  const totalMaestros = Object.values(maestros).reduce((s, n) => s + n, 0);
  const total = lecturas.periodos + gestiones + totalMaestros + 1;
  console.log(`\nPeríodo abierto: ${periodoTexto}. Mes a exportar: ${mes.anio}-${mes.mes}.`);
  console.log(`Gestiones del mes: ${gestiones} (mes anterior: ${anterior}).`);
  Object.entries(maestros).forEach(([c, n]) => console.log(`${c}: ${n}`));
  console.log(`\nLecturas estimadas de una exportación: ${total}`);
  console.log(`  (${lecturas.periodos} períodos + ${gestiones} gestiones + ${totalMaestros} maestros + 1 conteo del mes anterior)`);
  console.log('Este conteo costó unas', lecturas.periodos + 6, 'lecturas.\n');
};

const leerTodo = async (args) => {
  const fs_ = conectar();
  const lecturas = {};
  const { mes, periodoTexto } = await resolverMes(fs_, args, lecturas);
  const snapMes = await consultaMes(fs_, mes).get();
  lecturas.gestiones = snapMes.size;
  const gestiones = snapMes.docs
    .filter((d) => esRutaDelMes(d.ref.path, COLECCION, mes))
    .map((d) => ({ refPath: d.ref.path, ...d.data() }));
  const leerColeccion = async (col) => {
    const s = await fs_.db.collection(col).get();
    lecturas[col] = s.size;
    return s.docs.map((d) => d.data());
  };
  const codigos = await leerColeccion('maestros_codigos');
  const empresas = await leerColeccion('maestros_empresas');
  const centros = await leerColeccion('maestros_centros');
  const recargos = await leerColeccion('maestros_recargos');
  const gestionesMesAnterior = await contar(consultaMes(fs_, mesAnterior(mes)));
  lecturas.conteoMesAnterior = 1;
  return { mes, periodoTexto, gestiones, codigos, empresas, centros, recargos, gestionesMesAnterior, lecturas };
};

// --- Archivo -------------------------------------------------------------------

const guardarCifrado = async (libro, carpeta, clave) => {
  const plano = Buffer.from(await libro.xlsx.writeBuffer());
  const cifrado = officeCrypto.encrypt(plano, { password: clave });
  if (!officeCrypto.isEncrypted(cifrado)) throw new Error('El archivo no quedó cifrado: no se guarda.');
  const destino = path.join(carpeta, nombreArchivo(fechaISOChile()));
  // Se escribe primero un temporal y luego se renombra: si algo falla a
  // medio camino, no queda un respaldo incompleto con el nombre bueno.
  const temporal = `${destino}.tmp`;
  await fs.writeFile(temporal, cifrado);
  await fs.rename(temporal, destino);
  return { destino, bytes: cifrado.length };
};

const rotarCopias = async (carpeta) => {
  const nombres = await fs.readdir(carpeta);
  const borrar = copiasABorrar(nombres);
  for (const n of borrar) await fs.unlink(path.join(carpeta, n));
  return borrar;
};

// --- Principal -----------------------------------------------------------------

const main = async () => {
  const args = leerArgumentos(process.argv.slice(2));

  if (args.contar) {
    if (args.demo) salir('--contar no se combina con --demo.');
    await modoContar(args);
    return;
  }

  // Validaciones ANTES de leer nada.
  const clave = process.env[VARIABLE_CLAVE];
  if (!clave) salir(`Falta la variable ${VARIABLE_CLAVE} con la contraseña. No se genera el archivo sin cifrar.`);
  if (clave.length < LARGO_MINIMO_CLAVE) salir(`La contraseña debe tener al menos ${LARGO_MINIMO_CLAVE} caracteres.`);
  if (!args.salida) salir('Indique la carpeta de salida con --salida "<carpeta>".');
  const carpeta = path.resolve(args.salida);
  if (estaDentro(RAIZ, carpeta)) salir('La carpeta de salida debe estar fuera del repositorio (el archivo contiene datos de pacientes).');
  await fs.mkdir(carpeta, { recursive: true });

  const inicio = Date.now();
  let leidos;
  if (args.demo) {
    const mes = args.mes ? mesDesdeTexto(args.mes) : { anio: '2026', mes: '11' };
    leidos = { mes, periodoTexto: `DEMO ${MESES[Number(mes.mes) - 1]} ${mes.anio}`, lecturas: {}, ...datosDemo({ anio: mes.anio, mes: mes.mes }) };
  } else {
    leidos = await leerTodo(args);
  }

  const { filasGestiones, filasItems, ultimaLinea } = filasDesdeGestiones(leidos.gestiones);
  const catalogo = catalogoReferencias(leidos.codigos);
  const tamano = dimensionar({
    gestionesMes: filasGestiones.length,
    itemsMes: filasItems.length,
    gestionesMesAnterior: leidos.gestionesMesAnterior,
  });
  const { libro, filas } = await construirLibro({
    generadoEl: fechaHoraChile(),
    periodoTexto: leidos.periodoTexto,
    mesExportado: `${leidos.mes.anio}-${leidos.mes.mes}`,
    filasGestiones, filasItems, ultimaLinea, catalogo, tamano,
    empresas: listaEmpresas(leidos.empresas),
    centros: listaCentros(leidos.centros),
    recargos: listaRecargos(leidos.recargos),
    // Sin macros: la protección usa la misma variable si existe.
    claveHojas: process.env.RESPALDO_IMPLANTES_CLAVE_HOJAS || '',
  });
  const { destino, bytes } = await guardarCifrado(libro, carpeta, clave);
  const borradas = await rotarCopias(carpeta);

  const totalLecturas = Object.values(leidos.lecturas).reduce((s, n) => s + n, 0);
  console.log(`\nRespaldo generado: ${destino} (${(bytes / 1024 / 1024).toFixed(1)} MB, cifrado)`);
  console.log(`Mes exportado: ${leidos.mes.anio}-${leidos.mes.mes} · período: ${leidos.periodoTexto}`);
  console.log(`Gestiones: ${filasGestiones.length} exportadas + ${tamano.gestionesLibres} libres (hasta la fila ${filas.ultimaGestion})`);
  console.log(`Ítems: ${filasItems.length} exportados + ${tamano.itemsLibres} libres (hasta la fila ${filas.ultimaItem})`);
  console.log(`Referencias: ${catalogo.resumen.usables} (excluidas: ${catalogo.resumen.inactivas} inactivas). `
    + `Referencias en más de una empresa: ${catalogo.resumen.referenciasRepetidas}; referencia+empresa repetidas: ${catalogo.resumen.clavesRepetidas}.`);
  console.log(`Lecturas de Firestore: ${args.demo ? '0 (demo)' : totalLecturas}`);
  console.log(borradas.length ? `Copias antiguas borradas: ${borradas.join(', ')}` : 'Sin copias antiguas que borrar.');
  console.log(`Tiempo: ${((Date.now() - inicio) / 1000).toFixed(1)} s\n`);
};

main().catch((e) => { console.error(e); process.exit(1); });
