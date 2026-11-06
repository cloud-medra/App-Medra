// functions/scripts/generarUsoCodigos.js
//
// Carga inicial y reparación del historial de uso de las referencias
// (maestros_codigos_uso): lee todas las gestiones de Implantes, recalcula cada
// documento desde cero y lo sobrescribe si difiere (no suma a lo existente).
// Después lo mantiene el trigger zonasDiagnosticoGestionImplante.
//
//   cd functions
//   node scripts/generarUsoCodigos.js            # simulación (no escribe)
//   node scripts/generarUsoCodigos.js --aplicar  # escribe
//
// Correrlo DESPUÉS de desplegar la función y en horario sin uso: un guardado
// entre la lectura de las gestiones y la escritura se perdería. Volver a simular
// muestra si quedó alguna diferencia, y aplicar de nuevo la corrige.
//
// Lecturas: 1 por gestión + 1 por documento de uso existente. Estas escrituras
// no disparan triggers.
//
// Credenciales: Application Default Credentials del proyecto
// (`gcloud auth application-default login`, o GOOGLE_APPLICATION_CREDENTIALS).
// Proyecto: GCLOUD_PROJECT o workcraft-491b7.

const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { recalcular } = require('../usoCodigos/servicio');

const PROYECTO = process.env.GCLOUD_PROJECT || 'workcraft-491b7';
const aplicar = process.argv.includes('--aplicar');

(async () => {
  const db = getFirestore(initializeApp({ projectId: PROYECTO }));
  console.log(`${aplicar ? 'APLICANDO' : 'SIMULACIÓN (sin escribir)'} — proyecto ${PROYECTO}`);
  const r = await recalcular(db, { aplicar });
  console.log(`Gestiones leídas: ${r.totalGestiones} (sin ninguna asociación: ${r.sinAporte})`);
  console.log(`Referencias con historial: ${r.referencias} · médicos distintos: ${r.medicos} · descripciones distintas: ${r.descripciones}`);
  console.log(`Documento más grande: ${(r.bytesDocumentoMayor / 1024).toFixed(1)} KB (límite de Firestore: 1024 KB)`);
  console.log(`Documentos: ${r.aCrear} por crear · ${r.aSobrescribir} por sobrescribir · ${r.aBorrar} por borrar · ${r.sinCambios} sin cambios`);
  console.log(`Lecturas: ${r.lecturas}`);
  console.log(`\nReferencias en más de una empresa (según sus gestiones): ${r.enVariasEmpresas.length}`);
  r.enVariasEmpresas.forEach((x) => console.log(`  ${x.referencia}: ${x.empresas.join(' | ')}`));
})().catch((err) => { console.error(err); process.exit(1); });
