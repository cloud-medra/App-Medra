import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useUser } from '../context/UserContext';
import { esExterno, empresaDeUsuario, empresaActiva } from '../../functions/permisos/nucleo.mjs';

// Empresa del usuario externo: { esExterno, empresaId, nombre, activa, cargando }.
// Una lectura al abrir (las reglas le dejan leer solo la suya). `activa` solo
// explica en pantalla; el acceso a los datos lo cortan las reglas.
export const useEmpresaUsuario = () => {
  const { userData } = useUser();
  const externo = esExterno(userData);
  const empresaId = empresaDeUsuario(userData);
  const [empresa, setEmpresa] = useState({ id: null, nombre: '', activa: false });

  useEffect(() => {
    if (!empresaId) return undefined;
    let cancelado = false;
    getDoc(doc(db, 'maestros_empresas', empresaId))
      .then((snap) => {
        if (!cancelado) setEmpresa({ id: empresaId, nombre: snap.data()?.nombre || '', activa: snap.exists() && empresaActiva(snap.data()) });
      })
      .catch((error) => {
        console.error('No se pudo leer la empresa del usuario:', error);
        if (!cancelado) setEmpresa({ id: empresaId, nombre: '', activa: false });
      });
    return () => { cancelado = true; };
  }, [empresaId]);

  const cargada = empresa.id === empresaId;
  return {
    esExterno: externo,
    empresaId,
    nombre: cargada ? empresa.nombre : '',
    activa: cargada && empresa.activa,
    cargando: Boolean(empresaId) && !cargada,
  };
};
