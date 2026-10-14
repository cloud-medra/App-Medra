// Orquesta una importación de Detalles OC con mínimas lecturas:
//   1. ocImport/meta (1 lectura) → snapshot desde la caché local si la
//      versión coincide; si no, se descarga de Storage (0 lecturas).
//   2. Lectura del Excel + comparación contra el snapshot en un Web Worker
//      (planificarImportacion.js): nuevas, actualizadas (solo los campos que
//      cambiaron), sin cambios, y los casos especiales del resumen.
//   3. Escritura de lo nuevo/cambiado en writeBatch de hasta 450 operaciones.
//      Un lote que falla no detiene los demás; el snapshot guarda solo lo
//      confirmado, así reimportar el mismo archivo reintenta lo pendiente.
//   4. OC cambiadas → se liberan en las gestiones de Implantes afectadas.
//   5. Snapshot + índice de OC + ocImport/meta.
//   6. Resumen Mensual de facturación de los meses tocados (desde el
//      snapshot nuevo, 0 lecturas).
import { doc, writeBatch, setDoc } from 'firebase/firestore';
import { db } from '../../../../../../firebaseConfig';
import { normalizarProveedorId } from './normalizarProveedor';
import { entradaSnapshot } from './planificarImportacion';
import { analizarArchivoEnSegundoPlano } from './analizarArchivoDetallesOC';
import { obtenerSnapshotDetallesOC, guardarSnapshotDetallesOC, camposMetaSnapshot } from './snapshotStorageDetallesOC';
import { mezclarIndiceOC } from '../../../shared/ocIndex/indiceOC';
import { leerMetaOC, obtenerIndiceOC, publicarIndiceOC, agregarInvalidacionesPendientes } from '../../../shared/ocIndex/indiceOCRemoto';
import { invalidarOCGestiones } from '../../../shared/ocIndex/invalidarOCGestiones';
import { actualizarMeses } from '../../resumenFacturacion/resumenFacturacionService';

export { leerFilasDelExcel } from './leerFilasDelExcel';
export { SnapshotAntiguoError } from './snapshotStorageDetallesOC';

export const COL_BASE = 'documentos_sistema';
const MAX_OPS_BATCH = 450;

const CAMPOS_PAYLOAD = [
  'admision', 'paciente', 'medico', 'fecha_cx', 'proveedor', 'codigo', 'descripcion', 'cantidad', 'precio_u',
  'atributo', 'oc', 'oc_monto', 'estado', 'fecha_recepcion', 'fecha_cargo', 'numero_guia', 'numero_factura',
  'fecha_emision', 'fecha_ingreso', 'lote', 'fecha_vencimiento'
];

const construirPayloadDetalle = (fila) => ({
  ...CAMPOS_PAYLOAD.reduce((acc, c) => { acc[c] = fila[c] ?? null; return acc; }, {}),
  actualizadoEn: new Date()
});

// Valor normalizado del snapshot ('YYYY-MM-DD', número, texto) -> valor para
// Firestore (las fechas vuelven a Date).
const valorParaFirestore = (campo, v) => {
  if (!campo.startsWith('fecha_')) return v;
  const m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
};

const esVacioPayload = (v) => v === null || v === undefined || v === '' || v === 0;

const rutaDetalle = ({ anio, mes, admision, slug }) => ({
  anio: [COL_BASE, anio],
  mes: [COL_BASE, anio, 'meses', mes],
  admision: [COL_BASE, anio, 'meses', mes, 'admisiones', admision],
  empresa: [COL_BASE, anio, 'meses', mes, 'admisiones', admision, 'empresas', slug]
});

const partesRuta = (fechaISO, admision, proveedor) => ({
  anio: fechaISO.slice(0, 4), mes: fechaISO.slice(5, 7), admision: String(admision), slug: normalizarProveedorId(proveedor)
});

