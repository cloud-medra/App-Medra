// Resumen mensual de facturación de Detalles OC (Seguimiento → Resumen
// Mensual): UN documento por año en resumen_facturacion_mensual/{anio} con
// un mapa por mes ('01'..'12'), así la pantalla hace 1 sola lectura por año.
//
//   { anio, meses: { MM: { total, facturado, pendiente, cantidad, cantidadPendiente } }, actualizadoEn }
//
// El mes de cada fila es el de su fecha_cx (el mismo de su ruta
// documentos_sistema/{anio}/meses/{mes}/...). Total = suma de oc_monto.
//
// Mantenimiento (siempre se sobrescribe el mes completo, nunca se suman
// deltas, así se autocorrige):
//   - actualizarMeses: lo llaman Importar Detalles OC y Eliminar filas al
//     terminar, con el snapshot nuevo ya en memoria → 0 lecturas.
//   - reconstruirResumen: botón "Recalcular" (administradores); lee las
//     filas reales del año en Firestore (1 lectura por fila).
import { collectionGroup, query, where, orderBy, limit, startAfter, getDocs, documentId, doc, setDoc, serverTimestamp, or } from 'firebase/firestore';
import { db } from '../../../../../firebaseConfig';
import { montoNumerico } from '../seguimientoFacturasGuias/utils/columnasSeguimiento';

export const COL_RESUMEN = 'resumen_facturacion_mensual';
export const ESTADO_PENDIENTE_FACTURA = 'Pendiente factura';
// numero_factura se guarda siempre como texto recortado (CAMPOS_TEXTO en
// parsearFilaDetalleOC.js): estos son los valores "sin factura".
export const FACTURAS_VACIAS = ['', '0'];

export const MESES = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];

// Criterio único de "facturado", compartido con la lista de Seguimiento de
// Facturas (que muestra justo lo contrario, ver filtroPendienteFactura).
export const criterioFacturado = (fila) =>
  !FACTURAS_VACIAS.includes(String(fila?.numero_factura ?? '').trim())
  && fila?.estado !== ESTADO_PENDIENTE_FACTURA;

// Filtro de servidor de la lista de Facturas: lo que NO cumple
// criterioFacturado. Una fila sin el campo numero_factura no aparecería
// (Firestore no encuentra campos inexistentes); reconstruirResumen las cuenta.
export const filtroPendienteFactura = {
  o: [
    { campo: 'estado', operador: '==', valor: ESTADO_PENDIENTE_FACTURA },
    { campo: 'numero_factura', operador: 'in', valor: FACTURAS_VACIAS }
  ]
};

export const mesVacio = () => ({ total: 0, facturado: 0, pendiente: 0, cantidad: 0, cantidadPendiente: 0 });

const sumarFila = (acumulado, fila) => {
  const monto = montoNumerico(fila.oc_monto) ?? 0;
  acumulado.total += monto;
  acumulado.cantidad += 1;
  if (criterioFacturado(fila)) acumulado.facturado += monto;
  else acumulado.cantidadPendiente += 1;
  acumulado.pendiente = acumulado.total - acumulado.facturado;
};

// Entradas del snapshot de Detalles OC ({ f: 'YYYY-MM-DD', v: valores })
// -> { [anio]: { [mes]: totales } } solo para los meses pedidos
// ('YYYY-MM'). Un mes pedido sin filas queda en 0.
export const calcularMesesDesdeSnapshot = (filasSnapshot, meses) => {
  const pedidos = new Set(meses);
  const resultado = {};
  pedidos.forEach((am) => {
    const [anio, mes] = am.split('-');
    (resultado[anio] ||= {})[mes] = mesVacio();
  });
  Object.values(filasSnapshot || {}).forEach((e) => {
    const am = String(e?.f || '').slice(0, 7);
    if (!pedidos.has(am)) return;
    const [anio, mes] = am.split('-');
    sumarFila(resultado[anio][mes], e.v || {});
  });
  return resultado;
};

// Recalcula y sobrescribe los meses afectados ('YYYY-MM') desde el
// snapshot ya actualizado. 1 escritura por año afectado, 0 lecturas.
// Nunca lanza: devuelve { ok, escrituras, error }.
export const actualizarMeses = async (filasSnapshot, meses) => {
  const validos = [...new Set(meses)].filter(m => /^\d{4}-\d{2}$/.test(m));
  if (validos.length === 0) return { ok: true, escrituras: 0 };
  try {
    const porAnio = calcularMesesDesdeSnapshot(filasSnapshot, validos);
    for (const [anio, mesesAnio] of Object.entries(porAnio)) {
      await setDoc(doc(db, COL_RESUMEN, anio), { anio: Number(anio), meses: mesesAnio, actualizadoEn: serverTimestamp() }, { merge: true });
    }
    return { ok: true, escrituras: Object.keys(porAnio).length };
  } catch (err) {
    console.error('No se pudo actualizar el resumen de facturación:', err);
    return { ok: false, escrituras: 0, error: 'No se actualizó el Resumen Mensual de facturación (usa "Recalcular"): ' + err.message };
  }
};

// Mes 'MM' de una fila leída de Firestore: el de su ruta.
const mesDeRuta = (path) => path.match(/^documentos_sistema\/\d{4}\/meses\/(\d{2})\//)?.[1];

// Recalcula el año completo leyendo las filas reales de Firestore (páginas
// de 1000, misma consulta que reconstruirSnapshotDetallesOC) y sobrescribe
// el documento. Cuenta las filas cuyo numero_factura no es texto (campo
// ausente o null): esas no salen en la lista de Facturas.
const TAMANO_PAGINA = 1000;
export const reconstruirResumen = async (anio, { onProgreso } = {}) => {
  const meses = Object.fromEntries(MESES.map(m => [m, mesVacio()]));
  let lecturas = 0;
  let filas = 0;
  let sinNumeroFactura = 0;
  let ultimo = null;
  for (;;) {
    const restricciones = [
      where(documentId(), '>=', `documentos_sistema/${anio}`),
      where(documentId(), '<', `documentos_sistema/${anio}`),
      orderBy(documentId(), 'desc'),
      limit(TAMANO_PAGINA)
    ];
    if (ultimo) restricciones.push(startAfter(ultimo));
    const snap = await getDocs(query(collectionGroup(db, 'detalles'), ...restricciones));
    lecturas += Math.max(1, snap.size);
    snap.docs.forEach((d) => {
      const mes = mesDeRuta(d.ref.path);
      if (!meses[mes]) return;
      const data = d.data();
      if (typeof data.numero_factura !== 'string') sinNumeroFactura += 1;
      sumarFila(meses[mes], data);
      filas += 1;
    });
    onProgreso?.({ leidas: filas });
    if (snap.size < TAMANO_PAGINA) break;
    ultimo = snap.docs[snap.docs.length - 1];
  }
  await setDoc(doc(db, COL_RESUMEN, String(anio)), { anio: Number(anio), meses, actualizadoEn: serverTimestamp() });
  return { meses, lecturas, filas, sinNumeroFactura };
};

// where(...) de un filtro { campo, operador, valor } o or(...) de un
// filtro { o: [...] } (ver filtroPendienteFactura).
export const restriccionDeFiltro = (filtro) => (filtro.o
  ? or(...filtro.o.map(f => where(f.campo, f.operador, f.valor)))
  : where(filtro.campo, filtro.operador, filtro.valor));
