// Firestore en memoria para los tests de transacciones (los emuladores no se
// usan en este equipo). Como Firestore, repite la transacción si un documento
// leído cambió, falla si se lee después de escribir y aplica arrayUnion y
// arrayRemove. Rutas: { 'coleccion/id': datos }.

const aplicarCampos = (actual, cambios) => {
  const resultado = { ...actual };
  Object.entries(cambios).forEach(([k, v]) => {
    if (v?.methodName === 'FieldValue.arrayUnion') resultado[k] = [...new Set([...(resultado[k] || []), ...v.elements])];
    else if (v?.methodName === 'FieldValue.arrayRemove') resultado[k] = (resultado[k] || []).filter((x) => !v.elements.includes(x));
    else resultado[k] = v;
  });
  return resultado;
};

export const crearDb = (inicial = {}) => {
  const datos = new Map(Object.entries(inicial).map(([k, v]) => [k, structuredClone(v)]));
  const versiones = new Map();
  let auto = 0;
  const snap = (ruta) => ({
    id: ruta.split('/').pop(), ref: doc(ruta), exists: datos.has(ruta),
    data: () => (datos.has(ruta) ? structuredClone(datos.get(ruta)) : undefined),
  });
  const doc = (ruta) => ({
    id: ruta.split('/').pop(), ruta,
    collection: (sub) => col(`${ruta}/${sub}`),
    get: async () => snap(ruta),
  });
  const consulta = (nombre, filtros = [], tope = Infinity) => ({
    esConsulta: true, nombre, filtros, tope,
    where: (campo, op, valor) => consulta(nombre, [...filtros, { campo, op, valor }], tope),
    limit: (n) => consulta(nombre, filtros, n),
    rutas: () => [...datos.keys()]
      .filter((r) => r.startsWith(`${nombre}/`) && !r.slice(nombre.length + 1).includes('/'))
      .filter((r) => filtros.every(({ campo, op, valor }) => (op === 'in' ? valor.includes(datos.get(r)[campo]) : datos.get(r)[campo] === valor)))
      .slice(0, tope),
  });
  function col(nombre) {
    return { ...consulta(nombre), doc: (id) => doc(`${nombre}/${id || `auto${++auto}`}`) };
  }
  const db = {
    collection: col,
    runTransaction: async (fn) => {
      for (let intento = 0; intento < 8; intento++) {
        const leidos = new Map();
        const escrituras = [];
        const marcar = (r) => leidos.set(r, versiones.get(r) || 0);
        const t = {
          get: async (x) => {
            if (escrituras.length) throw new Error('Firestore exige leer antes de escribir');
            await Promise.resolve();
            if (x.esConsulta) {
              const rutas = x.rutas();
              rutas.forEach(marcar);
              return { docs: rutas.map(snap), empty: !rutas.length };
            }
            marcar(x.ruta);
            return snap(x.ruta);
          },
          set: (ref, valor, op) => escrituras.push({ ruta: ref.ruta, tipo: op?.merge ? 'update' : 'set', valor }),
          update: (ref, valor) => escrituras.push({ ruta: ref.ruta, tipo: 'update', valor }),
          delete: (ref) => escrituras.push({ ruta: ref.ruta, tipo: 'delete' }),
        };
        const resultado = await fn(t);
        await Promise.resolve();
        if ([...leidos].some(([r, v]) => (versiones.get(r) || 0) !== v)) continue;
        escrituras.forEach(({ ruta, tipo, valor }) => {
          versiones.set(ruta, (versiones.get(ruta) || 0) + 1);
          if (tipo === 'delete') datos.delete(ruta);
          else if (tipo === 'update') datos.set(ruta, aplicarCampos(datos.get(ruta) || {}, valor));
          else datos.set(ruta, aplicarCampos({}, valor));
        });
        return resultado;
      }
      throw new Error('Demasiados reintentos');
    },
  };
  return { db, datos };
};
