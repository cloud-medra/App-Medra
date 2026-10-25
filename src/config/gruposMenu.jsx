import { Wallet, UserCog } from 'lucide-react';
import { MODULES } from './modulesConfig.jsx';

// Grupos del sidebar en que se reparte Administración: Finanzas, Usuarios y
// accesos y Administración (el resto). Es SOLO el menú: cada ítem sigue
// siendo de permisos.administracion con su ruta /administracion/..., que es
// lo que guardan los usuarios en Firestore y validan firestore.rules y las
// Cloud Functions. El grupo de cada ítem es su campo `grupo` en
// modulesConfig.jsx (sin `grupo`, queda en Administración).
//
// "Entrada" = lo que se ve como módulo en el sidebar: la clave de un módulo
// o la de un grupo.

export const MODULO_AGRUPADO = 'administracion';

export const GRUPOS_MENU = {
  finanzas: { label: 'Finanzas', icon: <Wallet size={18} /> },
  usuarios: { label: 'Usuarios y accesos', icon: <UserCog size={18} /> },
};

// En el sidebar los grupos van juntos, en el lugar de Administración.
const ENTRADAS_AGRUPADAS = ['finanzas', 'usuarios', MODULO_AGRUPADO];

export const entradaDeItem = (moduloKey, item) =>
  (moduloKey === MODULO_AGRUPADO && GRUPOS_MENU[item?.grupo] ? item.grupo : moduloKey);

export const entradaDeRuta = (moduloKey, ruta) =>
  entradaDeItem(moduloKey, MODULES[moduloKey]?.subItems?.find((s) => s.path === ruta));

// Módulo dueño del permiso (y de ordenSubItems) de una entrada.
export const moduloDeEntrada = (entrada) => (GRUPOS_MENU[entrada] ? MODULO_AGRUPADO : entrada);

// Lista ordenada de módulos -> entradas del sidebar.
export const entradasMenu = (moduloKeys) =>
  moduloKeys.flatMap((k) => (k === MODULO_AGRUPADO ? ENTRADAS_AGRUPADAS : [k]));

// Ítems de `items` (los del módulo de la entrada) que van en esa entrada.
export const itemsDeEntrada = (entrada, items) => (moduloDeEntrada(entrada) === MODULO_AGRUPADO
  ? items.filter((s) => entradaDeItem(MODULO_AGRUPADO, s) === entrada)
  : items);

export const etiquetaEntrada = (entrada) => GRUPOS_MENU[entrada]?.label ?? MODULES[entrada]?.label;
export const iconoEntrada = (entrada) => GRUPOS_MENU[entrada]?.icon ?? MODULES[entrada]?.icon;
