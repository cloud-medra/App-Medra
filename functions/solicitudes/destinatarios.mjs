// Quién aprueba (y recibe la alerta de) la solicitud de un usuario. Cálculo
// puro sobre la lista de usuarios: lo usan la función crearSolicitud y la
// pantalla (Lista de usuarios marca a quién reasignar; Editar usuario ofrece
// los administradores del centro).
//
// Operador / Encargado de centro:
//   - con centro: sus administradores asignados (administradoresAsignados,
//     solo los que siguen siendo administradores activos de ese centro) o,
//     si no tiene, si marcó "todos" o ninguno sigue válido, todos los
//     administradores activos de su centro (centrosAdministrados).
//   - sin centro (anterior a que fuera obligatorio): todos los
//     administradores activos.
// Administrador / Desarrollador: solo los desarrolladores.
// Siempre, además, todos los desarrolladores activos. Nunca el propio
// solicitante. El rol Encargado no es administrador asignable.

const activo = (u) => u && u.activo !== false;
const idDe = (u) => u.uid ?? u.id;

export const esAdministradorDelCentro = (u, centroId) => activo(u) && u.rol === 'admin'
  && Boolean(centroId) && (u.centrosAdministrados || []).includes(centroId);

export const administradoresDelCentro = (usuarios, centroId) => usuarios.filter((u) => esAdministradorDelCentro(u, centroId));

const ROLES_CON_ADMINISTRADOR = ['operador', 'encargado'];
const rolDe = (u) => u?.rol || 'operador';
export const usaAdministradores = (u) => ROLES_CON_ADMINISTRADOR.includes(rolDe(u));

// { aprobadores: [uid], motivo: 'asignados' | 'centro' | 'sinCentro' | 'desarrolladores' }
export const resolverAprobadores = (solicitante, usuarios) => {
  const devs = usuarios.filter((u) => activo(u) && u.rol === 'dev');
  let admins = [];
  let motivo = 'desarrolladores';
  if (usaAdministradores(solicitante)) {
    const centro = solicitante.centroCostoId || null;
    if (!centro) {
      admins = usuarios.filter((u) => activo(u) && u.rol === 'admin');
      motivo = 'sinCentro';
    } else {
      const delCentro = administradoresDelCentro(usuarios, centro);
      const asignados = solicitante.todosLosAdministradoresDelCentro ? [] : (solicitante.administradoresAsignados || []);
      const validos = delCentro.filter((a) => asignados.includes(idDe(a)));
      admins = validos.length ? validos : delCentro;
      motivo = validos.length ? 'asignados' : 'centro';
    }
  }
  const yo = idDe(solicitante);
  const aprobadores = [...new Set([...admins, ...devs].map(idDe))].filter((uid) => uid !== yo);
  return { aprobadores, motivo };
};

// Por qué hay que reasignar a un operador (null si está bien). Se calcula al
// mostrar Lista de usuarios; no se guarda.
export const motivoReasignar = (u, usuarios) => {
  if (rolDe(u) !== 'operador' || !activo(u)) return null;
  if (!u.centroCostoId) return 'Sin centro de costo: sus solicitudes van a todos los administradores.';
  const delCentro = administradoresDelCentro(usuarios, u.centroCostoId);
  if (!delCentro.length) return 'Su centro no tiene administradores activos: sus solicitudes van solo a los desarrolladores.';
  const asignados = u.todosLosAdministradoresDelCentro ? [] : (u.administradoresAsignados || []);
  const invalidos = asignados.filter((uid) => !delCentro.some((a) => idDe(a) === uid));
  if (invalidos.length) return 'Tiene administradores asignados que ya no administran su centro o están inactivos.';
  return null;
};
