import { useColumnResize } from '../../../../hooks/useColumnResize';
import { useUser } from '../../../../context/UserContext';

// Estilos y anchos de TablaBodega (separado del .jsx: este solo exporta componentes).

// Celda: una línea; lo que no cabe se corta con "…".
export const TD_BODEGA = 'py-1 px-2 border-b border-r border-gray-200 dark:border-gray-700/70 whitespace-nowrap overflow-hidden text-ellipsis';
export const TH_BODEGA = 'py-1.5 px-2 border-b border-r border-gray-200 dark:border-gray-700';

// Anchos redimensionables recordados por usuario y tabla (`clave`).
export const useAnchosTablaBodega = (columnas, clave) => {
  const usuario = useUser()?.userData?.uid;
  return useColumnResize(columnas, { clave, usuario });
};
