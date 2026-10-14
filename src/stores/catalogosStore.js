import { collection, query, getDocs, onSnapshot, FieldValue, serverTimestamp, deleteField } from 'firebase/firestore';
import { db } from '../firebaseConfig';

// =====================================================================
// CATÁLOGOS MAESTROS — una sola copia en memoria por sesión
// =====================================================================
// Antes cada pantalla (autocompletados, selects, Vista General, Inventario,
// PAD, Actualización de Precios...) leía por su cuenta la colección
// completa, y la volvía a leer cada vez que se montaba. Ahora todas leen de
// este store:
//
//   - `codigos` (maestros_codigos, ~3.000 docs): UN listener compartido que
//     se abre la primera vez que alguien lo pide y NO se cierra al quedar
//     sin suscriptores (cerrarlo y reabrirlo es lo que volvía a cobrar la
//     colección entera). Así un código creado por otro usuario aparece al
//     instante en los autocompletados y solo se cobran los cambios. Se
//     cierra únicamente al cerrar sesión (reiniciarCatalogos).
//   - `empresas`, `recargos`, `centros`, `prestadores`: lectura única por
//     sesión. Las escrituras de la propia app se reflejan con
//     upsertLocal/removeLocal; los cambios de otros usuarios, con
//     refrescarCatalogo (botón "Actualizar") o al recargar la página.
//   - `notas`: igual que los de lectura única, pero con consulta filtrada
//     (por rol): las reglas no dejan leer la colección entera. La pantalla
//     pasa `consulta: { clave, restricciones }`; si la clave cambia (otro
//     rol), se descarta la copia y se vuelve a leer.
//
// Los datos se guardan SIN ordenar ni filtrar (las consultas originales
// usaban orderBy, que además excluye los docs sin ese campo): cada pantalla
// ordena/filtra en memoria con `ordenarPor` o sus propios selectores.
// =====================================================================

export const CATALOGOS = {
  codigos: { coleccion: 'maestros_codigos', enVivo: true },
  empresas: { coleccion: 'maestros_empresas', enVivo: false },
  recargos: { coleccion: 'maestros_recargos', enVivo: false },
  centros: { coleccion: 'maestros_centros', enVivo: false },
  prestadores: { coleccion: 'maestros_prestadores', enVivo: false },
  // No es un maestro, pero se usa igual: notas del panel (Dashboard + Notas Admin).
  notas: { coleccion: 'administracion_notas', enVivo: false },
  // Bodega: maestro de productos (con sus totales de stock) y categorías /
  // unidades. Lectura única: las pantallas de Bodega reflejan sus propias
  // escrituras con upsertLocal y los cambios de otros con "Actualizar".
  bodegaProductos: { coleccion: 'bodega_productos', enVivo: false },
  bodegaCatalogos: { coleccion: 'bodega_catalogos', enVivo: false },
};

const ESTADO_INICIAL = Object.freeze({ datos: null, cargando: false, error: null });

// nombre -> { estado, promesa, unsubscribe, suscriptores:Set }
const entradas = new Map();

const obtenerEntrada = (nombre) => {
  if (!CATALOGOS[nombre]) throw new Error(`Catálogo desconocido: "${nombre}"`);
  let e = entradas.get(nombre);
  if (!e) {
    e = { estado: ESTADO_INICIAL, promesa: null, unsubscribe: null, suscriptores: new Set(), consulta: null };
    entradas.set(nombre, e);
  }
  return e;
};

// El estado se reemplaza (nunca se muta) para que useSyncExternalStore
// detecte el cambio por referencia.
const actualizar = (e, cambios) => {
  e.estado = { ...e.estado, ...cambios };
  e.suscriptores.forEach((cb) => cb());
};

const mapearDocs = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));

const referencia = (nombre, e) => {
  const ref = collection(db, CATALOGOS[nombre].coleccion);
  return e.consulta?.restricciones?.length ? query(ref, ...e.consulta.restricciones) : ref;
};

const abrirListener = (nombre, e) => {
  e.promesa = new Promise((resolve, reject) => {
    let primero = true;
    e.unsubscribe = onSnapshot(
      referencia(nombre, e),
      (snap) => {
        const datos = mapearDocs(snap);
        actualizar(e, { datos, cargando: false, error: null });
        if (primero) { primero = false; resolve(datos); }
      },
      (error) => {
        console.error(`Error al escuchar ${CATALOGOS[nombre].coleccion}:`, error);
        // Se deja listo para reintentar en la próxima llamada a cargarCatalogo.
        e.unsubscribe = null;
        e.promesa = null;
        actualizar(e, { cargando: false, error });
        if (primero) { primero = false; reject(error); }
      }
    );
  });
  return e.promesa;
};

const leerUnaVez = (nombre, e) => {
  const promesa = getDocs(referencia(nombre, e))
    .then((snap) => {
      // Si mientras tanto cambió la consulta, esta respuesta ya no vale.
      if (e.promesa !== promesa) return e.promesa;
      const datos = mapearDocs(snap);
      actualizar(e, { datos, cargando: false, error: null });
      return datos;
    })
    .catch((error) => {
      if (e.promesa !== promesa) return e.promesa;
      console.error(`Error al cargar ${CATALOGOS[nombre].coleccion}:`, error);
      e.promesa = null;
      actualizar(e, { cargando: false, error });
      throw error;
    });
  e.promesa = promesa;
  return promesa;
};

/**
 * Devuelve (y carga si hace falta) los documentos del catálogo. Varias
 * llamadas simultáneas comparten la misma lectura.
 *
 * @param {{ clave: string, restricciones: import('firebase/firestore').QueryConstraint[] }} [consulta]
 *   Solo catálogos de lectura única: filtra la lectura. Otra clave descarta
 *   la copia anterior y vuelve a leer.
 */
