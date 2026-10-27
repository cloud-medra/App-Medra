// Finanzas → Comparativo mensual: Consumos y Facturas de los días
// `desde`–`hasta` del mes actual contra los mismos días del mes pasado.
//
// El snapshot de imputaciones_periodos es mensual y no sirve para un rango
// de días, así que se suma por la FECHA DEL DOCUMENTO (texto 'YYYY-MM-DD'):
//   - Consumos: `fecha` de la gestión / cirugía (Implantes, Hemodinamia y
//     Consignación copian esa fecha a la imputada).
//   - Facturas: `fchEmis`, fecha de emisión de la factura electrónica
//     (Laboratorio y Vacunatorio la copian del XML a la imputada).
// Un documento se imputa en el período abierto, que puede ser el de su mes,
// el anterior (solicitud antes de la cirugía) o el siguiente (factura o
// carga atrasada): por eso cada mes se busca en los períodos mes−1, mes y
// mes+1 (sin pasar del mes actual), con un filtro de rango sobre la fecha.
//
// Meses de distinto largo: un día que no existe en el mes se lleva al
// último día del mes (hasta el 31 contra un mes de 30 compara hasta el 30),
// así "del 1 al 31" siempre es "el mes completo" en los dos.
import { GRUPOS, MESES } from '../controlMensual/constants';
import { fechaISOEnChile } from '../../operaciones/shared/gestion/rangoFechaGestiones';

export const RUTA_COMPARATIVO_MES = '/administracion/comparativoMes';

const modulosDeGrupo = (grupoId) => GRUPOS.find((g) => g.id === grupoId).moduloIds;

export const FUENTES_COMPARATIVO = Object.freeze({
  consumos: { titulo: 'Consumos', moduloIds: modulosDeGrupo('consumos'), campoFecha: 'fecha', etiquetaFecha: 'fecha de la gestión / cirugía' },
  facturas: { titulo: 'Facturas', moduloIds: modulosDeGrupo('facturacion'), campoFecha: 'fchEmis', etiquetaFecha: 'fecha de emisión de la factura' },
});

// Hoy en Chile: { anio: 2026, mes: 10, dia: 27 } (mes 1-12).
export const hoyEnChile = (fecha = new Date()) => {
  const [anio, mes, dia] = fechaISOEnChile(fecha).split('-').map(Number);
  return { anio, mes, dia };
};

export const diasDelMes = (anio, mes) => new Date(Date.UTC(anio, mes, 0)).getUTCDate();

export const mesAnterior = ({ anio, mes }) => (mes === 1 ? { anio: anio - 1, mes: 12 } : { anio, mes: mes - 1 });
export const mesSiguiente = ({ anio, mes }) => (mes === 12 ? { anio: anio + 1, mes: 1 } : { anio, mes: mes + 1 });
const antesOIgual = (a, b) => a.anio < b.anio || (a.anio === b.anio && a.mes <= b.mes);

// Período de imputación de un mes: { anio: '2026', mesId: 'octubre' }.
export const periodoDe = ({ anio, mes }) => ({ anio: String(anio), mesId: MESES[mes - 1].id });

const iso = (anio, mes, dia) => `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;

// Rango de fechas de un mes para los días pedidos, llevando los días que no
// existen al último del mes. `ajustado` avisa que se recortó.
export const rangoDelMes = ({ anio, mes }, desde, hasta) => {
  const ultimo = diasDelMes(anio, mes);
  const d = Math.min(desde, ultimo);
  const h = Math.min(hasta, ultimo);
  return { anio, mes, desde: d, hasta: h, inicio: iso(anio, mes, d), fin: iso(anio, mes, h), ajustado: d !== desde || h !== hasta };
};

// Períodos donde pueden estar imputados los documentos de `mes`.
export const periodosAConsultar = (mes, tope) =>
  [mesAnterior(mes), mes, mesSiguiente(mes)].filter((m) => antesOIgual(m, tope)).map(periodoDe);

// Los dos rangos a comparar. `hoy` acota: no se elige un día posterior a hoy.
export const rangosComparativo = (hoy, desde, hasta) => {
  const actual = { anio: hoy.anio, mes: hoy.mes };
  return {
    actual: rangoDelMes(actual, desde, hasta),
    anterior: rangoDelMes(mesAnterior(actual), desde, hasta),
  };
};

// Días elegibles (1..hoy) y un rango válido a partir de lo elegido.
export const diasElegibles = (hoy) => Array.from({ length: hoy.dia }, (_, i) => i + 1);
export const normalizarRango = (desde, hasta, hoy) => {
  const h = Math.min(Math.max(Number(hasta) || hoy.dia, 1), hoy.dia);
  const d = Math.min(Math.max(Number(desde) || 1, 1), h);
  return { desde: d, hasta: h };
};

export const diferencia = (actual, anterior) => ({
  monto: actual - anterior,
  porcentaje: anterior ? ((actual - anterior) / Math.abs(anterior)) * 100 : null,
});

export const porcentajeTexto = (p) => (p === null
  ? 'sin base'
  : `${p > 0 ? '+' : ''}${p.toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`);

export const nombreMes = (mes) => MESES[mes - 1].nombre;
