import { useEffect, useState } from 'react';
import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { normalizarModulosActivos } from '../config/modulosActivos';

// =====================================================================
// Módulos activos — configuración GLOBAL (una sola para el sistema)
// =====================================================================
// configuracion_sistema/modulosActivos (ver config/modulosActivos.js). La
// edita el Desarrollador desde Administración → Gestión de módulos (las
// reglas de configuracion_sistema ya exigen esDev() para escribir).
// Un solo listener compartido (un documento): así un cambio llega al
// sidebar de todos los usuarios conectados sin recargar.
// =====================================================================

const refConfig = () => doc(db, 'configuracion_sistema', 'modulosActivos');

let ultima = null;
let cancelar = null;
const suscriptores = new Set();

const notificar = (config) => {
  ultima = config;
  suscriptores.forEach((cb) => cb(config));
};

const abrirListener = () => {
  cancelar = onSnapshot(
    refConfig(),
    (snap) => notificar(normalizarModulosActivos(snap.exists() ? snap.data() : null)),
    (error) => {
      // Sin lectura (ej. sesión cerrándose) se conserva lo último; si nunca
      // se leyó, todo activo.
      console.error('Error al leer los módulos activos:', error);
      if (!ultima) notificar(normalizarModulosActivos(null));
    }
  );
};

const cerrarListener = () => {
  if (cancelar) cancelar();
  cancelar = null;
};

export const guardarModulosActivos = async (config, usuario) => {
  const limpia = normalizarModulosActivos(config);
  await setDoc(refConfig(), {
    ...limpia,
    actualizadoEn: serverTimestamp(),
    actualizadoPor: usuario?.nombreCompleto || usuario?.email || ''
  });
  notificar(limpia);
  return limpia;
};

// { modulosInactivos, itemsInactivos } o null mientras carga.
export const useModulosActivos = () => {
  const [config, setConfig] = useState(ultima);
  useEffect(() => {
    suscriptores.add(setConfig);
    if (!cancelar) abrirListener();
    return () => {
      suscriptores.delete(setConfig);
      if (suscriptores.size === 0) cerrarListener();
    };
  }, []);
  return config;
};
