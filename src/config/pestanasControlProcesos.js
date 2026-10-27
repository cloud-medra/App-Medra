// "Control Procesos" de Laboratorio y Vacunatorio: antes era UN ítem del
// menú con 8 pestañas; ahora cada pestaña es un ítem propio del módulo.
//
// Los permisos NO cambiaron de forma (no hubo migración de datos):
//   - La ruta del ítem sigue siendo la que tenía la pestaña
//     ("<contenedor>/<clave>"), que es la clave que ya existe en
//     permisosGranulares de cada usuario y plantilla.
//   - El acceso se sigue asignando como "Control Procesos": su ruta (el
//     contenedor) en permisos[modulo] y la de cada pestaña habilitada en
//     permisosGranulares (editor de permisos, ver accesoMenu.subItemsAsignables).
// Un ítem `pestanaDe` lo ve quien tiene el contenedor en su menú y la ruta
// del ítem en permisosGranulares, igual que antes se veía la pestaña.
//
// La ruta del contenedor ya no es una pantalla: quien llegue a ella (atajos,
// orden guardado, enlaces) se redirige al primer ítem visible.

export const CONTENEDORES_PESTANAS = Object.freeze({
  '/laboratorio/archivosControlLaboratorio': { modulo: 'laboratorio', label: 'Control Procesos' },
  '/vacunatorio/archivosControlVacunatorio': { modulo: 'vacunatorio', label: 'Control Procesos' },
});

// Mismo orden que tenían las pestañas. `clave` = último tramo de la ruta y
// clave de la pestaña en componentMaps/controlProcesos.js.
export const FASES_CONTROL_PROCESOS = Object.freeze([
  { clave: 'documentosRecibidos', label: 'Documentos Recibidos' },
  { clave: 'iniciarProcesos', label: 'Ingreso de Folios' },
  { clave: 'vinculacionCodigos', label: 'Vinculación de Códigos' },
  { clave: 'vinculacionOrdenes', label: 'Vinculación de Órdenes' },
  { clave: 'solicitudDiferencias', label: 'Solicitud Diferencias' },
  { clave: 'documentosListos', label: 'Documentos Listos' },
  { clave: 'documentosImputados', label: 'Documentos Imputados' },
  { clave: 'documentosEdicion', label: 'Edición' },
]);

export const esContenedor = (ruta) => Object.hasOwn(CONTENEDORES_PESTANAS, ruta);

// Rutas de los ítems de un contenedor (null si la ruta no es contenedor).
export const rutasDeContenedor = (ruta) => (esContenedor(ruta)
  ? FASES_CONTROL_PROCESOS.map((f) => `${ruta}/${f.clave}`)
  : null);

// Lista de rutas con cada contenedor reemplazado, en su lugar, por sus ítems
// (sin repetir). Para datos guardados con la ruta antigua: orden del menú,
// ítems inactivos.
export const expandirContenedores = (rutas) => [
  ...new Set(rutas.flatMap((r) => rutasDeContenedor(r) || [r])),
];

// A qué ítem redirigir la ruta del contenedor: el primero que el usuario ve
// (`visibles`: rutas visibles en su menú) o, si no ve ninguno, el primero de
// la lista (que muestra "Acceso insuficiente"). null si no es contenedor.
export const redireccionContenedor = (ruta, visibles = []) => {
  const rutas = rutasDeContenedor(ruta);
  if (!rutas) return null;
  return rutas.find((r) => visibles.includes(r)) || rutas[0];
};
