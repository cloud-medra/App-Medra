// functions/scripts/migrarCostosPeriodosBodega.js
//
// Bodega en Control Mensual: deja el kardex existente con periodo y costo
// promedio ponderado (ver "Valorización y periodos" en bodega/nucleo.mjs).
//   1. Verifica que no haya movimientos anteriores a la apertura del periodo
//      (por defecto octubre 2026; la primera apertura de cualquier módulo en
//      ese mes): ese periodo parte con saldo inicial $0.
//   2. Recorre TODOS los movimientos en orden (fecha, orden) y recalcula:
//      - movimientos: linea, costoUnitario, valor, y periodoId en los que no
//        lo tienen (los hechos antes de esta funcionalidad);
//      - productos: costoPromedio y valorStock;
//      - tránsitos: costoUnitarioCentro (costo de lo dejado en el centro).
//      Costo de entrada: el ya registrado por las funciones nuevas; si no
//      tiene, el precio unitario de la línea del documento (carga inicial /
//      ingreso), el costo de lo dejado en el centro (retorno) o el precio
//      neto del maestro clínico (resto).
//   3. Escribe solo lo que cambia: correrlo dos veces no altera nada.
//
//   cd functions
//   node scripts/migrarCostosPeriodosBodega.js                       # prueba: muestra qué cambiaría, no escribe
//   node scripts/migrarCostosPeriodosBodega.js --aplicar             # guarda el respaldo JSON y escribe
//   node scripts/migrarCostosPeriodosBodega.js --revertir=<archivo>  # deja los campos como estaban en el respaldo
//   --periodo=2026_octubre   periodo de los movimientos sin periodo (por defecto)
//   --respaldos=<carpeta>    dónde guardar el respaldo (por defecto C:\respaldos-medra)
//
// Antes de escribir guarda en la carpeta de respaldos (fuera del proyecto y
// de OneDrive: tiene datos de pacientes; el script se niega a usar una
// carpeta de OneDrive) cada documento que va a modificar, completo, y los
// campos que cambian con su valor anterior (lo que usa --revertir). Si algo
// no cuadra (movimientos antes de la apertura, o unidades del kardex que no
// coinciden con el stock de los productos) no escribe.
//
// Correrlo DESPUÉS de desplegar las funciones y en horario de poco uso (un
// movimiento hecho mientras corre podría quedar con un costo anterior; se
// corrige volviendo a correrlo). Lecturas: 1 por movimiento, producto,
// tránsito y documento de Bodega.
//
// Credenciales: Application Default Credentials del proyecto. Proyecto:
// GCLOUD_PROJECT o workcraft-491b7.

/* global require, process, __dirname */
const fs = require('node:fs');
const path = require('node:path');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const {
  COL, TIPOS_MOVIMIENTO, MESES_PERIODO, lineaDeMovimiento, costoDe, aplicarCosto, valorizarMovimiento, camposCosto,
  costoEnCentro, sumarLineas, saldoFinalPeriodo, unidadesValorizadas,
} = require('../bodega/nucleo.mjs');

const PROYECTO = process.env.GCLOUD_PROJECT || 'workcraft-491b7';
const argumento = (nombre) => process.argv.find((a) => a.startsWith(`--${nombre}=`))?.split('=').slice(1).join('=') || null;
const aplicar = process.argv.includes('--aplicar');
const archivoRevertir = argumento('revertir');
const PERIODO = argumento('periodo') || '2026_octubre';
// Fuera del proyecto: la carpeta del proyecto la sincroniza OneDrive y los
// respaldos tienen datos de pacientes.
const DIR_RESPALDOS = path.resolve(argumento('respaldos') || 'C:\\respaldos-medra');
const LOTE = 400;
const AUSENTE = { __ausente: true }; // el campo no existía antes de la migración

const ms = (f) => (f && typeof f.toMillis === 'function' ? f.toMillis() : 0);
const pesos = (n) => `$${Math.round(Number(n) || 0).toLocaleString('es-CL')}`;
const fechaTexto = (f) => (ms(f) ? new Date(ms(f)).toISOString() : '—');
// Documento -> JSON (Timestamp como ISO, para leerlo y para el respaldo).
const aJSON = (v) => JSON.parse(JSON.stringify(v, (_k, x) => (x && typeof x.toDate === 'function' ? { __fecha: x.toDate().toISOString() } : x)));

