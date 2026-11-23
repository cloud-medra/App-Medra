// Genera la PLANTILLA vacía del respaldo de contingencia de Implantes
// (respaldo_implantes_PLANTILLA.xlsx): misma estructura que el respaldo,
// sin datos, con los catálogos vacíos para pegarlos desde las exportaciones
// de la app. No se conecta a Firestore ni cifra: la plantilla no tiene datos
// de pacientes y la contraseña se pone en Excel una vez usada.
//
// Uso (desde la raíz del repo):
//   node scripts/respaldoImplantes/generarPlantillaImplantes.js --salida "C:\Users\<usuario>\Documents\Medra\Contingencia"
//
// Si el archivo ya existe en la carpeta, se reemplaza.

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import process from 'node:process';
import { Buffer } from 'node:buffer';
import { construirLibro } from './libroRespaldo.js';
import { datosPlantilla, fechaHoraChile, ARCHIVO_PLANTILLA } from './datosRespaldo.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const salir = (mensaje) => { console.error(`\nERROR: ${mensaje}\n`); process.exit(1); };

const main = async () => {
  const args = process.argv.slice(2);
  const i = args.indexOf('--salida');
  if (i < 0 || !args[i + 1]) salir('Indique la carpeta de salida con --salida "<carpeta>".');
  const carpeta = path.resolve(args[i + 1]);
  const rel = path.relative(RAIZ, carpeta);
  if (rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))) salir('La carpeta de salida debe estar fuera del repositorio.');
  await fs.mkdir(carpeta, { recursive: true });

  const datos = datosPlantilla(fechaHoraChile());
  const { libro, filas } = await construirLibro(datos);
  const destino = path.join(carpeta, ARCHIVO_PLANTILLA);
  const temporal = `${destino}.tmp`;
  await fs.writeFile(temporal, Buffer.from(await libro.xlsx.writeBuffer()));
  await fs.rename(temporal, destino);

  console.log(`\nPlantilla generada: ${destino}`);
  console.log(`Filas preparadas: Gestiones hasta la fila ${filas.ultimaGestion}, Ítems hasta la ${filas.ultimaItem}, Documentos hasta la ${filas.ultimaDocumento}.\n`);
};

main().catch((e) => { console.error(e); process.exit(1); });
