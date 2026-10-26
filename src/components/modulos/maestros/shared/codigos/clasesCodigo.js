// Valores posibles del campo "clase" de maestros_codigos. Fuente única para los
// select de Clase (panel de edición y filtros de Códigos).
export const CLASES_CODIGO = ['IMPLANTE', 'INSUMOS', 'PAD', 'KIT'];

// Colores del badge de clase (PadMaestros). IMPLANTE/IMPLANTES en morado,
// KIT en ámbar y el resto (INSUMOS, vacías, etc.) en azul como hasta ahora.
const BADGE_CLASE = {
  IMPLANTE: 'bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300',
  IMPLANTES: 'bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300',
  KIT: 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300'
};
const BADGE_CLASE_DEFECTO = 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300';

export const claseBadgeCodigo = (clase) => BADGE_CLASE[clase] || BADGE_CLASE_DEFECTO;