const escribirPorTandas = async (db, cambios, armar) => {
  for (let i = 0; i < cambios.length; i += LOTE) {
    const lote = db.batch();
    cambios.slice(i, i + LOTE).forEach((c) => armar(lote, c));
    await lote.commit();
    process.stdout.write(`  escritos ${Math.min(i + LOTE, cambios.length)}/${cambios.length}\r`);
  }
  if (cambios.length) process.stdout.write('\n');
};

// Campos que cambian: { campo: valorNuevo } comparando con el documento.
const diferencias = (actual, nuevos) => Object.fromEntries(Object.entries(nuevos).filter(([k, v]) => actual[k] !== v));

// Apertura del periodo: la primera de cualquier módulo en ese mes (Bodega
// abre su periodo después de tener movimientos, así que la suya no sirve).
const aperturaDelPeriodo = async (db) => {
  const snap = await db.collection('cierres_periodos').get();
  const conFecha = snap.docs.filter((d) => d.id.startsWith(`${PERIODO}_`) && d.get('fechaApertura'))
    .sort((a, b) => ms(a.get('fechaApertura')) - ms(b.get('fechaApertura')));
  return conFecha.length ? { fecha: conFecha[0].get('fechaApertura'), origen: conFecha[0].get('modulo') } : null;
};

const calcular = async (db) => {
  const [snapMovs, snapProductos, snapTransitos, snapDocumentos] = await Promise.all([
    db.collection(COL.movimientos).get(),
    db.collection(COL.productos).get(),
    db.collection(COL.transitos).get(),
    db.collection(COL.documentos).where('estado', '==', 'CONFIRMADO').get(),
  ]);
  const productos = new Map(snapProductos.docs.map((d) => [d.id, { id: d.id, ...d.data() }]));
  const transitos = new Map(snapTransitos.docs.map((d) => [d.id, d.data()]));
  // Precio de cada línea de documento: documentoId|loteId -> precioUnitario.
  const preciosLinea = new Map();
  snapDocumentos.docs.forEach((d) => (d.get('lineas') || []).forEach((l) => preciosLinea.set(`${d.id}|${l.loteId}`, l.precioUnitario ?? null)));

  const movimientos = snapMovs.docs.map((d) => ({ id: d.id, ref: d.ref, data: d.data() }))
    .sort((a, b) => ms(a.data.fecha) - ms(b.data.fecha) || (a.data.orden || 0) - (b.data.orden || 0) || a.id.localeCompare(b.id));

  // Estado de la repetición, por producto y por tránsito.
  const saldos = new Map();
  const costos = new Map();
  const centros = new Map(); // transitoId -> { enCentro, costoUnitarioCentro }
  const cambiosMovs = [];
  movimientos.forEach((m) => {
    const d = m.data;
    const def = TIPOS_MOVIMIENTO[d.tipo];
    const producto = productos.get(d.productoId) || { id: d.productoId };
    if (!saldos.has(d.productoId)) {
      saldos.set(d.productoId, { disponible: 0, transito: 0, enCentro: 0 });
      costos.set(d.productoId, costoDe({ ...producto, disponible: 0, transito: 0, costoPromedio: null }));
    }
    const saldo = saldos.get(d.productoId);
    const cantidad = Number(d.cantidad) || 0;
    const centro = centros.get(d.transitoId) || { enCentro: 0, costoUnitarioCentro: null };
    const linea = lineaDeMovimiento(d.tipo);
    const esEntrada = linea && ['cargaInicial', 'ingresos', 'retornosCentros', 'ajustePositivo'].includes(linea);
    // Entradas ya valorizadas por las funciones nuevas: se respeta su costo.
    const registrado = esEntrada && d.linea !== undefined && typeof d.costoUnitario === 'number';
    const r = registrado
      ? aplicarCosto(costos.get(d.productoId), saldo, { tipo: d.tipo, cantidad, costoUnitario: d.costoUnitario })
      : valorizarMovimiento(costos.get(d.productoId), saldo, producto, { tipo: d.tipo, cantidad }, {
        precioLinea: d.documentoRef?.id ? preciosLinea.get(`${d.documentoRef.id}|${d.loteId}`) ?? null : null,
        costoCentro: centro.costoUnitarioCentro,
      });
    costos.set(d.productoId, r.costo);
    if (def) {
      saldo.disponible += def.disponible * cantidad;
      saldo.transito += def.transito * cantidad;
      saldo.enCentro += (def.enCentro || 0) * cantidad;
    }
    if (d.transitoId) {
      if (d.tipo === 'DEJADO_EN_CENTRO') centro.costoUnitarioCentro = costoEnCentro(centro, cantidad, r.valorizado.costoUnitario);
      centro.enCentro += (def?.enCentro || 0) * cantidad;
      centros.set(d.transitoId, centro);
    }
    const nuevos = { linea: r.valorizado.linea, costoUnitario: r.valorizado.costoUnitario, valor: r.valorizado.valor };
    if (d.periodoId === undefined) nuevos.periodoId = PERIODO;
    const cambios = diferencias(d, nuevos);
    if (Object.keys(cambios).length) cambiosMovs.push({ ref: m.ref, actual: d, cambios });
    m.final = { ...d, ...nuevos };
  });

  const cambiosProductos = [];
  const descuadres = [];
  productos.forEach((p) => {
    const saldo = saldos.get(p.id) || { disponible: 0, transito: 0, enCentro: 0 };
    if (saldo.disponible !== (Number(p.disponible) || 0) || saldo.transito !== (Number(p.transito) || 0) || saldo.enCentro !== (Number(p.enCentro) || 0)) {
      descuadres.push(`${p.codigoMaestro || p.id} ${p.nombre || ''}: kardex ${saldo.disponible}/${saldo.transito}/${saldo.enCentro} vs. producto ${p.disponible || 0}/${p.transito || 0}/${p.enCentro || 0} (disponible/tránsito/en centro)`);
    }
    const costo = costos.get(p.id) || costoDe({ ...p, disponible: 0, transito: 0, costoPromedio: null });
    const cambios = diferencias(p, camposCosto(costo));
    if (Object.keys(cambios).length) cambiosProductos.push({ ref: db.collection(COL.productos).doc(p.id), actual: p, cambios });
  });

  const cambiosTransitos = [];
  centros.forEach((c, id) => {
    const actual = transitos.get(id);
    if (!actual || c.costoUnitarioCentro === null) return;
    const cambios = diferencias(actual, { costoUnitarioCentro: c.costoUnitarioCentro });
    if (Object.keys(cambios).length) cambiosTransitos.push({ ref: db.collection(COL.transitos).doc(id), actual, cambios });
  });

  return { movimientos, productos, saldos, costos, cambiosMovs, cambiosProductos, cambiosTransitos, descuadres };
};

