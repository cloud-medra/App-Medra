// Lado (Bodymap) de una gestión de Implantes: es de la ADMISIÓN. Se elige en
// la pestaña Información del detalle o en el formulario de registro, y en
// ambos casos se aplica a todas las gestiones (empresa/fecha) de la admisión.
// Una gestión nueva registrada con "No especificado" hereda el lado de la
// admisión (planLadoAlGuardar).
//
// - ladoAGuardar: criterio común de los dos guardados. Solo se escribe si
//   cambió respecto del guardado (sin campo = "No especificado"), así un
//   guardado que no lo toca no escribe en gestiones ajenas.
// - valoresAdmision / unirGestionesDeAdmision: la búsqueda de las gestiones
//   de una admisión (la usa el listener del detalle y la propagación desde el
//   formulario). gestionId/agendaId pueden estar guardados como texto o
//   número, y el collectionGroup "detalles" también trae Hemodinamia y
//   Consignación: se filtran por ruta.
import { LADO_POR_DEFECTO } from '../../../../../../../functions/bodymap/nucleo.mjs';

export const ladoAGuardar = (ladoNuevo, ladoGuardado) => (
  ladoNuevo && ladoNuevo !== (ladoGuardado || LADO_POR_DEFECTO) ? { lado: ladoNuevo } : {}
);

export const CAMPOS_ADMISION = ['gestionId', 'agendaId'];

export const valoresAdmision = (admision) => {
  const texto = String(admision ?? '').trim();
  return Number.isFinite(Number(texto)) && texto !== '' ? [texto, Number(texto)] : [texto];
};

// docsPorCampo: listas de documentos (DocumentSnapshot o { ref: { path } }).
// Devuelve los de implantes_gestiones sin repetir (por ruta).
export const unirGestionesDeAdmision = (...docsPorCampo) => {
  const unicos = new Map();
  docsPorCampo.flat()
    .filter(d => d.ref.path.startsWith('implantes_gestiones/'))
    .forEach(d => unicos.set(d.ref.path, d));
  return [...unicos.values()];
};

// Gestiones de la admisión a las que hay que escribir el lado nuevo: las
// otras (no `rutaGuardada`, ya escrita) que tengan otro lado.
export const gestionesParaPropagarLado = (docs, lado, rutaGuardada) => docs.filter(d => (
  d.ref.path !== rutaGuardada && (d.data().lado || LADO_POR_DEFECTO) !== lado
));

// Lado que ya tiene la admisión: el único especificado entre sus gestiones.
// Sin ninguno, o con más de uno distinto (datos inconsistentes), null: no se
// adivina.
export const ladoDeAdmision = (docs) => {
  const lados = new Set(docs.map(d => d.data().lado).filter(l => l && l !== LADO_POR_DEFECTO));
  return lados.size === 1 ? [...lados][0] : null;
};

// Hace falta leer las gestiones de la admisión al guardar desde el
// formulario: si el lado cambió (para propagarlo) o si la gestión es nueva
// (para heredar el de la admisión). Sin admisión real, nunca.
export const debeLeerAdmisionParaLado = ({ ladoFormulario, ladoGuardado, esNueva, admision }) => (
  admision !== 'SIN_ADMISION' && (esNueva || Boolean(ladoAGuardar(ladoFormulario, ladoGuardado).lado))
);

// Qué hacer con el Lado al guardar desde el formulario de registro.
//   gestionesAdmision: gestiones de la admisión leídas ANTES de escribir
//   (null si no se leyeron o falló la lectura). rutaGuardada: la de esta
//   gestión al editar (una nueva todavía no existe y no está en la lista).
// → { campoLado: {} | { lado }, heredado, propagarA: [docs] }
//   - Lado cambiado: va en esta gestión y en las demás con otro lado.
//   - Gestión nueva sin lado ("No especificado"): HEREDA el de la admisión y
//     NUNCA propaga, así no pisa el lado que ya tienen las otras.
//   - Sin cambio al editar: nada.
export const planLadoAlGuardar = ({ ladoFormulario, ladoGuardado, esNueva, gestionesAdmision, rutaGuardada }) => {
  const cambio = ladoAGuardar(ladoFormulario, ladoGuardado);
  if (cambio.lado) {
    return { campoLado: cambio, heredado: false, propagarA: gestionesAdmision ? gestionesParaPropagarLado(gestionesAdmision, cambio.lado, rutaGuardada) : [] };
  }
  const heredado = esNueva && gestionesAdmision ? ladoDeAdmision(gestionesAdmision) : null;
  return { campoLado: heredado ? { lado: heredado } : {}, heredado: Boolean(heredado), propagarA: [] };
};
