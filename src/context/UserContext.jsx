import React, { createContext, useState, useContext, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db, prepararCacheParaUsuario } from '../firebaseConfig';

const UserContext = createContext();

export const UserProvider = ({ children }) => {
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true); // Nuevo estado de carga global
  // Por qué no se pudo cargar el perfil del usuario autenticado:
  // null | 'sin-perfil' (no existe usuarios/{uid}) | 'inactivo' (un admin
  // lo inactivó; LoginForm cierra la sesión con el aviso) | 'error-carga'.
  const [perfilError, setPerfilError] = useState(null);

// El perfil propio se ESCUCHA (no se lee una sola vez): si un administrador
// cambia los permisos del usuario, su centro de costo o la plantilla de ese
// centro (las Cloud Functions reescriben el permiso efectivo), el menú, los
// guards y los botones se actualizan al instante, sin volver a entrar.
useEffect(() => {
  let dejarDeEscuchar = null;
  let turno = 0;
  const detener = () => { dejarDeEscuchar?.(); dejarDeEscuchar = null; };

  const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
    detener();
    const miTurno = ++turno;
    if (!currentUser) {
      setUserData(null);
      setPerfilError(null);
      setLoading(false);
      return;
    }
    // Al iniciar sesión (no solo al recargar) se vuelve a "cargando": así
    // nadie (LoginForm, ProtectedRoute) decide con el userData anterior
    // mientras se prepara la caché y se lee el perfil.
    setLoading(true);
    setPerfilError(null);
    try {
      // Antes de la primera lectura: si la caché local de Firestore es de
      // otro usuario, se borra (ver firebaseConfig.js).
      await prepararCacheParaUsuario(currentUser.uid);
    } catch (error) {
      console.error("Error al preparar la caché:", error);
      setUserData(null);
      setPerfilError('error-carga');
      setLoading(false);
      return;
    }
    if (miTurno !== turno) return; // ya cambió la sesión mientras tanto

    dejarDeEscuchar = onSnapshot(
      doc(db, "usuarios", currentUser.uid),
      (userDoc) => {
        if (userDoc.exists() && userDoc.data().activo === false) {
          // Inactivado (también con la sesión ya abierta): las reglas ya le
          // niegan todo; sin userData, ProtectedRoute lo lleva al login.
          setUserData(null);
          setPerfilError('inactivo');
        } else if (userDoc.exists()) {
          setUserData({ ...userDoc.data(), uid: currentUser.uid });
          setPerfilError(null);
        } else {
          // Si el usuario existe en Auth pero no en Firestore, es un error de lógica
          console.error("Usuario sin documento en Firestore");
          setUserData(null);
          setPerfilError('sin-perfil');
        }
        setLoading(false);
      },
      (error) => {
        console.error("Error al cargar datos:", error);
        setUserData(null);
        setPerfilError('error-carga');
        setLoading(false);
      }
    );
  });
  return () => { detener(); unsubscribe(); };
}, []);

  return (
    <UserContext.Provider value={{ userData, setUserData, loading, perfilError }}>
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => useContext(UserContext);
