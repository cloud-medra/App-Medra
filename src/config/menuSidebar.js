import { MODULES } from './modulesConfig.jsx';
import { subItemsVisibles } from './accesoMenu';
import { expandirContenedores } from './pestanasControlProcesos.js';
import { entradasMenu, itemsDeEntrada, moduloDeEntrada, MODULO_AGRUPADO } from './gruposMenu.jsx';

// Qué muestra el sidebar del Dashboard a un usuario: módulos (y grupos de
// Administración, ver config/gruposMenu.jsx) e ítems, en su orden guardado.
// `activos`: config/modulosActivos.js (null mientras carga = todo activo).

// Módulos con algo que mostrar, en el orden de userData.ordenModulos.
// El Desarrollador ve todos los ítems y Administrador/Desarrollador los
// automáticos (Alertas) aunque no estén en sus permisos (ver
// config/accesoMenu.js). Un módulo inactivo, o con todos sus ítems visibles
// inactivos, no sale.
export const modulosDelSidebar = (userData, activos) => {
  const base = Object.keys(MODULES).filter((mKey) => {
    const visibles = subItemsVisibles(userData, mKey, activos).length;
    if (visibles === 0 && subItemsVisibles(userData, mKey).length > 0) return false;
    return (userData?.permisos?.[mKey] || []).length > 0 || visibles > 0;
  });
  const orden = userData?.ordenModulos;
  if (!orden || !orden.length) return base;
  const ordenados = orden.filter((k) => base.includes(k));
  const faltantes = base.filter((k) => !ordenados.includes(k));
  return [...ordenados, ...faltantes];
};

// Ítems de una entrada (módulo o grupo) en el orden de
// userData.ordenSubItems del módulo dueño. Un "Control Procesos" guardado
// en el orden se reemplaza, en su lugar, por sus ítems
// (config/pestanasControlProcesos.js).
export const itemsDelSidebar = (userData, entrada, activos) => {
  const moduleKey = moduloDeEntrada(entrada);
  const visibles = subItemsVisibles(userData, moduleKey, activos);
  const ordenGuardado = expandirContenedores(userData?.ordenSubItems?.[moduleKey] || []);
  if (!ordenGuardado.length) return itemsDeEntrada(entrada, visibles);
  const ordenados = ordenGuardado
    .map((path) => visibles.find((s) => s.path === path))
    .filter(Boolean);
  const faltantes = visibles.filter((s) => !ordenGuardado.includes(s.path));
  return itemsDeEntrada(entrada, [...ordenados, ...faltantes]);
};

// Entradas del sidebar: Administración se reparte en sus grupos (en su
// lugar del orden); un grupo sin ítems visibles no se muestra.
export const entradasDelSidebar = (userData, activos) => entradasMenu(modulosDelSidebar(userData, activos)).filter(
  (e) => moduloDeEntrada(e) !== MODULO_AGRUPADO || itemsDelSidebar(userData, e, activos).length > 0
);
