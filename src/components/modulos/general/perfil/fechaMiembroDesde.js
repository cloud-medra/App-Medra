// "Miembro desde" de Mi perfil: creadoEl (lo escribe crearUsuario) y, en las
// cuentas sin ese campo, la creación de la cuenta en Firebase Authentication.
import { SIN_REGISTRO } from '../settings/cambiarPassword/fechaCambioPassword';

const aFecha = (valor) => {
  const fecha = valor?.toDate ? valor.toDate() : valor ? new Date(valor) : null;
  return fecha && !Number.isNaN(fecha.getTime()) ? fecha : null;
};

// "13-10-2026", hora de Chile.
export const textoMiembroDesde = (creadoEl, creacionAuth) => {
  const fecha = aFecha(creadoEl) || aFecha(creacionAuth);
  if (!fecha) return SIN_REGISTRO;
  return fecha.toLocaleDateString('es-CL', { timeZone: 'America/Santiago', day: '2-digit', month: '2-digit', year: 'numeric' });
};
