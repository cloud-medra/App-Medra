import { MODULES } from './modulesConfig.jsx';
import { esAdministrador as esAdministradorActivo, esDesarrollador as esDesarrolladorActivo } from '../../functions/permisos/nucleo.mjs';

// Qué ítems del menú ve un usuario: lo que tiene en `permisos[modulo]`.
// Excepciones:
//   - Desarrollador: ve todos los ítems (acceso total; así siempre hay
//     alguien con acceso a Administración).
//   - Ítems `automaticoAdministradores` (Administración → Alertas): los ven
//     siempre Administrador y Desarrollador y nunca los demás, aunque figuren
//     en sus permisos (no se asignan desde el editor de permisos).

export const esDesarrollador = (userData) => esDesarrolladorActivo(userData);
// Rol Administrador o Desarrollador (activo).
export const esAdministrador = (userData) => esAdministradorActivo(userData);

export const subItemsVisibles = (userData, moduloKey) => {
  const permitidos = userData?.permisos?.[moduloKey] || [];
  const subItems = MODULES[moduloKey]?.subItems || [];
  if (esDesarrollador(userData)) return subItems;
  const admin = esAdministrador(userData);
  return subItems.filter((s) => (s.automaticoAdministradores ? admin : permitidos.includes(s.path)));
};

// ¿Puede abrir esta vista? Las rutas de ítems `automaticoAdministradores` solo admin/dev.
export const RUTAS_AUTOMATICAS_ADMINISTRADORES = new Set(
  Object.values(MODULES).flatMap((m) => (m.subItems || []).filter((s) => s.automaticoAdministradores).map((s) => s.path))
);
export const puedeAbrirVista = (userData, ruta) => !RUTAS_AUTOMATICAS_ADMINISTRADORES.has(ruta) || esAdministrador(userData);

// Ítems que se pueden asignar en el editor de permisos (sin los automáticos).
export const subItemsAsignables = (modulo) => (modulo.subItems || []).filter((s) => !s.automaticoAdministradores);
