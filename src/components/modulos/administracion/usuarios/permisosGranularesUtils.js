// Lógica compartida por CrearUsuario y EditarUsuario (EditorPermisos) para
// armar y completar `permisosGranulares` a partir de COMPONENT_MAPS.
// Forma: { '/ruta': { seccionKey: { visible, elements: { elementoKey: bool } } } }
import { deniegaSinConfigurar } from '../../../../../functions/permisos/nucleo.mjs';

// Acceso total (o ninguno, con valor=false) a todas las secciones y
// elementos de una config de COMPONENT_MAPS (vista o `proceso`). Con `ruta`
// (lo que se genera solo, sin que el admin lo pida), las acciones de
// ACCIONES_DENEGADAS_POR_DEFECTO quedan desmarcadas; sin ella (habilitar la
// vista, "marcar toda la vista"), también se marcan.
export const generarAccesoDesdeConfig = (config, valor = true, ruta = null) => {
  if (!config) return null;
  const secciones = {};
  Object.entries(config.sections || {}).forEach(([sectionKey, section]) => {
    const elementos = {};
    Object.keys(section.elements || {}).forEach((elKey) => {
      elementos[elKey] = valor && !(ruta && deniegaSinConfigurar(ruta, sectionKey, elKey));
    });
    secciones[sectionKey] = { visible: valor, elements: elementos };
  });
  return secciones;
};

export const generarAccesoTotalDesdeConfig = (config) => generarAccesoDesdeConfig(config, true);

// Completa las secciones y elementos que existen en el mapa pero no en lo
// guardado del usuario, con `true` (salvo ACCIONES_DENEGADAS_POR_DEFECTO,
// con `false`): es lo mismo que hace useGranularPermission en tiempo real,
// así el editor muestra marcado lo que el usuario efectivamente puede hacer.
// No toca lo que ya tiene valor.
const completarVista = (guardado, config, ruta) => {
  const resultado = { ...guardado };
  Object.entries(config.sections || {}).forEach(([sectionKey, section]) => {
    const actual = resultado[sectionKey];
    const elementos = { ...(actual?.elements || {}) };
    Object.keys(section.elements || {}).forEach((elKey) => {
      if (typeof elementos[elKey] !== 'boolean') elementos[elKey] = !deniegaSinConfigurar(ruta, sectionKey, elKey);
    });
    resultado[sectionKey] = { visible: actual ? actual.visible !== false : true, elements: elementos };
  });
  return resultado;
};

// Migración perezosa al abrir el editor:
//  - Vistas y pestañas que el usuario ya tiene: se completan secciones y
//    elementos nuevos (ver completarVista).
//  - Pestañas (`procesos`): si el usuario tiene la vista padre pero NINGUNA
//    de sus pestañas, es un usuario anterior a que la vista tuviera
//    pestañas → se le incluyen todas (comportamiento histórico). Si tiene
//    alguna, las que faltan fueron quitadas a propósito y NO se vuelven a
//    agregar (antes se re-agregaban cada vez que se abría el editor, así
//    que quitar una pestaña no "pegaba").
export const completarPermisosGranulares = (guardados, componentMaps) => {
  const resultado = { ...(guardados || {}) };
  Object.entries(componentMaps).forEach(([path, config]) => {
    if (!resultado[path]) return;
    resultado[path] = completarVista(resultado[path], config, path);

    const procesos = Object.entries(config.procesos || {});
    if (procesos.length === 0) return;
    const tieneAlguna = procesos.some(([procesoPath]) => resultado[procesoPath]);
    procesos.forEach(([procesoPath, procesoConfig]) => {
      if (resultado[procesoPath]) {
        resultado[procesoPath] = completarVista(resultado[procesoPath], procesoConfig, procesoPath);
      } else if (!tieneAlguna && procesoConfig.porDefecto !== false) {
        resultado[procesoPath] = generarAccesoDesdeConfig(procesoConfig, true, procesoPath) || {};
      }
    });
  });
  return resultado;
};

