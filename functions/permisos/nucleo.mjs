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
// - accesoTotal: ve y hace todo sin permisos asignados (solo Desarrollador:
//   así siempre hay alguien con acceso a Administración).
// - sinPlantilla: no recibe la plantilla de su centro de costo; sus permisos
//   son solo los propios (Administrador y Desarrollador).
// - administra: rol que puede administrar usuarios (Crear usuario, Lista de
//   usuarios, Permisos por centro), siempre que además tenga el ítem del
//   menú; ve automáticamente los ítems `automaticoAdministradores` (Alertas).
// Los demás reciben la plantilla de su centro de costo PARA SU ROL.
export const ROLES = Object.freeze([
  { value: 'admin', label: 'Administrador del sistema', accesoTotal: false, sinPlantilla: true, administra: true },
  { value: 'dev', label: 'Desarrollador', accesoTotal: true, sinPlantilla: true, administra: true },
  { value: 'encargado', label: 'Encargado de centro', accesoTotal: false, sinPlantilla: false, administra: false },
  { value: 'operador', label: 'Operador', accesoTotal: false, sinPlantilla: false, administra: false },
]);
export const esRolAccesoTotal = (rol) => ROLES.some((r) => r.value === rol && r.accesoTotal);
export const esRolSinPlantilla = (rol) => ROLES.some((r) => r.value === rol && r.sinPlantilla);
export const esRolAdministrador = (rol) => ROLES.some((r) => r.value === rol && r.administra);
// Orden de las pestañas de Permisos por centro: Operador (la base) primero.
const ORDEN_PLANTILLAS = ['operador', 'encargado'];
export const ROLES_CON_PLANTILLA = Object.freeze(ROLES.filter((r) => !r.sinPlantilla).map((r) => r.value)
  .sort((a, b) => ORDEN_PLANTILLAS.indexOf(a) - ORDEN_PLANTILLAS.indexOf(b)));
export const ROL_POR_DEFECTO = 'operador';
export const labelRol = (rol) => ROLES.find((r) => r.value === rol)?.label || rol || 'Sin rol';

// Plantilla de un centro de costo para un rol: plantillas_permisos/{centroId}__{rol}.
export const idPlantilla = (centroId, rol) => `${centroId}__${rol}`;
// Id de la plantilla que corresponde a un usuario (null: sin centro, o rol sin plantilla).
export const idPlantillaDeUsuario = (centroId, rol) => {
  const r = rol || ROL_POR_DEFECTO;
  return centroId && ROLES_CON_PLANTILLA.includes(r) ? idPlantilla(centroId, r) : null;
};

export const claveMenu = (modulo, ruta) => `m|${modulo}|${ruta}`;
export const claveVista = (ruta) => `v|${ruta}`;
export const claveSeccion = (ruta, seccion) => `s|${ruta}|${seccion}`;
export const claveElemento = (ruta, seccion, elemento) => `e|${ruta}|${seccion}|${elemento}`;

// Acciones sensibles DENEGADAS POR DEFECTO (para todos salvo Desarrollador): sin configurar
// (sección o acción sin valor guardado) se niegan, al revés que el resto
// ("sin configurar = permitida"). Toda acción sensible nueva (aprobar,
// rechazar, desbloquear…) debe agregarse aquí; así ningún usuario que ya
// tenga la vista la recibe sin que un admin la marque. Lo respetan
// useGranularPermission, puedeAccion (Cloud Functions), valorDe (plantillas
// y excepciones) y el editor de permisos (que las completa desmarcadas;
// "marcar toda la vista" y "acceso total" sí las marcan). Desarrollador, siempre.
// Las reglas de Firestore/Storage usan el criterio permisivo: estas acciones
// se validan en Cloud Functions, no en reglas (lo verifica
// src/config/componentMaps/accionesDenegadas.test.js).
export const ACCIONES_DENEGADAS_POR_DEFECTO = Object.freeze([
  claveElemento('/administracion/listadoUsuario', 'tabla_usuarios', 'btn_desbloquear'),
  // Antes solo por rol (admin/dev); siguen exigiendo además rol Administrador.
  claveElemento('/administracion/estadisticas', 'acciones', 'btn_recalcular'),
  claveElemento('/documentos/importarDetallesOC', 'tabla_registros', 'btn_eliminar_filas'),
  claveElemento('/implantes/gestionImplantes', 'drawer_configuracion', 'btn_marcar_oc_pendiente'),
  claveElemento('/hemodinamia/gestionHemodinamia', 'drawer_configuracion', 'btn_marcar_oc_pendiente'),
  // Bodega (functions/bodega): inactivar productos y quitar/reasignar códigos de barra.
  claveElemento('/bodega/maestroBodega', 'productos', 'btn_inactivar'),
  claveElemento('/bodega/maestroBodega', 'codigos', 'btn_desvincular'),
  // Bodega: confirmar la carga inicial (stock sin documento) y cerrarla/reabrirla.
  claveElemento('/bodega/cargaInicialBodega', 'carga', 'btn_confirmar'),
  claveElemento('/bodega/cargaInicialBodega', 'carga', 'btn_cerrar_carga'),
  // Bodega: cerrar el inventario físico con ajuste de stock, y anularlo.
  claveElemento('/bodega/inventarioBodega', 'inventario', 'btn_cerrar'),
  claveElemento('/bodega/inventarioBodega', 'inventario', 'btn_anular'),
  // Pestaña Documentos de Gestión (functions/documentosAdmision): enviar un
  // PDF de la admisión a la papelera.
  claveElemento('/implantes/gestionImplantes/documentos', 'contenido', 'btn_eliminar_documento'),
  claveElemento('/hemodinamia/gestionHemodinamia/documentos', 'contenido', 'btn_eliminar_documento'),
]);
const DENEGADAS = new Set(ACCIONES_DENEGADAS_POR_DEFECTO);
export const deniegaSinConfigurar = (ruta, seccion, accion) => DENEGADAS.has(claveElemento(ruta, seccion, accion));

