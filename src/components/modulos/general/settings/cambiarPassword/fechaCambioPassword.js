// Fecha del último cambio de contraseña (usuarios/{uid}.passwordCambiadaEl).
// La guardan las dos pantallas que cambian la contraseña: Ajustes y el cambio
// obligatorio del primer ingreso. Lo anterior a este campo no se conoce: se
// muestra "Sin registro" en vez de inventar una fecha.
import { serverTimestamp } from 'firebase/firestore';

export const SIN_REGISTRO = 'Sin registro';

export const camposCambioPassword = () => ({ passwordCambiadaEl: serverTimestamp() });

// "05-11-2026 08:30", hora de Chile.
export const textoFechaCambioPassword = (valor) => {
  const fecha = valor?.toDate ? valor.toDate() : valor ? new Date(valor) : null;
  if (!fecha || Number.isNaN(fecha.getTime())) return SIN_REGISTRO;
  const zona = { timeZone: 'America/Santiago' };
  const dia = fecha.toLocaleDateString('es-CL', { ...zona, day: '2-digit', month: '2-digit', year: 'numeric' });
  const hora = fecha.toLocaleTimeString('es-CL', { ...zona, hour: '2-digit', minute: '2-digit', hour12: false });
  return `${dia} ${hora}`;
};
