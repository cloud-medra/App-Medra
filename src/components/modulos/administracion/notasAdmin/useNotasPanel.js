import { useMemo } from 'react';
import { useCatalogo } from '../../../../hooks/useCatalogo';
import { useUser } from '../../../../context/UserContext';
import { consultaNotas } from './notasConfig';

// Notas del panel (administracion_notas) desde el catalogosStore: una sola
// lectura por sesión compartida por el Dashboard (NuevoModuloCard) y Notas
// Admin, en vez de un listener en cada uno. Las escrituras de la app se
// reflejan con upsertLocal/removeLocal o `refrescar()`.
// La lectura se filtra por el rol del usuario (las reglas no permiten leer
// notas dirigidas a otros roles; el Desarrollador ve todas).
// Mismo orden que el orderBy('orden', 'asc') original.
export const useNotasPanel = () => {
  const { userData } = useUser();
  const { datos, cargando, refrescar } = useCatalogo('notas', {
    habilitado: Boolean(userData),
    consulta: consultaNotas(userData),
  });
  const notas = useMemo(
    () => datos
      .filter(n => n.orden !== undefined)
      .sort((a, b) => a.orden - b.orden),
    [datos]
  );
  return { notas, cargando, refrescar };
};