export const SIN_EXCEPCIONES = Object.freeze({ agregados: [], quitados: [] });
const PATRON_CLAVE = /^(m\|[^|]+\|[^|]+|v\|[^|]+|s\|[^|]+\|[^|]+|e\|[^|]+\|[^|]+\|[^|]+)$/;
const MAX_EXCEPCIONES = 20000;

const tipo = (clave) => clave[0];
const permitidaSinConfigurar = (clave) => tipo(clave) === 's' || (tipo(clave) === 'e' && !DENEGADAS.has(clave));

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

// --- Protección contra quedarse sin desarrollador --------------------------
// El Desarrollador es el único rol con acceso total (el que siempre puede
// entrar a Administración); el rol no viene de plantillas, así que solo lo
// pueden quitar un cambio de rol o la inactivación.
export const esDesarrollador = (u) => Boolean(u) && esRolAccesoTotal(u.rol) && u.activo !== false;
// Usuario activo con rol que administra (Administrador o Desarrollador).
export const esAdministrador = (u) => Boolean(u) && esRolAdministrador(u.rol) && u.activo !== false;
// ¿Puede usar una vista de Administración que administra usuarios? El
// Desarrollador siempre; el Administrador, solo con alguno de esos ítems.
export const puedeAdministrar = (u, rutas) => esDesarrollador(u)
  || (esAdministrador(u) && rutas.some((r) => (u.permisos?.administracion || []).includes(r)));
// usuarios: [{ id, rol, activo }] (al menos todos los desarrolladores).
export const dejaSinDesarrollador = (usuarios, uid, cambios = {}) => {
  const antes = usuarios.find((u) => u.id === uid);
  if (!esDesarrollador(antes)) return false;
  const definidos = Object.fromEntries(Object.entries(cambios).filter(([, v]) => v !== undefined));
  if (esDesarrollador({ ...antes, ...definidos })) return false;
  return !usuarios.some((u) => u.id !== uid && esDesarrollador(u));
};

// Acción granular de un usuario activo, con el mismo criterio que las reglas
// (accionEnVista) y useGranularPermission: el Desarrollador puede todo; el resto
// necesita el ítem del menú y la vista en permisosGranulares; una sección o
// acción sin configurar se permite (salvo ACCIONES_DENEGADAS_POR_DEFECTO);
// visible:false o la acción en false, no.
export const puedeAccion = (u, modulo, ruta, seccion, accion) => {
  if (!u || u.activo === false) return false;
  if (esRolAccesoTotal(u.rol)) return true;
  if (!(u.permisos?.[modulo] || []).includes(ruta)) return false;
  const vista = u.permisosGranulares?.[ruta];
  if (!vista) return false;
  return accionDeVista(vista, ruta, seccion, accion);
};

// Igual que puedeAccion, para una acción de una pestaña (`procesos` del
// mapa): el ítem del menú es la vista contenedora (rutaVista) y la acción
// se lee de permisosGranulares[rutaPestana], como hasPermission(rutaPestana, …).
export const puedeAccionEnPestana = (u, modulo, rutaVista, rutaPestana, seccion, accion) => {
  if (!u || u.activo === false) return false;
  if (esRolAccesoTotal(u.rol)) return true;
  if (!(u.permisos?.[modulo] || []).includes(rutaVista)) return false;
  const vista = u.permisosGranulares?.[rutaPestana];
  if (!vista) return false;
  return accionDeVista(vista, rutaPestana, seccion, accion);
};

// Una acción dentro de la vista ya otorgada (permisosGranulares[ruta]).
export const accionDeVista = (vista, ruta, seccion, accion) => {
  const config = vista?.[seccion];
  const porDefecto = !deniegaSinConfigurar(ruta, seccion, accion);
  if (!config) return porDefecto;
  if (config.visible === false) return false;
  const valor = config.elements?.[accion];
  return valor === undefined ? porDefecto : valor !== false;
};

// usuarios: [{ id, rol, activo }] (al menos todos los administradores).
export const dejaSinAdministrador = (usuarios, uid, cambios = {}) => {
  const antes = usuarios.find((u) => u.id === uid);
  if (!esAdministrador(antes)) return false;
  const definidos = Object.fromEntries(Object.entries(cambios).filter(([, v]) => v !== undefined));
  if (esAdministrador({ ...antes, ...definidos })) return false;
  return !usuarios.some((u) => u.id !== uid && esAdministrador(u));
};
