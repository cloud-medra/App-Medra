// Lado (Bodymap) de una gestión de Implantes: es de la ADMISIÓN. Se elige en
// la pestaña Información del detalle o en el formulario de registro, y en
// ambos casos se aplica a todas las gestiones (empresa/fecha) de la admisión.
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
