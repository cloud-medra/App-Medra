// Migración de una sola vez para "Sincronizar OC", desde el navegador (sin
// cuenta de servicio): agrega `ocPendiente` a las gestiones (Implantes o
// Hemodinamia, `coleccion`) que
// no lo tienen. Sincronizar OC consulta where('ocPendiente', '==', true) y
// Firestore no encuentra documentos donde el campo no existe.
//
//   ocPendiente = true  si algún ítem con código no tiene OC en ocPorItem
//   ocPendiente = false si no tiene ítems con código (o ya tienen todos OC)
//
// Se acota a un rango de meses por la ruta del documento
// (implantes_gestiones/{anio}/mes/{mes}/...): lee solo las gestiones de esos
// meses, sin índice nuevo. Los documentos que ya tienen el campo se saltan.
// Equivale a functions/scripts/marcarOcPendiente.js.
import { collectionGroup, query, where, getDocs, getDoc, doc, writeBatch, documentId } from 'firebase/firestore';
import { db } from '../../../../../firebaseConfig';
import { calcularOcPendiente, itemsDeGestion } from './indiceOC';

const MAX_OPS_BATCH = 450;

const MES_VALIDO = /^(\d{4})-(\d{2})$/;

// 'YYYY-MM' del mes siguiente.
const mesSiguiente = (mes) => {
  const [, a, m] = mes.match(MES_VALIDO);
  return Number(m) === 12 ? `${Number(a) + 1}-01` : `${a}-${String(Number(m) + 1).padStart(2, '0')}`;
};

const rutaMes = (mes, coleccion) => {
  const [, a, m] = mes.match(MES_VALIDO);
  return `${coleccion}/${a}/mes/${m}`;
};

// Límites de documentId() para las gestiones entre `desde` y `hasta`
// (meses 'YYYY-MM', ambos incluidos): [inicio, fin).
export const rangoRutasGestiones = (desde, hasta, coleccion = 'implantes_gestiones') => {
  if (!MES_VALIDO.test(desde || '') || !MES_VALIDO.test(hasta || '')) throw new Error('Indica los meses en formato AAAA-MM.');
  if (desde > hasta) throw new Error('El mes "desde" es posterior al mes "hasta".');
  return { inicio: rutaMes(desde, coleccion), fin: rutaMes(mesSiguiente(hasta), coleccion) };
};

// Gestiones (data cruda) -> qué escribir. Las que ya tienen el campo no se tocan.
export const calcularMarcasOcPendiente = (docs) => {
  const marcas = [];
  let yaTenian = 0;
  docs.forEach(({ ref, data }) => {
    if (typeof data.ocPendiente === 'boolean') { yaTenian++; return; }
    marcas.push({ ref, ocPendiente: calcularOcPendiente(itemsDeGestion(data), data.ocPorItem || {}) });
  });
  return { marcas, yaTenian };
};

// Mes más antiguo del Excel de OC importado (ocImport/meta, 1 lectura), para
// proponerlo como "desde". null si aún no hay importación.
export const mesMasAntiguoIndiceOC = async () => {
  const snap = await getDoc(doc(db, 'ocImport', 'meta'));
  const fechaMin = snap.exists() ? snap.data().fechaMin : '';
  return fechaMin ? String(fechaMin).slice(0, 7) : null;
};

export const marcarOcPendienteEnRango = async ({ desde, hasta, coleccion = 'implantes_gestiones' }) => {
  const { inicio, fin } = rangoRutasGestiones(desde, hasta, coleccion);
  const snap = await getDocs(query(
    collectionGroup(db, 'detalles'),
    where(documentId(), '>=', inicio),
    where(documentId(), '<', fin)
  ));
  const { marcas, yaTenian } = calcularMarcasOcPendiente(snap.docs.map(d => ({ ref: d.ref, data: d.data() })));

  let escrituras = 0;
  let errores = 0;
  for (let i = 0; i < marcas.length; i += MAX_OPS_BATCH) {
    const chunk = marcas.slice(i, i + MAX_OPS_BATCH);
    const batch = writeBatch(db);
    chunk.forEach(({ ref, ocPendiente }) => batch.update(ref, { ocPendiente }));
    try {
      await batch.commit();
      escrituras += chunk.length;
    } catch (err) {
      console.error('[Marcar OC pendiente] Falló un lote:', err);
      errores += chunk.length;
    }
  }

  const pendientes = marcas.filter(m => m.ocPendiente).length;
  return {
    revisadas: snap.size,
    yaTenian,
    marcadasPendiente: pendientes,
    marcadasSinPendiente: marcas.length - pendientes,
    errores,
    // Una consulta sin resultados igual cobra 1 lectura.
    lecturasFirestore: Math.max(1, snap.size),
    escriturasFirestore: escrituras
  };
};
