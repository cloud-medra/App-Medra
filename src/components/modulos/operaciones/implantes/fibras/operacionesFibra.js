// Aplica las operaciones de fibra (registrar, anular o actualizar un uso)
// dentro de una transacción de Firestore. Recibe la transacción y las
// referencias inyectadas (ver fibrasTransacciones.js) para poder probarla sin
// Firestore: con una transacción simulada (fibras.test.js) se prueba el
// conteo, la reversión y el caso de dos personas usando la misma fibra.
//
// Concurrencia: todo se calcula sobre lo leído en ESTA transacción. Si otra
// escribe la misma fibra antes del commit, Firestore reintenta la función con
// los datos nuevos; ahí la fibra ya puede estar agotada y se lanza ErrorFibra
// sin escribir nada. Las reglas validan además que el contador nunca pase del
// total ni repita un número (firestore.rules, implantes_fibras).
//
// Operaciones:
//   { tipo: 'registrar', fibraId, usoId, item?, datosGestion?, perdida?: { motivo, fecha } }
//   { tipo: 'anular', fibraId, usoId, motivo, detalle?, soloPerdida? }
//   { tipo: 'actualizar', fibraId, usoId, datosGestion }

import {
  ErrorFibra, ESTADO_USO, TIPO_USO, MOTIVO_ANULACION,
  motivoNoUsable, motivoNoPerdible, siguienteNumeroUso, fibraConAlta, fibraConBaja, fibraConFecha,
  usosRestantes, validarUnCambioPorFibra, etiquetaFibra,
} from './fibrasNucleo';

/**
 * refs: { fibra(id), uso(fibraId, usoId), log(fibraId) } -> referencias.
 * ahora: valor de marca de tiempo (serverTimestamp() en producción).
 * usuario: { uid, nombre }.
 * Devuelve [{ tipo, fibraId, codigoInterno, lote, numeroUso, usosTotales, restantes, perdida }]
 * con cada uso o pérdida registrado (para los avisos).
 */
