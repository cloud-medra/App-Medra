// functions/scripts/verificarBodega.js
//
// Revisión de SOLO LECTURA de la consistencia de Bodega (no escribe nada):
//   - el disponible / tránsito / dejado en centro (y por centro) de cada
//     producto es la suma de sus lotes;
//   - el tránsito y lo dejado en centro de cada lote (por centro) es la suma
//     de lo pendiente / enCentro en sus registros de tránsito abiertos;
//   - bodega_transito_centros/{centro} cuadra con los tránsitos abiertos;
//   - no hay saldos negativos ni tránsitos abiertos vacíos.
// Lee las colecciones bodega_productos, bodega_lotes, bodega_transitos
// (abiertos) y bodega_transito_centros completas: cuesta 1 lectura por
// documento.
//
//   cd functions
//   node scripts/verificarBodega.js
//
// Proyecto: workcraft-491b7 (o GCLOUD_PROJECT). Credenciales: Application
// Default Credentials. Con FIRESTORE_EMULATOR_HOST corre contra el emulador.

const process = require('node:process');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { COL } = require('../bodega/nucleo.mjs');

const PROYECTO = process.env.GCLOUD_PROJECT || 'workcraft-491b7';

const sumarMapa = (destino, origen = {}) => {
  Object.entries(origen).forEach(([k, v]) => { destino[k] = (destino[k] || 0) + (Number(v) || 0); });
  return destino;
};
const sinCeros = (m) => Object.fromEntries(Object.entries(m).filter(([, v]) => v !== 0));
const igualMapa = (a, b) => JSON.stringify(Object.entries(sinCeros(a)).sort()) === JSON.stringify(Object.entries(sinCeros(b)).sort());

