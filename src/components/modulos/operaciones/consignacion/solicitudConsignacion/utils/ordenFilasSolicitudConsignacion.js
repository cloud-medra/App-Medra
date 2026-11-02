// Orden de las filas DENTRO de cada admisión en Solicitud de Consignación
// (la tabla y, por lo tanto, las dos hojas del Excel, que se arman con los
// seleccionados en el orden de la lista):
//   1. los códigos solos (ítems sin delivery);
//   2. cada código PAD (ítem con delivery) seguido de sus filas "No lleva OC"
//      (el desglose de la guía de ESE delivery; con un solo PAD por admisión,
//      como hoy, quedan al final).
// Dentro de cada grupo se respeta el orden que ya traía la lista (el de
// Cargas). El orden entre admisiones no cambia: se reordena cada tramo
// contiguo de filas de la misma admisión, sin juntar tramos separados.
// Las filas "No lleva OC" quedan siempre justo debajo de su PAD: de eso
// depende la previsión de la hoja Resumen (filasResumenSolicitudConsignacion).

const SIN_ADMISION = new Set(['', 'P', '-']);

// Delivery de una fila "No lleva OC": su id es `guia-${delivery}-${indice}`
// (construirCandidatosSolicitudConsignacion).
export const deliveryDeFilaGuia = (fila) => {
  const id = String(fila?.id || '');
  if (!fila?.esFilaGuia || !id.startsWith('guia-')) return null;
  return id.slice('guia-'.length, id.lastIndexOf('-'));
};

const ordenarTramo = (filas) => {
  const solos = filas.filter((f) => !f.esFilaGuia && !f.delivery);
  const pads = filas.filter((f) => !f.esFilaGuia && f.delivery);
  const guias = filas.filter((f) => f.esFilaGuia);
  const usadas = new Set();
  const conSusGuias = pads.flatMap((pad) => {
    const propias = guias.filter((g) => !usadas.has(g) && deliveryDeFilaGuia(g) === pad.delivery);
    propias.forEach((g) => usadas.add(g));
    return [pad, ...propias];
  });
  // Filas de guía sin su PAD en el tramo (no debería pasar): al final.
  return [...solos, ...conSusGuias, ...guias.filter((g) => !usadas.has(g))];
};

// Copia ordenada (no modifica `filas`).
export const ordenarFilasPorAdmision = (filas) => {
  const tramos = [];
  (filas || []).forEach((f) => {
    const adm = String(f.gestionId ?? '').trim();
    const ultimo = tramos[tramos.length - 1];
    // Filas sin admisión: cada una es su propio tramo (no se agrupan entre sí).
    if (ultimo && !SIN_ADMISION.has(adm) && ultimo.adm === adm) ultimo.filas.push(f);
    else tramos.push({ adm, filas: [f] });
  });
  return tramos.flatMap((t) => (SIN_ADMISION.has(t.adm) ? t.filas : ordenarTramo(t.filas)));
};