export const aplicarOperacionesFibra = async (t, operaciones, { refs, ahora, usuario }) => {
  if (operaciones.length === 0) return [];
  const error = validarUnCambioPorFibra(operaciones);
  if (error) throw new ErrorFibra(error);

  // 1) Todas las lecturas primero (regla de las transacciones).
  const ids = [...new Set(operaciones.map((op) => op.fibraId))];
  const snapsFibra = await Promise.all(ids.map((id) => t.get(refs.fibra(id))));
  const fibras = new Map(snapsFibra.map((s, i) => [ids[i], s.exists() ? { id: ids[i], ...s.data() } : null]));
  const conUso = operaciones.filter((op) => op.tipo !== 'registrar');
  const snapsUso = await Promise.all(conUso.map((op) => t.get(refs.uso(op.fibraId, op.usoId))));
  const usos = new Map(snapsUso.map((s, i) => [conUso[i].usoId, s.exists() ? s.data() : null]));

  // 2) Validar, calcular y escribir.
  const resultados = [];
  for (const op of operaciones) {
    const fibra = fibras.get(op.fibraId);
    const refFibra = refs.fibra(op.fibraId);
    const refUso = refs.uso(op.fibraId, op.usoId);

    if (op.tipo === 'registrar') {
      const perdida = Boolean(op.perdida);
      const motivo = perdida ? motivoNoPerdible(fibra) : motivoNoUsable(fibra, op.datosGestion?.fecha);
      if (motivo) throw new ErrorFibra(motivo);
      const numeroUso = siguienteNumeroUso(fibra);
      const fecha = perdida ? op.perdida.fecha : op.datosGestion.fecha;
      const cambios = fibraConAlta(fibra, numeroUso, op.usoId, fecha);
      t.update(refFibra, { ...cambios, actualizadoEl: ahora });
      t.set(refUso, {
        tipo: perdida ? TIPO_USO.PERDIDA : TIPO_USO.USO,
        estado: ESTADO_USO.VIGENTE,
        numeroUso,
        usosTotales: fibra.usosTotales,
        fibraId: op.fibraId,
        registradoEl: ahora,
        registradoPor: usuario,
        ...(perdida
          ? { fecha: op.perdida.fecha, motivo: op.perdida.motivo }
          : { ...op.datosGestion, itemId: op.item?.id || '' }),
      });
      if (perdida) {
        t.set(refs.log(op.fibraId), { accion: 'PERDIDA_REGISTRADA', detalles: { usoId: op.usoId, numeroUso, motivo: op.perdida.motivo }, usuario: usuario.nombre, uid: usuario.uid, timestamp: ahora });
      }
      // La línea de la gestión (copia, ver prepararFibrasNuevas) guarda el
      // mismo número que el uso: es la etiqueta "FIB-0007 · 2/5".
      if (op.item) {
        op.item.fibra.numeroUso = numeroUso;
        op.item.fibra.usosTotales = fibra.usosTotales;
      }
      const fibraDespues = { ...fibra, ...cambios };
      // Si la misma fibra vuelve a aparecer (no debería: validarUnCambioPorFibra).
      fibras.set(op.fibraId, fibraDespues);
      resultados.push({
        tipo: perdida ? TIPO_USO.PERDIDA : TIPO_USO.USO,
        fibraId: op.fibraId,
        codigoInterno: fibra.codigoInterno,
        lote: fibra.lote,
        numeroUso,
        usosTotales: fibra.usosTotales,
        restantes: usosRestantes(fibraDespues),
      });
      continue;
    }

    const uso = usos.get(op.usoId);
    if (op.tipo === 'anular') {
      if (op.soloPerdida && uso?.tipo !== TIPO_USO.PERDIDA) throw new ErrorFibra('Solo se pueden anular pérdidas desde aquí.');
      // Ya anulado (o inexistente): nada que revertir. Así anular es idempotente.
      if (!uso || uso.estado !== ESTADO_USO.VIGENTE || !fibra) continue;
      const cambios = fibraConBaja(fibra, uso.numeroUso, op.usoId);
      t.update(refFibra, { ...cambios, actualizadoEl: ahora });
      t.update(refUso, {
        estado: ESTADO_USO.ANULADO,
        anuladoEl: ahora,
        anuladoPor: usuario,
        motivoAnulacion: op.motivo,
        ...(op.detalle ? { detalleAnulacion: op.detalle } : {}),
      });
      if (op.motivo === MOTIVO_ANULACION.PERDIDA_ANULADA) {
        t.set(refs.log(op.fibraId), { accion: 'PERDIDA_ANULADA', detalles: { usoId: op.usoId, numeroUso: uso.numeroUso, motivo: op.detalle || '' }, usuario: usuario.nombre, uid: usuario.uid, timestamp: ahora });
      }
      fibras.set(op.fibraId, { ...fibra, ...cambios });
      continue;
    }

    if (op.tipo === 'actualizar') {
      if (!uso || uso.estado !== ESTADO_USO.VIGENTE || !fibra) continue;
      const { fecha } = op.datosGestion;
      if (fecha !== uso.fecha && fibra.vencimiento < fecha) {
        throw new ErrorFibra(`La fibra ${etiquetaFibra(fibra)} vence el ${fibra.vencimiento}, antes de la nueva fecha de cirugía (${fecha}).`);
      }
      const cambios = Object.fromEntries(Object.entries(op.datosGestion).filter(([k, v]) => uso[k] !== v));
      if (Object.keys(cambios).length > 0) t.update(refUso, { ...cambios, actualizadoEl: ahora });
      // Nueva fecha de cirugía: también la fecha del uso en la fibra (fechasUso).
      if (fecha !== uso.fecha) {
        const cambiosFibra = fibraConFecha(fibra, uso.numeroUso, op.usoId, fecha);
        t.update(refFibra, { ...cambiosFibra, actualizadoEl: ahora });
        fibras.set(op.fibraId, { ...fibra, ...cambiosFibra });
      }
    }
  }
  return resultados;
};