// Estado del botón "todo" de una vista/pestaña: 'todo' | 'nada' | 'parcial'.
export const estadoMarcadoVista = (vistaPermisos, config) => {
  let marcados = 0;
  let total = 0;
  Object.entries(config?.sections || {}).forEach(([sectionKey, section]) => {
    const seccion = vistaPermisos?.[sectionKey];
    total += 1;
    if (seccion?.visible !== false) marcados += 1;
    Object.keys(section.elements || {}).forEach((elKey) => {
      total += 1;
      if (seccion?.visible !== false && seccion?.elements?.[elKey] !== false) marcados += 1;
    });
  });
  if (total === 0 || marcados === total) return 'todo';
  return marcados === 0 ? 'nada' : 'parcial';
};

// ---------------------------------------------------------------------
// Operaciones del árbol de permisos, compartidas por CrearUsuario y
// EditarUsuario (Listado Usuario). Son funciones puras sobre
// `{ permisos, permisosGranulares }`: cada formulario solo agrega su estado
// propio alrededor (ítems "finalizados" del asistente, "pendientes de
// revisión" del drawer).
// ---------------------------------------------------------------------

const rutasProceso = (config) => Object.keys(config?.procesos || {});

// Pestañas que se incluyen solas al marcar la vista: todas, salvo las
// declaradas con `porDefecto: false` en el mapa (ej. "Administrar tareas" de
// Recordatorios), que se marcan a mano.
const procesosPorDefecto = (config) =>
  Object.entries(config?.procesos || {}).filter(([, pc]) => pc.porDefecto !== false);

// Incluye una vista del menú con acceso total (y sus pestañas por defecto),
// sin pisar lo que ya tenga configurado.
const incluirVista = (granulares, path, config) => {
  if (!config) return;
  if (!granulares[path]) granulares[path] = generarAccesoTotalDesdeConfig(config);
  procesosPorDefecto(config).forEach(([p, pc]) => {
    if (!granulares[p]) granulares[p] = generarAccesoTotalDesdeConfig(pc);
  });
};
const quitarVista = (granulares, path, config) => {
  delete granulares[path];
  rutasProceso(config).forEach((p) => delete granulares[p]);
};

// Marca/desmarca una vista del menú (ítem de un módulo).
// Devuelve { estado, quitada, rutas } — rutas: la vista y sus pestañas.
export const alternarVistaDelMenu = (estado, moduloKey, path, componentMaps) => {
  const config = componentMaps[path];
  const actuales = estado.permisos[moduloKey] || [];
  const quitada = actuales.includes(path);
  const permisosGranulares = { ...estado.permisosGranulares };
  if (quitada) quitarVista(permisosGranulares, path, config);
  else incluirVista(permisosGranulares, path, config);
  return {
    estado: {
      permisos: { ...estado.permisos, [moduloKey]: quitada ? actuales.filter((p) => p !== path) : [...actuales, path] },
      permisosGranulares,
    },
    quitada,
    rutas: config ? [path, ...rutasProceso(config)] : [path],
  };
};

// Marca todo el módulo, o lo desmarca si ya estaba completo.
// Devuelve { estado, quitado, rutas, rutasAgregadas } — rutasAgregadas: las
// vistas/pestañas que no tenían configuración y se crearon ahora.
export const alternarModuloCompleto = (estado, moduloKey, subItems, componentMaps) => {
  const quitado = (estado.permisos[moduloKey]?.length || 0) === subItems.length;
  const permisosGranulares = { ...estado.permisosGranulares };
  const rutas = [];
  const rutasAgregadas = [];
  subItems.forEach((s) => {
    const config = componentMaps[s.path];
    const propias = config ? [s.path, ...rutasProceso(config)] : [s.path];
    rutas.push(...propias);
    if (quitado) { quitarVista(permisosGranulares, s.path, config); return; }
    const nuevas = config && !permisosGranulares[s.path];
    incluirVista(permisosGranulares, s.path, config);
    if (nuevas) rutasAgregadas.push(...propias.filter((p) => permisosGranulares[p]));
  });
  return {
    estado: {
      permisos: { ...estado.permisos, [moduloKey]: quitado ? [] : subItems.map((s) => s.path) },
      permisosGranulares,
    },
    quitado,
    rutas,
    rutasAgregadas,
  };
};