export const cargarCatalogo = (nombre, consulta) => {
  const e = obtenerEntrada(nombre);
  if (consulta && consulta.clave !== e.consulta?.clave) {
    e.consulta = consulta;
    if (e.unsubscribe) { e.unsubscribe(); e.unsubscribe = null; }
    e.promesa = null;
    actualizar(e, { datos: null });
  }
  if (e.promesa) return e.promesa;
  actualizar(e, { cargando: e.estado.datos === null, error: null });
  return CATALOGOS[nombre].enVivo ? abrirListener(nombre, e) : leerUnaVez(nombre, e);
};

/** Datos ya cargados, o null si todavía no se leyó (no dispara lectura). */
export const leerCatalogo = (nombre) => obtenerEntrada(nombre).estado.datos;

/** true si el catálogo ya se pidió en esta sesión (cargado o cargando). */
export const catalogoSolicitado = (nombre) => Boolean(obtenerEntrada(nombre).promesa);

export const obtenerEstadoCatalogo = (nombre) => obtenerEntrada(nombre).estado;

export const suscribirCatalogo = (nombre, cb) => {
  const e = obtenerEntrada(nombre);
  e.suscriptores.add(cb);
  return () => e.suscriptores.delete(cb);
};

/**
 * Vuelve a leer un catálogo de lectura única (botón "Actualizar"). En el
 * catálogo en vivo no hace nada: ya está al día.
 */
export const refrescarCatalogo = (nombre) => {
  const e = obtenerEntrada(nombre);
  if (CATALOGOS[nombre].enVivo) return cargarCatalogo(nombre);
  e.promesa = null;
  return cargarCatalogo(nombre);
};

// Los datos que se acaban de escribir pueden traer sentinels del SDK
// (serverTimestamp(), deleteField()...). En la copia local se reemplazan
// por su valor aproximado para que las pantallas los puedan mostrar.
const normalizarParaLocal = (anterior, cambios) => {
  const resultado = { ...anterior };
  Object.entries(cambios).forEach(([k, v]) => {
    if (v instanceof FieldValue) {
      if (v.isEqual(serverTimestamp())) resultado[k] = new Date();
      else if (v.isEqual(deleteField())) delete resultado[k];
      // increment/arrayUnion/arrayRemove: se conserva el valor anterior
      // (no hay forma fiable de reproducirlos localmente).
      return;
    }
    resultado[k] = v;
  });
  return resultado;
};

/**
 * Refleja en la copia local un documento recién creado/editado por la app
 * (merge sobre el existente, como updateDoc). Sin efecto si el catálogo
 * aún no se cargó: la próxima lectura ya lo traerá.
 */
export const upsertLocal = (nombre, id, cambios) => {
  const e = obtenerEntrada(nombre);
  const datos = e.estado.datos;
  if (!datos) return;
  const idx = datos.findIndex((d) => d.id === id);
  const nuevo = normalizarParaLocal(idx >= 0 ? datos[idx] : {}, cambios);
  nuevo.id = id;
  const copia = [...datos];
  if (idx >= 0) copia[idx] = nuevo;
  else copia.push(nuevo);
  actualizar(e, { datos: copia });
};

export const removeLocal = (nombre, id) => {
  const e = obtenerEntrada(nombre);
  const datos = e.estado.datos;
  if (!datos) return;
  actualizar(e, { datos: datos.filter((d) => d.id !== id) });
};

/**
 * Cierra el listener y borra todo. Se llama al cerrar sesión o al cambiar
 * de usuario, para que nadie vea catálogos cargados por otra cuenta.
 */
export const reiniciarCatalogos = () => {
  entradas.forEach((e) => {
    if (e.unsubscribe) e.unsubscribe();
    e.unsubscribe = null;
    e.promesa = null;
    e.consulta = null;
    actualizar(e, ESTADO_INICIAL);
  });
};

// ---------- Utilidades de orden en memoria ----------

const valorComparable = (v) => {
  if (v && typeof v.toMillis === 'function') return v.toMillis();
  if (v instanceof Date) return v.getTime();
  return v;
};

/**
 * Comparador equivalente a orderBy(campo, dir) de Firestore, salvo que los
 * documentos sin el campo quedan al final en vez de excluirse.
 */
export const ordenarPor = (campo, dir = 'asc') => (a, b) => {
  const va = valorComparable(a[campo]);
  const vb = valorComparable(b[campo]);
  const faltaA = va === undefined || va === null;
  const faltaB = vb === undefined || vb === null;
  if (faltaA || faltaB) return faltaA === faltaB ? 0 : faltaA ? 1 : -1;
  if (va === vb) return 0;
  const r = va < vb ? -1 : 1;
  return dir === 'desc' ? -r : r;
};

// ---------- Búsquedas puntuales ----------

/**
 * Si `maestros_codigos` ya está en memoria (o cargándose) en esta sesión,
 * devuelve un Map referencia -> documento para las referencias pedidas, sin
 * nuevas lecturas. Si nadie lo pidió todavía devuelve null, para que el
 * llamador haga su consulta puntual (where referencia in [...]) en vez de
 * forzar la descarga de todo el catálogo por un par de referencias.
 * Ante varias coincidencias se queda con la primera por id, como snap.docs[0].
 */
export const codigosPorReferenciaSiDisponible = async (referencias) => {
  if (!catalogoSolicitado('codigos')) return null;
  let datos;
  try {
    datos = await cargarCatalogo('codigos');
  } catch {
    return null;
  }
  const buscadas = new Set(referencias);
  const mapa = new Map();
  datos.forEach((d) => {
    if (d.referencia && buscadas.has(d.referencia) && !mapa.has(d.referencia)) mapa.set(d.referencia, d);
  });
  return mapa;
};
