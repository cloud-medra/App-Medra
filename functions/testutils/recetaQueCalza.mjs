// Para los tests que prueban stock, FEFO, costos o tránsito y no la receta:
// antes de cada guardado deja en la Firestore en memoria una receta que calza
// con lo pedido (un componente por producto, con la cantidad pedida) y los
// modelos KFH y KFM. La receta se prueba aparte (armadoKits/receta.test.js).

export const MODELOS_PRUEBA = Object.freeze([
  { referencia: 'KFH', nombre: 'Kit Flexible Hombre', genero: 'HOMBRE', vaina: 'NORMAL', activo: true },
  { referencia: 'KFM', nombre: 'Kit Flexible Mujer', genero: 'MUJER', vaina: 'NORMAL', activo: true },
]);

export const conRecetaQueCalza = (guardar, datosDe) => (db, por, d = {}) => {
  const cantidades = new Map();
  (Array.isArray(d.lineas) ? d.lineas : []).forEach((l) => cantidades.set(l.productoId, (cantidades.get(l.productoId) || 0) + (Number(l.cantidad) || 0)));
  datosDe().set('kits_configuracion/FLEXIBLE', {
    familia: 'FLEXIBLE', version: 1, modelos: MODELOS_PRUEBA,
    componentes: [...cantidades].map(([productoId, n], i) => ({
      id: `c${i}`, nombre: `Componente ${productoId}`, orden: i + 1, porVariante: false,
      cantidad: Number.isInteger(n) && n > 0 ? n : 1,
      referencias: [{ referencia: String(productoId).toUpperCase(), productoId, nombre: productoId }],
    })),
  });
  const modelo = MODELOS_PRUEBA.find((m) => m.referencia === d.referencia);
  return guardar(db, por, { ...d, ...(modelo ? { genero: modelo.genero, vaina: modelo.vaina } : {}) });
};
