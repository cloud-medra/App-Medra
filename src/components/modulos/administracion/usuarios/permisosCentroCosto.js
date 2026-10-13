// Permisos por centro de costo en la pantalla de usuarios: el mismo cálculo
// que hacen las Cloud Functions (functions/permisos/nucleo.mjs), para la
// vista previa del editor, y las llamadas a esas funciones (lo único que
// puede guardar rol, centro de costo, excepciones y el permiso efectivo).
import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../../../firebaseConfig';
import { COMPONENT_MAPS } from '../../../../config/componentMaps.jsx';
import { completarPermisosGranulares } from './permisosGranularesUtils';
import {
  aplanar, combinar, calcularExcepciones, normalizarExcepciones, origenCasilla, tieneExcepciones, idPlantillaDeUsuario, SIN_EXCEPCIONES,
} from '../../../../../functions/permisos/nucleo.mjs';

export { calcularExcepciones, tieneExcepciones, SIN_EXCEPCIONES };
export {
  claveMenu, claveVista, claveSeccion, claveElemento, idPlantilla, idPlantillaDeUsuario, ROLES_CON_PLANTILLA, esRolAccesoTotal, labelRol,
} from '../../../../../functions/permisos/nucleo.mjs';

// Plantilla que recibe un usuario de `centroId` con `rol` (undefined si no
// tiene centro, su rol tiene acceso total o la combinación no está
// configurada). `plantillas` viene de usePlantillasPermisos.
export const plantillaDeUsuario = (plantillas, centroId, rol) => {
  const id = idPlantillaDeUsuario(centroId, rol);
  return id ? plantillas[id] : undefined;
};

// "+3 agregados, −1 quitado" (para avisos de cambio de centro o de rol).
export const describirExcepciones = (exc) => {
  const a = exc?.agregados?.length || 0;
  const q = exc?.quitados?.length || 0;
  return `+${a} ${a === 1 ? 'agregado' : 'agregados'}, −${q} ${q === 1 ? 'quitado' : 'quitados'}`;
};

export const SIN_PERMISOS = Object.freeze({ permisos: {}, permisosGranulares: {} });

// Permisos completos para el editor (lo no configurado, marcado: igual que
// al editar un usuario).
export const completar = (estado) => ({
  permisos: JSON.parse(JSON.stringify(estado?.permisos || {})),
  permisosGranulares: completarPermisosGranulares(JSON.parse(JSON.stringify(estado?.permisosGranulares || {})), COMPONENT_MAPS),
});

// Permiso efectivo (para el editor) de una plantilla con excepciones.
export const efectivo = (plantilla, excepciones) => completar(combinar(plantilla || SIN_PERMISOS, excepciones || SIN_EXCEPCIONES));

export const excepcionesDe = (usuario) => normalizarExcepciones(usuario?.excepciones || SIN_EXCEPCIONES);

export const contarExcepciones = (exc) => ({ agregados: exc?.agregados?.length || 0, quitados: exc?.quitados?.length || 0 });

// Estado de cada casilla del editor respecto de la plantilla.
export const crearOrigen = (plantilla, excepciones) => {
  const plano = aplanar(plantilla || SIN_PERMISOS);
  return (clave) => origenCasilla(clave, plano, excepciones);
};

// Plantillas de todas las combinaciones centro + rol
// ({ [`${centroId}__${rol}`]: plantilla }), en vivo. `cargadas` es false
// hasta la primera respuesta: antes no se pueden calcular excepciones (se
// tomaría la plantilla como vacía).
export const usePlantillasPermisos = () => {
  const [estado, setEstado] = useState({ plantillas: {}, cargadas: false, error: null });
  useEffect(() => onSnapshot(
    collection(db, 'plantillas_permisos'),
    (snap) => setEstado({
      plantillas: Object.fromEntries(snap.docs.map((d) => [d.id, { permisos: d.data().permisos || {}, permisosGranulares: d.data().permisosGranulares || {} }])),
      cargadas: true,
      error: null,
    }),
    (error) => {
      console.error('Error al leer las plantillas de permisos:', error);
      setEstado({ plantillas: {}, cargadas: false, error });
    }
  ), []);
  return estado;
};

const llamar = (nombre) => async (datos) => (await httpsCallable(functions, nombre)(datos)).data;
export const guardarPermisosUsuario = llamar('guardarPermisosUsuario');
export const asignarCentroCostoMasivo = llamar('asignarCentroCostoMasivo');
export const guardarPlantillaCentroCosto = llamar('guardarPlantillaCentroCosto');
export const crearUsuario = llamar('crearUsuario');
export const desbloquearUsuario = llamar('desbloquearUsuario');

// Mensaje legible de un error de las funciones.
export const mensajeError = (error, porDefecto) => {
  if (['functions/failed-precondition', 'functions/invalid-argument', 'functions/permission-denied', 'functions/already-exists'].includes(error?.code)) {
    return error.message;
  }
  return porDefecto;
};
