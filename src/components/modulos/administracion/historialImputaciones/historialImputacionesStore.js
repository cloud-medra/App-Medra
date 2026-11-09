// Historial de Imputaciones: lecturas de Firestore y caché en memoria.
//
// Costo (páginas de TAMANO_PAGINA = 25):
//   - Abrir pestaña de un tipo: 25 documentos + 2 agregaciones.
//   - Abrir General: hasta 25 por colección + 2 agregaciones por colección.
//     Unir listados exige tener una página de cada fuente; después solo se
//     repone lo que ya se mostró (unas 25 lecturas por página).
//   - Volver a una página, filtro o pestaña ya vistos: 0 lecturas.
//
// Sin onSnapshot: es un historial; "Actualizar" vuelve a leer lo que se ve.
//
// La caché dura lo que la sesión y vive solo en memoria, a nivel de módulo,
// para sobrevivir al cambio de pantalla. Se borra al cambiar o cerrar sesión.

import { onAuthStateChanged } from 'firebase/auth';
import {
  collection, count, getAggregateFromServer, getCountFromServer, getDocs,
  limit, orderBy, query, startAfter, sum, where,
} from 'firebase/firestore';
import { auth, db } from '../../../../firebaseConfig';
import {
  FUENTES, LIMITE_ADMISION_POR_MES, TAMANO_PAGINA, campoDeOrden, limitesDePrefijo,
  ordenarComoListado, sumarTotales, totalesDeUnOrigen, unirPagina,
} from './logicaHistorial';

// clave -> { meta: { anio, mes (null en búsquedas del año), origenes }, valor }
const cache = new Map();
let duenoCache;
let escuchandoSesion = false;

const sincronizarDueno = () => {
  const uid = auth.currentUser?.uid ?? null;
  if (uid !== duenoCache) {
    cache.clear();
    duenoCache = uid;
  }
};

// Se registra al primer uso. Una lectura que termine después de limpiar
// escribe en una entrada ya descartada, así que no reaparece.
const prepararCache = () => {
  if (!escuchandoSesion) {
    escuchandoSesion = true;
    onAuthStateChanged(auth, sincronizarDueno);
  }
  sincronizarDueno();
};

const promesaEnCache = (clave, meta, leer) => {
  prepararCache();
  const previa = cache.get(clave);
  if (previa) return previa.valor;
  const entrada = { meta, valor: null };
  entrada.valor = leer().catch((error) => {
    if (cache.get(clave) === entrada) cache.delete(clave);
    throw error;
  });
  cache.set(clave, entrada);
  return entrada.valor;
};

const coleccionMes = (origen, anio, mes) => collection(db, FUENTES[origen].raiz, anio, 'meses', mes, 'documentos');

const aFila = (origen, documento) => FUENTES[origen].normalizar({ id: documento.id, ...documento.data() });

// --- Totales del mes ---

// Dos agregaciones por colección: varios sum() juntos exigirían un índice
// compuesto. El filtro de la segunda deja solo los `venta` numéricos, y
// filtrar y sumar el mismo campo usa su índice automático.
const totalesDeOrigen = (origen, anio, mes) => promesaEnCache(
  `totales|${origen}|${anio}|${mes}`,
  { anio, mes, origenes: [origen] },
  async () => {
    const ref = coleccionMes(origen, anio, mes);
    const [todos, conVenta] = await Promise.all([
      getAggregateFromServer(ref, { cantidad: count(), totalCosto: sum('total') }),
      getAggregateFromServer(query(ref, where('venta', '>=', -Number.MAX_VALUE)), { conVenta: count(), totalVenta: sum('venta') }),
    ]);
    return totalesDeUnOrigen({ ...todos.data(), ...conVenta.data() });
  },
);

export const obtenerTotales = async (origenes, anio, mes) => {
  const lista = await Promise.all(origenes.map((o) => totalesDeOrigen(o, anio, mes)));
  return {
    ...sumarTotales(lista),
    porOrigen: Object.fromEntries(origenes.map((o, i) => [o, lista[i]])),
  };
};

// --- Listado paginado (mes completo o búsqueda por prefijo) ---

const consultaListado = (origen, anio, mes, busqueda, cantidad, cursor) => {
  const campo = campoDeOrden(FUENTES[origen], busqueda);
  const filtros = [];
  if (busqueda.tipo !== 'ninguna') {
    const [desde, hasta] = limitesDePrefijo(busqueda.valor);
    filtros.push(where(campo, '>=', desde), where(campo, '<', hasta));
  }
  return query(
    coleccionMes(origen, anio, mes),
    ...filtros,
    orderBy(campo),
    ...(cursor ? [startAfter(cursor)] : []),
    limit(cantidad),
  );
};

const obtenerListado = (origenes, anio, mes, busqueda) => {
  prepararCache();
  const clave = `listado|${origenes.join(',')}|${anio}|${mes}|${busqueda.tipo}|${busqueda.valor}`;
  const previa = cache.get(clave);
  if (previa) return previa.valor;
  const valor = {
    anio,
    mes,
    busqueda,
    paginas: [],
    cola: Promise.resolve(),
    fuentes: origenes.map((origen) => ({ origen, buffer: [], cursor: null, agotada: false })),
  };
  cache.set(clave, { meta: { anio, mes, origenes }, valor });
  return valor;
};

