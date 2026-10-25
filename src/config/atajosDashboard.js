import { GRUPOS_MENU } from './gruposMenu.jsx';

// Atajos del widget "Accesos rápidos" del Dashboard (AtajosCard.jsx).
//
// Cada atajo apunta a un ítem que ya existe en el sidebar (MODULES de
// modulesConfig.jsx): `modulo` es la clave del módulo y `path` la ruta del
// ítem, exactamente como están allí. El nombre, el ícono y el nombre del
// módulo se toman del sidebar; `label` / `icon` opcionales los reemplazan
// solo en el atajo. Un atajo sin permiso para ese ítem no se muestra.
//
// La lista que se usa es la que configura un admin/dev en Ajustes → Atajos
// (global, en configuracion_sistema/atajosDashboard; ver
// stores/atajosDashboardStore.js). Mientras no se haya guardado nada, se usa
// ATAJOS_POR_DEFECTO.
export const ATAJOS_POR_DEFECTO = [
  { modulo: 'implantes', path: '/implantes/gestionImplantes' },
  { modulo: 'consignacion', path: '/consignacion/cargasConsignacion' },
  { modulo: 'consignacion', path: '/consignacion/registroConsignacion' },
  { modulo: 'maestros', path: '/maestros/codigosMaestros' },
  { modulo: 'documentos', path: '/documentos/reportesInfo' }
];

// Atajos que el usuario puede ver, con los datos del sidebar resueltos.
// Mismo criterio de permisos que el sidebar (Dashboard.jsx →
// getSubItemsOrdenados): el ítem tiene que estar en permisos[modulo]. El
// nombre del módulo es el del grupo del sidebar si el ítem tiene uno
// (Finanzas, Usuarios y accesos; ver config/gruposMenu.jsx).
export const resolverAtajos = (atajos, modulos, permisos) =>
  atajos.flatMap((atajo) => {
    const modulo = modulos[atajo.modulo];
    const item = modulo?.subItems?.find((s) => s.path === atajo.path);
    if (!item || !(permisos?.[atajo.modulo] || []).includes(atajo.path)) return [];
    return [{
      modulo: atajo.modulo,
      path: atajo.path,
      label: atajo.label || item.label,
      moduloLabel: GRUPOS_MENU[item.grupo]?.label || modulo.label,
      icon: atajo.icon || item.icon || modulo.icon
    }];
  });

// Quién puede editar la configuración global (Ajustes → Atajos): solo el
// Desarrollador. Mismo criterio que esDev() de firestore.rules.
export const puedeConfigurarAtajos = (userData) => userData?.rol === 'dev' && userData?.activo !== false;

const mismoAtajo = (a, b) => a.modulo === b.modulo && a.path === b.path;

// Lista guardada en Firestore -> [{ modulo, path }] válida y sin repetidos.
// Sin documento (o con un formato inesperado) se usan los atajos por defecto;
// una lista vacía guardada a propósito se respeta.
export const normalizarAtajosGuardados = (data) => {
  if (!Array.isArray(data?.atajos)) return ATAJOS_POR_DEFECTO;
  return data.atajos.reduce((acc, a) => {
    if (typeof a?.modulo !== 'string' || typeof a?.path !== 'string') return acc;
    const atajo = { modulo: a.modulo, path: a.path };
    if (!acc.some((x) => mismoAtajo(x, atajo))) acc.push(atajo);
    return acc;
  }, []);
};

export const estaSeleccionado = (lista, atajo) => lista.some((a) => mismoAtajo(a, atajo));

// Marca/desmarca un ítem: al marcarlo queda al final de la lista.
export const alternarAtajo = (lista, atajo) => (estaSeleccionado(lista, atajo)
  ? lista.filter((a) => !mismoAtajo(a, atajo))
  : [...lista, { modulo: atajo.modulo, path: atajo.path }]);

// Mueve el atajo de `desde` a `hasta` (flechas o arrastre).
export const moverAtajo = (lista, desde, hasta) => {
  if (desde === hasta || desde < 0 || hasta < 0 || desde >= lista.length || hasta >= lista.length) return lista;
  const nueva = [...lista];
  const [movido] = nueva.splice(desde, 1);
  nueva.splice(hasta, 0, movido);
  return nueva;
};
