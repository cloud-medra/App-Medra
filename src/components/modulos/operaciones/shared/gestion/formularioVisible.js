import { useCallback, useState } from 'react';
import { esPantallaEscritorio } from './fijarColumnas';

// Formulario de registro de Gestiones (Implantes y Hemodinamia) visible u
// oculto: mismo patrón que "Fijar columnas" (fijarColumnas.js). La elección
// se guarda en localStorage del navegador, por módulo y por usuario (uid),
// así cada persona que use el mismo equipo tiene la suya; nada va a
// Firestore. El cierre de sesión no borra estas claves (handleLogout y
// limpiarCacheAlCerrarSesion solo borran las suyas), así que la
// preferencia se mantiene al volver a entrar.
// Sin nada guardado: visible desde 768px y oculto en pantallas menores.

export const claveFormularioVisible = (modulo, uid) => `medra:gestiones:${modulo}:${uid || 'anonimo'}:formularioVisible`;

// Preferencia guardada ('1' / '0'); cualquier otro valor, o sin
// localStorage, cae al valor por defecto según la pantalla.
export const leerFormularioVisible = (clave, porDefecto) => {
  try {
    const valor = localStorage.getItem(clave);
    if (valor === '1') return true;
    if (valor === '0') return false;
  } catch { /* sin localStorage */ }
  return porDefecto;
};

export const guardarFormularioVisible = (clave, visible) => {
  try { localStorage.setItem(clave, visible ? '1' : '0'); } catch { /* sin localStorage: dura mientras la pantalla está abierta */ }
};

// [visible, cambiar]. Si el uid llega después del primer render (perfil aún
// cargando), se relee con la clave del usuario.
export const useFormularioVisible = (modulo, uid) => {
  const clave = claveFormularioVisible(modulo, uid);
  const [estado, setEstado] = useState(() => ({ clave, visible: leerFormularioVisible(clave, esPantallaEscritorio()) }));
  if (estado.clave !== clave) setEstado({ clave, visible: leerFormularioVisible(clave, esPantallaEscritorio()) });
  const cambiar = useCallback((visible) => {
    setEstado({ clave, visible });
    guardarFormularioVisible(clave, visible);
  }, [clave]);
  return [estado.clave === clave ? estado.visible : leerFormularioVisible(clave, esPantallaEscritorio()), cambiar];
};
