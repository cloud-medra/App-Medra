// functions/scripts/migrarPerdidasFibras.js
//
// Implantes → Fibras: agrupa las pérdidas antiguas (una por número) en la
// pérdida nueva (todos los usos restantes de una vez, con numerosPerdidos).
// Regla del plan: fibrasNucleo.planMigracionPerdidas (con sus tests). Solo
// aplica si las pérdidas vigentes de una fibra son exactamente sus últimos
// números, después de todos sus usos reales; si no, la fibra se informa y no
// se toca.
//
// Por cada fibra que aplica, en UNA transacción:
//   - la fibra: esos números salen de numerosOcupados (y de fechasUso) y pasan
//     a numerosPerdidos; usosConsumidos y estado no cambian;
//   - una pérdida nueva con la fecha, el usuario, el motivo y la observación
//     originales, más `migracion` (cuándo, quién y de qué registros);
//   - las pérdidas antiguas NO se borran: quedan ANULADAS con el motivo
//     MIGRADA_A_PERDIDA_TOTAL y `migradaA` (el ID de la nueva);
//   - un log PERDIDA_MIGRADA en la fibra.
//
//   NODE_PATH=functions/node_modules node functions/scripts/migrarPerdidasFibras.js            # simula, no escribe
//   ... --fibra=FIB-0003       # solo esa fibra (menos lecturas)
//   ... --aplicar              # guarda un respaldo JSON y escribe
//   --respaldos=<carpeta>      dónde guardar el respaldo (por defecto C:\respaldos-medra)
//
// Lecturas: 1 por fibra y 1 por uso de cada fibra revisada (hoy, unas 30 en
// total; con --fibra, unas 6). Correrlo dos veces no cambia nada: una fibra ya
// migrada no tiene pérdidas antiguas vigentes.
//
// Credenciales: Application Default Credentials. Proyecto: workcraft-491b7.

/* global require, process */
const fs = require('node:fs');
const path = require('node:path');
const { initializeApp, applicationDefault, getApps } = require('firebase-admin/app');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');

const argumento = (nombre) => process.argv.find((a) => a.startsWith(`--${nombre}=`))?.split('=').slice(1).join('=') || null;
const APLICAR = process.argv.includes('--aplicar');
const SOLO = argumento('fibra');
const DIR_RESPALDOS = path.resolve(argumento('respaldos') || 'C:\\respaldos-medra');
const COL = 'implantes_fibras';
const POR = { uid: 'script', nombre: 'Migración de pérdidas (script)' };

const fecha = (v) => (v?.toDate ? v.toDate().toISOString() : v);
const respaldoJSON = (x) => JSON.parse(JSON.stringify(x, (k, v) => (v && typeof v === 'object' && typeof v.toDate === 'function' ? { _ts: v.toDate().toISOString() } : v)));

