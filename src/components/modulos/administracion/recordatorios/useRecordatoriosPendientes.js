import { useEffect, useMemo, useState } from 'react';
import { onSnapshot } from 'firebase/firestore';
import { db } from '../../../../firebaseConfig';
import { useUser } from '../../../../context/UserContext';
import {
  puedeRecibirRecordatorios, fechaEnSantiago, horaEnSantiago, fechaMinimaRealizados, tareasPendientes, idRealizado,
} from './recordatoriosConfig';
import { consultaTareasDe, consultaRealizadosDe } from './recordatoriosServicio';

// Cada cuánto se revisa la hora: una tarea con hora aparece (y abre el
// recuadro) a lo más estos ms después de su hora.
export const INTERVALO_RELOJ_MS = 15000;

// Fecha y hora ('HH:MM') en Santiago, revisadas cada INTERVALO_RELOJ_MS
// (cambio de día y de minuto con la app abierta). Solo re-renderiza cuando
// cambia el minuto.
const useAhoraSantiago = () => {
  const [hoy, setHoy] = useState(() => fechaEnSantiago());
  const [hora, setHora] = useState(() => horaEnSantiago());
  useEffect(() => {
    const id = setInterval(() => {
      const ahora = new Date();
      setHoy(fechaEnSantiago(ahora));
      setHora(horaEnSantiago(ahora));
    }, INTERVALO_RELOJ_MS);
    return () => clearInterval(id);
  }, []);
  return { hoy, hora };
};

// Tareas del usuario conectado que tocan hoy (ya llegada su hora) o
// quedaron atrasadas. Dos listeners (sus tareas + sus Realizados de los
// últimos DIAS_MAX_ATRASO días), solo si tiene permiso de recibir
// recordatorios; sin permiso no lee nada (y lo ya leído se ignora:
// pendientes depende de habilitado y del uid).
export const useRecordatoriosPendientes = () => {
  const { userData } = useUser();
  const uid = userData?.uid;
  const habilitado = puedeRecibirRecordatorios(userData);
  const { hoy, hora } = useAhoraSantiago();
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
    () => (habilitado ? tareasPendientes(tareas, realizados, { uid, hoy, hora }) : []),
    [habilitado, tareas, realizados, uid, hoy, hora]
  );

  return { pendientes, hoy, habilitado };
};
