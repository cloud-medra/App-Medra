// Reglas del nombre de usuario y del identificador de login. Compartido por
// las Cloud Functions (functions/usuarios/servicio.js) y el navegador (Crear
// / Editar usuario, LoginForm), así las dos validaciones son la misma.
//
// El nombre se guarda tal como se escribió (sin espacios alrededor) en
// usuarios/{uid}.nombreUsuario; su forma normalizada (minúsculas) es el id
// del índice nombres_usuario/{normalizado}, que garantiza que sea único sin
// distinguir mayúsculas.

export const MAX_NOMBRE_USUARIO = 50;

// Mismo mensaje para cualquier fallo de credenciales: no revela si el
// usuario existe, si está inactivo o si solo falló la contraseña.
export const MENSAJE_LOGIN_INCORRECTO = 'Usuario/correo o contraseña incorrectos.';
export const MENSAJE_NOMBRE_EN_USO = 'Ese nombre de usuario ya está en uso.';

export const normalizarNombreUsuario = (valor) => String(valor ?? '').trim().toLowerCase();

// Identificador del login (correo o nombre de usuario): sin espacios
// alrededor y en minúsculas (Firebase Auth guarda los correos en minúsculas).
export const normalizarIdentificador = normalizarNombreUsuario;
export const esCorreo = (identificador) => identificador.includes('@');

// '' si el nombre es válido; si no, el motivo. Sin "@" (se confundiría con
// un correo en el login) ni espacios; sin "/" ni ids reservados de
// Firestore, porque la forma normalizada es el id del índice.
export const errorNombreUsuario = (valor) => {
  const nombre = String(valor ?? '').trim();
  if (!nombre) return 'El nombre de usuario es obligatorio.';
  if (nombre.includes('@')) return 'El nombre de usuario no puede contener "@".';
  if (/\s/.test(nombre)) return 'El nombre de usuario no puede contener espacios.';
  if (nombre.includes('/') || /^\.{1,2}$/.test(nombre) || /^__.*__$/.test(nombre)) {
    return 'El nombre de usuario tiene caracteres no permitidos.';
  }
  if (nombre.length > MAX_NOMBRE_USUARIO) return `El nombre de usuario admite hasta ${MAX_NOMBRE_USUARIO} caracteres.`;
  return '';
};
