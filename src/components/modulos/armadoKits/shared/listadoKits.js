// Listado de kits (PantallaKits): textos del filtro de estado y avisos de
// cada kit. Lógica pura.
import {
  ETIQUETAS_ESTADO_KIT, ORDEN_ESTADOS_KIT, tieneReposicionPendiente, consumoKit,
} from '../../../../../functions/armadoKits/nucleo.mjs';

// Texto del botón del filtro de estado.
export const textoFiltroEstado = (estados, pendiente) => {
  if (pendiente) return 'Con reposición pendiente';
  if (estados.length === ORDEN_ESTADOS_KIT.length) return 'Todos los estados';
  if (!estados.length) return 'Ningún estado';
  return ORDEN_ESTADOS_KIT.filter((e) => estados.includes(e)).map((e) => ETIQUETAS_ESTADO_KIT[e]).join(', ');
};

// Avisos de un kit en el listado: sin vencimiento, reposición pendiente y el
// vínculo de rearmado (solo referencia, no mueve nada).
export const avisosKit = (k) => [
  ...(k.lineasSinVencimiento > 0 ? [{ color: 'ambar', texto: `Con insumos sin vencimiento (${k.lineasSinVencimiento})` }] : []),
  ...(tieneReposicionPendiente(k) ? [{ color: 'ambar', texto: `Reposición pendiente: ${consumoKit(k.lineas).pendiente}` }] : []),
  ...(k.rearmadoEn ? [{ color: 'gris', texto: `Rearmado en ${k.rearmadoEn.codigo}` }] : []),
  ...(k.rearmadoDe ? [{ color: 'gris', texto: `Rearmado de ${k.rearmadoDe.codigo}` }] : []),
];
