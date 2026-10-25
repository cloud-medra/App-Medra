// Maestros → Instituciones (colección maestros_instituciones): funciones
// puras que comparten la pantalla del maestro, el contexto global
// (context/InstitucionContext.jsx) y el selector del header.
//
// Documento: { nombre, rut, direccion, ciudad, telefono, email, activa,
// predeterminada, creadoEl/Por/PorUid, actualizadoEl/Por/PorUid }. Los
// largos máximos son los mismos que valida firestore.rules
// (institucionValida): si cambian aquí, cambiarlos también allá.

export const RUTA_INSTITUCIONES = '/maestros/institucionesMaestros';
export const COLECCION_INSTITUCIONES = 'maestros_instituciones';

export const LARGO_MAXIMO = Object.freeze({
  nombre: 120, rut: 20, direccion: 200, ciudad: 80, telefono: 30, email: 120,
});
const CAMPOS_TEXTO = Object.keys(LARGO_MAXIMO);

export const FORM_VACIO = Object.freeze({
  nombre: '', rut: '', direccion: '', ciudad: '', telefono: '', email: '', activa: true, predeterminada: false,
});

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const comparable = (texto) => String(texto ?? '').trim().toLocaleLowerCase('es');

// Formulario -> datos a guardar: textos sin espacios en los extremos y
// booleanos. Una institución inactiva no puede ser la predeterminada.
export const normalizarInstitucion = (form) => {
  const datos = Object.fromEntries(CAMPOS_TEXTO.map((c) => [c, String(form?.[c] ?? '').trim()]));
  const activa = form?.activa !== false;
  return { ...datos, activa, predeterminada: activa && form?.predeterminada === true };
};

// Mensaje de error, o null si los datos (ya normalizados) se pueden guardar.
// `existentes`: las demás instituciones, para no repetir el nombre.
export const validarInstitucion = (datos, existentes = [], idEditando = null) => {
  if (!datos.nombre) return 'El nombre es obligatorio';
  const largo = CAMPOS_TEXTO.find((c) => datos[c].length > LARGO_MAXIMO[c]);
  if (largo) return `El campo ${largo} admite hasta ${LARGO_MAXIMO[largo]} caracteres`;
  if (datos.email && !EMAIL.test(datos.email)) return 'El email no es válido';
  const repetida = existentes.some((i) => i.id !== idEditando && comparable(i.nombre) === comparable(datos.nombre));
  if (repetida) return 'Ya existe una institución con ese nombre';
  return null;
};

// Al marcar `id` como predeterminada: las demás que hoy lo son y hay que
// desmarcar en el mismo writeBatch (solo puede haber una).
export const idsADesmarcar = (instituciones, id) =>
  instituciones.filter((i) => i.id !== id && i.predeterminada === true).map((i) => i.id);

// Activas, por nombre (las que ofrece el selector).
export const institucionesActivas = (instituciones) => instituciones
  .filter((i) => i.activa !== false)
  .sort((a, b) => comparable(a.nombre).localeCompare(comparable(b.nombre), 'es'));

// Institución vigente del selector: la elegida por el usuario si sigue
// activa; si no, la predeterminada; si no, la primera activa; null sin
// instituciones activas.
export const elegirInstitucion = (instituciones, idGuardado) => {
  const activas = institucionesActivas(instituciones);
  return activas.find((i) => i.id === idGuardado)
    ?? activas.find((i) => i.predeterminada === true)
    ?? activas[0]
    ?? null;
};

// Clave de localStorage de la elección (por usuario).
export const claveSeleccion = (uid) => `medra.institucion.${uid}`;