// Incluye/quita una pestaña (`proceso`) por existencia de su entrada.
export const alternarPestana = (granulares, procesoPath, procesoConfig) => {
  if (granulares[procesoPath]) {
    const resto = { ...granulares };
    delete resto[procesoPath];
    return resto;
  }
  return { ...granulares, [procesoPath]: generarAccesoTotalDesdeConfig(procesoConfig) || {} };
};

export const alternarSeccion = (granulares, path, seccionKey) => {
  const vista = granulares[path];
  const seccion = vista?.[seccionKey];
  if (!seccion) return granulares;
  return { ...granulares, [path]: { ...vista, [seccionKey]: { ...seccion, visible: !seccion.visible } } };
};

// Pone `valor` en varios elementos de una sección (un elemento, o todas las
// columnas de una tabla de una vez).
export const establecerElementos = (granulares, path, seccionKey, elementos, valor) => {
  const vista = granulares[path];
  const seccion = vista?.[seccionKey];
  if (!seccion) return granulares;
  const nuevos = { ...seccion.elements };
  elementos.forEach((el) => { nuevos[el] = valor; });
  return { ...granulares, [path]: { ...vista, [seccionKey]: { ...seccion, elements: nuevos } } };
};

export const alternarElemento = (granulares, path, seccionKey, elemento) =>
  establecerElementos(granulares, path, seccionKey, [elemento], !(granulares[path]?.[seccionKey]?.elements?.[elemento]));

export const establecerTodaLaVistaEn = (granulares, path, config, valor) =>
  ({ ...granulares, [path]: generarAccesoDesdeConfig(config, valor) || {} });

// Vistas del menú del usuario que existen en el mapa pero no tienen entrada
// en permisosGranulares: en tiempo real quedan bloqueadas (useGranularPermission
// bloquea una vista sin configuración). Pasa con vistas que entraron al mapa
// después de asignarlas (ej. Laboratorio Códigos/Órdenes/XML): se completan
// con acceso total, igual que functions/scripts/migrarPermisosGranulares.js,
// y se devuelven para marcarlas "pendiente de revisión".
export const completarVistasDelMenu = (permisos, granulares, componentMaps) => {
  const resultado = { ...(granulares || {}) };
  const agregadas = [];
  Object.values(permisos || {}).flat().forEach((path) => {
    const config = componentMaps[path];
    if (!config || resultado[path]) return;
    incluirVista(resultado, path, config);
    agregadas.push(path, ...rutasProceso(config).filter((p) => resultado[p]));
  });
  return { permisosGranulares: resultado, agregadas };
};

// Lista plana para dibujar el árbol de un módulo: cada vista seleccionada
// seguida de sus pestañas (`procesos`).
export const construirItemsRenderables = (items, modulo, componentMaps) =>
  items.flatMap((path) => {
    const config = componentMaps[path];
    const sub = modulo.subItems.find((s) => s.path === path);
    const procesos = Object.entries(config?.procesos || {}).map(([procesoPath, procesoConfig]) => ({
      path: procesoPath, config: procesoConfig, sub: null, esProceso: true,
    }));
    return [{ path, config, sub, esProceso: false }, ...procesos];
  });

// Vistas y pestañas con configuración que el usuario tiene incluidas (las que
// el asistente de creación pide revisar una por una).
export const vistasConfigurables = (permisos, granulares, componentMaps) =>
  [...new Set(Object.values(permisos || {}).flat())].flatMap((path) => {
    const config = componentMaps[path];
    if (!config) return [];
    return [path, ...rutasProceso(config).filter((p) => granulares?.[p])];
  });

const esColumna = (elKey) => elKey.startsWith('col_');