// Cada fuente debe tener una página completa (o estar agotada) antes de unir,
// porque la página podría salir entera de una sola. Los resultados se aplican
// recién cuando responden todas: si una falla, el reintento parte igual.
const generarPagina = async (listado) => {
  const { anio, mes, busqueda } = listado;
  const respuestas = await Promise.all(listado.fuentes.map(async (fuente) => {
    const falta = TAMANO_PAGINA - fuente.buffer.length;
    if (fuente.agotada || falta <= 0) return null;
    const snap = await getDocs(consultaListado(fuente.origen, anio, mes, busqueda, falta, fuente.cursor));
    return { fuente, snap, falta };
  }));

  respuestas.filter(Boolean).forEach(({ fuente, snap, falta }) => {
    const campo = campoDeOrden(FUENTES[fuente.origen], busqueda);
    snap.docs.forEach((d) => fuente.buffer.push({ orden: d.data()[campo], fila: aFila(fuente.origen, d) }));
    if (snap.docs.length > 0) fuente.cursor = snap.docs[snap.docs.length - 1];
    fuente.agotada = snap.docs.length < falta;
  });

  listado.paginas.push(unirPagina(listado.fuentes, TAMANO_PAGINA).map((item) => item.fila));
};

const quedanFilas = (listado) => listado.paginas.length === 0
  || listado.fuentes.some((f) => f.buffer.length > 0 || !f.agotada);

// `indice` empieza en 0. Las páginas se generan en orden y una sola a la vez,
// porque cada una continúa los cursores de la anterior.
export const obtenerPagina = (origenes, anio, mes, busqueda, indice) => {
  const listado = obtenerListado(origenes, anio, mes, busqueda);
  if (listado.paginas[indice]) return Promise.resolve(listado.paginas[indice]);
  const resultado = listado.cola.then(async () => {
    while (listado.paginas.length <= indice && quedanFilas(listado)) await generarPagina(listado);
    return listado.paginas[indice] ?? [];
  });
  listado.cola = resultado.catch(() => {});
  return resultado;
};

const conteoDeBusqueda = (origen, anio, mes, busqueda) => promesaEnCache(
  `conteo|${origen}|${anio}|${mes}|${busqueda.tipo}|${busqueda.valor}`,
  { anio, mes, origenes: [origen] },
  async () => {
    const campo = campoDeOrden(FUENTES[origen], busqueda);
    const [desde, hasta] = limitesDePrefijo(busqueda.valor);
    const snap = await getCountFromServer(query(coleccionMes(origen, anio, mes), where(campo, '>=', desde), where(campo, '<', hasta)));
    return snap.data().count;
  },
);

export const obtenerConteoBusqueda = async (origenes, anio, mes, busqueda) => {
  const conteos = await Promise.all(origenes.map((o) => conteoDeBusqueda(o, anio, mes, busqueda)));
  return conteos.reduce((acc, n) => acc + n, 0);
};

// --- "Buscar en este mes": descarga explícita ---

const claveDescarga = (origen, anio, mes) => `descarga|${origen}|${anio}|${mes}`;

export const mesDescargado = (origen, anio, mes) => {
  prepararCache();
  return cache.has(claveDescarga(origen, anio, mes));
};

// Única lectura sin limit() del módulo, a propósito: la pide el usuario con un
// botón, tras confirmar cuántos registros se cargan, y debe traer el mes
// completo para buscar cualquier parte del nombre. Por colección, para que
// General y las pestañas de cada tipo compartan lo ya descargado.
const descargaDeOrigen = (origen, anio, mes) => promesaEnCache(
  claveDescarga(origen, anio, mes),
  { anio, mes, origenes: [origen] },
  async () => {
    const snap = await getDocs(coleccionMes(origen, anio, mes));
    return snap.docs.map((d) => aFila(origen, d));
  },
);

export const descargarMes = async (origenes, anio, mes) => {
  const partes = await Promise.all(origenes.map((o) => descargaDeOrigen(o, anio, mes)));
  return ordenarComoListado(partes.flat());
};

// --- "Buscar en todo el año": admisión exacta ---

// Una consulta por mes y colección: sin índice nuevo, y Firestore cobra
// mínimo 1 lectura por cada una aunque venga vacía.
const admisionEnOrigen = (origen, anio, admision, meses) => promesaEnCache(
  `admision|${origen}|${anio}|${meses.length}|${admision}`,
  { anio, mes: null, origenes: [origen] },
  async () => {
    const porMes = await Promise.all(meses.map(async (mes) => {
      const snap = await getDocs(query(
        coleccionMes(origen, anio, mes),
        where('gestionId', '==', admision),
        limit(LIMITE_ADMISION_POR_MES),
      ));
      return {
        mes,
        // Un ítem podría estar en dos períodos: el id de la fila incluye el mes.
        filas: snap.docs.map((d) => ({ ...aFila(origen, d), id: `${mes}/${d.id}` })),
        truncado: snap.docs.length === LIMITE_ADMISION_POR_MES,
      };
    }));
    return porMes;
  },
);

export const buscarAdmisionEnAnio = async (origenes, anio, admision, meses) => {
  const porOrigen = await Promise.all(origenes.map((o) => admisionEnOrigen(o, anio, admision, meses)));
  // Por período, de enero a diciembre, y dentro de cada uno por colección.
  const bloques = meses.flatMap((_, i) => porOrigen.map((resultados) => resultados[i]));
  return { filas: bloques.flatMap((b) => b.filas), truncado: bloques.some((b) => b.truncado) };
};

// --- Invalidación ---

// "Actualizar": olvida lo del mes y las búsquedas del año de esas colecciones.
export const invalidarHistorial = ({ anio, mes, origenes }) => {
  [...cache.entries()].forEach(([clave, { meta }]) => {
    const mismoPeriodo = meta.anio === anio && (meta.mes === mes || meta.mes === null);
    if (mismoPeriodo && meta.origenes.some((o) => origenes.includes(o))) cache.delete(clave);
  });
};

export const limpiarCacheHistorial = () => cache.clear();
