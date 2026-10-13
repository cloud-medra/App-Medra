// Permisos por centro de costo: cálculo puro del permiso efectivo.
//
// Lo usan las Cloud Functions (functions/permisos/index.js, con require():
// Node 24 carga ESM sincrónico) y la pantalla de usuarios (vista previa en
// el editor), así ambos calculan exactamente lo mismo. Sin dependencias.
//
// Permisos de un usuario (o de una plantilla), forma de siempre:
//   { permisos: { modulo: [rutas] },
//     permisosGranulares: { ruta: { seccion: { visible, elements: { el: bool } } } } }
//
// Para combinarlos se "aplanan" en casillas, una por cada casilla del árbol
// de permisos:
//   m|modulo|ruta          ítem del menú (permisos[modulo] incluye ruta)
//   v|ruta                 vista o pestaña con configuración (entrada en permisosGranulares)
//   s|ruta|seccion         sección visible
//   e|ruta|seccion|accion  acción o columna permitida
// Una sección o acción sin configurar cuenta como permitida (igual que
// useGranularPermission y las reglas); un ítem o vista ausente, no.
//
// Permiso efectivo = plantilla del centro de costo + agregados − quitados.
// Del usuario solo se guardan las excepciones { agregados, quitados }.

// Roles (lista única: pantalla de usuarios, Permisos por centro y funciones).
// Los de acceso total (administradores del sistema) no usan plantillas; los
// demás reciben la plantilla de su centro de costo PARA SU ROL.
export const ROLES = Object.freeze([
  { value: 'admin', label: 'Administrador del sistema', accesoTotal: true },
  { value: 'dev', label: 'Desarrollador', accesoTotal: true },
  { value: 'encargado', label: 'Encargado de centro', accesoTotal: false },
  { value: 'operador', label: 'Operador', accesoTotal: false },
]);
export const esRolAccesoTotal = (rol) => ROLES.some((r) => r.value === rol && r.accesoTotal);
// Orden de las pestañas de Permisos por centro: Operador (la base) primero.
const ORDEN_PLANTILLAS = ['operador', 'encargado'];
export const ROLES_CON_PLANTILLA = Object.freeze(ROLES.filter((r) => !r.accesoTotal).map((r) => r.value)
  .sort((a, b) => ORDEN_PLANTILLAS.indexOf(a) - ORDEN_PLANTILLAS.indexOf(b)));
export const ROL_POR_DEFECTO = 'operador';
export const labelRol = (rol) => ROLES.find((r) => r.value === rol)?.label || rol || 'Sin rol';

// Plantilla de un centro de costo para un rol: plantillas_permisos/{centroId}__{rol}.
export const idPlantilla = (centroId, rol) => `${centroId}__${rol}`;
// Id de la plantilla que corresponde a un usuario (null: sin centro, o rol de acceso total).
export const idPlantillaDeUsuario = (centroId, rol) => {
  const r = rol || ROL_POR_DEFECTO;
  return centroId && ROLES_CON_PLANTILLA.includes(r) ? idPlantilla(centroId, r) : null;
};

export const claveMenu = (modulo, ruta) => `m|${modulo}|${ruta}`;
export const claveVista = (ruta) => `v|${ruta}`;
export const claveSeccion = (ruta, seccion) => `s|${ruta}|${seccion}`;
export const claveElemento = (ruta, seccion, elemento) => `e|${ruta}|${seccion}|${elemento}`;

export const SIN_EXCEPCIONES = Object.freeze({ agregados: [], quitados: [] });
const PATRON_CLAVE = /^(m\|[^|]+\|[^|]+|v\|[^|]+|s\|[^|]+\|[^|]+|e\|[^|]+\|[^|]+\|[^|]+)$/;
const MAX_EXCEPCIONES = 20000;

const tipo = (clave) => clave[0];
const permitidaSinConfigurar = (clave) => tipo(clave) === 's' || tipo(clave) === 'e';

export const aplanar = (estado) => {
  const plano = {};
  Object.entries(estado?.permisos || {}).forEach(([modulo, rutas]) => {
    (Array.isArray(rutas) ? rutas : []).forEach((ruta) => { plano[claveMenu(modulo, ruta)] = true; });
  });
  Object.entries(estado?.permisosGranulares || {}).forEach(([ruta, vista]) => {
    if (!vista || typeof vista !== 'object') return;
    plano[claveVista(ruta)] = true;
    Object.entries(vista).forEach(([seccion, sec]) => {
      if (!sec || typeof sec !== 'object') return;
      plano[claveSeccion(ruta, seccion)] = sec.visible !== false;
      Object.entries(sec.elements || {}).forEach(([el, v]) => { plano[claveElemento(ruta, seccion, el)] = v !== false; });
    });
  });
  return plano;
};

export const valorDe = (plano, clave) => (clave in plano ? plano[clave] : permitidaSinConfigurar(clave));

