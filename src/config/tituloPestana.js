import { MODULES } from './modulesConfig.jsx';
import { itemDeRuta } from './modulosActivos';
import { entradaDeItem, etiquetaEntrada } from './gruposMenu.jsx';

// Título de la pestaña del Dashboard: "<sección> | Medra". La sección es
// el módulo, no el ítem, con el nombre del sidebar (Finanzas, Usuarios y
// accesos... aunque por dentro sean Administración):
//   - Ajustes: "Ajustes".
//   - Módulo abierto en el sidebar: su nombre.
//   - Sin módulo abierto pero con una vista de módulo (ej. tras "Volver a
//     módulos"): el módulo de esa vista.
//   - Lo demás (panel, perfil, políticas): "Inicio".
export const tituloPestana = ({ isAjustesMode, activeModule, activeView }) => {
  let seccion = 'Inicio';
  if (isAjustesMode) {
    seccion = 'Ajustes';
  } else if (activeModule && etiquetaEntrada(activeModule)) {
    seccion = etiquetaEntrada(activeModule);
  } else {
    const encontrado = itemDeRuta(MODULES, activeView);
    if (encontrado) seccion = etiquetaEntrada(entradaDeItem(encontrado.moduloKey, encontrado.item));
  }
  return `${seccion} | Medra`;
};
