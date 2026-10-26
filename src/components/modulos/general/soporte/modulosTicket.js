import { MODULES } from '../../../../config/modulesConfig.jsx';
import { entradasMenu, entradaDeItem, etiquetaEntrada } from '../../../../config/gruposMenu.jsx';
import { itemDeRuta } from '../../../../config/modulosActivos';

// "Módulo relacionado" de un ticket: las entradas del sidebar (módulos y
// grupos, con el nombre visible) más General y Ajustes. Se guarda la clave.

export const MODULO_GENERAL = 'GENERAL';
export const MODULO_AJUSTES = 'AJUSTES';

export const opcionesModuloTicket = () => [
  ...entradasMenu(Object.keys(MODULES).filter((k) => (MODULES[k].subItems || []).length > 0))
    .map((e) => ({ id: e, label: etiquetaEntrada(e) })),
  { id: MODULO_AJUSTES, label: 'Ajustes' },
  { id: MODULO_GENERAL, label: 'General / Otro' },
];

export const etiquetaModuloTicket = (id) => {
  if (id === MODULO_GENERAL) return 'General / Otro';
  if (id === MODULO_AJUSTES) return 'Ajustes';
  return etiquetaEntrada(id) || id || '—';
};

// Módulo preseleccionado según la pantalla donde estaba el usuario.
export const moduloDesdeContexto = ({ entrada, vista } = {}) => {
  if (entrada && etiquetaEntrada(entrada)) return entrada;
  const encontrado = itemDeRuta(MODULES, vista);
  if (encontrado) return entradaDeItem(encontrado.moduloKey, encontrado.item);
  if (typeof vista === 'string' && (vista.startsWith('/settings') || vista.startsWith('/ajustes'))) return MODULO_AJUSTES;
  return MODULO_GENERAL;
};