const revertir = async (db) => {
  const respaldo = JSON.parse(fs.readFileSync(path.resolve(archivoRevertir), 'utf8'));
  const entradas = respaldo.documentos || [];
  console.log(`REVIRTIENDO ${entradas.length} documento(s) desde ${archivoRevertir} (respaldo del ${respaldo.creadoEn})`);
  await escribirPorTandas(db, entradas, (lote, e) => {
    const campos = Object.fromEntries(Object.entries(e.camposAntes).map(([k, v]) => [k, v && v.__ausente ? FieldValue.delete() : v]));
    lote.update(db.doc(e.ruta), campos);
  });
  console.log('Listo: los campos volvieron a su valor anterior.');
};

(async () => {
  const db = getFirestore(initializeApp({ projectId: PROYECTO }));
  if (archivoRevertir) { await revertir(db); return; }
  const [anio, mes] = PERIODO.split('_');
  if (!/^\d{4}$/.test(anio) || !MESES_PERIODO.includes(mes)) throw new Error(`Periodo inválido: ${PERIODO} (ej.: 2026_octubre)`);
  console.log(`${aplicar ? 'APLICANDO' : 'PRUEBA (no escribe nada)'} — proyecto ${PROYECTO} — periodo ${PERIODO}\n`);

  // 1. Movimientos antes de la apertura del periodo.
  const apertura = await aperturaDelPeriodo(db);
  const r = await calcular(db);
  const anteriores = apertura ? r.movimientos.filter((m) => ms(m.data.fecha) < ms(apertura.fecha)) : [];
  console.log(`Apertura de ${PERIODO}: ${apertura ? `${fechaTexto(apertura.fecha)} (${apertura.origen})` : 'NO ENCONTRADA'}`);
  console.log(`Movimientos anteriores a la apertura: ${anteriores.length}`);
  anteriores.slice(0, 20).forEach((m) => console.log(`  ${fechaTexto(m.data.fecha)} ${m.data.tipo} ${m.data.productoNombre} × ${m.data.cantidad}`));
  if (r.descuadres.length) {
    console.log(`\nATENCIÓN: ${r.descuadres.length} producto(s) cuyo stock no coincide con su kardex:`);
    r.descuadres.slice(0, 30).forEach((t) => console.log(`  ${t}`));
  }

  // 2. Totales por producto y saldo resultante.
  console.log(`\nMovimientos: ${r.movimientos.length} · productos: ${r.productos.size}`);
  console.log(`Documentos a modificar → movimientos: ${r.cambiosMovs.length} · productos: ${r.cambiosProductos.length} · tránsitos: ${r.cambiosTransitos.length}`);
  console.log('\nProducto | unidades (general + tránsito) | costo promedio | valor');
  let saldo = 0;
  [...r.productos.values()].sort((a, b) => String(a.codigoMaestro || '').localeCompare(String(b.codigoMaestro || ''))).forEach((p) => {
    const costo = r.costos.get(p.id);
    const unidades = unidadesValorizadas(r.saldos.get(p.id));
    if (!costo || !unidades) return;
    saldo += costo.valorStock;
    console.log(`  ${p.codigoMaestro || p.id} ${p.nombre || ''} | ${unidades} | ${pesos(costo.costoPromedio)} | ${pesos(costo.valorStock)}${costo.costoPromedio ? '' : '  ← SIN COSTO'}`);
  });
  const delPeriodo = r.movimientos.filter((m) => (m.final.periodoId ?? PERIODO) === PERIODO).map((m) => m.final);
  const lineas = sumarLineas(delPeriodo);
  console.log(`\nCuadratura de ${PERIODO} (saldo inicial $0):`);
  Object.entries(lineas).forEach(([l, t]) => console.log(`  ${l}: ${t.unidades} u. · ${pesos(t.valor)}`));
  const saldoFinal = saldoFinalPeriodo(0, lineas);
  console.log(`  Saldo final calculado: ${pesos(saldoFinal)} · stock valorizado: ${pesos(saldo)} · diferencia: ${pesos(saldoFinal - saldo)}`);

  const bloqueos = [
    ...(!apertura ? [`no se encontró la apertura de ${PERIODO}`] : []),
    ...(anteriores.length ? ['hay movimientos anteriores a la apertura'] : []),
    ...(r.descuadres.length ? ['hay productos cuyo stock no coincide con su kardex'] : []),
  ];
  if (!aplicar) {
    console.log(`\n${bloqueos.length ? `No se podría aplicar: ${bloqueos.join('; ')}.` : 'Para aplicar: --aplicar'}`);
    return;
  }
  if (bloqueos.length) throw new Error(`No se aplica: ${bloqueos.join('; ')}.`);
  const todos = [...r.cambiosMovs, ...r.cambiosProductos, ...r.cambiosTransitos];
  if (!todos.length) { console.log('\nNada que cambiar (ya estaba migrado).'); return; }

  // 3. Respaldo y escritura.
  if (/onedrive/i.test(DIR_RESPALDOS) || DIR_RESPALDOS.startsWith(path.resolve(__dirname, '..', '..'))) {
    throw new Error(`No se guarda el respaldo en ${DIR_RESPALDOS}: está dentro de OneDrive o del proyecto. Usa --respaldos=<carpeta local>.`);
  }
  fs.mkdirSync(DIR_RESPALDOS, { recursive: true });
  const archivo = path.join(DIR_RESPALDOS, `bodega-costos-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(archivo, JSON.stringify({
    creadoEn: new Date().toISOString(), proyecto: PROYECTO, periodo: PERIODO,
    documentos: todos.map((c) => ({
      ruta: c.ref.path,
      camposAntes: Object.fromEntries(Object.keys(c.cambios).map((k) => [k, c.actual[k] === undefined ? AUSENTE : aJSON(c.actual[k])])),
      documento: aJSON(c.actual),
    })),
  }, null, 1));
  console.log(`\nRespaldo: ${archivo} (${todos.length} documento(s))`);
  await escribirPorTandas(db, todos, (lote, c) => lote.update(c.ref, c.cambios));
  console.log('Listo. Para deshacer: --revertir=<archivo del respaldo>');
})().catch((err) => { console.error(err.message || err); process.exit(1); });
