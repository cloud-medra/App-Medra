// Aplica las operaciones de fibra (registrar, anular o actualizar un uso, y
// los cambios de ubicación) dentro de una transacción de Firestore. Recibe la
// transacción y las referencias inyectadas (ver fibrasTransacciones.js) para
// poder probarla sin Firestore: con una transacción simulada (fibras.test.js)
// se prueba el conteo, la reversión, la ubicación y el caso de dos personas
// usando la misma fibra.
//
// Concurrencia: todo se calcula sobre lo leído en ESTA transacción. Si otra
// escribe la misma fibra (o el control "en uso" de su referencia) antes del
// commit, Firestore reintenta la función con los datos nuevos; ahí la fibra ya
// puede estar agotada (o en uso otra) y se lanza ErrorFibra sin escribir nada.
// Las reglas validan además el contador y que haya una sola fibra EN USO por
// referencia (firestore.rules, implantes_fibras).
//
// Operaciones:
//   { tipo: 'registrar', fibraId, usoId, item?, datosGestion?, perdida?: { motivo, fecha },
//     ponerEnUso?, devolver? }
//   { tipo: 'anular', fibraId, usoId, motivo, detalle?, soloPerdida? }
//   { tipo: 'actualizar', fibraId, usoId, datosGestion }

import {
  ErrorFibra, ESTADO_USO, TIPO_USO, MOTIVO_ANULACION, UBICACION,
  motivoNoUsable, motivoNoPerdible, motivoNoPonerEnUso, siguienteNumeroUso, fibraConAlta, fibraConBaja, fibraConFecha,
  usosRestantes, validarUnCambioPorFibra, validarLecturasReglas, etiquetaFibra, ubicacionDe, idControlEnUso, normalizarReferencia,
} from './fibrasNucleo';

// --- Ubicación (compartido con fibrasTransacciones.js) ------------------------

const ACCION_LOG_UBICACION = {
  [UBICACION.EN_USO]: 'PUESTA_EN_USO',
  [UBICACION.EN_BODEGA]: 'DEVUELTA_A_BODEGA',
  [UBICACION.AGOTADA]: 'SALIDA_DE_USO',
};

// Campos de ubicación de la fibra si cambia ({} si no).
export const camposUbicacion = (antes, nueva, { ahora, usuario }) =>
  (antes === nueva ? {} : { ubicacion: nueva, ubicacionDesde: { fecha: ahora, por: usuario } });

// Log del cambio de ubicación (historial y Detalle de la fibra).
export const logUbicacion = (t, fibraId, de, a, motivo, { refs, ahora, usuario }) => {
  if (de === a) return;
  t.set(refs.log(fibraId), {
    accion: ACCION_LOG_UBICACION[a],
    detalles: { de, a, ...(motivo ? { motivo } : {}) },
    usuario: usuario.nombre,
    uid: usuario.uid,
    timestamp: ahora,
  });
};

// Control "en uso" de la referencia: qué fibra está EN USO (o null) y cuál
// provocó el cambio (\`origen\`, lo exigen las reglas).
export const escribirControlEnUso = (t, referencia, fibraId, origen, { refs, ahora }) => {
  t.set(refs.control(idControlEnUso(referencia)), {
    referencia: normalizarReferencia(referencia),
    fibraId,
    origen,
    actualizadoEl: ahora,
  });
};

/**
 * refs: { fibra(id), uso(fibraId, usoId), log(fibraId), control(id) } -> referencias.
 * ahora: valor de marca de tiempo (serverTimestamp() en producción).
 * usuario: { uid, nombre }. hoy: 'AAAA-MM-DD' en Chile.
 * Devuelve [{ tipo, fibraId, referencia, codigoInterno, lote, numeroUso, usosTotales, restantes, puestaEnUso, devuelta }]
 * con cada uso o pérdida registrado (para los avisos).
 */
