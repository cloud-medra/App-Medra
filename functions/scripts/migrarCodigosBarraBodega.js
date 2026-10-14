// functions/scripts/migrarCodigosBarraBodega.js
//
// Migración única al módulo Bodega: los códigos de barra ya vinculados en
// Inventario (inventario_codigos_barra/{código} -> maestros_codigos/{id})
// pasan a Bodega. NO migra stock (Bodega parte de cero con la carga
// inicial) y NO modifica nada de Inventario (solo lo lee).
//
// Por cada producto del maestro clínico que tenga códigos vinculados:
//   - si ya existe un producto de Bodega vinculado a ese maestro clínico
//     (maestroCodigoId), se le agregan los códigos que le falten;
//   - si no, se crea el producto de Bodega:
//       nombre       = descriptor del maestro clínico (o su referencia)
//       código       = automático (BOD-00001…); el código del maestro
//                      clínico se repite entre productos, queda en la copia
//                      maestroCodigo y también sirve para buscar
//       referencia   = referencia del maestro clínico
//       categoría    = la "clase" del maestro clínico (IMPLANTE, INSUMOS,
//                      PAD, KIT); se crea si no existe
//       unidad       = UNIDAD (se crea si no existe)
//       lote y vencimiento: sí (se pueden cambiar mientras no tenga
//                      movimientos)
//     con sus códigos vinculados.
// Se informa y se salta: códigos ya vinculados en Bodega a OTRO producto
// (no se reasignan) y vínculos cuyo producto del maestro clínico ya no
// existe. Se puede volver a correr: lo ya migrado no se repite.
//
// Por defecto SOLO SIMULA (lista lo que haría, no escribe nada):
//   cd functions
//   node scripts/migrarCodigosBarraBodega.js            # simulación
//   node scripts/migrarCodigosBarraBodega.js --detalle  # simulación, una línea por producto
//   node scripts/migrarCodigosBarraBodega.js --aplicar  # escribe
//
// Proyecto: workcraft-491b7 (o GCLOUD_PROJECT). Credenciales: Application
// Default Credentials. Con FIRESTORE_EMULATOR_HOST corre contra el emulador.

const process = require('node:process');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const servicio = require('../bodega/servicio');
const { COL, idUnico } = require('../bodega/nucleo.mjs');
const { idVinculo } = require('../bodega/gs1.mjs');

const PROYECTO = process.env.GCLOUD_PROJECT || 'workcraft-491b7';
const APLICAR = process.argv.includes('--aplicar');
const DETALLE = process.argv.includes('--detalle') || APLICAR;
const MAX_CODIGOS_AL_CREAR = 20;
const UNIDAD_POR_DEFECTO = 'UNIDAD';
const POR = Object.freeze({ uid: 'migracion-inventario', nombre: 'Migración desde Inventario', email: '' });

const normalizarClase = (clase) => {
  const c = String(clase || '').trim().toUpperCase();
  return c === 'IMPLANTES' ? 'IMPLANTE' : c;
};
const nombreDeMaestro = (m) => String(m.descriptorAuto || m.descriptorEmpresa || m.tipo || m.referencia || m.codigo || '').trim().slice(0, 150);

// Lee documentos por id en tandas (getAll admite muchos, pero se acota).
const leerPorIds = async (db, coleccion, ids) => {
  const resultado = new Map();
  for (let i = 0; i < ids.length; i += 300) {
    const refs = ids.slice(i, i + 300).map((id) => db.collection(coleccion).doc(id));
    (await db.getAll(...refs)).forEach((s) => { if (s.exists) resultado.set(s.id, s.data()); });
  }
  return resultado;
};