// Devuelve la lista de diferencias (vacía = todo cuadra). Exportado para los tests.
const verificar = async (db) => {
  const [productos, lotes, transitos, centros] = await Promise.all([
    db.collection(COL.productos).get(),
    db.collection(COL.lotes).get(),
    db.collection(COL.transitos).where('estado', '==', 'ABIERTO').get(),
    db.collection(COL.transitoCentros).get(),
  ]);
  const problemas = [];

  const porProducto = {};
  lotes.docs.forEach((d) => {
    const l = d.data();
    if ((l.disponible || 0) < 0 || (l.transito || 0) < 0 || (l.enCentro || 0) < 0) problemas.push(`Lote ${d.id}: saldo negativo.`);
    const acc = porProducto[l.productoId] || { disponible: 0, transito: 0, transitoPorCentro: {}, enCentro: 0, enCentroPorCentro: {} };
    acc.disponible += l.disponible || 0;
    acc.transito += l.transito || 0;
    acc.enCentro += l.enCentro || 0;
    sumarMapa(acc.transitoPorCentro, l.transitoPorCentro);
    sumarMapa(acc.enCentroPorCentro, l.enCentroPorCentro);
    porProducto[l.productoId] = acc;
    const suma = Object.values(l.transitoPorCentro || {}).reduce((n, v) => n + v, 0);
    if (suma !== (l.transito || 0)) problemas.push(`Lote ${d.id}: tránsito ${l.transito} pero por centro suma ${suma}.`);
    const sumaEnCentro = Object.values(l.enCentroPorCentro || {}).reduce((n, v) => n + v, 0);
    if (sumaEnCentro !== (l.enCentro || 0)) problemas.push(`Lote ${d.id}: dejado en centro ${l.enCentro || 0} pero por centro suma ${sumaEnCentro}.`);
  });
  productos.docs.forEach((d) => {
    const p = d.data();
    const s = porProducto[d.id] || { disponible: 0, transito: 0, transitoPorCentro: {}, enCentro: 0, enCentroPorCentro: {} };
    if ((p.disponible || 0) !== s.disponible) problemas.push(`Producto ${p.codigoMaestro}: disponible ${p.disponible || 0}, lotes suman ${s.disponible}.`);
    if ((p.transito || 0) !== s.transito) problemas.push(`Producto ${p.codigoMaestro}: tránsito ${p.transito || 0}, lotes suman ${s.transito}.`);
    if (!igualMapa(p.transitoPorCentro || {}, s.transitoPorCentro)) problemas.push(`Producto ${p.codigoMaestro}: tránsito por centro no cuadra con sus lotes.`);
    if ((p.enCentro || 0) !== s.enCentro) problemas.push(`Producto ${p.codigoMaestro}: dejado en centro ${p.enCentro || 0}, lotes suman ${s.enCentro}.`);
    if (!igualMapa(p.enCentroPorCentro || {}, s.enCentroPorCentro)) problemas.push(`Producto ${p.codigoMaestro}: dejado en centro por centro no cuadra con sus lotes.`);
  });

  const porLote = {};
  const enCentroPorLote = {};
  const porCentro = {};
  transitos.docs.forEach((d) => {
    const t = d.data();
    if ((t.pendiente || 0) + (t.enCentro || 0) <= 0) problemas.push(`Tránsito ${d.id}: abierto sin pendiente ni dejado en centro.`);
    porLote[t.loteId] = sumarMapa(porLote[t.loteId] || {}, { [t.centroId]: t.pendiente || 0 });
    enCentroPorLote[t.loteId] = sumarMapa(enCentroPorLote[t.loteId] || {}, { [t.centroId]: t.enCentro || 0 });
    const c = porCentro[t.centroId] || { unidades: 0, productos: {}, abiertos: 0, enCentro: 0, productosEnCentro: {} };
    c.unidades += t.pendiente || 0;
    c.enCentro += t.enCentro || 0;
    sumarMapa(c.productos, { [t.productoId]: t.pendiente || 0 });
    sumarMapa(c.productosEnCentro, { [t.productoId]: t.enCentro || 0 });
    c.abiertos += 1;
    porCentro[t.centroId] = c;
  });
  lotes.docs.forEach((d) => {
    if (!igualMapa(d.data().transitoPorCentro || {}, porLote[d.id] || {})) problemas.push(`Lote ${d.id}: tránsito por centro no cuadra con sus tránsitos abiertos.`);
    if (!igualMapa(d.data().enCentroPorCentro || {}, enCentroPorLote[d.id] || {})) problemas.push(`Lote ${d.id}: dejado en centro no cuadra con sus tránsitos abiertos.`);
  });
  const idsCentros = new Set([...centros.docs.map((d) => d.id), ...Object.keys(porCentro)]);
  idsCentros.forEach((id) => {
    const doc = centros.docs.find((d) => d.id === id)?.data() || {};
    const real = porCentro[id] || { unidades: 0, productos: {}, abiertos: 0, enCentro: 0, productosEnCentro: {} };
    if ((doc.unidades || 0) !== real.unidades) problemas.push(`Centro ${doc.centroNombre || id}: unidades ${doc.unidades || 0}, tránsitos abiertos suman ${real.unidades}.`);
    if (!igualMapa(doc.productos || {}, real.productos)) problemas.push(`Centro ${doc.centroNombre || id}: productos no cuadran con sus tránsitos abiertos.`);
    if ((doc.enCentro || 0) !== real.enCentro) problemas.push(`Centro ${doc.centroNombre || id}: dejado en centro ${doc.enCentro || 0}, tránsitos abiertos suman ${real.enCentro}.`);
    if (!igualMapa(doc.productosEnCentro || {}, real.productosEnCentro)) problemas.push(`Centro ${doc.centroNombre || id}: productos dejados no cuadran con sus tránsitos abiertos.`);
    if ((doc.transitosAbiertos || 0) !== real.abiertos) problemas.push(`Centro ${doc.centroNombre || id}: transitosAbiertos ${doc.transitosAbiertos || 0}, hay ${real.abiertos}.`);
  });
  return problemas;
};

const main = async () => {
  initializeApp({ projectId: PROYECTO });
  console.log(`Proyecto: ${PROYECTO}${process.env.FIRESTORE_EMULATOR_HOST ? ' (EMULADOR)' : ''} · solo lectura\n`);
  const problemas = await verificar(getFirestore());
  if (!problemas.length) {
    console.log('Todo cuadra.');
    return;
  }
  console.log(`${problemas.length} diferencia(s):`);
  problemas.forEach((p) => console.log(`  ${p}`));
  process.exitCode = 1;
};

if (require.main === module) {
  main().catch((error) => {
    console.error('Error en la verificación:', error);
    process.exit(1);
  });
}

module.exports = { verificar };
