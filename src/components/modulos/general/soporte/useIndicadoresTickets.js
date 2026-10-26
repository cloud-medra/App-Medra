import { useEffect, useState } from 'react';
import { escucharNovedadesUsuario, escucharPendientesGestor } from './ticketsServicio';

// Indicadores del menú (ver ticketsServicio.js): nunca leen todos los tickets.

// ¿Alguno de mis tickets tiene una respuesta o un cambio de estado sin ver?
// Consulta con limit(1).
export const useNovedadesTicketsUsuario = (uid) => {
  const [hay, setHay] = useState(false);
  useEffect(() => {
    if (!uid) return undefined;
    return escucharNovedadesUsuario(uid, setHay);
  }, [uid]);
  return hay;
};

// Tickets sin revisar (nuevos o con respuesta del usuario), para quien
// gestiona. Consulta con limit(10): se muestra hasta "9+".
export const useTicketsPendientesGestor = (habilitado) => {
  const [cantidad, setCantidad] = useState(0);
  useEffect(() => {
    if (!habilitado) { setCantidad(0); return undefined; }
    return escucharPendientesGestor(setCantidad);
  }, [habilitado]);
  return cantidad;
};
