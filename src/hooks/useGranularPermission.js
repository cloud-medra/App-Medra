import { accionDeVista, esRolAccesoTotal } from '../../functions/permisos/nucleo.mjs';
import { useUser } from '../context/UserContext';

export const useGranularPermission = () => {
  const { userData } = useUser();

  const hasPermission = (viewPath, sectionKey, elementKey = null) => {
    if (!userData) return false;
    // Solo el Desarrollador tiene acceso total; el Administrador se rige por
    // sus permisos como cualquier usuario.
    if (esRolAccesoTotal(userData.rol)) return true;

    const granularMap = userData.permisosGranulares || {};
    const viewConfig = granularMap[viewPath];

    if (!viewConfig) {
      console.warn(`[PERMISOS] ¡ALERTA! No hay config para ${viewPath}. Bloqueando por seguridad.`);
      return false;
    }

    if (!elementKey) {
      const seccionConfig = viewConfig[sectionKey];
      return !seccionConfig || seccionConfig.visible !== false;
    }
    // Sección o acción sin configurar = permitida, salvo las acciones de
    // ACCIONES_DENEGADAS_POR_DEFECTO (functions/permisos/nucleo.mjs).
    return accionDeVista(viewConfig, viewPath, sectionKey, elementKey);
  };

  const hasAccesoProceso = (procesoPath) => {
    if (!userData) return false;
    if (esRolAccesoTotal(userData.rol)) return true;

    const granularMap = userData.permisosGranulares || {};
    return Boolean(granularMap[procesoPath]);
  };

  return { hasPermission, hasAccesoProceso };
};