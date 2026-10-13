// Roles de usuario (Crear Usuario, Editar usuario, Listado Usuario y
// Permisos por centro). La lista vive en functions/permisos/nucleo.mjs
// (la comparten las Cloud Functions). Desarrollador: acceso total.
// Administrador: sin plantilla de centro (solo sus permisos propios) y puede
// administrar usuarios si tiene el ítem. Encargado y operador reciben la
// plantilla de su centro + rol.
import { ROLES as LISTA, ROLES_CON_PLANTILLA, esRolAccesoTotal, esRolSinPlantilla, labelRol } from '../../../../../functions/permisos/nucleo.mjs';

export const ROLES = LISTA.map(({ value, label }) => ({ value, label }));
export { ROLES_CON_PLANTILLA, esRolAccesoTotal, esRolSinPlantilla, labelRol };

// Roles que `quien` puede asignar: el Desarrollador, todos; el resto, todos
// menos Desarrollador (salvo que ya sea el rol actual, para mostrarlo).
export const rolesAsignables = (quien, actual) => ROLES.filter((r) => quien?.rol === 'dev' || r.value !== 'dev' || r.value === actual);
