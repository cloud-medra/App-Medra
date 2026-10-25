import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useUser } from './UserContext';
import { useCatalogo } from '../hooks/useCatalogo';
import {
  claveSeleccion, elegirInstitucion, institucionesActivas,
} from '../components/modulos/maestros/institucionesMaestros/instituciones';

// Institución / sucursal elegida en el selector del header (Maestros →
// Instituciones). Por ahora solo se expone: NINGUNA pantalla filtra datos
// con ella.
//
// - Lista: catálogo `instituciones` (catalogosStore, lectura única por
//   sesión; el maestro refleja sus cambios con upsertLocal).
// - Elección: localStorage por usuario (medra.institucion.<uid>), así se
//   recuerda al recargar sin escribir en Firestore. Si no hay elección
//   válida, vale la predeterminada o la primera activa (elegirInstitucion).

const leerSeleccion = (uid) => {
  if (!uid) return null;
  try {
    return localStorage.getItem(claveSeleccion(uid));
  } catch {
    return null;
  }
};

const guardarSeleccion = (uid, id) => {
  if (!uid) return;
  try {
    localStorage.setItem(claveSeleccion(uid), id);
  } catch {
    // Sin almacenamiento (modo privado o bloqueado): la elección dura la sesión.
  }
};

const SIN_PROVEEDOR = Object.freeze({
  instituciones: [], institucion: null, seleccionar: () => {}, cargando: false, error: null,
});

const InstitucionContext = createContext(SIN_PROVEEDOR);

export const InstitucionProvider = ({ children }) => {
  const { userData } = useUser();
  const uid = userData?.uid;
  const { datos, cargado, error } = useCatalogo('instituciones', { habilitado: Boolean(uid) });

  // Al cambiar de usuario se vuelve a leer su elección guardada.
  const [seleccion, setSeleccion] = useState(() => ({ uid, id: leerSeleccion(uid) }));
  if (seleccion.uid !== uid) setSeleccion({ uid, id: leerSeleccion(uid) });

  const seleccionar = useCallback((id) => {
    guardarSeleccion(uid, id);
    setSeleccion({ uid, id });
  }, [uid]);

  const valor = useMemo(() => ({
    instituciones: institucionesActivas(datos),
    institucion: elegirInstitucion(datos, seleccion.id),
    seleccionar,
    cargando: Boolean(uid) && !cargado && !error,
    error,
  }), [datos, seleccion.id, seleccionar, uid, cargado, error]);

  return <InstitucionContext.Provider value={valor}>{children}</InstitucionContext.Provider>;
};

// eslint-disable-next-line react-refresh/only-export-components
export const useInstitucion = () => useContext(InstitucionContext);