export const desaplanar = (plano) => {
  const permisos = {};
  const permisosGranulares = {};
  const claves = Object.keys(plano);
  const partes = (c) => c.split('|');
  claves.filter((c) => tipo(c) === 'm' && plano[c]).forEach((c) => {
    const [, modulo, ruta] = partes(c);
    (permisos[modulo] ||= []).push(ruta);
  });
  claves.filter((c) => tipo(c) === 'v' && plano[c]).forEach((c) => { permisosGranulares[partes(c)[1]] = {}; });
  claves.filter((c) => tipo(c) === 's').forEach((c) => {
    const [, ruta, seccion] = partes(c);
    if (permisosGranulares[ruta]) permisosGranulares[ruta][seccion] = { visible: plano[c], elements: {} };
  });
  claves.filter((c) => tipo(c) === 'e').forEach((c) => {
    const [, ruta, seccion, el] = partes(c);
    const vista = permisosGranulares[ruta];
    if (!vista) return;
    vista[seccion] ||= { visible: true, elements: {} };
    vista[seccion].elements[el] = plano[c];
  });
  return { permisos, permisosGranulares };
};

// ¿La casilla importa en `plano`? Las secciones y acciones de una vista que
// no está incluida no cuentan (quitar una vista entera es UNA excepción).
// Las acciones de una sección oculta sí: se conservan para cuando se vuelva
// a mostrar.
const relevante = (plano, clave) => {
  if (!permitidaSinConfigurar(clave)) return true;
  return plano[claveVista(clave.split('|')[1])] === true;
};

// Excepciones para que `editado` sea el permiso efectivo sobre `plantilla`.
export const calcularExcepciones = (plantilla, editado) => {
  const p = aplanar(plantilla);
  const e = aplanar(editado);
  const agregados = [];
  const quitados = [];
  new Set([...Object.keys(p), ...Object.keys(e)]).forEach((clave) => {
    if (!relevante(e, clave)) return;
    const antes = valorDe(p, clave);
    const ahora = valorDe(e, clave);
    if (antes === ahora) return;
    (ahora ? agregados : quitados).push(clave);
  });
  return { agregados: agregados.sort(), quitados: quitados.sort() };
};

// Excepciones válidas (lo que llega del navegador o de Firestore): solo
// casillas bien formadas, sin repetir; si una casilla está en las dos
// listas, gana "quitado".
export const normalizarExcepciones = (exc) => {
  const lista = (v) => (Array.isArray(v) ? v.filter((c) => typeof c === 'string' && PATRON_CLAVE.test(c)) : []);
  const quitados = [...new Set(lista(exc?.quitados))];
  const setQuitados = new Set(quitados);
  const agregados = [...new Set(lista(exc?.agregados))].filter((c) => !setQuitados.has(c));
  if (agregados.length + quitados.length > MAX_EXCEPCIONES) throw new Error('Demasiadas excepciones.');
  return { agregados: agregados.sort(), quitados: quitados.sort() };
};

export const tieneExcepciones = (exc) => Boolean(exc && ((exc.agregados?.length || 0) + (exc.quitados?.length || 0) > 0));

// Permiso efectivo = plantilla + agregados − quitados. Sin plantilla (sin
// centro de costo, o centro sin plantilla) quedan solo los agregados.
export const combinar = (plantilla, excepciones = SIN_EXCEPCIONES) => {
  const plano = aplanar(plantilla);
  (excepciones?.agregados || []).forEach((c) => { plano[c] = true; });
  (excepciones?.quitados || []).forEach((c) => { plano[c] = false; });
  return desaplanar(plano);
};

// Estado de una casilla para el editor: 'agregado' | 'quitado' | 'heredado' | null.
export const origenCasilla = (clave, planoPlantilla, excepciones) => {
  if (excepciones?.agregados?.includes(clave)) return 'agregado';
  if (excepciones?.quitados?.includes(clave)) return 'quitado';
  if (!relevante(planoPlantilla, clave)) return null;
  return valorDe(planoPlantilla, clave) ? 'heredado' : null;
};

// --- Protección contra quedarse sin administrador -------------------------
// Administrar usuarios exige rol admin/dev (reglas de Firestore y estas
// funciones); el rol no viene de plantillas, así que solo lo pueden quitar
// un cambio de rol o la inactivación.
export const esAdministrador = (u) => Boolean(u) && esRolAccesoTotal(u.rol) && u.activo !== false;

// Acción granular de un usuario activo, con el mismo criterio que las reglas
// (accionEnVista) y useGranularPermission: admin/dev pueden todo; el resto
// necesita el ítem del menú y la vista en permisosGranulares; una sección o
// acción sin configurar se permite; visible:false o la acción en false, no.
export const puedeAccion = (u, modulo, ruta, seccion, accion) => {
  if (!u || u.activo === false) return false;
  if (esRolAccesoTotal(u.rol)) return true;
  if (!(u.permisos?.[modulo] || []).includes(ruta)) return false;
  const vista = u.permisosGranulares?.[ruta];
  if (!vista) return false;
  const config = vista[seccion];
  if (!config) return true;
  return config.visible !== false && config.elements?.[accion] !== false;
};

// usuarios: [{ id, rol, activo }] (al menos todos los administradores).
export const dejaSinAdministrador = (usuarios, uid, cambios = {}) => {
  const antes = usuarios.find((u) => u.id === uid);
  if (!esAdministrador(antes)) return false;
  const definidos = Object.fromEntries(Object.entries(cambios).filter(([, v]) => v !== undefined));
  if (esAdministrador({ ...antes, ...definidos })) return false;
  return !usuarios.some((u) => u.id !== uid && esAdministrador(u));
};