// Plan de la migración (sin escribir). Exportado para probarlo.
const planificar = async (db) => {
  const [snapInv, snapBodegaCodigos, snapProductos, snapCatalogos] = await Promise.all([
    db.collection('inventario_codigos_barra').get(),
    db.collection(COL.codigosBarra).get(),
    db.collection(COL.productos).get(),
    db.collection(COL.catalogos).get(),
  ]);
  const vinculadosEnBodega = new Map(snapBodegaCodigos.docs.map((d) => [d.id, d.data().productoId]));
  const bodegaPorMaestro = new Map(snapProductos.docs.filter((d) => d.data().maestroCodigoId).map((d) => [d.data().maestroCodigoId, { id: d.id, ...d.data() }]));
  const catalogos = snapCatalogos.docs.map((d) => ({ id: d.id, ...d.data() }));

  // Vínculos de Inventario agrupados por producto del maestro clínico.
  const porMaestro = new Map();
  snapInv.docs.forEach((d) => {
    const v = d.data();
    const clave = String(v.clave || decodeURIComponent(d.id)).trim();
    if (!v.productoId || !clave) return;
    if (!porMaestro.has(v.productoId)) porMaestro.set(v.productoId, []);
    porMaestro.get(v.productoId).push({ clave, codigoLeido: String(v.codigoLeido || clave) });
  });
  const maestros = await leerPorIds(db, 'maestros_codigos', [...porMaestro.keys()]);

  const plan = { catalogos, totalVinculos: snapInv.size, crear: [], completar: [], conflictos: [], huerfanos: [], categoriasNuevas: new Set(), unidadNueva: false };
  const existeCatalogo = (tipo, nombre) => catalogos.some((c) => c.tipo === tipo && idUnico.catalogo(tipo, c.nombre) === idUnico.catalogo(tipo, nombre));
  if (!existeCatalogo('UNIDAD', UNIDAD_POR_DEFECTO)) plan.unidadNueva = true;

  for (const [maestroId, codigos] of porMaestro) {
    const maestro = maestros.get(maestroId);
    if (!maestro) { plan.huerfanos.push({ maestroId, codigos: codigos.map((c) => c.clave) }); continue; }
    const existente = bodegaPorMaestro.get(maestroId);
    const libres = [];
    codigos.forEach((c) => {
      const dueno = vinculadosEnBodega.get(idVinculo(c.clave));
      if (!dueno) libres.push(c);
      else if (dueno !== existente?.id) plan.conflictos.push({ clave: c.clave, maestroId, productoBodegaId: dueno });
    });
    if (existente) {
      if (libres.length) plan.completar.push({ productoId: existente.id, codigoMaestro: existente.codigoMaestro, nombre: existente.nombre, codigos: libres });
      continue;
    }
    if (!libres.length) continue;
    const clase = normalizarClase(maestro.clase);
    if (clase && !existeCatalogo('CATEGORIA', clase)) plan.categoriasNuevas.add(clase);
    plan.crear.push({ maestroId, maestro, nombre: nombreDeMaestro(maestro), clase, codigos: libres });
  }
  return plan;
};

// Id de la categoría/unidad con ese nombre (sin distinguir tildes ni
// mayúsculas); si no existe, la crea.
const asegurarCatalogo = async (db, plan, tipo, nombre) => {
  const existente = plan.catalogos.find((c) => c.tipo === tipo && idUnico.catalogo(tipo, c.nombre) === idUnico.catalogo(tipo, nombre));
  if (existente) return existente.id;
  const creado = await servicio.guardarCatalogoComo(db, POR, { tipo, nombre });
  plan.catalogos.push(creado);
  return creado.id;
};