export const aplicarOperacionesFibra = async (t, operaciones, ctx) => {
  const { refs, ahora, usuario, hoy } = ctx;
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

  // Fibras elegidas de bodega en Cargas: quién está hoy EN USO en su
  // referencia (control) y esa fibra, que vuelve a bodega.
  const enUsoPorOp = new Map();
  for (const op of operaciones) {
    const fibra = fibras.get(op.fibraId);
    if (op.tipo !== 'registrar' || !op.ponerEnUso || !fibra || ubicacionDe(fibra) === UBICACION.EN_USO) continue;
    const snapControl = await t.get(refs.control(idControlEnUso(fibra.referencia)));
    const titularId = snapControl.exists() ? snapControl.data().fibraId || null : null;
    if (titularId && titularId !== op.fibraId && titularId !== op.devolver) {
      throw new ErrorFibra(`Mientras editabas se puso en uso otra fibra de ${fibra.referencia} (${titularId}). Vuelve a elegir la fibra.`);
    }
    if (titularId && fibras.has(titularId)) {
      throw new ErrorFibra(`La fibra ${titularId} aparece en este guardado y además volvería a bodega: guarda en partes.`);
    }
    const snapTitular = titularId ? await t.get(refs.fibra(titularId)) : null;
    enUsoPorOp.set(op, snapTitular?.exists() ? { id: titularId, ...snapTitular.data() } : null);
  }

  // Con lo leído ya se sabe qué altas cambian la ubicación (eligen una de
  // bodega o agotan la fibra en uso): se vuelve a validar el tope de lecturas
  // de las reglas, ahora exacto.
  const lecturas = validarLecturasReglas(operaciones.map((op) => {
    const f = fibras.get(op.fibraId);
    const agotaLaEnUso = op.tipo === 'registrar' && f && ubicacionDe(f) === UBICACION.EN_USO && usosRestantes(f) === 1;
    return { ...op, cambiaUbicacion: enUsoPorOp.has(op) || Boolean(agotaLaEnUso) };
  }));
  if (lecturas) throw new ErrorFibra(lecturas);

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
      const ponerEnUso = enUsoPorOp.has(op);
      if (ponerEnUso) {
        const noSePuede = motivoNoPonerEnUso(fibra, hoy);
        if (noSePuede) throw new ErrorFibra(noSePuede);
      }
      const numeroUso = siguienteNumeroUso(fibra);
      const fecha = perdida ? op.perdida.fecha : op.datosGestion.fecha;
      const ubicacionAntes = ubicacionDe(fibra);
      const cambios = fibraConAlta(fibra, numeroUso, op.usoId, fecha, ponerEnUso ? UBICACION.EN_USO : ubicacionAntes);
      t.update(refFibra, { ...cambios, ...camposUbicacion(ubicacionAntes, cambios.ubicacion, ctx), actualizadoEl: ahora });
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
      logUbicacion(t, op.fibraId, ubicacionAntes, cambios.ubicacion,
        cambios.ubicacion === UBICACION.AGOTADA ? 'Último uso' : 'Elegida en una gestión', ctx);

      // Control "en uso": la elegida de bodega pasa a EN USO (y la anterior
      // vuelve a bodega); una EN USO que se agota deja la referencia sin fibra en uso.
      let devuelta = null;
      if (ponerEnUso) {
        const titular = enUsoPorOp.get(op);
        if (titular) {
          t.update(refs.fibra(titular.id), { ...camposUbicacion(UBICACION.EN_USO, UBICACION.EN_BODEGA, ctx), actualizadoEl: ahora });
          logUbicacion(t, titular.id, UBICACION.EN_USO, UBICACION.EN_BODEGA, `Se puso en uso ${fibra.codigoInterno} en una gestión`, ctx);
          devuelta = titular.codigoInterno || titular.id;
        }
        escribirControlEnUso(t, fibra.referencia, cambios.ubicacion === UBICACION.EN_USO ? op.fibraId : null, op.fibraId, ctx);
      } else if (ubicacionAntes === UBICACION.EN_USO && cambios.ubicacion === UBICACION.AGOTADA) {
        escribirControlEnUso(t, fibra.referencia, null, op.fibraId, ctx);
      }

      // La línea de la gestión (copia, ver prepararFibrasNuevas) guarda el
      // mismo número que el uso: es la etiqueta "FIB-0007 · 2/5". Las marcas
      // de "poner en uso" no se guardan en la gestión.
      if (op.item) {
        op.item.fibra.numeroUso = numeroUso;
        op.item.fibra.usosTotales = fibra.usosTotales;
        delete op.item.fibra.ponerEnUso;
        delete op.item.fibra.devolver;
      }
      const fibraDespues = { ...fibra, ...cambios };
      fibras.set(op.fibraId, fibraDespues);
      resultados.push({
        tipo: perdida ? TIPO_USO.PERDIDA : TIPO_USO.USO,
        fibraId: op.fibraId,
        referencia: fibra.referencia,
        codigoInterno: fibra.codigoInterno,
        lote: fibra.lote,
        numeroUso,
        usosTotales: fibra.usosTotales,
        restantes: usosRestantes(fibraDespues),
        puestaEnUso: ponerEnUso && cambios.ubicacion === UBICACION.EN_USO,
        devuelta,
      });
      continue;
    }

    const uso = usos.get(op.usoId);
    if (op.tipo === 'anular') {
      if (op.soloPerdida && uso?.tipo !== TIPO_USO.PERDIDA) throw new ErrorFibra('Solo se pueden anular pérdidas desde aquí.');
      // Ya anulado (o inexistente): nada que revertir. Así anular es idempotente.
      if (!uso || uso.estado !== ESTADO_USO.VIGENTE || !fibra) continue;
      const cambios = fibraConBaja(fibra, uso.numeroUso, op.usoId);
      const ubicacionAntes = ubicacionDe(fibra);
      t.update(refFibra, { ...cambios, ...camposUbicacion(ubicacionAntes, cambios.ubicacion, ctx), actualizadoEl: ahora });
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
      // Una agotada que recupera un uso queda EN BODEGA.
      logUbicacion(t, op.fibraId, ubicacionAntes, cambios.ubicacion, 'Se anuló un uso: vuelve a tener usos', ctx);
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

/**
 * Pantalla Fibras: pone en uso \`fibraId\` (la que estaba en uso en su
 * referencia vuelve a bodega) o la devuelve a bodega. Devuelve
 * { devuelta: código de la que volvió a bodega | null }.
 */
export const cambiarUbicacionFibra = async (t, fibraId, nueva, ctx) => {
  const { refs, ahora, hoy } = ctx;
  const snap = await t.get(refs.fibra(fibraId));
  if (!snap.exists()) throw new ErrorFibra('La fibra ya no existe.');
  const fibra = { id: fibraId, ...snap.data() };
  const actual = ubicacionDe(fibra);

  if (nueva === UBICACION.EN_BODEGA) {
    if (actual !== UBICACION.EN_USO) throw new ErrorFibra(`La fibra ${etiquetaFibra(fibra)} no está en uso.`);
    t.update(refs.fibra(fibraId), { ...camposUbicacion(actual, nueva, ctx), actualizadoEl: ahora });
    logUbicacion(t, fibraId, actual, nueva, '', ctx);
    escribirControlEnUso(t, fibra.referencia, null, fibraId, ctx);
    return { devuelta: null };
  }

  const noSePuede = motivoNoPonerEnUso(fibra, hoy);
  if (noSePuede) throw new ErrorFibra(noSePuede);
  const snapControl = await t.get(refs.control(idControlEnUso(fibra.referencia)));
  const titularId = snapControl.exists() ? snapControl.data().fibraId || null : null;
  const snapTitular = titularId && titularId !== fibraId ? await t.get(refs.fibra(titularId)) : null;
  t.update(refs.fibra(fibraId), { ...camposUbicacion(actual, UBICACION.EN_USO, ctx), actualizadoEl: ahora });
  logUbicacion(t, fibraId, actual, UBICACION.EN_USO, '', ctx);
  let devuelta = null;
  if (snapTitular?.exists()) {
    t.update(refs.fibra(titularId), { ...camposUbicacion(UBICACION.EN_USO, UBICACION.EN_BODEGA, ctx), actualizadoEl: ahora });
    logUbicacion(t, titularId, UBICACION.EN_USO, UBICACION.EN_BODEGA, `Se puso en uso ${fibra.codigoInterno}`, ctx);
    devuelta = snapTitular.data().codigoInterno || titularId;
  }
  escribirControlEnUso(t, fibra.referencia, fibraId, fibraId, ctx);
  return { devuelta };
};
