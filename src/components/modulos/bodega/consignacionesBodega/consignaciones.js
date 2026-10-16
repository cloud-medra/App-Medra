import { normalizarClave, stockTotal } from '../../../../../functions/bodega/nucleo.mjs';
import { estadoVencimiento } from '../shared/vencimientos';

// Stock consignado (lógica pura): cruza lo que cada empresa dejó (debo
// tener, bodega_consignaciones) con sus lotes del Kardex (tengo,
// bodega_lotes con propietarioId = empresa).
//   Diferencia = actual + en tránsito + en otro centro − consignada
//   (negativa = faltante: se usó, se perdió o no ha llegado).

const n = (x) => Number(x) || 0;

// Consignación + lotes de esa empresa -> filas por producto + lote +
// vencimiento. Un lote con stock que no está en la consignación aparece
// igual (consignada 0, `registrada: false`).
export const filasConsignacion = (consignacion, lotes = []) => {
  const porLote = new Map(lotes.map((l) => [l.id, l]));
  const filas = (consignacion?.lineas || []).map((linea) => {
    const lote = porLote.get(linea.loteId) || {};
    porLote.delete(linea.loteId);
    return { ...linea, registrada: true, lote: linea.lote, vencimiento: linea.vencimiento, ...saldos(lote) };
  });
  porLote.forEach((l) => {
    if (stockTotal(l) <= 0) return;
    filas.push({
      loteId: l.id, productoId: l.productoId, productoNombre: l.productoNombre || '', codigoMaestro: l.codigoMaestro || '',
      lote: l.lote || null, vencimiento: l.vencimiento || null, cantidadConsignada: 0, registrada: false, ...saldos(l),
    });
  });
  return filas.map((f) => ({ ...f, diferencia: f.actual + f.transito + f.enCentro - f.cantidadConsignada }));
};

const saldos = (l) => ({
  actual: n(l.disponible), transito: n(l.transito), transitoPorCentro: l.transitoPorCentro || {},
  enCentro: n(l.enCentro), enCentroPorCentro: l.enCentroPorCentro || {},
});

// Completa nombre y código de las filas que vienen solo del lote (el lote
// no los guarda) con el maestro de productos en memoria.
export const conDatosProducto = (filas, productosPorId) => filas.map((f) => {
  const p = productosPorId[f.productoId];
  return p ? { ...f, productoNombre: f.productoNombre || p.nombre, codigoMaestro: f.codigoMaestro || p.codigoMaestro } : f;
});

export const ordenarFilas = (filas) => [...filas].sort((a, b) => String(a.productoNombre).localeCompare(String(b.productoNombre), 'es')
  || String(a.vencimiento || '9999').localeCompare(String(b.vencimiento || '9999'))
  || String(a.lote || '').localeCompare(String(b.lote || '')));

export const totalesFilas = (filas, opciones = {}) => filas.reduce((t, f) => ({
  consignada: t.consignada + f.cantidadConsignada,
  actual: t.actual + f.actual,
  transito: t.transito + f.transito,
  enCentro: t.enCentro + f.enCentro,
  faltante: t.faltante + Math.max(0, -f.diferencia),
  sobrante: t.sobrante + Math.max(0, f.diferencia),
  conFaltante: t.conFaltante + (f.diferencia < 0 ? 1 : 0),
  porVencer: t.porVencer + (estadoVencimiento(f.vencimiento, opciones).nivel && f.actual + f.transito + f.enCentro > 0 ? 1 : 0),
}), { consignada: 0, actual: 0, transito: 0, enCentro: 0, faltante: 0, sobrante: 0, conFaltante: 0, porVencer: 0 });

// Una fila por empresa: las que tienen consignación registrada o lotes
// consignados (aunque no se haya registrado nada todavía).
export const resumenEmpresas = (consignaciones = [], lotes = [], opciones = {}) => {
  const lotesPorEmpresa = lotes.reduce((acc, l) => {
    (acc[l.propietarioId] = acc[l.propietarioId] || []).push(l);
    return acc;
  }, {});
  const ids = new Set([...consignaciones.map((c) => c.id), ...Object.keys(lotesPorEmpresa)]);
  return [...ids].map((empresaId) => {
    const consignacion = consignaciones.find((c) => c.id === empresaId) || null;
    const propios = lotesPorEmpresa[empresaId] || [];
    const filas = filasConsignacion(consignacion, propios);
    return {
      empresaId,
      empresaNombre: consignacion?.empresaNombre || propios[0]?.propietarioNombre || empresaId,
      consignacion,
      lineas: filas.length,
      ...totalesFilas(filas, opciones),
    };
  }).sort((a, b) => a.empresaNombre.localeCompare(b.empresaNombre, 'es'));
};

// filtro: { texto, soloFaltantes, soloPorVencer }
export const filtrarFilas = (filas, { texto = '', soloFaltantes = false, soloPorVencer = false } = {}, opciones = {}) => {
  const palabras = normalizarClave(texto).split(' ').filter(Boolean);
  return filas.filter((f) => {
    if (soloFaltantes && f.diferencia >= 0) return false;
    if (soloPorVencer && !estadoVencimiento(f.vencimiento, opciones).nivel) return false;
    if (!palabras.length) return true;
    const base = normalizarClave(`${f.productoNombre} ${f.codigoMaestro} ${f.lote || ''}`);
    return palabras.every((w) => base.includes(w));
  });
};

// { [centroId]: n } -> 'PABELLÓN: 2 · UCI: 1' (por nombre).
export const textoPorCentro = (mapa, nombreCentro) => Object.entries(mapa || {})
  .filter(([, v]) => v > 0)
  .map(([c, v]) => [nombreCentro(c), v])
  .sort(([a], [b]) => a.localeCompare(b, 'es'))
  .map(([c, v]) => `${c}: ${v}`)
  .join(' · ');
