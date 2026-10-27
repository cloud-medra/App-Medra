import { MODULES } from './modulesConfig.jsx';
import { esAdministrador as esAdministradorActivo, esDesarrollador as esDesarrolladorActivo } from '../../functions/permisos/nucleo.mjs';
import { itemActivo } from './modulosActivos';

// Qué ítems del menú ve un usuario: lo que tiene en `permisos[modulo]`.
// Excepciones:
//   - Desarrollador: ve todos los ítems (acceso total; así siempre hay
//     alguien con acceso a Administración).
//   - Ítems `automaticoAdministradores` (Administración → Alertas): los ven
//     siempre Administrador y Desarrollador y nunca los demás, aunque figuren
//     en sus permisos (no se asignan desde el editor de permisos).
//   - Ítems `soloDesarrollador` (Administración → Gestión de módulos): solo
//     el Desarrollador; tampoco se asignan.
//   - Ítems `heredaDe: <ruta>` (Solicitudes de modificaciones): los ve
//     también quien tiene esa otra ruta, aunque no los tenga asignados.
//   - Ítems `pestanaDe: { path }` (ex pestañas de Control Procesos, ver
//     config/pestanasControlProcesos.js): los ve quien tiene el contenedor
//     (`pestanaDe.path`) en sus permisos y la ruta del ítem en
//     permisosGranulares, igual que antes se veía la pestaña.
// `activos` (config/modulosActivos.js): los módulos/ítems inactivos no los
// ve nadie, tampoco el Desarrollador. Sin `activos`, todo activo.

export const esDesarrollador = (userData) => esDesarrolladorActivo(userData);
// Rol Administrador o Desarrollador (activo).
export const esAdministrador = (userData) => esAdministradorActivo(userData);

// ¿El ítem está entre lo asignado al usuario (sin contar rol ni activos)?
export const tieneItemAsignado = (userData, moduloKey, s) => {
  const permitidos = userData?.permisos?.[moduloKey] || [];
  if (s.pestanaDe) {
    return permitidos.includes(s.pestanaDe.path) && Boolean(userData?.permisosGranulares?.[s.path]);
  }
  return permitidos.includes(s.path) || Boolean(s.heredaDe && permitidos.includes(s.heredaDe));
};

export const subItemsVisibles = (userData, moduloKey, activos) => {
  const subItems = (MODULES[moduloKey]?.subItems || []).filter((s) => itemActivo(activos, moduloKey, s.path));
  if (esDesarrollador(userData)) return subItems;
  const admin = esAdministrador(userData);
  return subItems.filter((s) => {
    if (s.soloDesarrollador) return false;
    if (s.automaticoAdministradores) return admin;
    return tieneItemAsignado(userData, moduloKey, s);
  });
};

// ¿Puede abrir esta vista por rol? Las rutas de ítems `automaticoAdministradores`
// solo admin/dev; las `soloDesarrollador`, solo dev. (Si está activa se
// revisa aparte con vistaActiva de config/modulosActivos.js.)
const rutasCon = (marca) => new Set(
  Object.values(MODULES).flatMap((m) => (m.subItems || []).filter((s) => s[marca]).map((s) => s.path))
);
export const RUTAS_AUTOMATICAS_ADMINISTRADORES = rutasCon('automaticoAdministradores');
export const RUTAS_SOLO_DESARROLLADOR = rutasCon('soloDesarrollador');
export const puedeAbrirVista = (userData, ruta) => {
  if (RUTAS_SOLO_DESARROLLADOR.has(ruta)) return esDesarrollador(userData);
  return !RUTAS_AUTOMATICAS_ADMINISTRADORES.has(ruta) || esAdministrador(userData);
};

// Ítems que se pueden asignar en el editor de permisos (sin los automáticos
// ni los de solo Desarrollador). Los ítems `pestanaDe` se asignan juntos
// como su contenedor ("Control Procesos", con sus pestañas en `procesos`
// del componentMap), en el lugar del primero: así el editor y lo que guarda
// en Firestore siguen exactamente como antes.
export const subItemsAsignables = (modulo) => (modulo.subItems || [])
  .filter((s) => !s.automaticoAdministradores && !s.soloDesarrollador)
  .flatMap((s, i, lista) => {
    if (!s.pestanaDe) return [s];
    const primero = lista.findIndex((o) => o.pestanaDe?.path === s.pestanaDe.path) === i;
    return primero ? [s.pestanaDe] : [];
  });
