// functions/scripts/cargarConfiguracionKits.js
//
// Carga inicial de la receta de los kits flexibles (kits_configuracion/FLEXIBLE),
// con los datos confirmados por el usuario. Usa la misma función que la
// pantalla (guardarConfiguracionComo): valida cada referencia contra el
// maestro de Bodega, normaliza mayúsculas y deja la auditoría.
//
// Por defecto SOLO SIMULA: lee el maestro y la configuración actual (unas 80
// lecturas) y muestra qué se cargaría, qué referencias se omiten por no existir
// en Bodega y qué componentes le faltan a cada modelo. No escribe nada.
//   NODE_PATH=functions/node_modules node functions/scripts/cargarConfiguracionKits.js
//   ... --aplicar   (escribe; solo si la configuración aún no existe)
//
// Las referencias que no existen se omiten y se informan: se agregan después
// desde "Configuración Flexibles", cuando se creen en Bodega.

const { initializeApp, applicationDefault, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const APLICAR = process.argv.includes('--aplicar');
const POR = { uid: 'script', nombre: 'Carga inicial (script)', email: '' };

// Datos confirmados. Guía, Uretero y las Dormia quedan vacías hasta que el
// usuario confirme sus referencias (se completan desde la pantalla).
const PROPUESTA = {
  familia: 'FLEXIBLE',
  componentes: [
    { nombre: 'Guía', cantidad: 2, referencias: [] },
    { nombre: 'Vaina', cantidad: 1, porVariante: true, referenciasPorVariante: { HOMBRE_NORMAL: ['FUS-107045', 'FUS-120045'], MUJER_NORMAL: ['FUS-107035'] } },
    { nombre: 'Dormia', cantidad: 1, referencias: ['NGE-07115', 'NTSE-033115-UDH', 'NTSED-025115-UDH'] },
    { nombre: 'Catéter doble J', cantidad: 1, referencias: ['UFH-626-R', 'USH-626', 'USI-526-R', 'USI-600', 'USI-626-R'] },
    { nombre: 'Uretero', cantidad: 1, referencias: [] },
  ],
  modelos: [
    { referencia: 'KFH', nombre: 'Kit Flexible Hombre', genero: 'HOMBRE', vaina: 'NORMAL', activo: true },
    { referencia: 'KFM', nombre: 'Kit Flexible Mujer', genero: 'MUJER', vaina: 'NORMAL', activo: true },
  ],
};

(async () => {
  const { referenciaDeProducto } = await import('../bodega/nucleo.mjs');
  const { normalizarReferencia, faltantesDelModelo, validarConfiguracion, VARIANTES, etiquetaVariante, COL_CONFIGURACION_KITS } = await import('../armadoKits/receta.mjs');
  if (!getApps().length) initializeApp({ credential: applicationDefault(), projectId: 'workcraft-491b7' });
  const db = getFirestore();
  const [productos, actual] = await Promise.all([db.collection('bodega_productos').get(), db.collection(COL_CONFIGURACION_KITS).doc(PROPUESTA.familia).get()]);
  const existentes = new Set(productos.docs.filter((d) => d.get('activo') !== false).map((d) => normalizarReferencia(referenciaDeProducto(d.data()))));

  // Solo las que existen; las demás se informan.
  const omitidas = [];
  const filtrar = (lista, donde) => (lista || []).filter((r) => (existentes.has(normalizarReferencia(r)) ? true : (omitidas.push(`${donde}: ${r}`), false)));
  const datos = {
    ...PROPUESTA,
    versionEsperada: 0,
    componentes: PROPUESTA.componentes.map((c) => (c.porVariante
      ? { ...c, referenciasPorVariante: Object.fromEntries(VARIANTES.map((v) => [v, filtrar(c.referenciasPorVariante?.[v], `${c.nombre} (${etiquetaVariante(v)})`)])) }
      : { ...c, referencias: filtrar(c.referencias, c.nombre) })),
  };
  const { errores, config } = validarConfiguracion(datos, productos.docs.map((d) => ({ id: d.id, ...d.data() })));

  console.log(`Configuración actual: ${actual.exists ? `existe (versión ${actual.get('version')})` : 'no existe'}`);
  console.log('\nComponentes que se cargarían:');
  config.componentes.forEach((c) => {
    const listas = c.porVariante ? VARIANTES.map((v) => `    ${etiquetaVariante(v)}: ${c.referenciasPorVariante[v].map((r) => `${r.referencia} (${r.nombre})`).join(', ') || '—'}`) : [`    ${c.referencias.map((r) => `${r.referencia} (${r.nombre})`).join(', ') || '— (vacío)'}`];
    console.log(`  ${c.orden}. ${c.nombre} × ${c.cantidad}${c.porVariante ? ' (por variante)' : ''}\n${listas.join('\n')}`);
  });
  console.log('\nModelos:');
  config.modelos.forEach((m) => {
    const faltan = faltantesDelModelo(config, m);
    console.log(`  ${m.referencia} - ${m.nombre} (${etiquetaVariante(`${m.genero}_${m.vaina}`)}): ${faltan.length ? `INCOMPLETO, falta ${faltan.join(', ')}` : 'completo'}`);
  });
  console.log(`\nOmitidas por no existir en Bodega (${omitidas.length}):${omitidas.length ? `\n  ${omitidas.join('\n  ')}` : ' ninguna'}`);
  if (errores.length) { console.log(`\nErrores:\n  ${errores.join('\n  ')}`); process.exit(1); }

  if (!APLICAR) { console.log('\nSimulación: no se escribió nada. Para cargar: --aplicar'); process.exit(0); }
  if (actual.exists) { console.log('\nLa configuración ya existe: no se sobrescribe. Edítala desde la pantalla.'); process.exit(1); }
  const { guardarConfiguracionComo } = require('../armadoKits/configuracion');
  const r = await guardarConfiguracionComo(db, POR, datos);
  console.log(`\nCargada: versión ${r.version}, ${r.cambios.length} cambio(s) registrados en la auditoría.`);
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
