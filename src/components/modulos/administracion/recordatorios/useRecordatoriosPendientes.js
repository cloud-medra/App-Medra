import { useEffect, useMemo, useState } from 'react';
import { onSnapshot } from 'firebase/firestore';
import { db } from '../../../../firebaseConfig';
import { useUser } from '../../../../context/UserContext';
import {
  puedeRecibirRecordatorios, fechaEnSantiago, fechaMinimaRealizados, tareasPendientes, idRealizado,
} from './recordatoriosConfig';
import { consultaTareasDe, consultaRealizadosDe } from './recordatoriosServicio';

// "Hoy" en Santiago, revisado cada minuto (cambio de día con la app abierta).
const useHoySantiago = () => {
  const [hoy, setHoy] = useState(() => fechaEnSantiago());
  useEffect(() => {
    const id = setInterval(() => setHoy(fechaEnSantiago()), 60000);
    return () => clearInterval(id);
  }, []);
  return hoy;
};

// Tareas del usuario conectado que tocan hoy o quedaron atrasadas.
// Dos listeners (sus tareas + sus Realizados de la última semana), solo si
// tiene permiso de recibir recordatorios; sin permiso no lee nada (y lo ya
// leído se ignora: pendientes depende de habilitado y del uid).
export const useRecordatoriosPendientes = () => {
  const { userData } = useUser();
  const uid = userData?.uid;
  const habilitado = puedeRecibirRecordatorios(userData);
  const hoy = useHoySantiago();
  const fechaMinima = fechaMinimaRealizados(hoy);

  const [tareas, setTareas] = useState([]);
  const [realizados, setRealizados] = useState(() => new Set());

  useEffect(() => {
    if (!habilitado) return undefined;
    return onSnapshot(
      consultaTareasDe(db, uid),
      (snap) => setTareas(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => { console.error('Error al leer recordatorios:', err); setTareas([]); }
    );
  }, [habilitado, uid]);

  useEffect(() => {
    if (!habilitado) return undefined;
    return onSnapshot(
      consultaRealizadosDe(db, uid, fechaMinima),
      (snap) => setRealizados(new Set(snap.docs.map((d) => idRealizado(d.data().tareaId, d.data().fecha)))),
      (err) => console.error('Error al leer recordatorios realizados:', err)
    );
  }, [habilitado, uid, fechaMinima]);

  const pendientes = useMemo(
    () => (habilitado ? tareasPendientes(tareas, realizados, { uid, hoy }) : []),
    [habilitado, tareas, realizados, uid, hoy]
  );

  return { pendientes, hoy, habilitado };
};