const fechaDeFila = (fila) => {
  const d = fila.fecha_cx;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const clavesRuta = ({ anio, mes, admision, slug }) => [anio, `${anio}/${mes}`, `${anio}/${mes}/${admision}`, `${anio}/${mes}/${admision}/${slug}`];
const NIVELES = ['anio', 'mes', 'admision', 'empresa'];

// Rutas (año, mes, admisión, empresa) que ya existen según el snapshot: sus
// documentos "marcador" no se vuelven a escribir.
const rutasConocidas = (snapshot) => {
  const set = new Set();
  Object.values(snapshot).forEach((e) => clavesRuta(partesRuta(e.f, e.a, e.p)).forEach(k => set.add(k)));
  return set;
};

// Operaciones de escritura del plan. Cada una sabe cuántas operaciones de
// batch usa, cómo agregarse al batch y cómo reflejarse en el snapshot.
const construirOperaciones = (plan, snapshotAnterior) => {
  const ops = [];
  const base = (id, fila) => ({ id, filaExcel: fila._filaExcel, ruta: partesRuta(fechaDeFila(fila), fila.admision, fila.proveedor), proveedor: fila.proveedor });

  plan.nuevas.forEach(({ id, fila, valores }) => ops.push({
    ...base(id, fila), tipo: 'nueva', extraOps: 0,
    escribir: (batch, ref) => batch.set(ref, construirPayloadDetalle(fila)),
    aplicar: (snap) => { snap[id] = entradaSnapshot(fila, valores); }
  }));

  plan.actualizadas.forEach(({ id, fila, cambios, combinados }) => ops.push({
    ...base(id, fila), tipo: 'actualizada', extraOps: 0,
    // merge con solo los campos que cambiaron (si el documento no
    // existiera, un update haría fallar el lote entero).
    escribir: (batch, ref) => batch.set(ref, { ...cambios, actualizadoEn: new Date() }, { merge: true }),
    aplicar: (snap) => { snap[id] = { ...snap[id], v: combinados }; }
  }));

  plan.fechasCambiadas.forEach(({ idAntes, idNuevo, fila, combinados }) => ops.push({
    ...base(idNuevo, fila), tipo: 'movida', idAntes, extraOps: 1,
    escribir: (batch, ref) => {
      // Valores del archivo; donde viene vacío se conserva lo guardado.
      const payload = construirPayloadDetalle(fila);
      Object.entries(combinados).forEach(([c, v]) => {
        if (esVacioPayload(payload[c]) && !esVacioPayload(v)) payload[c] = valorParaFirestore(c, v);
      });
      batch.set(ref, payload);
      const anterior = snapshotAnterior[idAntes];
      batch.delete(doc(db, ...rutaDetalle(partesRuta(anterior.f, anterior.a, anterior.p)).empresa, 'detalles', idAntes));
    },
    aplicar: (snap) => { delete snap[idAntes]; snap[idNuevo] = entradaSnapshot(fila, combinados); }
  }));
  return ops;
};

const sanearOcCambiada = (c) => ({
  admision: String(c.admision ?? ''), fecha: String(c.fecha ?? ''), proveedor: String(c.proveedor ?? ''),
  codigo: String(c.codigo ?? ''), ocAntes: String(c.ocAntes ?? ''), ocDespues: String(c.ocDespues ?? '')
});

export const procesarImportacionDetallesOC = async (file, { onProgreso, usuario } = {}) => {
  let lecturas = 0;
  let escrituras = 0;

  // 1) Versión vigente y snapshot (lanza SnapshotAntiguoError si hay que
  // reconstruirlo antes).
  onProgreso?.({ etapa: 'verificando' });
  const meta = await leerMetaOC();
  lecturas += 1;
  const snapshot = await obtenerSnapshotDetallesOC(meta);

  // 2) Lectura + comparación fuera de la pantalla.
  const { lectura, plan } = await analizarArchivoEnSegundoPlano(file, snapshot.filas, onProgreso);
  const { invalidas, tieneColumnaOC, encabezados, mapa, hoja, formato, primeraFila } = lectura;
  console.info(`[Importar Detalles OC] Formato: ${formato} · hoja "${hoja}". Columnas reconocidas:`, mapa, '· Encabezados:', encabezados);
  console.table(primeraFila);

  // 3) Escrituras por lotes.
  const ops = construirOperaciones(plan, snapshot.filas);
  const conocidas = rutasConocidas(snapshot.filas);
  const nuevoSnapshot = { ...snapshot.filas };
  const errores = [...invalidas];
  const confirmadas = { nueva: 0, actualizada: 0, movida: 0 };
  const idsConfirmados = new Set();
  const mesesTocados = new Set(); // 'YYYY-MM' de lo confirmado (incluye el mes de origen de las movidas)
  let pendientes = 0;
  let procesadas = 0;
  onProgreso?.({ etapa: 'escribiendo', actual: 0, total: ops.length });

  let i = 0;
  while (i < ops.length) {
    const batch = writeBatch(db);
    const lote = [];
    const marcadoresDelLote = [];
    let usadas = 0;
    while (i < ops.length) {
      const op = ops[i];
      const claves = clavesRuta(op.ruta);
      const faltan = claves.filter(k => !conocidas.has(k));
      const necesita = 1 + op.extraOps + faltan.length;
      if (usadas + necesita > MAX_OPS_BATCH && lote.length > 0) break;
      const rutas = rutaDetalle(op.ruta);
      faltan.forEach((k) => {
        const nivel = NIVELES[claves.indexOf(k)];
        batch.set(doc(db, ...rutas[nivel]), nivel === 'empresa' ? { nombreOriginal: op.proveedor, active: true } : { active: true }, { merge: true });
        conocidas.add(k);
        marcadoresDelLote.push(k);
      });
      op.escribir(batch, doc(db, ...rutas.empresa, 'detalles', op.id));
      lote.push(op);
      usadas += necesita;
      i++;
    }
    try {
      await batch.commit();
      escrituras += usadas;
      lote.forEach((op) => {
        op.aplicar(nuevoSnapshot); confirmadas[op.tipo]++; idsConfirmados.add(op.id);
        mesesTocados.add(`${op.ruta.anio}-${op.ruta.mes}`);
        if (op.idAntes) mesesTocados.add(String(snapshot.filas[op.idAntes]?.f || '').slice(0, 7));
      });
    } catch (err) {
      console.error('[Importar Detalles OC] Falló un lote de escritura:', err);
      pendientes += lote.length;
      // Sus marcadores no quedaron escritos: que un lote siguiente los repita.
      marcadoresDelLote.forEach(k => conocidas.delete(k));
      lote.forEach(op => errores.push({ id: op.id, filaExcel: op.filaExcel, error: `No se guardó (${err.code || err.message}). Vuelve a importar el archivo para reintentar.` }));
    }
    procesadas += lote.length;
    onProgreso?.({ etapa: 'escribiendo', actual: procesadas, total: ops.length });
  }

  // 4) OC cambiadas (solo de filas que quedaron guardadas).
  const ocCambiadas = plan.ocCambiadas.filter(c => idsConfirmados.has(c.id));
  let gestionesOC = null;
  if (ocCambiadas.length > 0) {
    onProgreso?.({ etapa: 'gestiones_oc' });
    gestionesOC = await invalidarOCGestiones(ocCambiadas, { usuario });
    lecturas += gestionesOC.lecturas;
    escrituras += gestionesOC.escrituras;
    if (gestionesOC.error) {
      try {
        await agregarInvalidacionesPendientes(ocCambiadas.map(sanearOcCambiada), gestionesOC.modulosConError?.length ? gestionesOC.modulosConError : undefined);
        escrituras += 1;
        gestionesOC.pendientesEnSincronizar = true;
      } catch (err) {
        console.error('No se pudieron guardar las OC cambiadas pendientes:', err);
      }
    }
  }

  // 5) Snapshot, índice de OC y meta. Si no se guardó ninguna fila, no se
  // sube el snapshot ni se escribe el meta.
  const huboCambios = confirmadas.nueva + confirmadas.actualizada + confirmadas.movida > 0;
  let metaSnapshot = {};
  if (huboCambios) {
    onProgreso?.({ etapa: 'guardando_snapshot' });
    metaSnapshot = camposMetaSnapshot(await guardarSnapshotDetallesOC(nuevoSnapshot));
  }

  onProgreso?.({ etapa: 'indice_oc' });
  let indiceOC;
  if (!tieneColumnaOC) {
    indiceOC = { ok: false, error: 'El Excel no trae la columna "OC": el índice de OC no se actualizó.' };
  } else {
    try {
      const { indice: anterior } = await obtenerIndiceOC({ metaConocida: meta });
      const { indice, stats } = mezclarIndiceOC(anterior, plan.filas, plan.idsFueraDelIndice);
      if (stats.cambios > 0) {
        // El mismo setDoc del meta publica también la versión del snapshot.
        await publicarIndiceOC(indice, { extraMeta: metaSnapshot });
        escrituras += 1;
        metaSnapshot = {};
      }
      indiceOC = { ok: true, ...stats, totalEntradas: Object.keys(indice).length, publicado: stats.cambios > 0 };
    } catch (err) {
      console.error('Error al actualizar el índice de OC:', err);
      indiceOC = { ok: false, error: 'No se pudo actualizar el índice de OC: ' + err.message };
    }
  }
  if (Object.keys(metaSnapshot).length > 0) {
    await setDoc(doc(db, 'ocImport', 'meta'), metaSnapshot, { merge: true });
    escrituras += 1;
  }

  // 6) Resumen Mensual: un fallo acá no invalida la importación.
  let resumenFacturacion = null;
  if (huboCambios) {
    onProgreso?.({ etapa: 'resumen_facturacion' });
    resumenFacturacion = await actualizarMeses(nuevoSnapshot, [...mesesTocados]);
    escrituras += resumenFacturacion.escrituras;
  }

  const camposActualizados = {};
  plan.actualizadas.filter(a => idsConfirmados.has(a.id))
    .forEach(a => a.campos.forEach((c) => { camposActualizados[c] = (camposActualizados[c] || 0) + 1; }));

  return {
    totalFilasExcel: plan.filas.length + invalidas.length,
    formatoArchivo: formato,
    meses: plan.meses,
    nuevas: confirmadas.nueva,
    actualizadas: confirmadas.actualizada,
    sinCambios: plan.sinCambios,
    camposActualizados,
    noSobrescritos: plan.noSobrescritos,
    ocCambiadas,
    gestionesOC,
    fechasCambiadas: plan.fechasCambiadas.filter(f => idsConfirmados.has(f.idNuevo))
      .map(({ idAntes, idNuevo, fechaAntes, fechaDespues, filaExcel }) => ({ idAntes, idNuevo, fechaAntes, fechaDespues, filaExcel })),
    fechasAmbiguas: plan.fechasAmbiguas,
    yaNoVienen: plan.yaNoVienen,
    pendientes,
    errores,
    indiceOC,
    resumenFacturacion,
    snapshotDesdeCache: snapshot.desdeCache,
    lecturasFirestore: lecturas,
    escriturasFirestore: escrituras
  };
};
