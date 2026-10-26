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
//   - Ítems `porDefectoAdministradores` (Herramientas → Gestionar tickets):
//     se asignan como cualquier ítem y, además, los ven siempre el
//     Administrador y el Desarrollador (sin migrar sus permisos guardados).
// `activos` (config/modulosActivos.js): los módulos/ítems inactivos no los
// ve nadie, tampoco el Desarrollador. Sin `activos`, todo activo.

export const esDesarrollador = (userData) => esDesarrolladorActivo(userData);
// Rol Administrador o Desarrollador (activo).
export const esAdministrador = (userData) => esAdministradorActivo(userData);

export const subItemsVisibles = (userData, moduloKey, activos) => {
  const permitidos = userData?.permisos?.[moduloKey] || [];
  const subItems = (MODULES[moduloKey]?.subItems || []).filter((s) => itemActivo(activos, moduloKey, s.path));
  if (esDesarrollador(userData)) return subItems;
  const admin = esAdministrador(userData);
  return subItems.filter((s) => {
    if (s.soloDesarrollador) return false;
    if (s.automaticoAdministradores) return admin;
    return permitidos.includes(s.path) || (s.porDefectoAdministradores && admin);
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
// ni los de solo Desarrollador).
export const subItemsAsignables = (modulo) => (modulo.subItems || [])
  .filter((s) => !s.automaticoAdministradores && !s.soloDesarrollador);
