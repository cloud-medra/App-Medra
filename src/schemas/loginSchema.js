import * as z from 'zod';

// identificador: correo o nombre de usuario (la función iniciarSesion decide
// cuál es según tenga "@").
export const loginSchema = z.object({
  identificador: z.string().trim().min(1, "Ingresa tu usuario o correo"),
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres"),
});