const aplicar = async (db, plan) => {
  const unidadId = await asegurarCatalogo(db, plan, 'UNIDAD', UNIDAD_POR_DEFECTO);
  const categorias = {};
  const errores = [];
  for (const item of plan.crear) {
    try {
      if (item.clase && !categorias[item.clase]) categorias[item.clase] = await asegurarCatalogo(db, plan, 'CATEGORIA', item.clase);
      const r = await servicio.guardarProductoComo(db, POR, {
        producto: {
          nombre: item.nombre || `Producto ${item.maestroId}`,
          referencia: String(item.maestro.referencia || '').slice(0, 80),
          unidadId,
          categoriaId: item.clase ? categorias[item.clase] : null,
          manejaLote: true,
          manejaVencimiento: true,
          maestroCodigoId: item.maestroId,
        },
        codigos: item.codigos.slice(0, MAX_CODIGOS_AL_CREAR),
      });
      for (const c of item.codigos.slice(MAX_CODIGOS_AL_CREAR)) {
        await servicio.vincularCodigoComo(db, POR, { productoId: r.id, lectura: c });
      }
      console.log(`  creado ${r.producto.codigoMaestro}  ${item.nombre}  (${item.codigos.length} código/s)`);
    } catch (error) {
      errores.push(`${item.maestroId} ${item.nombre}: ${error.message}`);
    }
  }
  for (const item of plan.completar) {
    for (const c of item.codigos) {
      try {
        await servicio.vincularCodigoComo(db, POR, { productoId: item.productoId, lectura: c });
      } catch (error) {
        errores.push(`${item.codigoMaestro} código ${c.clave}: ${error.message}`);
      }
    }
    console.log(`  completado ${item.codigoMaestro}  ${item.nombre}  (+${item.codigos.length} código/s)`);
  }
  return errores;
};

const imprimirPlan = (plan) => {
  const codigosCrear = plan.crear.reduce((n, p) => n + p.codigos.length, 0);
  const codigosCompletar = plan.completar.reduce((n, p) => n + p.codigos.length, 0);
  console.log(`Vínculos en Inventario: ${plan.totalVinculos}`);
  console.log(`Productos de Bodega a crear: ${plan.crear.length} (con ${codigosCrear} código/s)`);
  console.log(`Productos de Bodega existentes a completar: ${plan.completar.length} (+${codigosCompletar} código/s)`);
  console.log(`Categorías a crear: ${[...plan.categoriasNuevas].join(', ') || 'ninguna'}${plan.unidadNueva ? ` · Unidad a crear: ${UNIDAD_POR_DEFECTO}` : ''}`);
  console.log(`Códigos que se saltan (ya vinculados en Bodega a otro producto): ${plan.conflictos.length}`);
  console.log(`Vínculos cuyo producto del maestro clínico ya no existe (se saltan): ${plan.huerfanos.length}`);
  if (DETALLE) {
    if (plan.crear.length) console.log('\nA crear:');
    plan.crear.forEach((p) => console.log(`  [${p.clase || 'sin categoría'}] ${p.nombre} · maestro ${p.maestro.codigo || 'S/C'} (${p.maestroId}) · códigos: ${p.codigos.map((c) => c.clave).join(', ')}`));
    if (plan.completar.length) console.log('\nA completar:');
    plan.completar.forEach((p) => console.log(`  ${p.codigoMaestro} ${p.nombre} · +${p.codigos.map((c) => c.clave).join(', ')}`));
    if (plan.conflictos.length) console.log('\nConflictos:');
    plan.conflictos.forEach((c) => console.log(`  ${c.clave}: maestro ${c.maestroId} pero en Bodega es de ${c.productoBodegaId}`));
    if (plan.huerfanos.length) console.log('\nSin producto en el maestro clínico:');
    plan.huerfanos.forEach((h) => console.log(`  ${h.maestroId}: ${h.codigos.join(', ')}`));
  }
};

const main = async () => {
  initializeApp({ projectId: PROYECTO });
  const db = getFirestore();
  console.log(`Proyecto: ${PROYECTO}${process.env.FIRESTORE_EMULATOR_HOST ? ' (EMULADOR)' : ''} · ${APLICAR ? 'APLICANDO' : 'SIMULACIÓN (no escribe nada)'}\n`);
  const plan = await planificar(db);
  imprimirPlan(plan);
  if (!APLICAR) {
    console.log('\nSimulación: no se escribió nada. Use --aplicar para migrar.');
    return;
  }
  console.log('');
  const errores = await aplicar(db, plan);
  if (errores.length) {
    console.log(`\n${errores.length} error(es):`);
    errores.forEach((e) => console.log(`  ${e}`));
    process.exitCode = 1;
  }
  console.log('\nMigración terminada. Se puede volver a correr: lo ya migrado no se repite.');
};

if (require.main === module) {
  main().catch((error) => {
    console.error('Error en la migración:', error);
    process.exit(1);
  });
}

module.exports = { planificar, aplicar };