// Resumen de lo que el usuario tiene RESTRINGIDO dentro de sus vistas (para
// Listado Usuario). Lo no configurado cuenta como permitido.
export const resumenRestricciones = (permisos, granulares, componentMaps) => {
  const r = { pestanas: 0, secciones: 0, acciones: 0, columnas: 0 };
  const g = granulares || {};
  const contarVista = (vista, config) => {
    Object.entries(config.sections || {}).forEach(([sk, sec]) => {
      const estado = vista?.[sk];
      if (estado?.visible === false) { r.secciones += 1; return; }
      Object.keys(sec.elements || {}).forEach((el) => {
        if (estado?.elements?.[el] === false) r[esColumna(el) ? 'columnas' : 'acciones'] += 1;
      });
    });
  };
  [...new Set(Object.values(permisos || {}).flat())].forEach((path) => {
    const config = componentMaps[path];
    if (!config || !g[path]) return;
    contarVista(g[path], config);
    Object.entries(config.procesos || {}).forEach(([p, pc]) => {
      if (!g[p]) r.pestanas += 1;
      else contarVista(g[p], pc);
    });
  });
  return { ...r, total: r.pestanas + r.secciones + r.acciones + r.columnas };
};

export { esColumna };

// ---------------------------------------------------------------------
// Conteos y búsqueda para el editor de permisos en dos columnas.
// Un "permiso" es cada casilla del árbol: la vista del menú, cada pestaña,
// cada sección y cada acción/columna. Marcado = efectivamente permitido.
// ---------------------------------------------------------------------

const contarConfig = (config, vista) => {
  let total = 0;
  let marcados = 0;
  Object.entries(config?.sections || {}).forEach(([sk, sec]) => {
    const estado = vista?.[sk];
    const visible = Boolean(vista) && estado?.visible !== false;
    total += 1;
    if (visible) marcados += 1;
    Object.keys(sec.elements || {}).forEach((el) => {
      total += 1;
      if (visible && estado?.elements?.[el] !== false) marcados += 1;
    });
  });
  return { total, marcados };
};

// Permisos de una vista del menú (ella misma + secciones/acciones/columnas
// + cada pestaña con las suyas).
export const contarPermisosVista = (path, incluida, granulares, componentMaps) => {
  const config = componentMaps[path];
  let total = 1;
  let marcados = incluida ? 1 : 0;
  if (!config) return { total, marcados };
  const propia = contarConfig(config, incluida ? granulares?.[path] : null);
  total += propia.total;
  marcados += propia.marcados;
  Object.entries(config.procesos || {}).forEach(([p, pc]) => {
    const vistaPestana = incluida ? granulares?.[p] : null;
    const c = contarConfig(pc, vistaPestana);
    total += 1 + c.total;
    marcados += (vistaPestana ? 1 : 0) + c.marcados;
  });
  return { total, marcados };
};

export const contarPermisosModulo = (moduloKey, modulo, estado, componentMaps) =>
  (modulo.subItems || []).reduce((acc, sub) => {
    const incluida = (estado.permisos?.[moduloKey] || []).includes(sub.path);
    const c = contarPermisosVista(sub.path, incluida, estado.permisosGranulares, componentMaps);
    return { total: acc.total + c.total, marcados: acc.marcados + c.marcados };
  }, { total: 0, marcados: 0 });

const normalizarTexto = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// ¿La vista del menú (su nombre, sus pestañas, secciones, acciones o
// columnas) coincide con el texto buscado?
export const vistaCoincideBusqueda = (sub, componentMaps, texto) => {
  const q = normalizarTexto(texto).trim();
  if (!q) return true;
  const config = componentMaps[sub.path];
  const textos = [sub.label, config?.label];
  const agregar = (c) => {
    if (!c) return;
    textos.push(c.label);
    Object.values(c.sections || {}).forEach((s) => {
      textos.push(s.label);
      Object.values(s.elements || {}).forEach((e) => textos.push(e.label));
    });
  };
  agregar(config);
  Object.values(config?.procesos || {}).forEach(agregar);
  return textos.some((t) => normalizarTexto(t).includes(q));
};

export const moduloCoincideBusqueda = (modulo, componentMaps, texto) =>
  normalizarTexto(modulo.label).includes(normalizarTexto(texto).trim()) ||
  (modulo.subItems || []).some((sub) => vistaCoincideBusqueda(sub, componentMaps, texto));
