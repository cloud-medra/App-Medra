// functions/scripts/sembrarBodega.js
//
// Datos de prueba de Bodega para los EMULADORES (lo llama
// sembrarEmulador.js, después de crear los usuarios). Crea con las mismas
// funciones que usa la app (servicio de Bodega):
//   - centros PABELLÓN CENTRAL, UCI ADULTO y URGENCIA (maestros_centros)
//   - unidades UNIDAD, CAJA, PAR y categorías INSUMOS, IMPLANTE, SUTURAS
//   - 5 productos con códigos de barra:
//       GUANTE NITRILO M     EAN 7801234567894
//       SONDA FOLEY 16FR     GTIN 07612345678900 (GS1: escanear
//                            "(01)07612345678900(17)271231(10)L2401" o crudo)
//       PLACA BLOQUEO 3.5    dos códigos: 7809876543214 (producto) y
//                            "(17)280630(10)PB-77" (solo lote/vencimiento)
//       SUTURA NYLON 3-0     sin códigos (para vincular uno escaneando)
//       GASA ESTÉRIL 10x10   inactivo
//   - para probar la migración: maestros_codigos + inventario_codigos_barra
//     con 2 productos y 3 códigos (node scripts/migrarCodigosBarraBodega.js)
// El stock queda en cero (lo llenan la carga inicial e ingresos: Fase 2).

const servicio = require('../bodega/servicio');

const POR = Object.freeze({ uid: 'semilla', nombre: 'Datos de prueba', email: '' });

const sembrarBodega = async (db) => {
  const centros = { pab: 'PABELLÓN CENTRAL', uci: 'UCI ADULTO', urg: 'URGENCIA' };
  for (const [id, nombre] of Object.entries(centros)) {
    await db.collection('maestros_centros').doc(id).set({ nombre, estado: 'ACTIVO', usarEnGestiones: false });
  }

  const cat = {};
  for (const [tipo, nombre] of [['UNIDAD', 'UNIDAD'], ['UNIDAD', 'CAJA'], ['UNIDAD', 'PAR'], ['CATEGORIA', 'INSUMOS'], ['CATEGORIA', 'IMPLANTE'], ['CATEGORIA', 'SUTURAS']]) {
    cat[nombre] = (await servicio.guardarCatalogoComo(db, POR, { tipo, nombre })).id;
  }

  const productos = [
    { nombre: 'GUANTE NITRILO M', unidadId: cat.CAJA, categoriaId: cat.INSUMOS, ubicacion: 'E1-A', manejaLote: true, manejaVencimiento: true, stockMinimo: 10, codigos: ['7801234567894'] },
    { nombre: 'SONDA FOLEY 16FR', referencia: 'SF-16', unidadId: cat.UNIDAD, categoriaId: cat.INSUMOS, ubicacion: 'E2-B', manejaLote: true, manejaVencimiento: true, stockMinimo: 5, codigos: ['(01)07612345678900'] },
    { nombre: 'PLACA BLOQUEO 3.5 MM', referencia: 'PB-35', unidadId: cat.UNIDAD, categoriaId: cat.IMPLANTE, ubicacion: 'E5-A', manejaLote: true, manejaVencimiento: true, codigos: ['7809876543214'] },
    { nombre: 'SUTURA NYLON 3-0', unidadId: cat.UNIDAD, categoriaId: cat.SUTURAS, ubicacion: 'E3-C', manejaLote: true, manejaVencimiento: true, codigos: [] },
    { nombre: 'GASA ESTÉRIL 10X10', unidadId: cat.UNIDAD, categoriaId: cat.INSUMOS, manejaLote: false, manejaVencimiento: false, codigos: [], activo: false },
  ];
  for (const { codigos, ...producto } of productos) {
    await servicio.guardarProductoComo(db, POR, { producto, codigos: codigos.map(servicio.lecturaParaVincular) });
  }

  // Inventario anterior (solo para probar la migración de códigos).
  await db.collection('maestros_codigos').doc('mc-cateter').set({ codigo: '0301010', referencia: 'CVC-7', descriptorAuto: 'CATETER VENOSO CENTRAL 7FR', empresa: 'ACME', clase: 'INSUMOS', precioNeto: 25000 });
  await db.collection('maestros_codigos').doc('mc-tornillo').set({ codigo: '', referencia: 'TC-35', descriptorAuto: 'TORNILLO CORTICAL 3.5', empresa: 'ORTO', clase: 'IMPLANTE', precioNeto: 18000 });
  const inv = db.collection('inventario_codigos_barra');
  await inv.doc('7801111111110').set({ clave: '7801111111110', codigoLeido: '7801111111110', productoId: 'mc-cateter' });
  await inv.doc('07612345678917').set({ clave: '07612345678917', codigoLeido: '(01)07612345678917(10)X1', productoId: 'mc-tornillo' });
  await inv.doc('7802222222221').set({ clave: '7802222222221', codigoLeido: '7802222222221', productoId: 'mc-tornillo' });

  console.log('  Bodega: 3 centros, 6 categorías/unidades, 5 productos, 3 códigos de Inventario para migrar');
};

module.exports = { sembrarBodega };