(async () => {
  const { planMigracionPerdidas, textoNumeros } = await import('../../src/components/modulos/operaciones/implantes/fibras/fibrasNucleo.js');
  if (!getApps().length) initializeApp({ credential: applicationDefault(), projectId: 'workcraft-491b7' });
  const db = getFirestore();

  const fibrasSnap = SOLO ? [await db.collection(COL).doc(SOLO).get()].filter((d) => d.exists) : (await db.collection(COL).get()).docs;
  if (!fibrasSnap.length) { console.log(SOLO ? `No existe la fibra ${SOLO}.` : 'No hay fibras.'); process.exit(0); }

  const planes = [];
  for (const d of fibrasSnap) {
    const fibra = { id: d.id, ...d.data() };
    const usos = (await d.ref.collection('usos').get()).docs.map((u) => ({ id: u.id, ...u.data() }));
    const nuevoUsoId = d.ref.collection('usos').doc().id;
    const plan = planMigracionPerdidas(fibra, usos, { nuevoUsoId, ahora: Timestamp.now(), por: POR });
    if (!plan.aplica && /Sin pérdidas antiguas/.test(plan.motivo)) continue;
    planes.push({ fibra, usos, plan, nuevoUsoId });
  }
  console.log(`Fibras revisadas: ${fibrasSnap.length}. Con pérdidas antiguas vigentes: ${planes.length}.`);

  planes.forEach(({ fibra, usos, plan, nuevoUsoId }) => {
    console.log(`\n${fibra.referencia} (${fibra.id}) · lote ${fibra.lote} · ${fibra.usosTotales} usos`);
    if (!plan.aplica) { console.log(`  NO SE MIGRA: ${plan.motivo}`); return; }
    const antiguas = usos.filter((u) => plan.anulaciones.some((a) => a.usoId === u.id));
    console.log('  Pérdidas antiguas (quedan ANULADAS con motivo MIGRADA_A_PERDIDA_TOTAL, no se borran):');
    antiguas.sort((a, b) => a.numeroUso - b.numeroUso).forEach((u) => console.log(`    ${u.id}: número ${u.numeroUso}/${u.usosTotales}, fecha ${u.fecha}, motivo "${u.motivo || ''}"${u.observacion ? `, observación "${u.observacion}"` : ''}, registrada por ${u.registradoPor?.nombre || '?'} el ${fecha(u.registradoEl)}`));
    const p = plan.perdida;
    console.log(`  Pérdida nueva ${nuevoUsoId}: números ${textoNumeros(p.numerosPerdidos, p.usosTotales)}, ${p.usosRealizados} usos realizados, fecha ${p.fecha}, motivo "${p.motivo}"${p.observacion ? `, observación "${p.observacion}"` : ''}, registrada por ${p.registradoPor?.nombre || '?'} el ${fecha(p.registradoEl)}`);
    const c = plan.cambiosFibra;
    console.log(`  Fibra: numerosOcupados [${(fibra.numerosOcupados || []).join(', ')}] → [${c.numerosOcupados.join(', ')}]; numerosPerdidos → [${c.numerosPerdidos.join(', ')}]; usosConsumidos ${fibra.usosConsumidos} → ${c.usosConsumidos}; estado ${fibra.estado} y ubicación ${fibra.ubicacion} sin cambio`);
    console.log(`  Fechas de uso que salen: ${plan.numeros.map((n) => `${n}: ${fibra.fechasUso?.[String(n)] || '—'}`).join(', ')}`);
    console.log(`  Resultado en pantalla: ${p.usosRealizados} usos realizados y ${p.numerosPerdidos.length} perdidos (${textoNumeros(p.numerosPerdidos, p.usosTotales)}), etiqueta "Pérdida".`);
    console.log(`  Auditoría: log PERDIDA_MIGRADA (de ${plan.log.detalles.de.join(', ')} a ${nuevoUsoId}).`);
  });

  const aplicables = planes.filter((x) => x.plan.aplica);
  if (!APLICAR) { console.log(`\nSimulación: no se escribió nada. ${aplicables.length} fibra(s) se migrarían. Para escribir: --aplicar`); process.exit(0); }
  if (!aplicables.length) { console.log('\nNada que migrar.'); process.exit(0); }

  fs.mkdirSync(DIR_RESPALDOS, { recursive: true });
  const archivo = path.join(DIR_RESPALDOS, `perdidas-fibras-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(archivo, JSON.stringify(respaldoJSON(aplicables.map(({ fibra, usos }) => ({ fibra, usos }))), null, 2));
  console.log(`\nRespaldo: ${archivo}`);

  for (const { fibra, nuevoUsoId } of aplicables) {
    const ref = db.collection(COL).doc(fibra.id);
    await db.runTransaction(async (t) => {
      // Se vuelve a leer y a calcular dentro de la transacción: si algo cambió
      // desde la simulación, manda lo actual (o no se migra).
      const actual = await t.get(ref);
      const usos = (await t.get(ref.collection('usos'))).docs.map((u) => ({ id: u.id, ...u.data() }));
      const plan = planMigracionPerdidas({ id: fibra.id, ...actual.data() }, usos, { nuevoUsoId, ahora: Timestamp.now(), por: POR });
      if (!plan.aplica) throw new Error(`${fibra.id}: ya no aplica (${plan.motivo})`);
      t.update(ref, plan.cambiosFibra);
      t.create(ref.collection('usos').doc(nuevoUsoId), plan.perdida);
      plan.anulaciones.forEach((a) => t.update(ref.collection('usos').doc(a.usoId), a.cambios));
      t.set(ref.collection('logs').doc(), plan.log);
    });
    console.log(`${fibra.id}: migrada (pérdida ${nuevoUsoId}).`);
  }
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
